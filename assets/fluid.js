/* Brand-tinted WebGL fluid simulation, scoped to [data-fluid].
   Adapted from Pavel Dobryakov's WebGL-Fluid-Simulation (MIT).
   - No jQuery. One canvas per [data-fluid] container.
   - Colors biased to the Vincent & Partner palette (reds/oranges + dark).
   - Pauses when offscreen; emits occasional auto-splats so it stays alive. */
(function () {
  const hosts = document.querySelectorAll('[data-fluid]');
  if (!hosts.length) return;
  hosts.forEach(setup);

  function setup(host) {
  const MONO = host.dataset.fluid === 'mono';
  const COFFEE = host.dataset.fluid === 'coffee';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;';
  host.style.position = host.style.position || 'relative';
  host.appendChild(canvas);

  function size() {
    const r = host.getBoundingClientRect();
    canvas.width = Math.max(2, Math.floor(r.width));
    canvas.height = Math.max(2, Math.floor(r.height));
  }
  size();

  let config = {
    SIM_RESOLUTION: 128, DYE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 0.975, VELOCITY_DISSIPATION: 0.99, PRESSURE_DISSIPATION: 0.8,
    PRESSURE_ITERATIONS: 20, CURL: 30, SPLAT_RADIUS: 0.5,
    SHADING: true, COLORFUL: true, PAUSED: false, TRANSPARENT: true,
    BLOOM: true, BLOOM_ITERATIONS: 8, BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.9, BLOOM_THRESHOLD: 0.6, BLOOM_SOFT_KNEE: 0.7
  };


  function pointerPrototype() {
    this.id = -1; this.x = 0; this.y = 0; this.dx = 0; this.dy = 0;
    this.down = false; this.moved = false; this.color = [30, 0, 300];
  }

  let pointers = [new pointerPrototype()];
  let splatStack = [];
  let bloomFramebuffers = [];

  const { gl, ext } = getWebGLContext(canvas);
  if (!gl) { host.style.background = '#111'; return; }
  if (isMobile()) config.SHADING = false;
  if (!ext.supportLinearFiltering) { config.SHADING = false; config.BLOOM = false; }

  function getWebGLContext(canvas) {
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!isWebGL2) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    if (!gl) return { gl: null, ext: {} };
    let halfFloat, supportLinearFiltering;
    if (isWebGL2) { gl.getExtension('EXT_color_buffer_float'); supportLinearFiltering = gl.getExtension('OES_texture_float_linear'); }
    else { halfFloat = gl.getExtension('OES_texture_half_float'); supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear'); }
    gl.clearColor(0, 0, 0, 1);
    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : (halfFloat && halfFloat.HALF_FLOAT_OES);
    let formatRGBA, formatRG, formatR;
    if (isWebGL2) {
      formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
      formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
      formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    } else {
      formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
      formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    }
    return { gl, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
  }
  function getSupportedFormat(gl, internalFormat, format, type) {
    if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
      switch (internalFormat) {
        case gl.R16F: return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
        case gl.RG16F: return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
        default: return null;
      }
    }
    return { internalFormat, format };
  }
  function supportRenderTextureFormat(gl, internalFormat, format, type) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  }
  function isMobile() { return /Mobi|Android/i.test(navigator.userAgent); }

  class GLProgram {
    constructor(vs, fs) {
      this.uniforms = {}; this.program = gl.createProgram();
      gl.attachShader(this.program, vs); gl.attachShader(this.program, fs);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw gl.getProgramInfoLog(this.program);
      const n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(this.program, i).name; this.uniforms[name] = gl.getUniformLocation(this.program, name); }
    }
    bind() { gl.useProgram(this.program); }
  }
  function compileShader(type, source) {
    const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
    return s;
  }

  const baseVertexShader = compileShader(gl.VERTEX_SHADER, `precision highp float;attribute vec2 aPosition;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform vec2 texelSize;void main(){vUv=aPosition*0.5+0.5;vL=vUv-vec2(texelSize.x,0.0);vR=vUv+vec2(texelSize.x,0.0);vT=vUv+vec2(0.0,texelSize.y);vB=vUv-vec2(0.0,texelSize.y);gl_Position=vec4(aPosition,0.0,1.0);}`);
  const clearShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;uniform sampler2D uTexture;uniform float value;void main(){gl_FragColor=value*texture2D(uTexture,vUv);}`);
  const colorShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;uniform vec4 color;void main(){gl_FragColor=color;}`);
  const displayShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uTexture;void main(){vec3 C=texture2D(uTexture,vUv).rgb;float a=max(C.r,max(C.g,C.b));gl_FragColor=vec4(C,a);}`);
  const displayBloomShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uTexture;uniform sampler2D uBloom;uniform sampler2D uDithering;uniform vec2 ditherScale;void main(){vec3 C=texture2D(uTexture,vUv).rgb;vec3 bloom=texture2D(uBloom,vUv).rgb;vec3 noise=texture2D(uDithering,vUv*ditherScale).rgb;noise=noise*2.0-1.0;bloom+=noise/800.0;bloom=pow(bloom.rgb,vec3(1.0/2.2));C+=bloom;float a=max(C.r,max(C.g,C.b));gl_FragColor=vec4(C,a);}`);
  const displayShadingShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uTexture;uniform vec2 texelSize;void main(){vec3 L=texture2D(uTexture,vL).rgb;vec3 R=texture2D(uTexture,vR).rgb;vec3 T=texture2D(uTexture,vT).rgb;vec3 B=texture2D(uTexture,vB).rgb;vec3 C=texture2D(uTexture,vUv).rgb;float dx=length(R)-length(L);float dy=length(T)-length(B);vec3 n=normalize(vec3(dx,dy,length(texelSize)));vec3 l=vec3(0.0,0.0,1.0);float diffuse=clamp(dot(n,l)+0.7,0.7,1.0);C.rgb*=diffuse;float a=max(C.r,max(C.g,C.b));gl_FragColor=vec4(C,a);}`);
  const displayBloomShadingShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uTexture;uniform sampler2D uBloom;uniform sampler2D uDithering;uniform vec2 ditherScale;uniform vec2 texelSize;void main(){vec3 L=texture2D(uTexture,vL).rgb;vec3 R=texture2D(uTexture,vR).rgb;vec3 T=texture2D(uTexture,vT).rgb;vec3 B=texture2D(uTexture,vB).rgb;vec3 C=texture2D(uTexture,vUv).rgb;float dx=length(R)-length(L);float dy=length(T)-length(B);vec3 n=normalize(vec3(dx,dy,length(texelSize)));vec3 l=vec3(0.0,0.0,1.0);float diffuse=clamp(dot(n,l)+0.7,0.7,1.0);C*=diffuse;vec3 bloom=texture2D(uBloom,vUv).rgb;vec3 noise=texture2D(uDithering,vUv*ditherScale).rgb;noise=noise*2.0-1.0;bloom+=noise/800.0;bloom=pow(bloom.rgb,vec3(1.0/2.2));C+=bloom;float a=max(C.r,max(C.g,C.b));gl_FragColor=vec4(C,a);}`);
  const bloomPrefilterShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying vec2 vUv;uniform sampler2D uTexture;uniform vec3 curve;uniform float threshold;void main(){vec3 c=texture2D(uTexture,vUv).rgb;float br=max(c.r,max(c.g,c.b));float rq=clamp(br-curve.x,0.0,curve.y);rq=curve.z*rq*rq;c*=max(rq,br-threshold)/max(br,0.0001);gl_FragColor=vec4(c,0.0);}`);
  const bloomBlurShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uTexture;void main(){vec4 sum=vec4(0.0);sum+=texture2D(uTexture,vL);sum+=texture2D(uTexture,vR);sum+=texture2D(uTexture,vT);sum+=texture2D(uTexture,vB);sum*=0.25;gl_FragColor=sum;}`);
  const bloomFinalShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uTexture;uniform float intensity;void main(){vec4 sum=vec4(0.0);sum+=texture2D(uTexture,vL);sum+=texture2D(uTexture,vR);sum+=texture2D(uTexture,vT);sum+=texture2D(uTexture,vB);sum*=0.25;gl_FragColor=sum*intensity;}`);
  const splatShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uTarget;uniform float aspectRatio;uniform vec3 color;uniform vec2 point;uniform float radius;void main(){vec2 p=vUv-point.xy;p.x*=aspectRatio;vec3 splat=exp(-dot(p,p)/radius)*color;vec3 base=texture2D(uTarget,vUv).xyz;gl_FragColor=vec4(base+splat,1.0);}`);
  const advectionManualFilteringShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uVelocity;uniform sampler2D uSource;uniform vec2 texelSize;uniform vec2 dyeTexelSize;uniform float dt;uniform float dissipation;vec4 bilerp(sampler2D sam,vec2 uv,vec2 tsize){vec2 st=uv/tsize-0.5;vec2 iuv=floor(st);vec2 fuv=fract(st);vec4 a=texture2D(sam,(iuv+vec2(0.5,0.5))*tsize);vec4 b=texture2D(sam,(iuv+vec2(1.5,0.5))*tsize);vec4 c=texture2D(sam,(iuv+vec2(0.5,1.5))*tsize);vec4 d=texture2D(sam,(iuv+vec2(1.5,1.5))*tsize);return mix(mix(a,b,fuv.x),mix(c,d,fuv.x),fuv.y);}void main(){vec2 coord=vUv-dt*bilerp(uVelocity,vUv,texelSize).xy*texelSize;gl_FragColor=dissipation*bilerp(uSource,coord,dyeTexelSize);gl_FragColor.a=1.0;}`);
  const advectionShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uVelocity;uniform sampler2D uSource;uniform vec2 texelSize;uniform float dt;uniform float dissipation;void main(){vec2 coord=vUv-dt*texture2D(uVelocity,vUv).xy*texelSize;gl_FragColor=dissipation*texture2D(uSource,coord);gl_FragColor.a=1.0;}`);
  const divergenceShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).x;float R=texture2D(uVelocity,vR).x;float T=texture2D(uVelocity,vT).y;float B=texture2D(uVelocity,vB).y;vec2 C=texture2D(uVelocity,vUv).xy;if(vL.x<0.0){L=-C.x;}if(vR.x>1.0){R=-C.x;}if(vT.y>1.0){T=-C.y;}if(vB.y<0.0){B=-C.y;}float div=0.5*(R-L+T-B);gl_FragColor=vec4(div,0.0,0.0,1.0);}`);
  const curlShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).y;float R=texture2D(uVelocity,vR).y;float T=texture2D(uVelocity,vT).x;float B=texture2D(uVelocity,vB).x;float vorticity=R-L-T+B;gl_FragColor=vec4(0.5*vorticity,0.0,0.0,1.0);}`);
  const vorticityShader = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;varying vec2 vL;varying vec2 vR;varying vec2 vT;varying vec2 vB;uniform sampler2D uVelocity;uniform sampler2D uCurl;uniform float curl;uniform float dt;void main(){float L=texture2D(uCurl,vL).x;float R=texture2D(uCurl,vR).x;float T=texture2D(uCurl,vT).x;float B=texture2D(uCurl,vB).x;float C=texture2D(uCurl,vUv).x;vec2 force=0.5*vec2(abs(T)-abs(B),abs(R)-abs(L));force/=length(force)+0.0001;force*=curl*C;force.y*=-1.0;vec2 vel=texture2D(uVelocity,vUv).xy;gl_FragColor=vec4(vel+force*dt,0.0,1.0);}`);
  const pressureShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uPressure;uniform sampler2D uDivergence;void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;float C=texture2D(uPressure,vUv).x;float divergence=texture2D(uDivergence,vUv).x;float pressure=(L+R+B+T-divergence)*0.25;gl_FragColor=vec4(pressure,0.0,0.0,1.0);}`);
  const gradientSubtractShader = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;varying highp vec2 vL;varying highp vec2 vR;varying highp vec2 vT;varying highp vec2 vB;uniform sampler2D uPressure;uniform sampler2D uVelocity;void main(){float L=texture2D(uPressure,vL).x;float R=texture2D(uPressure,vR).x;float T=texture2D(uPressure,vT).x;float B=texture2D(uPressure,vB).x;vec2 velocity=texture2D(uVelocity,vUv).xy;velocity.xy-=vec2(R-L,T-B);gl_FragColor=vec4(velocity,0.0,1.0);}`);

  const blit = (() => {
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    return (destination) => { gl.bindFramebuffer(gl.FRAMEBUFFER, destination); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); };
  })();

  let simWidth, simHeight, dyeWidth, dyeHeight, density, velocity, divergence, curl, pressure, bloom;
  let ditheringTexture = createTextureAsync('');

  const clearProgram = new GLProgram(baseVertexShader, clearShader);
  const colorProgram = new GLProgram(baseVertexShader, colorShader);
  const displayProgram = new GLProgram(baseVertexShader, displayShader);
  const displayBloomProgram = new GLProgram(baseVertexShader, displayBloomShader);
  const displayShadingProgram = new GLProgram(baseVertexShader, displayShadingShader);
  const displayBloomShadingProgram = new GLProgram(baseVertexShader, displayBloomShadingShader);
  const bloomPrefilterProgram = new GLProgram(baseVertexShader, bloomPrefilterShader);
  const bloomBlurProgram = new GLProgram(baseVertexShader, bloomBlurShader);
  const bloomFinalProgram = new GLProgram(baseVertexShader, bloomFinalShader);
  const splatProgram = new GLProgram(baseVertexShader, splatShader);
  const advectionProgram = new GLProgram(baseVertexShader, ext.supportLinearFiltering ? advectionShader : advectionManualFilteringShader);
  const divergenceProgram = new GLProgram(baseVertexShader, divergenceShader);
  const curlProgram = new GLProgram(baseVertexShader, curlShader);
  const vorticityProgram = new GLProgram(baseVertexShader, vorticityShader);
  const pressureProgram = new GLProgram(baseVertexShader, pressureShader);
  const gradienSubtractProgram = new GLProgram(baseVertexShader, gradientSubtractShader);

  function initFramebuffers() {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);
    simWidth = simRes.width; simHeight = simRes.height; dyeWidth = dyeRes.width; dyeHeight = dyeRes.height;
    const texType = ext.halfFloatTexType, rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    density = density == null ? createDoubleFBO(dyeWidth, dyeHeight, rgba.internalFormat, rgba.format, texType, filtering) : resizeDoubleFBO(density, dyeWidth, dyeHeight, rgba.internalFormat, rgba.format, texType, filtering);
    velocity = velocity == null ? createDoubleFBO(simWidth, simHeight, rg.internalFormat, rg.format, texType, filtering) : resizeDoubleFBO(velocity, simWidth, simHeight, rg.internalFormat, rg.format, texType, filtering);
    divergence = createFBO(simWidth, simHeight, r.internalFormat, r.format, texType, gl.NEAREST);
    curl = createFBO(simWidth, simHeight, r.internalFormat, r.format, texType, gl.NEAREST);
    pressure = createDoubleFBO(simWidth, simHeight, r.internalFormat, r.format, texType, gl.NEAREST);
    initBloomFramebuffers();
  }
  function initBloomFramebuffers() {
    let res = getResolution(config.BLOOM_RESOLUTION);
    const texType = ext.halfFloatTexType, rgba = ext.formatRGBA;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
    bloom = createFBO(res.width, res.height, rgba.internalFormat, rgba.format, texType, filtering);
    bloomFramebuffers.length = 0;
    for (let i = 0; i < config.BLOOM_ITERATIONS; i++) {
      let w = res.width >> (i + 1), h = res.height >> (i + 1);
      if (w < 2 || h < 2) break;
      bloomFramebuffers.push(createFBO(w, h, rgba.internalFormat, rgba.format, texType, filtering));
    }
  }
  function createFBO(w, h, internalFormat, format, type, param) {
    gl.activeTexture(gl.TEXTURE0);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, fbo, width: w, height: h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
  }
  function createDoubleFBO(w, h, internalFormat, format, type, param) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, param);
    let fbo2 = createFBO(w, h, internalFormat, format, type, param);
    return { get read() { return fbo1; }, set read(v) { fbo1 = v; }, get write() { return fbo2; }, set write(v) { fbo2 = v; }, swap() { let t = fbo1; fbo1 = fbo2; fbo2 = t; } };
  }
  function resizeFBO(target, w, h, internalFormat, format, type, param) {
    let n = createFBO(w, h, internalFormat, format, type, param);
    clearProgram.bind(); gl.uniform1i(clearProgram.uniforms.uTexture, target.attach(0)); gl.uniform1f(clearProgram.uniforms.value, 1); blit(n.fbo); return n;
  }
  function resizeDoubleFBO(target, w, h, internalFormat, format, type, param) {
    target.read = resizeFBO(target.read, w, h, internalFormat, format, type, param);
    target.write = createFBO(w, h, internalFormat, format, type, param);
    return target;
  }
  function createTextureAsync(url) {
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));
    let obj = { texture, width: 1, height: 1, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; } };
    if (url) { let image = new Image(); image.onload = () => { obj.width = image.width; obj.height = image.height; gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image); }; image.src = url; }
    return obj;
  }

  initFramebuffers();
  let lastColorChangeTime = Date.now();
  let running = false, raf = 0, lastAuto = Date.now();

  function update() {
    input();
    if (!config.PAUSED) step(0.016);
    // periodic auto-splats keep it alive
    if (Date.now() - lastAuto > 2600) { lastAuto = Date.now(); autoSplat(); }
    render(null);
    raf = requestAnimationFrame(update);
  }
  function input() {
    if (splatStack.length > 0) multipleSplats(splatStack.pop());
    for (let i = 0; i < pointers.length; i++) { const p = pointers[i]; if (p.moved) { splat(p.x, p.y, p.dx, p.dy, p.color); p.moved = false; } }
    if (!config.COLORFUL) return;
    if (lastColorChangeTime + 100 < Date.now()) { lastColorChangeTime = Date.now(); for (let i = 0; i < pointers.length; i++) pointers[i].color = generateColor(); }
  }
  function step(dt) {
    gl.disable(gl.BLEND); gl.viewport(0, 0, simWidth, simHeight);
    curlProgram.bind(); gl.uniform2f(curlProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight); gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0)); blit(curl.fbo);
    vorticityProgram.bind(); gl.uniform2f(vorticityProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight); gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0)); gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1)); gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL); gl.uniform1f(vorticityProgram.uniforms.dt, dt); blit(velocity.write.fbo); velocity.swap();
    divergenceProgram.bind(); gl.uniform2f(divergenceProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight); gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0)); blit(divergence.fbo);
    clearProgram.bind(); gl.uniform1i(clearProgram.uniforms.uTexture, pressure.read.attach(0)); gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE_DISSIPATION); blit(pressure.write.fbo); pressure.swap();
    pressureProgram.bind(); gl.uniform2f(pressureProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight); gl.uniform1i(pressureProgram.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) { gl.uniform1i(pressureProgram.uniforms.uPressure, pressure.read.attach(1)); blit(pressure.write.fbo); pressure.swap(); }
    gradienSubtractProgram.bind(); gl.uniform2f(gradienSubtractProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight); gl.uniform1i(gradienSubtractProgram.uniforms.uPressure, pressure.read.attach(0)); gl.uniform1i(gradienSubtractProgram.uniforms.uVelocity, velocity.read.attach(1)); blit(velocity.write.fbo); velocity.swap();
    advectionProgram.bind(); gl.uniform2f(advectionProgram.uniforms.texelSize, 1 / simWidth, 1 / simHeight);
    if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1 / simWidth, 1 / simHeight);
    let velocityId = velocity.read.attach(0); gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId); gl.uniform1i(advectionProgram.uniforms.uSource, velocityId); gl.uniform1f(advectionProgram.uniforms.dt, dt); gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION); blit(velocity.write.fbo); velocity.swap();
    gl.viewport(0, 0, dyeWidth, dyeHeight);
    if (!ext.supportLinearFiltering) gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1 / dyeWidth, 1 / dyeHeight);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0)); gl.uniform1i(advectionProgram.uniforms.uSource, density.read.attach(1)); gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION); blit(density.write.fbo); density.swap();
  }
  function render(target) {
    config.BLOOM_INTENSITY = isDark() ? 0.45 : 0.9;
    if (config.BLOOM) applyBloom(density.read, bloom);
    if (target == null || !config.TRANSPARENT) { gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.BLEND); } else gl.disable(gl.BLEND);
    let width = target == null ? gl.drawingBufferWidth : dyeWidth;
    let height = target == null ? gl.drawingBufferHeight : dyeHeight;
    gl.viewport(0, 0, width, height);
    if (config.SHADING) {
      let program = config.BLOOM ? displayBloomShadingProgram : displayShadingProgram; program.bind();
      gl.uniform2f(program.uniforms.texelSize, 1 / width, 1 / height); gl.uniform1i(program.uniforms.uTexture, density.read.attach(0));
      if (config.BLOOM) { gl.uniform1i(program.uniforms.uBloom, bloom.attach(1)); gl.uniform1i(program.uniforms.uDithering, ditheringTexture.attach(2)); let scale = getTextureScale(ditheringTexture, width, height); gl.uniform2f(program.uniforms.ditherScale, scale.x, scale.y); }
    } else {
      let program = config.BLOOM ? displayBloomProgram : displayProgram; program.bind(); gl.uniform1i(program.uniforms.uTexture, density.read.attach(0));
      if (config.BLOOM) { gl.uniform1i(program.uniforms.uBloom, bloom.attach(1)); gl.uniform1i(program.uniforms.uDithering, ditheringTexture.attach(2)); let scale = getTextureScale(ditheringTexture, width, height); gl.uniform2f(program.uniforms.ditherScale, scale.x, scale.y); }
    }
    blit(target);
  }
  function applyBloom(source, destination) {
    if (bloomFramebuffers.length < 2) return;
    let last = destination; gl.disable(gl.BLEND); bloomPrefilterProgram.bind();
    let knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
    gl.uniform3f(bloomPrefilterProgram.uniforms.curve, config.BLOOM_THRESHOLD - knee, knee * 2, 0.25 / knee);
    gl.uniform1f(bloomPrefilterProgram.uniforms.threshold, config.BLOOM_THRESHOLD); gl.uniform1i(bloomPrefilterProgram.uniforms.uTexture, source.attach(0)); gl.viewport(0, 0, last.width, last.height); blit(last.fbo);
    bloomBlurProgram.bind();
    for (let i = 0; i < bloomFramebuffers.length; i++) { let dest = bloomFramebuffers[i]; gl.uniform2f(bloomBlurProgram.uniforms.texelSize, 1 / last.width, 1 / last.height); gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0)); gl.viewport(0, 0, dest.width, dest.height); blit(dest.fbo); last = dest; }
    gl.blendFunc(gl.ONE, gl.ONE); gl.enable(gl.BLEND);
    for (let i = bloomFramebuffers.length - 2; i >= 0; i--) { let baseTex = bloomFramebuffers[i]; gl.uniform2f(bloomBlurProgram.uniforms.texelSize, 1 / last.width, 1 / last.height); gl.uniform1i(bloomBlurProgram.uniforms.uTexture, last.attach(0)); gl.viewport(0, 0, baseTex.width, baseTex.height); blit(baseTex.fbo); last = baseTex; }
    gl.disable(gl.BLEND); bloomFinalProgram.bind(); gl.uniform2f(bloomFinalProgram.uniforms.texelSize, 1 / last.width, 1 / last.height); gl.uniform1i(bloomFinalProgram.uniforms.uTexture, last.attach(0)); gl.uniform1f(bloomFinalProgram.uniforms.intensity, config.BLOOM_INTENSITY); gl.viewport(0, 0, destination.width, destination.height); blit(destination.fbo);
  }
  function splat(x, y, dx, dy, color) {
    gl.viewport(0, 0, simWidth, simHeight); splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0)); gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x / canvas.width, 1 - y / canvas.height); gl.uniform3f(splatProgram.uniforms.color, dx, -dy, 1); gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100); blit(velocity.write.fbo); velocity.swap();
    gl.viewport(0, 0, dyeWidth, dyeHeight); gl.uniform1i(splatProgram.uniforms.uTarget, density.read.attach(0)); gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b); blit(density.write.fbo); density.swap();
  }
  function multipleSplats(amount) {
    for (let i = 0; i < amount; i++) { const color = generateColor(); color.r *= 10; color.g *= 10; color.b *= 10; const x = canvas.width * Math.random(); const y = canvas.height * Math.random(); const dx = 1000 * (Math.random() - 0.5); const dy = 1000 * (Math.random() - 0.5); splat(x, y, dx, dy, color); }
  }
  function autoSplat() {
    const color = generateColor(); color.r *= 9; color.g *= 9; color.b *= 9;
    const x = canvas.width * (0.2 + Math.random() * 0.6);
    const y = canvas.height * (0.3 + Math.random() * 0.5);
    const ang = Math.random() * Math.PI * 2;
    splat(x, y, Math.cos(ang) * 700, Math.sin(ang) * 700, color);
  }
  function resizeCanvas() {
    // Nur bei echter Grössenänderung (≥ 2 px) neu aufbauen — Subpixel-Schwankungen der
    // Layout-Höhe liessen sonst jeden Frame die Framebuffer leer laufen (Flackern).
    const r = host.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (w < 2 || h < 2) return;
    if (Math.abs(canvas.width - w) >= 2 || Math.abs(canvas.height - h) >= 2 || !density) { canvas.width = w; canvas.height = h; initFramebuffers(); }
  }
  resizeCanvas();
  if (window.ResizeObserver) { let ro_t; new ResizeObserver(() => { clearTimeout(ro_t); ro_t = setTimeout(resizeCanvas, 120); }).observe(host); }

  host.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    pointers[0].moved = Math.abs(pointers[0].dx) > 0 || Math.abs(pointers[0].dy) > 0;
    pointers[0].dx = ((e.clientX - r.left) - pointers[0].x) * 5;
    pointers[0].dy = ((e.clientY - r.top) - pointers[0].y) * 5;
    pointers[0].x = e.clientX - r.left; pointers[0].y = e.clientY - r.top;
  });
  host.addEventListener('touchmove', e => {
    const r = canvas.getBoundingClientRect(); const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) { let p = pointers[i]; if (!p) continue; p.moved = p.down; p.dx = ((touches[i].clientX - r.left) - p.x) * 8; p.dy = ((touches[i].clientY - r.top) - p.y) * 8; p.x = touches[i].clientX - r.left; p.y = touches[i].clientY - r.top; }
  }, { passive: true });
  host.addEventListener('mousedown', () => { pointers[0].down = true; pointers[0].color = generateColor(); });
  host.addEventListener('touchstart', e => { const r = canvas.getBoundingClientRect(); const touches = e.targetTouches; for (let i = 0; i < touches.length; i++) { if (i >= pointers.length) pointers.push(new pointerPrototype()); pointers[i].id = touches[i].identifier; pointers[i].down = true; pointers[i].x = touches[i].clientX - r.left; pointers[i].y = touches[i].clientY - r.top; pointers[i].color = generateColor(); } }, { passive: true });
  window.addEventListener('mouseup', () => { pointers[0].down = false; });
  window.addEventListener('touchend', e => { const touches = e.changedTouches; for (let i = 0; i < touches.length; i++) for (let j = 0; j < pointers.length; j++) if (touches[i].identifier === pointers[j].id) pointers[j].down = false; });

  // Colorful swirl, tuned to read on a white background; dimmer on dark ground so
  // the dye does not glow brighter than the page.
  const isDark = () => document.documentElement.getAttribute('data-mode') === 'Dunkel';
  function generateColor() {
    if (MONO) { const v = isDark() ? 0.22 : 0.34; return { r: v, g: v, b: v }; }
    if (COFFEE) {
      // Dunkelmodus: warmes Kaffeebraun direkt als Dye (glüht braun auf Dunkel).
      // Hellmodus: graues Dye → per CSS invert+sepia zu Kaffeebraun auf Weiß.
      const dark = document.documentElement.getAttribute('data-mode') === 'Dunkel';
      return dark ? { r: 0.55, g: 0.33, b: 0.17 } : { r: 0.5, g: 0.5, b: 0.5 };
    }
    const c = HSVtoRGB(Math.random(), 1.0, 1.0);
    const k = isDark() ? 0.2 : 0.35;
    c.r *= k; c.g *= k; c.b *= k;
    return c;
  }
  function HSVtoRGB(h, s, v) {
    let r, g, b, i, f, p, q, t; i = Math.floor(h * 6); f = h * 6 - i; p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s);
    switch (i % 6) { case 0: r = v, g = t, b = p; break; case 1: r = q, g = v, b = p; break; case 2: r = p, g = v, b = t; break; case 3: r = p, g = q, b = v; break; case 4: r = t, g = p, b = v; break; case 5: r = v, g = p, b = q; break; }
    return { r, g, b };
  }
  function getResolution(resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight; if (aspectRatio < 1) aspectRatio = 1 / aspectRatio;
    let max = Math.round(resolution * aspectRatio), min = Math.round(resolution);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
  }
  function getTextureScale(texture, width, height) { return { x: width / texture.width, y: height / texture.height }; }

  let seeded = false;
  function start() { if (running) return; running = true; if (!seeded) { seeded = true; multipleSplats(parseInt(Math.random() * 12) + 8); } update(); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  const io = new IntersectionObserver((es) => { es.forEach(e => e.isIntersecting ? start() : stop()); }, { threshold: 0.02 });
  io.observe(host);

  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resizeCanvas, 150); });
  }
})();

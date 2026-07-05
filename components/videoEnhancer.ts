/**
 * VideoEnhancer4K — Real-time GPU video enhancement (true upscaling).
 *
 * Pipeline (WebGL2, runs entirely on the GPU, zero impact on video decode/network):
 *   Pass 1: Catmull-Rom bicubic upscale of the decoded frame to the display
 *           resolution (up to 3840x2160). This reconstructs a genuinely
 *           higher-resolution image instead of the browser's blurry bilinear.
 *   Pass 2: RCAS (Robust Contrast-Adaptive Sharpening — the sharpening pass of
 *           AMD FidelityFX Super Resolution 1.0) + subtle vibrance. RCAS
 *           restores edge detail lost by compression/upscaling while clamping
 *           ringing artifacts.
 *
 * Performance safety:
 *   - Work happens only when a NEW video frame is presented
 *     (requestVideoFrameCallback), so pausing/buffering costs nothing.
 *   - Frame cost is measured continuously; if the device is too slow the
 *     internal render scale steps down automatically, and as a last resort
 *     the enhancer signals a fallback so the UI can degrade gracefully.
 *   - The <video> element keeps decoding/playing untouched underneath —
 *     audio, seeking, buffering and speed are 100% unaffected.
 */

type FallbackReason = 'no-webgl' | 'security' | 'context-lost' | 'too-slow';

const MAX_W = 3840;
const MAX_H = 2160;

const VERT_SRC = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // Fullscreen triangle
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = pos;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

// Pass 1 — 9-tap optimized Catmull-Rom bicubic resampling (Jimenez).
const UPSCALE_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uSrcSize;
in vec2 vUv;
out vec4 outColor;

vec4 catmullRom(vec2 uv) {
  vec2 samplePos = uv * uSrcSize;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - texPos1;

  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);

  vec2 w12 = w1 + w2;
  vec2 offset12 = w2 / w12;

  vec2 texPos0 = (texPos1 - 1.0) / uSrcSize;
  vec2 texPos3 = (texPos1 + 2.0) / uSrcSize;
  vec2 texPos12 = (texPos1 + offset12) / uSrcSize;

  vec4 result = vec4(0.0);
  result += texture(uTex, vec2(texPos0.x,  texPos0.y))  * w0.x  * w0.y;
  result += texture(uTex, vec2(texPos12.x, texPos0.y))  * w12.x * w0.y;
  result += texture(uTex, vec2(texPos3.x,  texPos0.y))  * w3.x  * w0.y;

  result += texture(uTex, vec2(texPos0.x,  texPos12.y)) * w0.x  * w12.y;
  result += texture(uTex, vec2(texPos12.x, texPos12.y)) * w12.x * w12.y;
  result += texture(uTex, vec2(texPos3.x,  texPos12.y)) * w3.x  * w12.y;

  result += texture(uTex, vec2(texPos0.x,  texPos3.y))  * w0.x  * w3.y;
  result += texture(uTex, vec2(texPos12.x, texPos3.y))  * w12.x * w3.y;
  result += texture(uTex, vec2(texPos3.x,  texPos3.y))  * w3.x  * w3.y;
  return result;
}

void main() {
  outColor = vec4(clamp(catmullRom(vUv).rgb, 0.0, 1.0), 1.0);
}`;

// Pass 2 — RCAS (AMD FidelityFX FSR 1.0 sharpener) + subtle vibrance.
const RCAS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uPx;      // 1.0 / output size
uniform float uSharp;  // sharpness intensity (exp2(-stops))
in vec2 vUv;
out vec4 outColor;

#define RCAS_LIMIT (0.25 - (1.0 / 16.0))

void main() {
  vec3 b = texture(uTex, vUv + vec2( 0.0, -uPx.y)).rgb;
  vec3 d = texture(uTex, vUv + vec2(-uPx.x,  0.0)).rgb;
  vec3 e = texture(uTex, vUv).rgb;
  vec3 f = texture(uTex, vUv + vec2( uPx.x,  0.0)).rgb;
  vec3 h = texture(uTex, vUv + vec2( 0.0,  uPx.y)).rgb;

  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));
  vec2 peakC = vec2(1.0, -4.0);

  vec3 hitMin = mn4 / (4.0 * mx4 + 1e-5);
  vec3 hitMax = (peakC.x - mx4) / (4.0 * mn4 + peakC.y);
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-RCAS_LIMIT, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * uSharp;

  vec3 col = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);

  // Subtle vibrance so the enhancement is pleasing but natural
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, 1.07);

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class VideoEnhancer4K {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private onFallback: (reason: FallbackReason) => void;

  private gl: WebGL2RenderingContext | null = null;
  private progUpscale: WebGLProgram | null = null;
  private progRcas: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private srcTex: WebGLTexture | null = null;
  private midTex: WebGLTexture | null = null;
  private fbo: WebGLFramebuffer | null = null;

  private uSrcSize: WebGLUniformLocation | null = null;
  private uPx: WebGLUniformLocation | null = null;
  private uSharp: WebGLUniformLocation | null = null;

  private running = false;
  private disposed = false;
  private vfcId = 0;
  private rafId = 0;
  private srcW = 0;
  private srcH = 0;
  private midW = 0;
  private midH = 0;
  private renderScale = 1.0;   // steps down automatically on slow devices
  private costEma = 0;         // exponential moving average of CPU frame cost (ms)
  private frames = 0;
  private resizeObserver: ResizeObserver | null = null;
  private contextLostHandler = () => this.fail('context-lost');

  static isSupported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!c.getContext('webgl2');
    } catch {
      return false;
    }
  }

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement, onFallback: (reason: FallbackReason) => void) {
    this.video = video;
    this.canvas = canvas;
    this.onFallback = onFallback;

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      desynchronized: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null;

    if (!gl) throw new Error('no-webgl');
    this.gl = gl;

    canvas.addEventListener('webglcontextlost', this.contextLostHandler);

    this.progUpscale = this.buildProgram(VERT_SRC, UPSCALE_FRAG);
    this.progRcas = this.buildProgram(VERT_SRC, RCAS_FRAG);
    this.uSrcSize = gl.getUniformLocation(this.progUpscale!, 'uSrcSize');
    this.uPx = gl.getUniformLocation(this.progRcas!, 'uPx');
    this.uSharp = gl.getUniformLocation(this.progRcas!, 'uSharp');

    this.vao = gl.createVertexArray();

    this.srcTex = this.makeTexture();
    this.midTex = this.makeTexture();
    this.fbo = gl.createFramebuffer();
  }

  start() {
    if (this.disposed || this.running) return;
    this.running = true;

    // Render immediately (covers paused / already-decoded state)
    if (this.video.readyState >= 2) this.renderFrame();
    this.scheduleNext();

    // Re-render current frame if the layout size changes while paused
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.running && this.video.readyState >= 2 && this.video.paused) {
          this.renderFrame();
        }
      });
      this.resizeObserver.observe(this.canvas);
    }
  }

  dispose() {
    this.running = false;
    this.disposed = true;
    this.cancelScheduled();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.canvas.removeEventListener('webglcontextlost', this.contextLostHandler);

    const gl = this.gl;
    if (gl && !gl.isContextLost()) {
      // Clear so no stale frame flashes next time the canvas fades in
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (this.progUpscale) gl.deleteProgram(this.progUpscale);
      if (this.progRcas) gl.deleteProgram(this.progRcas);
      if (this.vao) gl.deleteVertexArray(this.vao);
      if (this.srcTex) gl.deleteTexture(this.srcTex);
      if (this.midTex) gl.deleteTexture(this.midTex);
      if (this.fbo) gl.deleteFramebuffer(this.fbo);
    }
    this.progUpscale = this.progRcas = null;
    this.vao = null;
    this.srcTex = this.midTex = null;
    this.fbo = null;
    this.gl = null;
  }

  // ---------------------------------------------------------------- internals

  private buildProgram(vsSrc: string, fsSrc: string): WebGLProgram {
    const gl = this.gl!;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('shader: ' + info);
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, vsSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  private makeTexture(): WebGLTexture {
    const gl = this.gl!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private scheduleNext() {
    if (!this.running) return;
    const v = this.video as any;
    if (typeof v.requestVideoFrameCallback === 'function') {
      this.vfcId = v.requestVideoFrameCallback(() => {
        this.renderFrame();
        this.scheduleNext();
      });
    } else {
      this.rafId = requestAnimationFrame(() => {
        if (!this.video.paused && !this.video.ended) this.renderFrame();
        this.scheduleNext();
      });
    }
  }

  private cancelScheduled() {
    const v = this.video as any;
    if (this.vfcId && typeof v.cancelVideoFrameCallback === 'function') {
      v.cancelVideoFrameCallback(this.vfcId);
      this.vfcId = 0;
    }
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private fail(reason: FallbackReason) {
    if (this.disposed) return;
    this.running = false;
    this.cancelScheduled();
    try { this.onFallback(reason); } catch { /* noop */ }
  }

  private computeOutputSize(): [number, number] {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, this.canvas.clientWidth) * dpr;
    const ch = Math.max(1, this.canvas.clientHeight) * dpr;

    // Fit the video aspect ratio inside the element box (object-contain),
    // capped at 4K and scaled by the adaptive render scale.
    const fit = Math.min(cw / vw, ch / vh);
    let w = Math.round(vw * fit * this.renderScale);
    let h = Math.round(vh * fit * this.renderScale);
    if (w > MAX_W) { h = Math.round(h * (MAX_W / w)); w = MAX_W; }
    if (h > MAX_H) { w = Math.round(w * (MAX_H / h)); h = MAX_H; }
    return [Math.max(vw >> 1, w), Math.max(vh >> 1, h)];
  }

  private renderFrame() {
    const gl = this.gl;
    const video = this.video;
    if (!gl || !this.running || gl.isContextLost()) return;
    if (!video.videoWidth || !video.videoHeight) return;

    const t0 = performance.now();

    const [outW, outH] = this.computeOutputSize();
    if (this.canvas.width !== outW || this.canvas.height !== outH) {
      this.canvas.width = outW;
      this.canvas.height = outH;
    }

    // --- Upload the decoded frame to the GPU
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      if (this.srcW !== video.videoWidth || this.srcH !== video.videoHeight) {
        this.srcW = video.videoWidth;
        this.srcH = video.videoHeight;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video);
      }
    } catch (e) {
      // Cross-origin frame without CORS approval — cannot read pixels.
      this.fail('security');
      return;
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    }

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // --- Pass 1: Catmull-Rom upscale → intermediate texture
    if (this.midW !== outW || this.midH !== outH) {
      this.midW = outW;
      this.midH = outH;
      gl.bindTexture(gl.TEXTURE_2D, this.midTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, outW, outH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.midTex, 0);
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.progUpscale);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.uniform2f(this.uSrcSize, this.srcW, this.srcH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- Pass 2: RCAS sharpen → screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(this.progRcas);
    gl.bindTexture(gl.TEXTURE_2D, this.midTex);
    gl.uniform2f(this.uPx, 1 / outW, 1 / outH);
    gl.uniform1f(this.uSharp, 0.87); // ~0.2 stops — crisp but no halos
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // --- Adaptive performance guard (CPU-side cost, mostly the upload)
    const cost = performance.now() - t0;
    this.costEma = this.costEma === 0 ? cost : this.costEma * 0.9 + cost * 0.1;
    this.frames++;
    if (this.frames > 60 && this.frames % 30 === 0) {
      if (this.costEma > 12 && this.renderScale > 0.6) {
        this.renderScale = Math.max(0.6, this.renderScale * 0.8);
      } else if (this.costEma > 24 && this.renderScale <= 0.6) {
        this.fail('too-slow');
      }
    }
  }
}

export default VideoEnhancer4K;

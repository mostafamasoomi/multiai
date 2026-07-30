/**
 * VortexIntro — text/logo-to-particle assembly effect.
 *
 * Zero dependencies, Canvas 2D only. On play(), N particles spawn on a
 * spiral path around a shared center, swirl for a short "vortex" phase,
 * then peel off — staggered, with a slight overshoot — toward sampled
 * pixel positions of the target text, reassembling it.
 *
 * Usage:
 *   const vortex = new VortexIntro();
 *   vortex.init(canvasEl, { text: 'MultiAI' });
 *   vortex.play();
 *   // later, e.g. on route change in an SPA:
 *   vortex.destroy();
 *
 * @module vortex-intro
 */

/**
 * @typedef {Object} VortexIntroOptions
 * @property {string} [text='MultiAI']            Text to assemble.
 * @property {string} [font='700 120px system-ui'] Font used to sample target points. Size scales with canvas width automatically.
 * @property {string[]} [colors]                   Particle color palette (brand colors). Defaults to a violet MultiAI palette.
 * @property {number} [particleCountMax=600]       Upper bound on particle count (desktop / high-end).
 * @property {number} [particleCountMin=200]       Lower bound on particle count (low-end devices).
 * @property {number} [vortexDuration=500]         Phase 1 (swirl) duration in ms.
 * @property {number} [settleDuration=1000]        Phase 2 (peel-to-target) duration in ms.
 * @property {number} [maxStagger=350]              Max additional per-particle delay in ms during phase 2.
 * @property {number} [overshoot=1.7]              easeOutBack overshoot constant (0 = no overshoot).
 * @property {() => void} [onComplete]             Called once all particles have settled.
 */

const DEFAULT_COLORS = ['#a855f7', '#7c3aed', '#c4b5fd', '#f3e4ff'];

// --- Easing -----------------------------------------------------------
// Phase 1 uses linear angular velocity (a true spiral needs constant dθ/dt,
// not an eased one, or the arms would bunch up unevenly).
// Phase 2 uses easeOutBack: a cubic ease-out with a small negative overshoot
// term, so particles fly slightly past their target and settle back — this
// reads as "snapping into place" rather than a flat linear stop, which is
// what "polished" mostly comes down to for a settle animation.
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
function easeOutBack(t, overshoot) {
  const c1 = overshoot;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Very small, synchronous capability heuristic — cheap, no delay to first frame. */
function estimateDeviceTier() {
  const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
  const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
  if (cores <= 2 || mem <= 2) return 'low';
  if (cores <= 4) return 'mid';
  return 'high';
}

export class VortexIntro {
  constructor() {
    /** @type {HTMLCanvasElement|null} */
    this.canvas = null;
    this.ctx = null;
    this.options = null;
    this._raf = null;
    this._destroyed = false;
    this._resizeObserver = null;
    this._startTime = 0;
    this._reduced = false;
    this._count = 0;

    // Particle pool — flat typed arrays, not N objects, so a running
    // animation never allocates and never triggers a GC pause mid-flight.
    /** @type {Float32Array} */ this.px = null; // current x
    /** @type {Float32Array} */ this.py = null; // current y
    /** @type {Float32Array} */ this.tx = null; // target x
    /** @type {Float32Array} */ this.ty = null; // target y
    /** @type {Float32Array} */ this.cx = null; // vortex-phase center-relative angle offset
    /** @type {Float32Array} */ this.r0 = null; // initial spiral radius
    /** @type {Float32Array} */ this.settleFromX = null; // position captured at phase-2 start
    /** @type {Float32Array} */ this.settleFromY = null;
    /** @type {Float32Array} */ this.delay = null;   // ms, phase-2 stagger
    /** @type {Float32Array} */ this.size = null;
    /** @type {Uint8Array} */ this.colorIdx = null;

    this._fpsProbe = { samples: 0, totalMs: 0, active: true, lastT: 0 };
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {VortexIntroOptions} [options]
   */
  init(canvas, options = {}) {
    if (!canvas) throw new Error('VortexIntro.init: canvas is required');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._destroyed = false;
    this._reduced = prefersReducedMotion();

    this.options = {
      text: 'MultiAI',
      font: '700 1px system-ui, sans-serif',
      colors: DEFAULT_COLORS,
      particleCountMax: 600,
      particleCountMin: 200,
      vortexDuration: 500,
      settleDuration: 1000,
      maxStagger: 350,
      overshoot: 1.7,
      onComplete: null,
      ...options,
    };

    const tier = estimateDeviceTier();
    this._count = tier === 'low'
      ? this.options.particleCountMin
      : tier === 'mid'
        ? Math.round((this.options.particleCountMin + this.options.particleCountMax) / 2)
        : this.options.particleCountMax;

    this._layout();

    // Debounced resize: read the new box size once, then write canvas
    // dimensions + resample once — never interleaved per-frame.
    let resizeT = null;
    this._resizeObserver = new ResizeObserver(() => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => { if (!this._destroyed) this._layout(); }, 120);
    });
    this._resizeObserver.observe(canvas);
  }

  /** (Re)computes canvas size + target sample points. Safe to call on resize. */
  _layout() {
    const canvas = this.canvas;
    // --- READ phase: measure once ---
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = rect.width || canvas.clientWidth || 600;
    const cssH = rect.height || canvas.clientHeight || 240;

    // --- WRITE phase: apply everything in one batch ---
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._w = cssW;
    this._h = cssH;
    this._targets = this._sampleText(cssW, cssH, this._count);
    this._allocatePool(this._targets.length);
  }

  /**
   * Renders the target text offscreen and samples pixel positions to use as
   * particle destinations (the standard "text-to-particle" technique).
   * @returns {Array<{x:number, y:number}>}
   */
  _sampleText(cssW, cssH, count) {
    const off = document.createElement('canvas');
    const scale = 2; // sample at 2x for a cleaner point cloud, independent of DPR
    off.width = Math.max(1, Math.round(cssW * scale));
    off.height = Math.max(1, Math.round(cssH * scale));
    const octx = off.getContext('2d');

    // Fit the text to ~80% of the offscreen width by binary-searching font size.
    const label = this.options.text;
    let fontSize = off.height * 0.55;
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    for (let i = 0; i < 8; i++) {
      octx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      const w = octx.measureText(label).width;
      const target = off.width * 0.82;
      if (Math.abs(w - target) < target * 0.02) break;
      fontSize *= target / Math.max(w, 1);
    }
    octx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    octx.fillStyle = '#fff';
    octx.clearRect(0, 0, off.width, off.height);
    octx.fillText(label, off.width / 2, off.height / 2);

    const { data } = octx.getImageData(0, 0, off.width, off.height);
    const points = [];
    const stride = 3; // px step while scanning — coarser = fewer, larger particles
    for (let y = 0; y < off.height; y += stride) {
      for (let x = 0; x < off.width; x += stride) {
        const alpha = data[(y * off.width + x) * 4 + 3];
        if (alpha > 128) points.push({ x: (x / scale), y: (y / scale) });
      }
    }
    // Shuffle so index order (used for stagger) doesn't correlate with glyph order.
    for (let i = points.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [points[i], points[j]] = [points[j], points[i]];
    }

    const n = Math.min(count, Math.max(points.length, 1));
    const sampled = new Array(n);
    for (let i = 0; i < n; i++) {
      sampled[i] = points.length ? points[i % points.length] : { x: cssW / 2, y: cssH / 2 };
    }
    return sampled;
  }

  _allocatePool(n) {
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.ty = new Float32Array(n);
    this.cx = new Float32Array(n);
    this.r0 = new Float32Array(n);
    this.settleFromX = new Float32Array(n);
    this.settleFromY = new Float32Array(n);
    this.delay = new Float32Array(n);
    this.size = new Float32Array(n);
    this.colorIdx = new Uint8Array(n);

    const cx0 = this._w / 2;
    const cy0 = this._h / 2;
    const maxR = Math.hypot(this._w, this._h) * 0.55;
    const colors = this.options.colors;

    for (let i = 0; i < n; i++) {
      const t = this._targets[i];
      this.tx[i] = t.x;
      this.ty[i] = t.y;
      // Random phase offset + radius on an Archimedean spiral (r = a + bθ);
      // used in _stepVortex() to compute live position each frame.
      this.cx[i] = Math.random() * Math.PI * 2;
      this.r0[i] = maxR * (0.35 + Math.random() * 0.65);
      this.delay[i] = Math.random() * this.options.maxStagger
        + (Math.hypot(t.x - cx0, t.y - cy0) / Math.max(this._w, this._h)) * 120; // farther glyphs settle slightly later
      this.size[i] = 1.4 + Math.random() * 1.8;
      this.colorIdx[i] = (Math.random() * colors.length) | 0;
      this.px[i] = cx0;
      this.py[i] = cy0;
    }
  }

  /** Starts (or restarts) the animation timeline. */
  play() {
    if (!this.canvas) throw new Error('VortexIntro.play: call init() first');
    if (this._raf) cancelAnimationFrame(this._raf);

    if (this._reduced) {
      this._playReducedMotion();
      return;
    }

    this._startTime = performance.now();
    this._fpsProbe = { samples: 0, totalMs: 0, active: true, lastT: this._startTime };
    const tick = (now) => {
      if (this._destroyed) return;
      const dt = now - (this._fpsProbe.lastT || now);
      this._fpsProbe.lastT = now;
      if (this._fpsProbe.active) this._probeFps(now, dt);

      const elapsed = now - this._startTime;
      this._render(elapsed);

      const totalDuration = this.options.vortexDuration + this.options.settleDuration + this.options.maxStagger;
      if (elapsed < totalDuration) {
        this._raf = requestAnimationFrame(tick);
      } else {
        this._raf = null;
        if (typeof this.options.onComplete === 'function') this.options.onComplete();
      }
    };
    this._raf = requestAnimationFrame(tick);
  }

  /** No motion, just a fade-in — respects prefers-reduced-motion. */
  _playReducedMotion() {
    const start = performance.now();
    const duration = 400;
    const ctx = this.ctx;
    const tick = (now) => {
      if (this._destroyed) return;
      const t = Math.min(1, (now - start) / duration);
      ctx.clearRect(0, 0, this._w, this._h);
      ctx.globalAlpha = t;
      ctx.fillStyle = this.options.colors[0];
      ctx.font = `700 ${this._h * 0.5}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.options.text, this._w / 2, this._h / 2);
      ctx.globalAlpha = 1;
      if (t < 1) {
        this._raf = requestAnimationFrame(tick);
      } else {
        this._raf = null;
        if (typeof this.options.onComplete === 'function') this.options.onComplete();
      }
    };
    this._raf = requestAnimationFrame(tick);
  }

  /**
   * First ~500ms: if average frame time indicates we're not keeping up
   * (< ~45fps), permanently drop a chunk of the pool by marking excess
   * particles as already-settled (they stop being simulated and snap to
   * their target), which is cheaper than restarting the whole animation.
   */
  _probeFps(now, dt) {
    if (now - this._startTime > 500) { this._fpsProbe.active = false; return; }
    if (dt <= 0) return;
    this._fpsProbe.samples++;
    this._fpsProbe.totalMs += dt;
    if (this._fpsProbe.samples < 6) return;
    const avgFps = 1000 / (this._fpsProbe.totalMs / this._fpsProbe.samples);
    if (avgFps < 45 && this._activeCount === undefined) {
      this._activeCount = Math.max(this.options.particleCountMin, Math.round(this.px.length * 0.5));
    }
    this._fpsProbe.active = false;
  }

  _render(elapsedMs) {
    const { vortexDuration, settleDuration, overshoot } = this.options;
    const ctx = this.ctx;
    const n = this._activeCount ?? this.px.length;
    const cx0 = this._w / 2;
    const cy0 = this._h / 2;

    ctx.clearRect(0, 0, this._w, this._h);
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < n; i++) {
      let x, y, alpha;

      if (elapsedMs < vortexDuration) {
        // --- Phase 1: vortex swirl ---
        // Archimedean spiral r = a + bθ, θ growing linearly with time so the
        // angular speed (dθ/dt) is constant — that's what keeps the swirl
        // looking like one continuous rotation instead of particles
        // "catching up" to each other. Radius shrinks as θ grows (b < 0),
        // giving the classic "sucked toward the center" vortex read.
        const t = elapsedMs / vortexDuration; // 0..1
        const theta = this.cx[i] + t * Math.PI * 4; // ~2 full turns
        const r = this.r0[i] * (1 - 0.55 * t); // spiral inward, never to 0
        x = cx0 + Math.cos(theta) * r;
        y = cy0 + Math.sin(theta) * r * 0.72; // slight ellipse reads better on wide canvases
        alpha = Math.min(1, t * 3);
        this.settleFromX[i] = x;
        this.settleFromY[i] = y;
      } else {
        // --- Phase 2: peel off toward target, staggered, with overshoot ---
        const localElapsed = elapsedMs - vortexDuration - this.delay[i];
        if (localElapsed <= 0) {
          // Still swirling in place (holding last vortex position) until this
          // particle's individual stagger delay elapses.
          x = this.settleFromX[i];
          y = this.settleFromY[i];
          alpha = 1;
        } else {
          const t = Math.min(1, localElapsed / settleDuration);
          const eased = easeOutBack(t, overshoot);
          x = this.settleFromX[i] + (this.tx[i] - this.settleFromX[i]) * eased;
          y = this.settleFromY[i] + (this.ty[i] - this.settleFromY[i]) * eased;
          alpha = 1;
        }
      }

      this.px[i] = x;
      this.py[i] = y;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.options.colors[this.colorIdx[i]];
      ctx.beginPath();
      ctx.arc(x, y, this.size[i], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Cancels the animation and releases all references. Idempotent, safe mid-flight. */
  destroy() {
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    if (this._resizeObserver) this._resizeObserver.disconnect();
    this._resizeObserver = null;
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas = null;
    this.ctx = null;
    this.px = this.py = this.tx = this.ty = this.cx = this.r0 = null;
    this.settleFromX = this.settleFromY = this.delay = this.size = this.colorIdx = null;
  }
}

export default VortexIntro;

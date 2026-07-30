/**
 * Interactive3DBoxes — scroll-driven rotation + hover tilt for a grid of
 * CSS 3D cards. Zero dependencies: `transform-style: preserve-3d` and
 * CSS custom properties only, no WebGL.
 *
 * Composition model: each box's final transform is
 *   rotateY( scrollBaseY + hoverTiltY )  rotateX( hoverTiltX )  translateZ(z)
 * — scroll owns Y rotation as the box crosses the viewport, hover adds a
 * small tilt on top (X purely from hover, Y additive), and mouse-leave
 * springs the hover component back to 0 while scroll rotation keeps going.
 *
 * Usage:
 *   const boxes = new Interactive3DBoxes();
 *   boxes.init('.box-grid', { hoverTiltDeg: 10, scrollRotationDeg: 360 });
 *   // later:
 *   boxes.destroy();
 *
 * @module interactive-3d-boxes
 */

/**
 * @typedef {Object} Interactive3DBoxesOptions
 * @property {string} [boxSelector='.box3d']   Selector (within the container) for individual box elements.
 * @property {number} [hoverTiltDeg=10]        Max hover tilt in degrees (±range) for both axes.
 * @property {number} [scrollRotationDeg=360]  Total Y rotation applied as a box crosses the viewport top-to-bottom.
 * @property {number} [translateZMax=40]       Max translateZ "pop" (px) applied near viewport center.
 * @property {string} [viewportMargin='100% 0px 100% 0px'] IntersectionObserver rootMargin — how far outside the
 *   viewport a box still counts as "active" and gets updated (caps simultaneous animated boxes for large grids).
 * @property {number} [lerp=0.18]              Spring-back lerp factor per frame (0..1) for hover release.
 */

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

export class Interactive3DBoxes {
  constructor() {
    this.container = null;
    this.options = null;
    /** @type {Array<BoxState>} */
    this._boxes = [];
    this._boxByEl = new Map();
    this._io = null;
    this._raf = null;
    this._loopRunning = false;
    this._hoveredBox = null;
    this._destroyed = false;

    // Bound once so add/removeEventListener reference the same function.
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerLeaveContainer = this._onPointerLeaveContainer.bind(this);
    this._tick = this._tick.bind(this);
  }

  /**
   * @param {string|HTMLElement} containerSelector
   * @param {Interactive3DBoxesOptions} [options]
   */
  init(containerSelector, options = {}) {
    const container = typeof containerSelector === 'string'
      ? document.querySelector(containerSelector)
      : containerSelector;
    if (!container) throw new Error('Interactive3DBoxes.init: container not found');

    this.container = container;
    this.options = {
      boxSelector: '.box3d',
      hoverTiltDeg: 10,
      scrollRotationDeg: 360,
      translateZMax: 40,
      viewportMargin: '100% 0px 100% 0px',
      lerp: 0.18,
      ...options,
    };
    this._destroyed = false;

    const els = Array.from(container.querySelectorAll(this.options.boxSelector));
    this._boxes = els.map((el) => {
      el.style.willChange = 'transform';
      /** @type {BoxState} */
      const state = {
        el,
        active: false,       // inside IntersectionObserver margin
        rect: null,           // filled during the read pass each frame
        scrollProgress: 0,    // 0..1 — how far the box has crossed the viewport
        hoverTiltX: 0,
        hoverTiltY: 0,
        targetTiltX: 0,
        targetTiltY: 0,
        pointerX: null,       // last known pointer position relative to box center, in [-1,1]
        pointerY: null,
        settled: true,        // true once hover tilt has fully lerped back to 0
      };
      this._boxByEl.set(el, state);
      return state;
    });

    this._io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const state = this._boxByEl.get(entry.target);
          if (!state) continue;
          state.active = entry.isIntersecting;
        }
        this._ensureLoop();
      },
      { root: null, rootMargin: this.options.viewportMargin, threshold: 0 },
    );
    for (const state of this._boxes) this._io.observe(state.el);

    // Delegated pointer handling — one listener for the whole grid rather
    // than one per box, so cost doesn't scale with grid size. We only ever
    // store the raw pointer position here (a "request"); the actual
    // getBoundingClientRect() read and style write happen in the next
    // rAF tick, batched with everything else (one update per frame, per spec).
    container.addEventListener('pointermove', this._onPointerMove, { passive: true });
    container.addEventListener('pointerleave', this._onPointerLeaveContainer, { passive: true });

    this._ensureLoop();
  }

  _onPointerMove(e) {
    const el = e.target.closest ? e.target.closest(this.options.boxSelector) : null;
    const state = el ? this._boxByEl.get(el) : null;

    if (this._hoveredBox && this._hoveredBox !== state) {
      this._releaseHover(this._hoveredBox);
    }
    if (state) {
      // Store raw client coords; converted to a local ratio during the read
      // pass (needs a fresh rect, which we batch with all other reads).
      state.pendingClientX = e.clientX;
      state.pendingClientY = e.clientY;
      state.hovering = true;
      this._hoveredBox = state;
      this._ensureLoop();
    } else {
      this._hoveredBox = null;
    }
  }

  _onPointerLeaveContainer() {
    if (this._hoveredBox) this._releaseHover(this._hoveredBox);
    this._hoveredBox = null;
  }

  _releaseHover(state) {
    state.hovering = false;
    state.targetTiltX = 0;
    state.targetTiltY = 0;
    state.settled = false; // let the lerp finish the spring-back over the next frames
    this._ensureLoop();
  }

  _ensureLoop() {
    if (this._loopRunning || this._destroyed) return;
    const anyWork = this._boxes.some((b) => b.active || !b.settled);
    if (!anyWork) return;
    this._loopRunning = true;
    this._raf = requestAnimationFrame(this._tick);
  }

  _tick() {
    if (this._destroyed) return;
    const { hoverTiltDeg, scrollRotationDeg, translateZMax, lerp: lerpFactor } = this.options;
    const vh = window.innerHeight;

    // --- READ pass: gather every rect up front, before any style write ---
    const work = [];
    for (const state of this._boxes) {
      if (!state.active && state.settled) continue;
      const rect = state.el.getBoundingClientRect();
      work.push({ state, rect });
    }

    // --- COMPUTE + WRITE pass: pure math against the cached rects, then
    // a single style write per box. No reads occur below this line. ---
    let anyUnsettled = false;
    for (const { state, rect } of work) {
      if (state.active) {
        // Scroll progress: 0 when the box's top edge is at the viewport's
        // bottom edge, 1 when its top edge has exited past the viewport's
        // top edge — i.e. progress tracks the box's full traversal.
        const progress = clamp((vh - rect.top) / (vh + rect.height), 0, 1);
        state.scrollProgress = progress;
      }

      if (state.pendingClientX != null) {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const nx = clamp((state.pendingClientX - cx) / (rect.width / 2), -1, 1);
        const ny = clamp((state.pendingClientY - cy) / (rect.height / 2), -1, 1);
        state.targetTiltY = nx * hoverTiltDeg;
        state.targetTiltX = -ny * hoverTiltDeg; // invert so the top tilts away from a cursor near the top
        state.pendingClientX = null;
        state.pendingClientY = null;
      }

      const dx = state.targetTiltX - state.hoverTiltX;
      const dy = state.targetTiltY - state.hoverTiltY;
      if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
        state.hoverTiltX = state.targetTiltX;
        state.hoverTiltY = state.targetTiltY;
        state.settled = state.targetTiltX === 0 && state.targetTiltY === 0;
      } else {
        state.hoverTiltX = lerp(state.hoverTiltX, state.targetTiltX, lerpFactor);
        state.hoverTiltY = lerp(state.hoverTiltY, state.targetTiltY, lerpFactor);
        state.settled = false;
        anyUnsettled = true;
      }

      const baseRotateY = state.scrollProgress * scrollRotationDeg;
      const rotateY = baseRotateY + state.hoverTiltY;
      const rotateX = state.hoverTiltX;
      const translateZ = Math.sin(state.scrollProgress * Math.PI) * translateZMax;

      // Custom properties, not a full transform string rewrite: cheaper
      // style recalculation, and keeps the CSS (which composes the actual
      // `transform`) as the single source of truth for the property order.
      const s = state.el.style;
      s.setProperty('--rotate-x', rotateX.toFixed(2) + 'deg');
      s.setProperty('--rotate-y', rotateY.toFixed(2) + 'deg');
      s.setProperty('--translate-z', translateZ.toFixed(1) + 'px');
    }

    const stillActive = this._boxes.some((b) => b.active);
    if (stillActive || anyUnsettled) {
      this._raf = requestAnimationFrame(this._tick);
    } else {
      this._loopRunning = false;
      this._raf = null;
    }
  }

  /** Disconnects observers/listeners and cancels the loop. Idempotent. */
  destroy() {
    this._destroyed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._loopRunning = false;
    if (this._io) this._io.disconnect();
    this._io = null;
    if (this.container) {
      this.container.removeEventListener('pointermove', this._onPointerMove);
      this.container.removeEventListener('pointerleave', this._onPointerLeaveContainer);
    }
    this.container = null;
    this._boxes = [];
    this._boxByEl.clear();
    this._hoveredBox = null;
  }
}

/**
 * @typedef {Object} BoxState
 * @property {HTMLElement} el
 * @property {boolean} active
 * @property {number} scrollProgress
 * @property {number} hoverTiltX
 * @property {number} hoverTiltY
 * @property {number} targetTiltX
 * @property {number} targetTiltY
 * @property {number|null} pendingClientX
 * @property {number|null} pendingClientY
 * @property {boolean} settled
 */

export default Interactive3DBoxes;

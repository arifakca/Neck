import * as THREE from 'three';

function hexToRgb(hex) {
  if (hex.length === 4) {
    // #abc → #aabbcc
    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

// Renders a fluid's particles as a low-res LED grid masked to a circle,
// onto a CanvasTexture suitable for mapping onto the disc's top face.
//
// Fluid coordinates are normalized to the unit disc [-1, 1]^2.
// Canvas y is flipped so fluid +y appears at the top of the texture.
export class LedScreen {
  constructor({ size = 512 } = {}) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d');

    // Offscreen canvas where dots are drawn first, then composited onto the
    // main canvas (sharp on top, optionally blurred underneath for glow).
    // This keeps glow to ONE blur pass instead of per-rect shadowBlur, which
    // is orders of magnitude faster.
    this.dotsCanvas = document.createElement('canvas');
    this.dotsCanvas.width = size;
    this.dotsCanvas.height = size;
    this.dotsCtx = this.dotsCanvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 1;

    this.resolution = 28;
    this.bgColor = '#0a0a0a';
    this.dotColor = '#e8d8a8';
    this.dotFill = 0.62; // fraction of cell occupied by the lit square
    // Each particle lights cells whose center sits within this multiple of
    // the particle's physical radius. ~0.7 gives roughly one-to-two LED
    // cells per particle so individuals are visible instead of merging into
    // big clusters.
    this.particleFootprint = 0.7;
    this.glow = false;
    this.speedGlow = false;
    // Multiplier on the bloom blur radius (1 = current cellPx * 0.7).
    this.glowStrength = 1.0;
    // Speed (length of fluid velocity) that maps to full brightness when
    // speedGlow is on. Anything below renders dimmer.
    this.speedRef = 3.0;
    // Whitewater / foam: blend the dot color toward whitewaterColor based on
    // particle speed and isolation (low neighbor count). Per-cell whiteness
    // takes the max over particles in that cell.
    this.whitewater = false;
    this.whitewaterAmount = 1.0;
    this.whitewaterColor = '#ffffff';
    // Whiteness below this is suppressed entirely; above is rescaled to fill
    // (threshold, 1] → (0, 1]. Lets the user filter out the long tail of
    // mildly-foamy particles and only show the truly splashy/isolated ones.
    this.whitewaterThreshold = 0;
    // Speed at which a particle is fully white from motion alone. Lower =
    // more reactive to sloshing.
    this.whitewaterSpeedRef = 1.0;
    // Particles with fewer than this many neighbors in their 3x3 grid
    // neighborhood get extra whiteness from isolation. With ~600 particles
    // most interior particles have 6-8 neighbors, surface/droplets fewer.
    this.whitewaterIsolationRef = 8;
  }

  setGlow(enabled) { this.glow = !!enabled; }
  setSpeedGlow(enabled) { this.speedGlow = !!enabled; }
  setParticleFootprint(v) { this.particleFootprint = Math.max(0.05, v); }
  setDotFill(v) { this.dotFill = Math.max(0.05, Math.min(1, v)); }
  setGlowStrength(v) { this.glowStrength = Math.max(0, v); }
  setSpeedRef(v) { this.speedRef = Math.max(0.05, v); }
  setWhitewater(enabled) { this.whitewater = !!enabled; }
  setWhitewaterAmount(v) { this.whitewaterAmount = Math.max(0, Math.min(1, v)); }
  setWhitewaterColor(c) { this.whitewaterColor = c; }
  setWhitewaterThreshold(v) { this.whitewaterThreshold = Math.max(0, Math.min(0.99, v)); }

  setResolution(n) {
    this.resolution = Math.max(4, Math.min(160, n | 0));
  }

  setColors({ liquid, background } = {}) {
    if (liquid) this.dotColor = liquid;
    if (background) this.bgColor = background;
  }

  render(fluid) {
    const ctx = this.ctx;
    const dotsCtx = this.dotsCtx;
    const size = this.size;
    const N = this.resolution;

    ctx.fillStyle = this.bgColor;
    ctx.fillRect(0, 0, size, size);
    dotsCtx.clearRect(0, 0, size, size);

    // For each particle, mark the LED cells whose center sits within its
    // (slightly inflated) radius. When speedGlow is on, each cell tracks the
    // max particle speed (for brightness modulation). When whitewater is on,
    // each cell tracks the max "whiteness" (for color blending).
    const cells = new Uint8Array(N * N);
    const cellSpeed = this.speedGlow ? new Float32Array(N * N) : null;
    const cellWhite = this.whitewater ? new Float32Array(N * N) : null;
    const needSpeedValue = !!cellSpeed || !!cellWhite;
    const px = fluid.x;
    const py = fluid.y;
    const vx = fluid.vx;
    const vy = fluid.vy;
    const neighbors = fluid.neighbors;
    const count = fluid.count;
    const rCells = (fluid.radius * this.particleFootprint) * 0.5 * N;
    const rCellsSq = rCells * rCells;
    const wsRef = 1 / Math.max(0.001, this.whitewaterSpeedRef);
    const wnRef = 1 / Math.max(0.001, this.whitewaterIsolationRef);
    const wAmt = this.whitewaterAmount;
    const wThresh = this.whitewaterThreshold;
    const wInvSpan = 1 / Math.max(0.001, 1 - wThresh);
    for (let p = 0; p < count; p++) {
      const fx = (px[p] + 1) * 0.5 * N;
      const fy = (py[p] + 1) * 0.5 * N;
      const speed = needSpeedValue
        ? Math.sqrt(vx[p] * vx[p] + vy[p] * vy[p])
        : 0;
      let whiteness = 0;
      if (cellWhite) {
        const speedPart = Math.min(1, speed * wsRef);
        const nb = neighbors ? neighbors[p] : 0;
        // Fade the isolation contribution near the disc boundary. Particles
        // there have fewer neighbors only because the 3x3 cell window spills
        // outside the wall, not because they're truly alone — without this
        // the outer ring would always foam regardless of fluid state.
        const dist = Math.sqrt(px[p] * px[p] + py[p] * py[p]);
        const boundaryFade = Math.min(1, Math.max(0, (1 - dist) / 0.22));
        const isoPart = Math.max(0, 1 - nb * wnRef) * boundaryFade;
        const wRaw = Math.min(1, speedPart + isoPart);
        // Threshold filter: drop anything below cutoff, rescale the rest.
        const wFiltered = wRaw > wThresh ? (wRaw - wThresh) * wInvSpan : 0;
        whiteness = wFiltered * wAmt;
      }
      const i0 = Math.max(0, Math.floor(fx - rCells));
      const i1 = Math.min(N - 1, Math.floor(fx + rCells));
      const j0 = Math.max(0, Math.floor(fy - rCells));
      const j1 = Math.min(N - 1, Math.floor(fy + rCells));
      for (let jj = j0; jj <= j1; jj++) {
        const dy = (jj + 0.5) - fy;
        const dySq = dy * dy;
        const row = jj * N;
        for (let ii = i0; ii <= i1; ii++) {
          const dx = (ii + 0.5) - fx;
          if (dx * dx + dySq <= rCellsSq) {
            const idx = row + ii;
            cells[idx] = 1;
            if (cellSpeed && speed > cellSpeed[idx]) cellSpeed[idx] = speed;
            if (cellWhite && whiteness > cellWhite[idx]) cellWhite[idx] = whiteness;
          }
        }
      }
    }

    const cellPx = size / N;
    const dotSize = cellPx * this.dotFill;
    const dotOffset = (cellPx - dotSize) * 0.5;
    // Mask: keep cells whose center is inside the unit circle.
    const rMaskSq = 0.985 * 0.985;

    const useSpeed = !!cellSpeed;
    const useWhite = !!cellWhite;
    const invSpeedRef = 1 / Math.max(0.001, this.speedRef);
    const minBrightness = 0.22;

    // For whitewater we precompute a small base→whitewaterColor palette, then
    // pick a level per cell. Avoids per-cell color string composition.
    let palette = null;
    const PAL = 16;
    if (useWhite) {
      const base = hexToRgb(this.dotColor);
      const white = hexToRgb(this.whitewaterColor);
      palette = new Array(PAL);
      for (let k = 0; k < PAL; k++) {
        const t = k / (PAL - 1);
        const r = (base.r + (white.r - base.r) * t) | 0;
        const g = (base.g + (white.g - base.g) * t) | 0;
        const b = (base.b + (white.b - base.b) * t) | 0;
        palette[k] = `rgb(${r},${g},${b})`;
      }
    }

    // Pass 1: draw all dots into the offscreen layer at their brightness +
    // (optional) blended whitewater color.
    if (!useWhite) dotsCtx.fillStyle = this.dotColor;
    for (let j = 0; j < N; j++) {
      const ny = ((j + 0.5) / N) * 2 - 1;
      const dySq = ny * ny;
      const cellTopY = (N - 1 - j) * cellPx;
      for (let i = 0; i < N; i++) {
        const nx = ((i + 0.5) / N) * 2 - 1;
        if (nx * nx + dySq > rMaskSq) continue;
        const idx = j * N + i;
        if (!cells[idx]) continue;
        if (useWhite) {
          const w = cellWhite[idx];
          // ceil() so any nonzero whiteness picks at least the first blended
          // step in the palette (otherwise sub-1/PAL values quantize to 0
          // and you'd see no foam until whiteness crossed ~6%).
          const lvl = w <= 0 ? 0 : Math.min(PAL - 1, Math.ceil(w * (PAL - 1)));
          dotsCtx.fillStyle = palette[lvl];
        }
        if (useSpeed) {
          const t = Math.min(1, cellSpeed[idx] * invSpeedRef);
          dotsCtx.globalAlpha = minBrightness + (1 - minBrightness) * t;
        }
        dotsCtx.fillRect(i * cellPx + dotOffset, cellTopY + dotOffset, dotSize, dotSize);
      }
    }
    if (useSpeed) dotsCtx.globalAlpha = 1;

    // Pass 2: optional bloom — one blurred additive copy of the dots layer
    // underneath, cheap because it's a single drawImage with a CSS filter.
    if (this.glow) {
      ctx.save();
      ctx.filter = `blur(${cellPx * 0.7 * this.glowStrength}px)`;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.dotsCanvas, 0, 0);
      ctx.restore();
    }

    // Pass 3: sharp dots on top.
    ctx.drawImage(this.dotsCanvas, 0, 0);

    this.texture.needsUpdate = true;
  }
}

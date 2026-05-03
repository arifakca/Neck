import * as THREE from 'three';

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
    // the particle's physical radius. >1 fuses neighboring particles into a
    // continuous liquid surface at high LED resolutions.
    this.particleFootprint = 1.4;
    this.glow = false;
    this.speedGlow = false;
    // Speed (length of fluid velocity) that maps to full brightness when
    // speedGlow is on. Anything below renders dimmer.
    this.speedRef = 3.0;
  }

  setGlow(enabled) { this.glow = !!enabled; }
  setSpeedGlow(enabled) { this.speedGlow = !!enabled; }

  setResolution(n) {
    this.resolution = Math.max(4, Math.min(160, n | 0));
  }

  setColors({ liquid, background } = {}) {
    if (liquid) this.dotColor = liquid;
    if (background) this.bgColor = background;
  }

  render(fluid) {
    const ctx = this.ctx;
    const size = this.size;
    const N = this.resolution;

    ctx.fillStyle = this.bgColor;
    ctx.fillRect(0, 0, size, size);

    // For each particle, mark the LED cells whose center sits within its
    // (slightly inflated) radius. When speedGlow is on, each cell also tracks
    // the max particle speed seen, used later as the cell's brightness.
    // Indices: i = column along fluid.x, j = row along fluid.y.
    const cells = new Uint8Array(N * N);
    const cellSpeed = this.speedGlow ? new Float32Array(N * N) : null;
    const px = fluid.x;
    const py = fluid.y;
    const vx = fluid.vx;
    const vy = fluid.vy;
    const count = fluid.count;
    const rCells = (fluid.radius * this.particleFootprint) * 0.5 * N;
    const rCellsSq = rCells * rCells;
    for (let p = 0; p < count; p++) {
      const fx = (px[p] + 1) * 0.5 * N;
      const fy = (py[p] + 1) * 0.5 * N;
      const speed = cellSpeed
        ? Math.sqrt(vx[p] * vx[p] + vy[p] * vy[p])
        : 0;
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
            cells[row + ii] = 1;
            if (cellSpeed && speed > cellSpeed[row + ii]) {
              cellSpeed[row + ii] = speed;
            }
          }
        }
      }
    }

    const cellPx = size / N;
    const dotSize = cellPx * this.dotFill;
    const dotOffset = (cellPx - dotSize) * 0.5;
    // Mask: keep cells whose center is inside the unit circle.
    const rMaskSq = 0.985 * 0.985;

    ctx.fillStyle = this.dotColor;
    if (this.glow) {
      ctx.shadowColor = this.dotColor;
      ctx.shadowBlur = cellPx * 0.85;
    } else {
      ctx.shadowBlur = 0;
    }

    const useSpeed = !!cellSpeed;
    const invSpeedRef = 1 / Math.max(0.001, this.speedRef);
    const minBrightness = 0.22;

    for (let j = 0; j < N; j++) {
      const ny = ((j + 0.5) / N) * 2 - 1;
      const dySq = ny * ny;
      // Flip so fluid +y → top of canvas.
      const cellTopY = (N - 1 - j) * cellPx;
      for (let i = 0; i < N; i++) {
        const nx = ((i + 0.5) / N) * 2 - 1;
        if (nx * nx + dySq > rMaskSq) continue;
        const idx = j * N + i;
        if (!cells[idx]) continue;
        if (useSpeed) {
          const t = Math.min(1, cellSpeed[idx] * invSpeedRef);
          ctx.globalAlpha = minBrightness + (1 - minBrightness) * t;
        }
        ctx.fillRect(i * cellPx + dotOffset, cellTopY + dotOffset, dotSize, dotSize);
      }
    }
    if (useSpeed) ctx.globalAlpha = 1;
    if (this.glow) ctx.shadowBlur = 0;

    this.texture.needsUpdate = true;
  }
}

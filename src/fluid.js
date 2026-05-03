// 2D position-based particle fluid inside a unit circle.
// Coordinates are normalized: domain is the disc x^2 + y^2 <= 1.

export class Fluid {
  constructor({ count = 600, radius = 0.032 } = {}) {
    this.radius = radius;
    this.gx = 0;
    this.gy = 0;
    this.damping = 0.985;
    this.restitution = 0.3;
    this.subSteps = 2;
    this.relaxIters = 4;
    this._allocate(count);
    this._scatter();
  }

  _allocate(count) {
    this.count = count;
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this._rebuildGrid();
  }

  _rebuildGrid() {
    // Uniform spatial hash grid covering the unit square [-1, 1]^2.
    this.cellSize = this.radius * 2;
    this.gridDim = Math.ceil(2 / this.cellSize);
    this.cellHead = new Int32Array(this.gridDim * this.gridDim);
    this.cellNext = new Int32Array(this.count);
  }

  _scatter() {
    // Random points inside a circle of radius 0.95 to leave a margin.
    const r = this.radius;
    for (let i = 0; i < this.count; i++) {
      let px, py;
      do {
        px = (Math.random() * 2 - 1);
        py = (Math.random() * 2 - 1);
      } while (px * px + py * py > (1 - r) * (1 - r));
      this.x[i] = px;
      this.y[i] = py;
      this.vx[i] = 0;
      this.vy[i] = 0;
    }
  }

  setGravity(gx, gy) {
    this.gx = gx;
    this.gy = gy;
  }

  setCount(n) {
    if (n === this.count) return;
    this._allocate(n);
    this._scatter();
  }

  _cellIndex(cx, cy) {
    return cy * this.gridDim + cx;
  }

  _bucketize() {
    this.cellHead.fill(-1);
    const inv = 1 / this.cellSize;
    const dim = this.gridDim;
    for (let i = 0; i < this.count; i++) {
      let cx = Math.floor((this.px[i] + 1) * inv);
      let cy = Math.floor((this.py[i] + 1) * inv);
      if (cx < 0) cx = 0; else if (cx >= dim) cx = dim - 1;
      if (cy < 0) cy = 0; else if (cy >= dim) cy = dim - 1;
      const idx = cy * dim + cx;
      this.cellNext[i] = this.cellHead[idx];
      this.cellHead[idx] = i;
    }
  }

  _resolveCollisions() {
    const r = this.radius;
    const minDist = r * 2;
    const minDistSq = minDist * minDist;
    const dim = this.gridDim;
    const inv = 1 / this.cellSize;

    for (let i = 0; i < this.count; i++) {
      const xi = this.px[i];
      const yi = this.py[i];
      let cx = Math.floor((xi + 1) * inv);
      let cy = Math.floor((yi + 1) * inv);
      if (cx < 0) cx = 0; else if (cx >= dim) cx = dim - 1;
      if (cy < 0) cy = 0; else if (cy >= dim) cy = dim - 1;

      for (let oy = -1; oy <= 1; oy++) {
        const ny = cy + oy;
        if (ny < 0 || ny >= dim) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = cx + ox;
          if (nx < 0 || nx >= dim) continue;
          let j = this.cellHead[ny * dim + nx];
          while (j !== -1) {
            if (j > i) {
              const dx = this.px[j] - xi;
              const dy = this.py[j] - yi;
              const d2 = dx * dx + dy * dy;
              if (d2 < minDistSq && d2 > 1e-12) {
                const d = Math.sqrt(d2);
                const overlap = (minDist - d) * 0.5;
                const nxn = dx / d;
                const nyn = dy / d;
                this.px[i] -= nxn * overlap;
                this.py[i] -= nyn * overlap;
                this.px[j] += nxn * overlap;
                this.py[j] += nyn * overlap;
              } else if (d2 <= 1e-12) {
                // Coincident — nudge apart deterministically.
                this.px[j] += minDist * 0.5;
              }
            }
            j = this.cellNext[j];
          }
        }
      }
    }
  }

  _resolveBoundary() {
    const r = this.radius;
    const limit = 1 - r;
    const limitSq = limit * limit;
    for (let i = 0; i < this.count; i++) {
      const x = this.px[i];
      const y = this.py[i];
      const d2 = x * x + y * y;
      if (d2 > limitSq) {
        const d = Math.sqrt(d2);
        const nx = x / d;
        const ny = y / d;
        this.px[i] = nx * limit;
        this.py[i] = ny * limit;
        // Reflect the normal component of velocity.
        const vn = this.vx[i] * nx + this.vy[i] * ny;
        if (vn > 0) {
          const k = (1 + this.restitution) * vn;
          this.vx[i] -= k * nx;
          this.vy[i] -= k * ny;
        }
      }
    }
  }

  step(dt) {
    const sub = this.subSteps;
    const h = dt / sub;
    for (let s = 0; s < sub; s++) {
      // Apply gravity + damping, predict positions.
      for (let i = 0; i < this.count; i++) {
        this.vx[i] = (this.vx[i] + this.gx * h) * this.damping;
        this.vy[i] = (this.vy[i] + this.gy * h) * this.damping;
        this.px[i] = this.x[i] + this.vx[i] * h;
        this.py[i] = this.y[i] + this.vy[i] * h;
      }
      // Iteratively resolve collisions and the boundary.
      for (let k = 0; k < this.relaxIters; k++) {
        this._bucketize();
        this._resolveCollisions();
        this._resolveBoundary();
      }
      // Recover velocities from predicted positions and commit.
      const invH = 1 / h;
      for (let i = 0; i < this.count; i++) {
        this.vx[i] = (this.px[i] - this.x[i]) * invH;
        this.vy[i] = (this.py[i] - this.y[i]) * invH;
        this.x[i] = this.px[i];
        this.y[i] = this.py[i];
      }
    }
  }
}

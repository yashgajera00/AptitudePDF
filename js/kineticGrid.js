/**
 * Kinetic Grid Interactive Background Engine
 * Full-viewport kinetic warped grid with cursor pull, edge pinning, glowing nodes, and click ripples.
 */

class KineticGridEngine {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.options = Object.assign({
      cellSize: 55,
      influenceRadius: 260,
      maxWarp: 24,
      dotSpacing: 28,
      lerpSpeed: 0.08,
      isDark: false
    }, options);

    this.mouse = { x: -9999, y: -9999 };
    this.targetMouse = { x: -9999, y: -9999 };
    this.ripples = [];
    this.rafId = null;
    this.dpr = window.devicePixelRatio || 1;

    this.init();
  }

  init() {
    this.resize();
    this.bindEvents();
    this.animate(performance.now());
  }

  lerpN(a, b, t) {
    return a + (b - a) * t;
  }

  lerpColor(base, active, t) {
    const r = Math.round(this.lerpN(base.r, active.r, t));
    const g = Math.round(this.lerpN(base.g, active.g, t));
    const b = Math.round(this.lerpN(base.b, active.b, t));
    const a = this.lerpN(base.a, active.a, t);
    return `rgba(${r},${g},${b},${a.toFixed(3)})`;
  }

  getTheme() {
    if (this.options.isDark) {
      return {
        bg: '#0f1420',
        dot: 'rgba(255,255,255,0.06)',
        lineBase: { r: 255, g: 255, b: 255, a: 0.12 },
        lineActive: { r: 99, g: 102, b: 241, a: 0.95 },
        nodeBase: { r: 255, g: 255, b: 255, a: 0.2 },
        nodeActive: { r: 129, g: 140, b: 248, a: 1.0 },
        glow: '99,102,241',
        ripple: '129,140,248'
      };
    } else {
      return {
        bg: '#f8fafc',
        dot: 'rgba(15,23,42,0.05)',
        lineBase: { r: 15, g: 23, b: 42, a: 0.10 },
        lineActive: { r: 79, g: 70, b: 229, a: 0.9 },
        nodeBase: { r: 15, g: 23, b: 42, a: 0.2 },
        nodeActive: { r: 79, g: 70, b: 229, a: 1.0 },
        glow: '79,70,229',
        ripple: '99,102,241'
      };
    }
  }

  setTheme(isDark) {
    this.options.isDark = isDark;
  }

  resize() {
    if (!this.canvas) return;
    this.dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    if (this.ctx) {
      this.ctx.scale(this.dpr, this.dpr);
    }
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('mousemove', (e) => {
      this.targetMouse.x = e.clientX;
      this.targetMouse.y = e.clientY;
    });

    window.addEventListener('mouseleave', () => {
      this.targetMouse.x = -9999;
      this.targetMouse.y = -9999;
    });

    window.addEventListener('click', (e) => {
      this.ripples.push({
        x: e.clientX,
        y: e.clientY,
        radius: 0,
        opacity: 1,
        born: performance.now()
      });
    });
  }

  getWarpedPoint(gx, gy, col, row, mouse, ripples, cols, rows) {
    const edgeMargin = 1.5;
    const colPin = Math.min(col / edgeMargin, (cols - 1 - col) / edgeMargin, 1);
    const rowPin = Math.min(row / edgeMargin, (rows - 1 - row) / edgeMargin, 1);
    const pinFactor = colPin * colPin * rowPin * rowPin;

    const dx = gx - mouse.x;
    const dy = gy - mouse.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const proximity = Math.max(0, 1 - dist / this.options.influenceRadius) * pinFactor;

    let rx = 0, ry = 0;
    for (const r of ripples) {
      const rdx = gx - r.x;
      const rdy = gy - r.y;
      const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
      const waveWidth = 55;
      const diff = rdist - r.radius;
      if (Math.abs(diff) < waveWidth) {
        const strength = (1 - Math.abs(diff) / waveWidth) * r.opacity * 18 * pinFactor;
        const angle = Math.atan2(rdy, rdx);
        const sign = diff < 0 ? -1 : 1;
        rx += Math.cos(angle) * strength * sign * -1;
        ry += Math.sin(angle) * strength * sign * -1;
      }
    }

    if (dist < this.options.influenceRadius && dist > 0 && pinFactor > 0) {
      const t = dist / this.options.influenceRadius;
      const eased = t < 0.01 ? 0 : (1 - t) * (1 - t) * Math.min(1, dist / 60);
      const warpAmt = eased * this.options.maxWarp * pinFactor;
      const angle = Math.atan2(dy, dx);
      return {
        pt: {
          x: gx - Math.cos(angle) * warpAmt + rx,
          y: gy - Math.sin(angle) * warpAmt + ry
        },
        proximity
      };
    }

    return { pt: { x: gx + rx, y: gy + ry }, proximity };
  }

  draw(now) {
    if (!this.ctx || !this.canvas) return;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const mouse = this.mouse;
    const ripples = this.ripples;
    const theme = this.getTheme();

    this.ctx.clearRect(0, 0, W, H);

    // Background fill
    this.ctx.fillStyle = theme.bg;
    this.ctx.fillRect(0, 0, W, H);

    // Static background dot texture
    this.ctx.fillStyle = theme.dot;
    for (let x = this.options.dotSpacing / 2; x < W; x += this.options.dotSpacing) {
      for (let y = this.options.dotSpacing / 2; y < H; y += this.options.dotSpacing) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, 0.7, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Update ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const age = (now - r.born) / 1000;
      r.radius = Math.max(0, age * 400);
      r.opacity = Math.max(0, 1 - age * 1.2);
      if (r.opacity <= 0) ripples.splice(i, 1);
    }

    // Build warped grid
    const cols = Math.max(2, Math.ceil(W / this.options.cellSize)) + 1;
    const rows = Math.max(2, Math.ceil(H / this.options.cellSize)) + 1;
    const cellW = W / (cols - 1);
    const cellH = H / (rows - 1);

    const pts = [];
    const prox = [];

    for (let row = 0; row < rows; row++) {
      pts[row] = [];
      prox[row] = [];
      for (let col = 0; col < cols; col++) {
        const { pt, proximity } = this.getWarpedPoint(
          col * cellW,
          row * cellH,
          col,
          row,
          mouse,
          ripples,
          cols,
          rows
        );
        pts[row][col] = pt;
        prox[row][col] = proximity;
      }
    }

    // Grid lines
    const drawSeg = (p1, p2, pr1, pr2) => {
      const avg = (pr1 + pr2) / 2;
      const t = avg * avg * (3 - 2 * avg);
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.strokeStyle = this.lerpColor(theme.lineBase, theme.lineActive, t);
      this.ctx.lineWidth = this.lerpN(0.8, 1.6, t);
      this.ctx.stroke();
    };

    this.ctx.lineCap = 'butt';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols - 1; col++) {
        drawSeg(pts[row][col], pts[row][col + 1], prox[row][col], prox[row][col + 1]);
      }
    }

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows - 1; row++) {
        drawSeg(pts[row][col], pts[row + 1][col], prox[row][col], prox[row + 1][col]);
      }
    }

    // Intersection nodes
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const p = pts[row][col];
        const pr = prox[row][col];
        const t = pr * pr * (3 - 2 * pr);
        const r = this.lerpN(1.8, 3.4, t);

        if (t > 0.3) {
          const glowR = r + this.lerpN(0, 7, (t - 0.3) / 0.7);
          const grd = this.ctx.createRadialGradient(p.x, p.y, r * 0.5, p.x, p.y, glowR);
          grd.addColorStop(0, `rgba(${theme.glow},${(t * 0.35).toFixed(3)})`);
          grd.addColorStop(1, `rgba(${theme.glow},0)`);
          this.ctx.beginPath();
          this.ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
          this.ctx.fillStyle = grd;
          this.ctx.fill();
        }

        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        this.ctx.fillStyle = this.lerpColor(theme.nodeBase, theme.nodeActive, t);
        this.ctx.fill();
      }
    }

    // Ripple rings
    for (const r of ripples) {
      const safeRadius = Math.max(0, r.radius);
      this.ctx.beginPath();
      this.ctx.arc(r.x, r.y, safeRadius, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(${theme.ripple},${(r.opacity * 0.32).toFixed(3)})`;
      this.ctx.lineWidth = 1.6;
      this.ctx.stroke();
    }
  }

  animate(now) {
    this.mouse.x = this.lerpN(this.mouse.x, this.targetMouse.x, this.options.lerpSpeed);
    this.mouse.y = this.lerpN(this.mouse.y, this.targetMouse.y, this.options.lerpSpeed);

    this.draw(now);
    this.rafId = requestAnimationFrame((timestamp) => this.animate(timestamp));
  }
}

window.KineticGridEngine = KineticGridEngine;

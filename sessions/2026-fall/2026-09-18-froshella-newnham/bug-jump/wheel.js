// Prize wheel. Each slice is sized by its weight, so what you see is the real chance.
const COLORS = ["#4285F4", "#EA4335", "#F9AB00", "#34A853"];

export class Wheel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.angle = 0;
    this.prizes = [];
  }

  setPrizes(prizes) {
    const total = prizes.reduce((s, p) => s + p.weight, 0);
    let start = 0;
    this.slices = prizes.map((p, i) => {
      const size = (p.weight / total) * Math.PI * 2;
      const slice = { ...p, start, size, color: COLORS[i % COLORS.length] };
      start += size;
      return slice;
    });
    // Avoid two neighbours sharing a colour when the count wraps.
    if (this.slices.length % 4 === 1 && this.slices.length > 1) this.slices.at(-1).color = COLORS[1];
    this.draw();
  }

  draw() {
    const { ctx, canvas } = this;
    const r = canvas.width / 2, inner = r - 14;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(r, r);
    ctx.rotate(this.angle);
    for (const s of this.slices) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, inner, s.start, s.start + s.size);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#1E1E1E";
      ctx.stroke();

      ctx.save();
      ctx.rotate(s.start + s.size / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = s.color === "#F9AB00" ? "#1E1E1E" : "#FFFFFF";
      const fontSize = Math.max(22, Math.min(46, s.size * 70));
      ctx.font = `700 ${fontSize}px 'Google Sans Flex', system-ui, sans-serif`;
      ctx.fillText(s.label, inner - 36, 0, inner - 120);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, inner, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.restore();
  }

  // The pointer sits at the right edge (angle 0). Resolves with the winning prize.
  spin(onTick) {
    const total = this.slices.reduce((s, p) => s + p.weight, 0);
    let pick = Math.random() * total;
    const winner = this.slices.find((s) => (pick -= s.weight) < 0) ?? this.slices.at(-1);

    const inside = winner.start + winner.size * (0.15 + Math.random() * 0.7);
    const current = ((this.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    let delta = (Math.PI * 2 - inside) - current;
    delta = ((delta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const target = this.angle + delta + Math.PI * 2 * 5;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 600 : 4200;
    const from = this.angle;
    const t0 = performance.now();
    let lastSlice = -1;

    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - t, 4);
        this.angle = from + (target - from) * eased;
        this.draw();
        const at = ((Math.PI * 2 - (this.angle % (Math.PI * 2))) + Math.PI * 2) % (Math.PI * 2);
        const idx = this.slices.findIndex((s) => at >= s.start && at < s.start + s.size);
        onTick?.(idx !== lastSlice);
        lastSlice = idx;
        if (t < 1) requestAnimationFrame(step);
        else resolve(winner);
      };
      requestAnimationFrame(step);
    });
  }
}

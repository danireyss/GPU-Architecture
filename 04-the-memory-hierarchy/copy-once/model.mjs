// Copy once. copy time = bytes / link speed; a step is copy + compute in sequence,
// or the longer of the two when they overlap. Pure functions, no DOM.
export const LINK = { board: 25, check: 20, vram: 500 }; // GB/s
export const OPS = 20e12; // operations a second, the course's example chip
export const copyTime = (gb, rate) => gb / rate;
export const stepTime = (copy, compute, overlap = false) => (overlap ? Math.max(copy, compute) : copy + compute);
export const narrower = (rate) => LINK.vram / rate;
export const lostOps = (seconds) => OPS * seconds;

const bar = (row, t0, t1, extra = {}) => ({ row, t0, t1, ...extra });
// Batches run one after another: copy, compute, copy, compute.
export function inSequence(n, copy, compute, gb, rate) {
  const bars = [];
  for (let i = 0; i < n; i++) { const t = i * stepTime(copy, compute); bars.push(bar("copy", t, t + copy, { gb, rate, dir: "in" }), bar("compute", t + copy, t + copy + compute)); }
  return bars;
}
// Each batch's copy runs during the batch before it, finishing as that batch's computing ends.
export function overlapped(n, copy, compute, gb, rate) {
  const step = stepTime(copy, compute, true), bars = [];
  for (let i = 0; i < n; i++) { const start = copy + i * step; bars.push(bar("compute", start, start + compute), bar("copy", start - copy, start, { gb, rate, dir: "in" })); }
  return bars;
}
// Every kernel copies in, computes and copies out.
export function roundTrip(kernels, gb, rate, compute) {
  const copy = copyTime(gb, rate), bars = [];
  for (let i = 0; i < kernels; i++) { const t = i * (2 * copy + compute); bars.push(bar("copy", t, t + copy, { gb, rate, dir: "in" }), bar("compute", t + copy, t + copy + compute), bar("copy", t + copy + compute, t + 2 * copy + compute, { gb, rate, dir: "out" })); }
  return bars;
}
// In once, the kernels chained in VRAM, back once.
export function chained(kernels, gb, rate, compute) {
  const copy = copyTime(gb, rate), work = kernels * compute;
  return [bar("copy", 0, copy, { gb, rate, dir: "in" }), bar("compute", copy, copy + work), bar("copy", copy + work, 2 * copy + work, { gb, rate, dir: "out" })];
}
export const totalOf = (bars) => Math.max(...bars.map((b) => b.t1));
export const copyingOf = (bars) => bars.filter((b) => b.row === "copy").reduce((sum, b) => sum + b.t1 - b.t0, 0);

export const BATCH = { gb: 2, rate: LINK.check, compute: 0.4 };
export const JOBS = [ // "New job": round figures chosen for the figure, on real PCIe speeds
  { name: "5 kernels on 1 GB, PCIe 4", gb: 1, rate: 32, compute: 0.2, kernels: 5 },
  { name: "2 kernels on 4 GB, PCIe 3", gb: 4, rate: 16, compute: 0.3, kernels: 2 },
  { name: "1 kernel on 8 GB, PCIe 5", gb: 8, rate: 64, compute: 0.5, kernels: 1 },
  { name: "8 kernels on 500 MB, PCIe 4", gb: 0.5, rate: 32, compute: 0.1, kernels: 8 },
];
export const STEPS = ["Copy 8 GB over", "Copy from ordinary RAM", "Run one training step", "Overlap the copies", "Round-trip every kernel", "Keep it on the GPU", "New job"];

// What each step plays: the bars, and a comparison row.
export function plan(index, job = JOBS[0]) {
  const { gb, rate, compute } = BATCH;
  const copy = copyTime(gb, rate);
  const base = (bars, ghost, ghostName, extra = {}) => ({ bars, ghost, ghostName, total: totalOf(bars), copying: copyingOf(bars), ...extra });
  const eight = [bar("copy", 0, copyTime(8, LINK.board), { gb: 8, rate: LINK.board, dir: "in" })];
  const eightVram = [bar("copy", 0, copyTime(8, LINK.vram), { gb: 8, rate: LINK.vram, dir: "in" })];
  if (index === 0) return base(eight, eightVram, "VRAM's speed", { slow: 8, gb: 8, rate: LINK.board, source: "pinned" });
  if (index === 1) return base(eight, eightVram, "VRAM's speed", { slow: 8, gb: 8, rate: LINK.board, source: "ram", hop: true });
  if (index === 2) return base(inSequence(3, copy, compute, gb, rate), null, "", { slow: 4, gb, rate, source: "pinned", step: stepTime(copy, compute), share: copy / stepTime(copy, compute) });
  if (index === 3) { const step = stepTime(copy, compute, true); return base(overlapped(3, copy, compute, gb, rate), inSequence(3, copy, compute, gb, rate), "in sequence", { slow: 4, gb, rate, source: "pinned", step, share: 0, gain: stepTime(copy, compute) / step - 1 }); }
  if (index === 4) return base(roundTrip(3, gb, rate, compute), null, "", { slow: 4, gb, rate, source: "pinned", kernels: 3 });
  if (index === 5) return base(chained(3, gb, rate, compute), roundTrip(3, gb, rate, compute), "round trips", { slow: 4, gb, rate, source: "pinned", kernels: 3 });
  return base(chained(job.kernels, job.gb, job.rate, job.compute), roundTrip(job.kernels, job.gb, job.rate, job.compute), "round trips", { slow: 4, gb: job.gb, rate: job.rate, source: "pinned", kernels: job.kernels, job });
}

// One streaming multiprocessor hiding VRAM latency with resident warps.
// Pure functions only: the page, the gauges, the displays and the chips all read from here.
//
// The machine: one issue port feeds 32 lanes. A warp computes for `compute` cycles, then
// issues a load and sleeps for `wait` cycles until VRAM answers. While it sleeps, the
// scheduler gives the lanes to any other resident warp that is ready (oldest first).

export const SM = {
  registers: 65536, // 32-bit registers in one SM's register file (Volta through Hopper)
  threadsPerWarp: 32,
  regsPerThread: 32, // a property of the kernel, chosen here so a warp needs 1,024
  regsPerWarp: 1024,
  maxWarps: 64, // hardware cap on resident warps per SM (compute capability 7.0 / 8.0 / 9.0)
  lanes: 32,
};

export const BASE = { compute: 10, wait: 100 };

// Steady-state share of cycles the lanes are busy.
export const busyShare = (warps, compute, wait) => (warps <= 0 ? 0 : Math.min(1, (warps * compute) / (compute + wait)));

// Warps needed so the lanes never idle: one computing plus enough to cover the wait.
export const warpsToHide = (compute, wait) => 1 + wait / compute;

export const registersFor = (warps) => warps * SM.regsPerWarp;

// How many warps fit: the register file and the hardware cap, whichever binds first.
export const residentCap = () => Math.min(SM.maxWarps, Math.floor(SM.registers / SM.regsPerWarp));

// The steps of the figure, each a change to the running kernel.
export const STEPS = [
  { id: "launch", label: "Launch the kernel", warps: 1, wait: 100, run: "hold", to: 0 },
  { id: "compute", label: "Compute 10 cycles", warps: 1, wait: 100, run: "until", to: 10 },
  { id: "load", label: "Load from VRAM", warps: 1, wait: 100, run: "until", to: 110 },
  { id: "second", label: "Add a second warp", warps: 2, wait: 100, run: "free" },
  { id: "eleven", label: "Fill to 11 warps", warps: 11, wait: 100, run: "free" },
  { id: "twenty", label: "Pile on 20 warps", warps: 20, wait: 100, run: "free" },
  { id: "slower", label: "Make memory slower", warps: 20, wait: 300, run: "free" },
  { id: "new", label: "New kernel", warps: 0, wait: 100, run: "reset" },
];

// plan: [{ at, warps, compute, wait }], at rising. Warp i joins at the first entry with warps > i.
// A burst takes the compute of the entry in force when it starts; a load takes the wait in
// force when it is issued. Returns every burst and load up to `horizon`.
export function simulate(plan, horizon) {
  const joins = [];
  for (const entry of plan) while (joins.length < entry.warps) joins.push(entry.at);
  const ready = joins.slice();
  const bursts = [];
  const loads = [];
  let free = 0;
  for (;;) {
    let pick = -1;
    for (let i = 0; i < ready.length; i++) if (pick < 0 || ready[i] < ready[pick]) pick = i;
    if (pick < 0) break;
    const start = Math.max(free, ready[pick]);
    if (start >= horizon) break;
    const end = start + entryAt(plan, start).compute;
    const back = end + entryAt(plan, end).wait;
    bursts.push({ warp: pick, start, end });
    loads.push({ warp: pick, start: end, end: back });
    ready[pick] = back;
    free = end;
  }
  return { plan, horizon, joins, bursts, loads };
}

const lastStartingBefore = (list, t) => {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
};

// Cycles the lanes were busy in [a, b].
export function busyBetween(run, a, b) {
  if (b <= a) return 0;
  let total = 0;
  for (let i = lastStartingBefore(run.bursts, b); i >= 0; i--) {
    const burst = run.bursts[i];
    if (burst.end <= a) break;
    total += Math.max(0, Math.min(b, burst.end) - Math.max(a, burst.start));
  }
  return total;
}

export const entryAt = (plan, t) => {
  let found = plan[0];
  for (const entry of plan) if (entry.at <= t) found = entry;
  return found;
};

// Busy share measured over the last full round trip (compute + wait), or since cycle 0.
export function measuredBusy(run, t) {
  const { compute, wait } = entryAt(run.plan, t);
  const from = Math.max(0, t - (compute + wait));
  return t > from ? busyBetween(run, from, t) / (t - from) : 0;
}

// What every resident warp is doing at cycle t.
// state: "compute" (on the lanes), "wait" (load in flight, share 0..1), "ready" (queued), "out" (not resident).
export function stateAt(run, t) {
  const warps = run.joins.map((join) => ({ state: join <= t ? "ready" : "out", share: 0, since: join }));
  const b = lastStartingBefore(run.bursts, t);
  let active = -1;
  if (b >= 0 && run.bursts[b].end > t) {
    active = run.bursts[b].warp;
    warps[active].state = "compute";
    warps[active].share = (t - run.bursts[b].start) / (run.bursts[b].end - run.bursts[b].start);
  }
  const seen = new Set();
  for (let i = lastStartingBefore(run.loads, t); i >= 0 && seen.size < warps.length; i--) {
    const load = run.loads[i];
    if (seen.has(load.warp)) continue;
    seen.add(load.warp);
    if (load.end > t && warps[load.warp].state !== "compute") {
      warps[load.warp].state = "wait";
      warps[load.warp].share = (t - load.start) / (load.end - load.start);
      warps[load.warp].wait = load.end - load.start;
    }
  }
  const resident = warps.filter((warp) => warp.state !== "out").length;
  return { t, active, warps, resident, registers: registersFor(resident) };
}

// The lanes' busy history: one 0/1 per cycle over [t - span, t).
export function historyOf(run, t, span) {
  const cells = new Array(span).fill(0);
  const from = t - span;
  for (let i = lastStartingBefore(run.bursts, t); i >= 0; i--) {
    const burst = run.bursts[i];
    if (burst.end <= from) break;
    for (let c = Math.max(from, burst.start); c < Math.min(t, burst.end); c++) cells[Math.floor(c - from)] = 1;
  }
  return cells;
}

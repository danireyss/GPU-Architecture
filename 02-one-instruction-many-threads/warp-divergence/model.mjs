// One warp of 32 threads meeting "if (x > 0) y = sqrt(x); else y = 0; z = y + 1;".
// Pure functions only: the page, the gauge, the displays and the chips all read from here.
// We count instruction slots: one slot = the whole warp issues one instruction, whatever its mask.

export const LANES = 32;
export const PATTERN = [true, true, false, false, true, false, false, true]; // repeated across the warp
export const COST = { compare: 1, sqrt: 4, zero: 1, add: 1 }; // illustrative; branch bookkeeping is free

// The program on the tape. `slots` is the cost of one issue; `side` says which lanes it is for.
export const PROGRAM = [
  { pc: 0, text: "setp.gt p, x, 0", note: "compare x > 0", slots: COST.compare, side: "all" },
  { pc: 1, text: "@!p bra ELSE", note: "branch: push mask", slots: 0, side: "branch" },
  { pc: 2, text: "y = sqrt(x)", note: "if side", slots: COST.sqrt, side: "if" },
  { pc: 3, text: "bra JOIN", note: "pop: else next", slots: 0, side: "jump" },
  { pc: 4, text: "ELSE: y = 0", note: "else side", slots: COST.zero, side: "else" },
  { pc: 5, text: "JOIN: z = y + 1", note: "rejoin", slots: COST.add, side: "all" },
];
export const LOOP_PROGRAM = [
  { pc: 0, text: "i = 0", note: "", slots: 0 },
  { pc: 1, text: "LOOP: work(i)", note: "one iteration", slots: 1 },
  { pc: 2, text: "i = i + 1", note: "", slots: 0 },
  { pc: 3, text: "setp.lt p, i, n", note: "", slots: 0 },
  { pc: 4, text: "@p bra LOOP", note: "mask off done lanes", slots: 0 },
  { pc: 5, text: "EXIT", note: "", slots: 0 },
];
export const IF_PC = 2, ELSE_PC = 4, JOIN_PC = 5;

export const conditionsOf = (pattern = PATTERN) => Array.from({ length: LANES }, (_, lane) => pattern[lane % pattern.length]);
export const countTrue = (conds) => conds.filter(Boolean).length;
export const maskOf = (conds) => conds.reduce((m, on, lane) => (on ? m | (2 ** lane) : m), 0);
export const maskHex = (mask) => "0x" + (mask >>> 0).toString(16).toUpperCase().padStart(8, "0");
export const FULL = 2 ** LANES - 1;

// The passes a warp makes over the program, and what each costs.
// A side runs only if at least one lane wants it; a side nobody wants is skipped.
export function passesOf(conds) {
  const yes = countTrue(conds);
  const no = conds.length - yes;
  const all = conds.length;
  const passes = [{ pc: 0, op: "compare", slots: COST.compare, active: all }];
  if (yes) passes.push({ pc: IF_PC, op: "sqrt", slots: COST.sqrt, active: yes });
  if (no) passes.push({ pc: ELSE_PC, op: "zero", slots: COST.zero, active: no });
  passes.push({ pc: JOIN_PC, op: "add", slots: COST.add, active: all });
  return passes;
}

export function costOf(conds) {
  const passes = passesOf(conds);
  const slots = passes.reduce((s, p) => s + p.slots, 0);
  const useful = passes.reduce((s, p) => s + p.slots * p.active, 0);
  const total = slots * conds.length;
  const yes = countTrue(conds);
  return { passes, slots, useful, total, use: total ? useful / total : 0, yes, no: conds.length - yes, diverged: yes > 0 && yes < conds.length };
}

// Totals after the first `count` passes.
export function progressOf(conds, count) {
  const passes = passesOf(conds).slice(0, count);
  const slots = passes.reduce((s, p) => s + p.slots, 0);
  const useful = passes.reduce((s, p) => s + p.slots * p.active, 0);
  return { slots, useful, total: slots * conds.length, use: slots ? useful / (slots * conds.length) : 0 };
}

// Two warps run as they come, or after sorting threads by their condition.
export function sortedPair(a, b) {
  const all = [...a, ...b];
  const yes = countTrue(all);
  const first = all.map((_, i) => i < yes);
  const left = first.slice(0, LANES), right = first.slice(LANES);
  const before = costOf(a).slots + costOf(b).slots;
  const after = costOf(left).slots + costOf(right).slots;
  return { before, after, left, right, saved: before - after };
}

// A loop where each lane needs its own number of iterations: the warp runs until the slowest is done.
export const LOOP = { lanes: 31, short: 10, long: 1000, slowLane: 13 };
export function loopOf(need) {
  const runs = Math.max(...need);
  const useful = need.reduce((s, n) => s + n, 0);
  const total = need.length * runs;
  return { runs, useful, total, use: total ? useful / total : 0, wasted: total ? 1 - useful / total : 0 };
}
export const loopNeed = () => Array.from({ length: LANES }, (_, lane) => (lane === LOOP.slowLane ? LOOP.long : LOOP.short));
// Lanes still looping after `done` iterations.
export const loopActive = (need, done) => need.map((n) => done < n);

// Each lane's x: positive where its condition is true, zero or negative where it is false.
export function valuesOf(seed, conds) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  return conds.map((on) => (on ? 1 + (next() % 99) : -(next() % 60)));
}
export const resultOf = (x) => {
  const y = x > 0 ? Math.sqrt(x) : 0;
  return { y, z: y + 1 };
};

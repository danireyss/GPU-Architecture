// How many thread blocks fit on one SM: the smallest of three limits. Pure functions, no DOM.
export const SM = { regs: 65536, drawers: 256, regsPerDrawer: 256, warps: 64, sharedKB: 96 };
export const BLOCK = { threads: 256, warps: 8 };

// The demo kernels, one per step, then the "New kernel" draws.
export const KERNELS = [
  { regs: 32, sharedKB: 0 },
  { regs: 16, sharedKB: 0 },
  { regs: 16, sharedKB: 16 },
  { regs: 64, sharedKB: 16 },
  { regs: 40, sharedKB: 12 },
];
export const NEW_KERNELS = [
  { regs: 24, sharedKB: 8 }, { regs: 128, sharedKB: 0 }, { regs: 48, sharedKB: 20 }, { regs: 255, sharedKB: 4 },
  { regs: 56, sharedKB: 32 }, { regs: 20, sharedKB: 48 }, { regs: 72, sharedKB: 10 }, { regs: 32, sharedKB: 24 },
];

export const regsPerBlock = (k) => k.regs * BLOCK.threads;
// A block's registers fill whole drawers: 256 threads × r registers = r drawers of 256.
export const drawersPerBlock = (k) => regsPerBlock(k) / SM.regsPerDrawer;

// How many MORE blocks each resource would take, with `resident` blocks already on the SM.
export function room(k, resident = 0) {
  const regsFree = SM.regs - resident * regsPerBlock(k);
  const slotsFree = SM.warps - resident * BLOCK.warps;
  const sharedFree = SM.sharedKB - resident * k.sharedKB;
  return {
    regs: Math.floor(regsFree / regsPerBlock(k)),
    regsExact: regsFree / regsPerBlock(k),
    slots: Math.floor(slotsFree / BLOCK.warps),
    shared: k.sharedKB ? Math.floor(sharedFree / k.sharedKB) : Infinity,
    sharedExact: k.sharedKB ? sharedFree / k.sharedKB : Infinity,
  };
}

// Blocks that fit = min(floor(65,536 / (r × 256)), floor(64 / 8), floor(96 KB / s)). Whole blocks only.
export function fit(k) {
  const allow = room(k, 0);
  const blocks = Math.min(allow.regs, allow.slots, allow.shared);
  const limits = ["regs", "slots", "shared"].filter((name) => allow[name] === blocks);
  const warps = blocks * BLOCK.warps;
  const regsUsed = blocks * regsPerBlock(k);
  const sharedUsed = blocks * k.sharedKB;
  return {
    blocks, limits, allow, warps,
    occupancy: warps / SM.warps,
    perBlock: regsPerBlock(k),
    regsUsed, regsLeft: SM.regs - regsUsed, rackUse: regsUsed / SM.regs,
    drawersUsed: regsUsed / SM.regsPerDrawer,
    sharedUsed, sharedLeft: SM.sharedKB - sharedUsed,
  };
}

export const LIMIT_NAMES = { regs: "registers", slots: "the warp slots", shared: "shared memory" };
export const limitText = (limits) => limits.map((name) => LIMIT_NAMES[name]).join(" and ");

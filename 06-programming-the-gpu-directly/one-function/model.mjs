// One function, a million threads. Pure functions, no DOM.
export const WARP = 32, WORD = 4;
export const CHIP = { sms: 80, perSM: 8, link: 25e9 }; // V100's SMs, Lesson 3.2's 8 blocks, Lesson 4.4's PCIe
export const KERNEL = ["int i = blockIdx.x * blockDim.x", "      + threadIdx.x;", "if (i < n)", "  c[i] = a[i] + b[i];"];

export function launch({ n, block, sms = CHIP.sms, perSM = CHIP.perSM, link = CHIP.link }) {
  const blocks = Math.ceil(n / block);
  const threads = blocks * block;
  const warpsPerBlock = Math.ceil(block / WARP);
  const atOnce = sms * perSM;
  const waves = Math.ceil(blocks / atOnce);
  const warps = blocks * warpsPerBlock;
  const lanes = warps * WARP;
  const lastWarp = block % WARP || WARP; // threads in a block's last warp
  return {
    n, block, sms, perSM, blocks, threads, off: threads - n, warpsPerBlock, atOnce, waves,
    lastWave: blocks - (waves - 1) * atOnce, warps, lanes, lastWarp, lanesIdlePerBlock: WARP - lastWarp,
    idle: (lanes - n) / lanes,
    copyIn: (2 * n * WORD) / link, copyBack: (n * WORD) / link, bytesIn: 2 * n * WORD, bytesBack: n * WORD,
  };
}
export const elementOf = (blockIndex, thread, block) => blockIndex * block + thread;
// Which blocks each wave runs, and where block j of a wave sits. A simplification: see the page's notes.
export const waveOf = (L, w) => ({ first: w * L.atOnce, count: w < L.waves - 1 ? L.atOnce : L.lastWave });
export const slotOf = (L, j) => ({ sm: Math.floor(j / L.perSM), slot: j % L.perSM });

export const FIRST = { n: 1e6, block: 256 }, SMALL = { n: 1e6, block: 100 };
export const NEW_LAUNCHES = [
  { n: 1e6, block: 64 }, { n: 2e6, block: 256 }, { n: 250000, block: 128 }, { n: 1000, block: 256 },
]; // round cases chosen for the figure
export const STEPS = [
  ["Write the kernel", "cpu"], ["Copy a and b over", "mem"], ["Launch the grid", "cpu"], ["Hand blocks to SMs", "sm"],
  ["Cut a block into warps", "sm"], ["Write c back", "mem"], ["Try blocks of 100", "sm"], ["New launch", "cpu"],
];

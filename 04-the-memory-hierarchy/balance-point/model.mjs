// How fast a kernel runs: the slower of what memory can feed and what the lanes can do. Pure, no DOM.
// elements per second = min(bandwidth / bytes per element, operations per second / operations per element)
export const G = 1e9, T = 1e12;
export const CARDS = {
  course: { name: "the course chip", bandwidth: 500 * G, ops: 20 * T },
  bigger: { name: "the bigger card", bandwidth: 1000 * G, ops: 30 * T },
};
export const WORD = 4; // bytes in one 32-bit number
export const KERNELS = {
  add: { name: "c = a + b", read: 8, write: 4, ops: 1 },
  big: { name: "4 bytes in, 200 operations, 4 bytes out", read: 4, write: 4, ops: 200 },
};
// "New kernel" draws these in turn. Operation counts are round figures chosen for the figure.
export const NEW_KERNELS = [
  { name: "scale: y = k × x", read: 4, write: 4, ops: 1 },
  { name: "dot product", read: 8, write: 0, ops: 2 },
  { name: "Mandelbrot pixel, about 100 steps", read: 0, write: 4, ops: 800 },
  { name: "5-point stencil, nothing cached", read: 20, write: 4, ops: 6 },
  { name: "n-body, 1,000 neighbours", read: 32, write: 16, ops: 20000 },
];
export function run(card, kernel) {
  const bytes = kernel.read + kernel.write;
  const memory = card.bandwidth / bytes;
  const lanes = card.ops / kernel.ops;
  const rate = Math.min(memory, lanes);
  return {
    bytes, memory, lanes, rate,
    limit: memory < lanes ? "pipe" : memory > lanes ? "lanes" : "both",
    busy: (rate * kernel.ops) / card.ops,
    pipeUse: (rate * bytes) / card.bandwidth,
    perByte: kernel.ops / bytes,
    balance: card.ops / card.bandwidth,
    turnsAt: (card.ops / card.bandwidth) * bytes,
    gap: lanes / memory,
  };
}
export const numbersPerSecond = (card) => card.bandwidth / WORD;
export const WIRES = { count: 384, gigabits: 21 };
export const wireBandwidth = ({ count, gigabits }) => (count * gigabits * G) / 8;

export const STEPS = ["Open the pipe", "Count it in numbers", "Run c = a + b", "Compare with the lanes", "Find the balance point", "Add math per element", "Swap in a bigger card", "New kernel"];

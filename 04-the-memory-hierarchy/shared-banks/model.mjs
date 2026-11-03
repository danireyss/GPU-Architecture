// Shared memory banks, as pure functions, no DOM. Every number on the page comes from here.
// 32 banks of 4-byte words. A word's bank is its index mod 32. One bank passes one word a cycle.
export const SHARED = { banks: 32, wordBytes: 4, threads: 32 };
export const bankOf = (word) => word % SHARED.banks;
export const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

// A tile laid out `wide` words per row and 32 rows tall. Wide is 32, or 33 with one padding word a row.
export function layout(wide) {
  const rows = 32, words = wide * rows, data = 32 * rows;
  const padWords = words - data;
  return { wide, rows, words, bytes: words * SHARED.wordBytes, data, dataBytes: data * SHARED.wordBytes, padWords, padBytes: padWords * SHARED.wordBytes, padShare: padWords / data };
}
// Where word w lands: which bank, how far down that bank, and its place in the tile.
export function place(word, wide) {
  return { word, bank: bankOf(word), depth: Math.floor(word / SHARED.banks), row: Math.floor(word / wide), col: word % wide, pad: word % wide >= 32 };
}
// The tile's picture: a placeholder tone from 0 to 3 for each texel, different for each seed.
export const toneAt = (seed, row, col) => {
  const u = (col - 15.5) / 16, v = (row - 15.5) / 16;
  return Math.floor((Math.sin(u * (3 + seed * 1.7) + seed) * Math.cos(v * (4 - seed * 0.6) - seed * 2) + 1) * 1.999);
};

// One warp read. words[t] is the word thread t wants. Identical words in a bank count once.
export function warpRead(words) {
  const banks = Array.from({ length: SHARED.banks }, () => []);
  words.forEach((word, thread) => {
    const queue = banks[bankOf(word)];
    const same = queue.find((entry) => entry.word === word);
    if (same) same.threads.push(thread);
    else queue.push({ word, threads: [thread] });
  });
  const depth = banks.map((queue) => queue.length);
  const cycles = Math.max(...depth);
  const threadsIn = banks.map((queue) => queue.reduce((n, entry) => n + entry.threads.length, 0));
  // In cycle c, each bank with a c-th entry passes it through its gate.
  const schedule = Array.from({ length: cycles }, (_, c) => banks.flatMap((queue, bank) => (queue[c] ? [{ bank, ...queue[c] }] : [])));
  return {
    words, banks, depth, cycles, schedule, threadsIn,
    banksUsed: threadsIn.filter((n) => n > 0).length,
    mostThreads: Math.max(...threadsIn),
    distinct: new Set(words).size,
  };
}
export const strideWords = (stride) => Array.from({ length: SHARED.threads }, (_, t) => t * stride);
export const oneWord = (word) => Array.from({ length: SHARED.threads }, () => word);

// The eight buttons. `rule` is the stride for gcd(stride, 32), or null where it does not apply.
export const BROADCAST_WORD = 7;
export const STEPS = [
  { label: "Load a 32 × 32 tile", kind: "load", wide: 32, seed: 0 },
  { label: "Read a row", kind: "read", name: "row", words: "t", stride: 1, wide: 32 },
  { label: "Read stride 2", kind: "read", name: "stride 2", words: "2t", stride: 2, wide: 32 },
  { label: "Read stride 3", kind: "read", name: "stride 3", words: "3t", stride: 3, wide: 32 },
  { label: "Read a column", kind: "read", name: "column", words: "32t", stride: 32, wide: 32 },
  { label: "Pad to 33 wide", kind: "read", name: "column, padded", words: "33t", stride: 33, wide: 33 },
  { label: "All read one word", kind: "read", name: "one word", words: "word " + BROADCAST_WORD, stride: null, wide: 33 },
  { label: "New tile", kind: "load", wide: 32, seed: 1 },
].map((step) => step.kind === "load" ? step : { ...step, read: warpRead(step.stride === null ? oneWord(BROADCAST_WORD) : strideWords(step.stride)), rule: step.stride === null ? null : gcd(step.stride, SHARED.banks) });

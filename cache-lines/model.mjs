// A toy L1 data cache, as pure functions, no DOM. Every number on the page comes from here.
// 16 lines, 128 bytes each, 32 cells of 4 bytes. Any line may sit in any slot (fully associative),
// and when the rack is full the least recently used line is evicted. Reads only, one at a time.
export const CACHE = { lines: 16, lineBytes: 128, cellBytes: 4, cells: 32 };
export const ADDR = { bits: 16, tagBits: 9, cellBits: 5, byteBits: 2 };

// Where the arrays live. All three are line-aligned and none share a line.
export const ARRAYS = {
  a: { name: "a", base: 0x0000, length: 320 },
  b: { name: "b", base: 0x0800, length: 10240 },
  c: { name: "c", base: 0xa800, length: 32 },
  d: { name: "d", base: 0xa880, length: 5120 },
};
export const addressOf = (array, i) => ARRAYS[array].base + i * CACHE.cellBytes;

// The address splits into a tag (which line), a slot in the tray (which cell) and a byte in the cell.
export function split(address) {
  return {
    tag: Math.floor(address / CACHE.lineBytes),
    cell: Math.floor(address / CACHE.cellBytes) % CACHE.cells,
    byte: address % CACHE.cellBytes,
  };
}
// Which array and index an address belongs to, for the displays.
export function nameOf(address) {
  for (const [key, array] of Object.entries(ARRAYS)) {
    const i = (address - array.base) / CACHE.cellBytes;
    if (i >= 0 && i < array.length) return { array: key, i };
  }
  return null;
}
// Placeholder contents: two-digit numbers, fixed for each address. Only the addresses matter.
export const valueAt = (address) => (Math.floor(address / CACHE.cellBytes) * 37 + 11) % 100;

export const emptyCache = () => ({ slots: Array.from({ length: CACHE.lines }, () => null), clock: 0 });

// One read. Returns the next cache (the input is not changed) and what happened.
export function read(cache, address) {
  const { tag, cell, byte } = split(address);
  const clock = cache.clock + 1;
  const slots = cache.slots.map((line) => (line ? { ...line, used: line.used } : null));
  const found = slots.findIndex((line) => line && line.tag === tag);
  const event = { address, tag, cell, byte, value: valueAt(address), hit: found >= 0, slot: found, free: false, evicted: null };
  if (found >= 0) {
    slots[found].last = clock;
    slots[found].used = setBit(slots[found].used, cell);
    return { cache: { slots, clock }, event: finish(event, slots) };
  }
  let slot = slots.findIndex((line) => line === null);
  if (slot >= 0) event.free = true;
  else {
    slot = slots.reduce((oldest, line, i) => (line.last < slots[oldest].last ? i : oldest), 0);
    event.evicted = slots[slot].tag;
  }
  event.slot = slot;
  slots[slot] = { tag, last: clock, used: setBit(0, cell) };
  return { cache: { slots, clock }, event: finish(event, slots) };
}
// What the rack looks like after this read: free slots, and which line is next out when full.
function finish(event, slots) {
  const freeSlots = slots.filter((line) => line === null).length;
  const oldest = freeSlots ? null : slots.reduce((best, line, i) => (line.last < slots[best].last ? i : best), 0);
  return { ...event, freeSlots, oldest };
}
const setBit = (mask, bit) => (mask | (1 << bit)) >>> 0;

// Feed a list of addresses. Returns the final cache, one event per read, and the totals.
export function run(cache, addresses) {
  const events = [];
  let current = cache;
  for (const address of addresses) {
    const step = read(current, address);
    current = step.cache;
    events.push(step.event);
  }
  return { cache: current, events, totals: tally(events) };
}
export function tally(events) {
  const misses = events.filter((e) => !e.hit).length;
  const fetched = misses * CACHE.lineBytes;
  // "used" counts each byte the program asked for once, however often it asked.
  const used = new Set(events.map((e) => e.address)).size * CACHE.cellBytes;
  return {
    reads: events.length, hits: events.length - misses, misses, fetched, used,
    useful: fetched ? used / fetched : null,
    intoFree: events.filter((e) => e.free).length,
    evictions: events.filter((e) => e.evicted !== null).length,
    lines: new Set(events.map((e) => e.tag)).size,
  };
}

const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const seq = (array, from, to) => range(to - from + 1, (i) => addressOf(array, from + i));
const every32 = () => range(320, (i) => addressOf("b", i * 32));
// 32 scattered reads: one cell from each of 32 different lines of d, in a fixed shuffled order.
const scattered = () => range(32, (i) => addressOf("d", ((i * 37 + 23) % 160) * 32 + ((i * 11) % 32)));

// The eight buttons. `pass` groups steps whose counters add up: steps 1 to 3 are one pass over a.
export const STEPS = [
  { label: "Read a[0]", pass: "a", addresses: seq("a", 0, 0) },
  { label: "Read the next 31", pass: "a", addresses: seq("a", 1, 31) },
  { label: "Read to a[319]", pass: "a", addresses: seq("a", 32, 319) },
  { label: "Read it all again", pass: "again", addresses: seq("a", 0, 319) },
  { label: "Read every 32nd", pass: "stride", addresses: every32() },
  { label: "Read those again", pass: "stride2", addresses: every32() },
  { label: "One warp, two layouts", pass: "warp", parts: [
    { name: "neighbours", addresses: seq("c", 0, 31) },
    { name: "scattered", addresses: scattered() },
  ] },
  { label: "Empty the cache", pass: "empty", addresses: [] },
];
export const PASSES = [
  { key: "a", label: "a[0] to a[319], in order" },
  { key: "again", label: "the same 320 again" },
  { key: "stride", label: "b, every 32nd element" },
  { key: "stride2", label: "those 320 again" },
  { key: "neighbours", label: "warp: 32 neighbours" },
  { key: "scattered", label: "warp: 32 scattered" },
];

// Replays the whole script once. Each step gets its events with running totals per pass.
export function script() {
  let cache = emptyCache();
  const open = {};
  return STEPS.map((step) => {
    if (step.pass === "empty") { cache = emptyCache(); return { ...step, parts: [] }; }
    const parts = (step.parts || [{ name: step.pass, addresses: step.addresses }]).map((part) => {
      const before = cache;
      const result = run(cache, part.addresses);
      cache = result.cache;
      const events = (open[part.name] = (open[part.name] || []).concat(result.events));
      return { name: part.name, before, after: cache, events: result.events, totals: tally(events) };
    });
    return { ...step, parts };
  });
}

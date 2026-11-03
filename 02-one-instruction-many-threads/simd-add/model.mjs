// c[i] = a[i] + b[i] for 1,000 32-bit integers, done by scalar code or by SIMD at 128, 256 or 512 bits.
// Pure functions only: the page, the gauges, the displays and the chips all read from here.
// We count add instructions, not time.

export const ELEMENTS = 1000;
export const ELEMENT_BITS = 32;
export const WIDTHS = [128, 256, 512];
export const ZMM_REGISTERS = 32; // AVX-512 has zmm0..zmm31
export const MASK_REGISTERS = 8; // k0..k7; k0 can't be used as a write mask

export const lanesFor = (width) => Math.max(1, Math.floor(width / ELEMENT_BITS));

// The whole loop at one register width.
export function loopFor(n, width) {
  const lanes = lanesFor(width);
  const full = Math.floor(n / lanes);
  const tail = n % lanes;
  const steps = full + (tail ? 1 : 0);
  return {
    n,
    width,
    lanes,
    full,
    tail,
    steps,
    vectorAdds: steps,
    scalarAdds: n,
    laneUse: steps ? n / (steps * lanes) : 0,
    tailMask: tail ? (2 ** tail - 1) : 0,
    fewerAdds: steps ? n / steps : 0,
  };
}

// Step k of the loop (0-based): which elements it covers and which lanes its mask turns on.
export function stepOf(loop, k) {
  const start = k * loop.lanes;
  const count = Math.max(0, Math.min(loop.lanes, loop.n - start));
  return { k, start, count, mask: count === loop.lanes ? 2 ** loop.lanes - 1 : 2 ** count - 1, masked: count < loop.lanes };
}

// Totals after the first `steps` vector steps.
export function progressOf(loop, steps) {
  let done = 0;
  for (let k = 0; k < steps; k++) done += stepOf(loop, k).count;
  return { steps, done, vectorAdds: steps, laneUse: steps ? done / (steps * loop.lanes) : 0 };
}

export const maskBits = (mask, lanes) => Array.from({ length: lanes }, (_, lane) => (mask >> lane) & 1);
export const maskHex = (mask, lanes) => "0x" + mask.toString(16).toUpperCase().padStart(Math.ceil(lanes / 4), "0");

// Two-digit inputs so every sum fits a slot; the seed changes with "New arrays".
export function arraysFor(seed, n = ELEMENTS) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const next = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s;
  };
  const a = Array.from({ length: n }, () => 10 + (next() % 90));
  const b = Array.from({ length: n }, () => 10 + (next() % 90));
  const c = a.map((value, i) => value + b[i]);
  return { a, b, c };
}

// Register names at each width.
export const registerName = (width, index) => (width >= 512 ? "zmm" : width >= 256 ? "ymm" : width >= 128 ? "xmm" : "e") + (width < 128 ? ["ax", "bx", "cx"][index] : index);

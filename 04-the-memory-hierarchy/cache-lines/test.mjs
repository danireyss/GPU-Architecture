import assert from "node:assert/strict";
import * as M from "./model.mjs";
const s = M.script();
const t = (i, p = 0) => s[i].parts[p].totals;
const pick = (o, ...k) => Object.fromEntries(k.map((n) => [n, o[n]]));
const eq = (got, want, why) => { assert.deepEqual(pick(got, ...Object.keys(want)), want, why); console.log("ok ", why); };
eq(t(0), { hits: 0, misses: 1, fetched: 128 }, "a[0] misses, 1 line");
eq(t(1), { hits: 31, misses: 1, fetched: 128, used: 128 }, "next 31 hit");
eq(t(2), { hits: 310, misses: 10, fetched: 1280, used: 1280, useful: 1 }, "a[0..319]: 10 misses 310 hits 100%");
eq(t(3), { hits: 320, misses: 0, fetched: 0 }, "again: 320 hits, 0 bytes");
eq(t(4), { hits: 0, misses: 320, fetched: 40960, used: 1280, intoFree: 6, evictions: 314 }, "every 32nd: 320 misses, 6 free, 314 evict");
console.log("    useful", (t(4).useful * 100).toFixed(3) + "%");
assert.equal((t(4).useful * 100).toFixed(1), "3.1");
eq(t(5), { hits: 0, misses: 320, fetched: 40960, evictions: 320 }, "those again: 320 misses");
eq(t(6, 0), { lines: 1, misses: 1, hits: 31, fetched: 128, used: 128 }, "warp neighbours: 1 line");
eq(t(6, 1), { lines: 32, misses: 32, hits: 0, fetched: 4096, used: 128 }, "warp scattered: 32 lines");
// every address fits the 16-bit register, arrays do not share lines
const all = s.flatMap((st) => st.parts.flatMap((p) => p.events));
assert.ok(all.every((e) => e.address < 65536 && e.tag < 512 && M.nameOf(e.address)));
// purity
const c = M.emptyCache(); const snap = JSON.stringify(c); M.read(c, 0); assert.equal(JSON.stringify(c), snap); console.log("ok  pure");

import assert from "node:assert/strict";
import * as M from "./model.mjs";
const near = (a, b, why) => { assert.ok(Math.abs(a - b) < 1e-12, `${why}: ${a} vs ${b}`); console.log("ok ", why); };
const L = M.launch(M.FIRST), S = M.launch(M.SMALL);
assert.deepEqual([L.blocks, L.threads, L.off], [3907, 1000192, 192]); console.log("ok  3,907 blocks, 1,000,192 threads, 192 off");
near(L.copyIn, 0.32e-3, "8 MB at 25 GB/s = 0.32 ms"); near(L.copyBack, 0.16e-3, "4 MB, 0.16 ms"); assert.deepEqual([L.bytesIn, L.bytesBack], [8e6, 4e6]);
assert.deepEqual([L.atOnce, L.waves, L.lastWave], [640, 7, 67]); console.log("ok  640 at once, 6 full waves and a last of 67");
assert.deepEqual([L.warpsPerBlock, L.warps], [8, 31256]); console.log("ok  8 warps a block, 31,256 in all");
assert.equal(M.elementOf(2, 5, 256), 517); console.log("ok  thread 5 of block 2 is element 517");
assert.deepEqual([S.blocks, S.warpsPerBlock, S.lastWarp, S.lanesIdlePerBlock, S.warps], [10000, 4, 4, 28, 40000]); console.log("ok  blocks of 100: 10,000, 4 warps, 4 threads + 28 idle, 40,000 warps");
assert.equal((S.idle * 100).toFixed(1), "21.9"); assert.equal((L.idle * 100).toFixed(2), "0.02"); console.log("ok  21.9% idle against 0.02%");
// the wave plan covers every block exactly once, and each wave fits the slots
for (const c of [M.FIRST, M.SMALL, ...M.NEW_LAUNCHES]) { const l = M.launch(c); let seen = 0; for (let w = 0; w < l.waves; w++) { const v = M.waveOf(l, w); assert.equal(v.first, seen); assert.ok(v.count <= l.atOnce && v.count > 0); seen += v.count; } assert.equal(seen, l.blocks); console.log("   ", String(c.n).padStart(8), String(c.block).padStart(4), l.blocks, "blocks", l.waves, "waves", (l.idle * 100).toFixed(2) + "% idle"); }
// the limits behind 8 blocks a SM (65,536 registers, 64 warp slots, 32 registers a thread)
const fit = (b) => Math.min(Math.floor(65536 / (32 * b)), Math.floor(64 / Math.ceil(b / 32)));
console.log("    per SM at 256:", fit(256), "· at 100:", fit(100), "· waves at 100 if 16 fit:", M.launch({ ...M.SMALL, perSM: 16 }).waves, "· at 8 a SM:", S.waves);

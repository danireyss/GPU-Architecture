import assert from "node:assert/strict";
import * as M from "./model.mjs";
const near = (a, b, why, tol = 1e-9) => { assert.ok(Math.abs(a - b) <= Math.abs(b) * tol, `${why}: ${a} vs ${b}`); console.log("ok ", why); };
const C = M.CARDS.course, B = M.CARDS.bigger, A = M.KERNELS.add, K = M.KERNELS.big;
near(M.numbersPerSecond(C), 125e9, "500 GB/s = 125 billion numbers/s");
const r = M.run(C, A);
assert.equal(r.bytes, 12); near(r.memory, 500e9 / 12, "12 bytes, 41.7 billion elements/s");
assert.equal((r.memory / 1e9).toFixed(1), "41.7"); assert.equal(Math.round(r.memory / 1e9), 42);
assert.equal((r.busy * 100).toFixed(2), "0.21"); assert.ok(1 - r.busy > 0.99); console.log("ok  0.21% busy, over 99% idle:", ((1 - r.busy) * 100).toFixed(2) + "%");
near(r.balance, 40, "balance 40 ops per byte"); near(r.perByte, 1 / 12, "c = a + b: 0.083 per byte"); assert.equal(r.limit, "pipe");
assert.equal(r.turnsAt, 480); const at = (ops) => M.run(C, { ...A, ops }).limit;
assert.deepEqual([at(479), at(480), at(481)], ["pipe", "both", "lanes"]); console.log("ok  turns compute-bound at 480 operations");
const b = M.run(B, K);
near(b.balance, 30, "bigger card: balance 30"); near(b.perByte, 25, "kernel: 25 per byte"); assert.equal(b.limit, "pipe");
near(b.memory, 125e9, "memory-bound at 125 billion"); near(b.lanes, 150e9, "lanes alone 150 billion"); assert.equal(Math.round(b.busy * 100), 83); console.log("ok  83% busy");
near(M.wireBandwidth(M.WIRES), 1008e9, "384 × 21 / 8 = 1,008 GB/s");
for (const k of M.NEW_KERNELS) { const x = M.run(B, k); console.log("   ", k.name.padEnd(36), x.perByte.toFixed(3).padStart(9), x.limit, ((x.busy) * 100).toFixed(1) + "%"); assert.ok(x.bytes > 0); }

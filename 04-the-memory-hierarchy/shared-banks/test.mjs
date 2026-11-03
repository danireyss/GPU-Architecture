import assert from "node:assert/strict";
import * as M from "./model.mjs";
const L = M.layout(32), P = M.layout(33);
assert.deepEqual([L.words, L.bytes], [1024, 4096]); console.log("ok  tile 1,024 words, 4 KB");
assert.deepEqual([0, 1, 32].map(M.bankOf), [0, 1, 0]); console.log("ok  words 0, 1, 32 in banks 0, 1, 0");
const R = (i) => M.STEPS[i].read;
const check = (i, banks, most, cycles) => { assert.deepEqual([R(i).banksUsed, R(i).mostThreads, R(i).cycles], [banks, most, cycles], M.STEPS[i].label); console.log("ok ", M.STEPS[i].label, banks, "banks,", most, "threads at most,", cycles, "cycles"); };
check(1, 32, 1, 1); check(2, 16, 2, 2); check(3, 32, 1, 1); check(4, 1, 32, 32); check(5, 32, 1, 1); check(6, 1, 32, 1);
assert.deepEqual(R(5).words.map(M.bankOf), R(1).words); console.log("ok  word 33t lands in bank t");
assert.deepEqual([P.padWords, P.padBytes], [32, 128]); assert.equal((P.padShare * 100).toFixed(1), "3.1"); console.log("ok  padding 32 words, 128 B, 3.1%");
assert.equal(R(6).distinct, 1); assert.equal(R(6).schedule[0][0].threads.length, 32); console.log("ok  broadcast: fetched once to 32 threads");
// the rule against the model, for every stride a tile could use
for (let s = 1; s <= 200; s++) assert.equal(M.warpRead(M.strideWords(s)).cycles, M.gcd(s, 32), "stride " + s);
console.log("ok  cycles = gcd(stride, 32) for strides 1 to 200");
console.log("    stride 0: rule says", M.gcd(0, 32), "but the model says", M.warpRead(M.strideWords(0)).cycles);
// every thread is served exactly once, in the padded layout every word read is real data
for (const i of [1, 2, 3, 4, 5, 6]) assert.equal(R(i).schedule.flat().reduce((n, e) => n + e.threads.length, 0), 32);
assert.ok(R(5).words.every((w) => !M.place(w, 33).pad && M.place(w, 33).col === 0)); console.log("ok  33t is column 0 of the padded tile");
assert.ok(R(4).words.every((w) => M.place(w, 32).col === 0 && w < 1024)); console.log("ok  32t is column 0 of the dense tile");
assert.ok(R(3).words.every((w) => w < 1024)); 
console.log("    padding words sit on the diagonal:", [0, 1, 2].map((r) => M.bankOf(33 * r + 32)).join(","));

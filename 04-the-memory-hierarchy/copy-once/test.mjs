import assert from "node:assert/strict";
import * as M from "./model.mjs";
const near = (a, b, why) => { assert.ok(Math.abs(a - b) < 1e-9, `${why}: ${a} vs ${b}`); console.log("ok ", why); };
near(M.narrower(25), 20, "PCIe 20 times narrower"); near(M.copyTime(8, 25), 0.32, "8 GB takes 0.32 s"); near(M.copyTime(8, 500), 0.016, "VRAM 0.016 s");
assert.equal(M.lostOps(0.32), 6.4e12); console.log("ok  6.4 trillion operations, about 6");
const c = M.copyTime(2, 20); near(c, 0.1, "2 GB at 20 GB/s: 0.1 s");
const seq = M.stepTime(c, 0.4), ov = M.stepTime(c, 0.4, true);
near(seq, 0.5, "0.5 s a step"); near(c / seq, 0.2, "20% copying"); near(1 / seq, 2, "2 batches a second");
near(ov, 0.4, "overlapped 0.4 s"); near(1 / ov, 2.5, "2.5 batches a second"); near(seq / ov - 1, 0.25, "25% more");
const p2 = M.plan(2), p3 = M.plan(3), p4 = M.plan(4), p5 = M.plan(5);
near(p2.total, 1.5, "three batches in sequence: 1.5 s"); near(p3.total, 1.3, "three overlapped: 1.3 s");
const done = p3.bars.filter((b) => b.row === "compute").map((b) => b.t1); near(done[1] - done[0], 0.4, "overlapped batches finish 0.4 s apart");
// no two copies, and no two computes, overlap each other in the overlapped plan
for (const row of ["copy", "compute"]) { const list = p3.bars.filter((b) => b.row === row).sort((a, b) => a.t0 - b.t0); list.slice(1).forEach((b, i) => assert.ok(b.t0 >= list[i].t1 - 1e-9)); }
near(p4.total, 1.8, "3 round trips: 1.8 s"); near(p5.total, 1.4, "copied once, chained: 1.4 s");
M.JOBS.forEach((j, i) => { const p = M.plan(6, j), g = M.totalOf(p.ghost); console.log("   ", j.name.padEnd(30), g.toFixed(3), "→", p.total.toFixed(3)); assert.ok(g <= 2 && p.total <= g + 1e-9); });

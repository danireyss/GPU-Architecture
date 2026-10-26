const stage = document.querySelector(".wd-stage");
const svg = stage.querySelector("svg");
const q = (selector) => svg.querySelector(selector);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]");
const status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll(".wd-step")];
const chips = Object.fromEntries([...document.querySelectorAll("[data-chip]")].map((el) => [el.dataset.chip, el]));
const lcd = Object.fromEntries([...svg.querySelectorAll("[data-lcd]")].map((el) => [el.dataset.lcd, el]));
const range = Array.from({ length: LANES }, (_, lane) => lane);
const laneEls = range.map((lane) => [...svg.querySelectorAll(`[data-ln="${lane}"]`)]);
const cores = range.map((lane) => q(`[data-ln="${lane}"][data-row="lane"] .wd-core`));
const pleds = range.map((lane) => q(`[data-ln="${lane}"][data-row="lane"] .wd-pled`));
const lights = range.map((lane) => q(`[data-ln="${lane}"][data-row="mask"] .wd-light`));
const values = Object.fromEntries(["x", "y", "z"].map((name) => [name, range.map((lane) => q(`[data-v="${name}"][data-lane="${lane}"]`))]));
const legends = Object.fromEntries(["x", "y", "z"].map((name) => [name, q(`[data-legend="${name}"]`)]));
const tapeText = Array.from({ length: 6 }, (_, pc) => q(`[data-tape="${pc}"]`));
const tapeNote = Array.from({ length: 6 }, (_, pc) => q(`[data-tape-note="${pc}"]`));
const tapeN = Array.from({ length: 6 }, (_, pc) => q(`[data-tape-pc="${pc}"]`));
const headEl = q('[data-part="head"]');
const pcText = q('[data-part="pc-text"]');
const needle = q('[data-part="needle"]');
const dialArc = q('[data-part="dial-arc"]');
const rackLed = q('[data-part="rack-led"]');
const springBack = q('[data-part="springs"] [data-k="back"]');
const springFront = q('[data-part="springs"] [data-k="front"]');
const platformEl = q('[data-part="platform"]');
const trayEls = [0, 1, 2].map((i) => {
  const el = q(`[data-tray="${i}"]`);
  return { el, bits: range.map((lane) => el.querySelector(`[data-tray-bit="${lane}"]`)), next: el.querySelector("[data-tray-next]"), rejoin: el.querySelector("[data-tray-rejoin]") };
});
const pegLayer = q('[data-part="pegs"]');
const pegs = { a: range.map((lane) => q(`[data-peg="a${lane}"]`)), b: range.map((lane) => q(`[data-peg="b${lane}"]`)) };
const cells = Array.from({ length: BOARD_ROWS }, (_, row) => range.map((lane) => q(`[data-cell="${row}-${lane}"]`)));
const rowLabels = Array.from({ length: BOARD_ROWS }, (_, row) => q(`[data-row-label="${row}"]`));

// ---------- state ----------
let seed = 1;
const ALL = range.map(() => true);
const NONE = range.map(() => false);
const fresh = () => ({
  on: false, program: "branch", conds: null, x: [], y: [], z: [], p: [], lit: [], pc: null, instr: "",
  trays: [], slots: 0, useful: 0, rows: [], pass: "", run: "",
  cart: { show: false, a: conditionsOf(), b: conditionsOf().map((c) => !c), f: 0, sorted: false },
  loop: null, pair: false,
});
let s = fresh();
let next = 0;
let queue = [];
let current = null;
let pendingSay = -1;
const shown = { pc: 0, use: 0, plat: RIM, off: [30, 30, 30], alpha: [0, 0, 0] };
let frame = 0, last = 0, visible = false;

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pct = (x) => (x * 100).toFixed(1) + "%";
const follow = (value, goal, dt, seconds) => (still.matches ? goal : value + (goal - value) * (1 - Math.exp(-dt / seconds)));
const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const text = (el, value) => { if (el && el.textContent !== value) el.textContent = value; };
const setFlag = (el, name, on) => { if (!el) return; if (on) { if (!el.hasAttribute(name)) el.setAttribute(name, ""); } else if (el.hasAttribute(name)) el.removeAttribute(name); };
const num = (v) => (v === null || v === undefined ? "" : Number.isInteger(v) ? String(v) : v.toFixed(1));
const top = () => s.trays[s.trays.length - 1];
const mask = () => (top() ? top().mask : s.on ? ALL : NONE);
const count = (list) => list.filter(Boolean).length;

// ---------- phases ----------
const phase = (dur, begin, update, end) => ({ dur, begin, update, end });
function push(entry) {
  const i = s.trays.length;
  s.trays.push(entry);
  shown.off[i] = still.matches ? 0 : 30;
  shown.alpha[i] = still.matches ? 1 : 0;
}
// One issued instruction: the whole warp spends one slot; lanes on in the mask do the work.
function slot(pc, op, dur, work) {
  return phase(dur,
    () => { s.pc = pc; s.instr = (s.program === "loop" ? LOOP_PROGRAM : PROGRAM)[pc].text; s.lit = mask().slice(); },
    null,
    () => {
      const active = count(s.lit);
      s.slots += 1;
      s.useful += active;
      s.rows.push({ label: String(s.slots).padStart(2, " ") + " " + op, cells: s.lit.slice() });
      s.pass = op + " · " + active + " of " + LANES + " lanes" + (active < LANES ? ", " + (LANES - active) + " idle" : "");
      if (work) work(s.lit);
      s.lit = [];
    });
}
const bookkeeping = (pc, dur, begin) => phase(dur, () => { s.pc = pc; s.instr = PROGRAM[pc].text; s.lit = []; begin && begin(); });

// The whole branchy program on one warp, following the model's passes. `fast` shortens every phase.
function runProgram(conds, xs, fast) {
  const d = (slow) => (fast ? slow * 0.3 : slow);
  const out = [];
  const yes = count(conds), no = LANES - yes;
  out.push(slot(0, "compare", d(1), () => { s.p = conds.slice(); }));
  out.push(bookkeeping(1, d(0.9), () => {
    if (yes && no) {
      top().next = JOIN_PC;
      push({ mask: conds.map((c) => !c), next: ELSE_PC, rejoin: JOIN_PC });
      push({ mask: conds.slice(), next: null, rejoin: JOIN_PC });
    }
  }));
  if (yes) {
    for (let i = 0; i < COST.sqrt; i++) out.push(slot(IF_PC, "sqrt", d(0.55), i === COST.sqrt - 1 ? (on) => on.forEach((o, lane) => { if (o) s.y[lane] = resultOf(xs[lane]).y; }) : null));
    out.push(bookkeeping(3, d(0.7), () => { if (yes && no) s.trays.pop(); }));
  }
  if (no) out.push(slot(ELSE_PC, "y = 0", d(0.9), (on) => on.forEach((o, lane) => { if (o) s.y[lane] = resultOf(xs[lane]).y; })));
  out.push(phase(d(0.5), () => { if (yes && no) { s.trays.pop(); top().next = null; } s.pc = JOIN_PC; s.instr = PROGRAM[JOIN_PC].text; }));
  out.push(slot(JOIN_PC, "z = y + 1", d(0.9), (on) => on.forEach((o, lane) => { if (o) s.z[lane] = resultOf(xs[lane]).z; })));
  return out;
}
function load(conds, xs, dur) {
  const out = [phase(0.2, () => {
    s.conds = conds; s.x = []; s.y = []; s.z = []; s.p = []; s.pc = 0; s.instr = "ld x";
    s.trays = s.trays.slice(0, 1);
    if (!s.trays.length) push({ mask: ALL, next: null, rejoin: null });
  })];
  for (const lane of range) out.push(phase(dur / LANES, () => { s.x[lane] = xs[lane]; s.lit = range.map((l) => l === lane); }, null, () => { s.lit = []; }));
  return out;
}
const resetTally = () => { s.slots = 0; s.useful = 0; s.rows = []; s.pass = ""; };

function plan(index) {
  const out = [];
  const conds = conditionsOf();
  const xs = valuesOf(seed, conds);
  if (index === 0) {
    out.push(phase(0.3, () => { s = fresh(); s.on = true; s.run = "diverged"; }));
    out.push(...load(conds, xs, 1.4));
    out.push(phase(0.2, () => { s.instr = ""; }));
  } else if (index === 1) {
    out.push(runProgram(conds, xs, false)[0]);
  } else if (index === 2) {
    const all = runProgram(conds, xs, false);
    out.push(...all.slice(1, 7));
  } else if (index === 3) {
    out.push(runProgram(conds, xs, false)[7]);
  } else if (index === 4) {
    const all = runProgram(conds, xs, false);
    out.push(all[8], all[9]);
  } else if (index === 5) {
    // flip every non-positive x to a positive one, so every thread wants the if side
    const agree = xs.map((x) => (x > 0 ? x : 1 - x));
    out.push(phase(0.5, () => { resetTally(); s.run = "agree"; s.instr = "x = |x| + 1 where x ≤ 0"; }));
    out.push(...load(ALL, agree, 0.9));
    out.push(...runProgram(ALL, agree, true));
  } else if (index === 6) {
    out.push(phase(1, () => { resetTally(); s.run = "pair"; s.cart.show = true; s.instr = "warps A and B: both mixed"; s.pass = "unsorted: 7 + 7 = 14 slots"; }));
    out.push(phase(still.matches ? 0 : 2,
      () => { s.instr = "sort threads by x > 0"; range.forEach((lane) => { if (!s.cart.a[lane]) pegLayer.appendChild(pegs.a[lane]); }); },
      (f) => { s.cart.f = f; },
      () => { s.cart.f = 1; s.cart.sorted = true; }));
    const yes = valuesOf(seed + 11, ALL), no = valuesOf(seed + 12, NONE);
    out.push(phase(0.4, () => { s.instr = "warp A: all true"; }));
    out.push(...load(ALL, yes, 0.6), ...runProgram(ALL, yes, true));
    out.push(phase(0.4, () => { s.instr = "warp B: all false"; }));
    out.push(...load(NONE, no, 0.6), ...runProgram(NONE, no, true));
    out.push(phase(0.2, () => { s.pair = true; s.pass = "sorted: 6 + 3 = 9 slots, every lane busy"; }));
  } else if (index === 7) {
    const need = loopNeed();
    out.push(phase(0.8, () => {
      resetTally(); s.run = "loop"; s.program = "loop"; s.cart.show = false;
      s.conds = null; s.p = []; s.y = []; s.z = []; s.x = need.slice();
      s.loop = { need, done: 0 };
      s.trays = s.trays.slice(0, 1); top().next = null;
      s.pc = 0; s.instr = LOOP_PROGRAM[0].text;
    }));
    out.push(phase(0.6, () => { top().next = 5; push({ mask: ALL, next: null, rejoin: 5 }); s.pc = 1; }));
    const iteration = (dur) => {
      const it = phase(dur,
        () => { s.pc = 1; s.instr = LOOP_PROGRAM[1].text; s.lit = mask().slice(); },
        (f) => { if (dur > 0.2) s.pc = 1 + Math.min(3, Math.floor(f * 4)); },
        () => {
          const active = count(s.lit);
          s.loop.done += 1;
          s.slots += 1; s.useful += active;
          s.rows.push({ label: "it " + s.loop.done, cells: s.lit.slice() });
          s.pass = "iteration " + fmt(s.loop.done) + " · " + active + " of " + LANES + " lanes" + (active < LANES ? ", " + (LANES - active) + " idle" : "");
          top().mask = loopActive(s.loop.need, s.loop.done);
          s.lit = [];
        });
      return it;
    };
    const { runs } = loopOf(need);
    for (let i = 0; i < runs; i++) out.push(iteration(i < LOOP.short ? 0.35 : i < 40 ? 0.08 : 0.0045));
    out.push(phase(0.6, () => { s.trays.pop(); top().next = null; s.pc = 5; s.instr = "EXIT"; }));
  } else if (index === 8) {
    out.push(phase(0.4, () => { seed += 1; s = fresh(); resetPegs(); }));
  }
  return out;
}
function resetPegs() {
  range.forEach((lane) => { pegs.a[lane].setAttribute("transform", ""); });
  for (const lane of range) for (const name of ["a", "b"]) pegLayer.appendChild(pegs[name][lane]);
  // restore depth order: row a before row b at each lane, then by lane
  const order = [...range.map((lane) => pegs.a[lane]), ...range.map((lane) => pegs.b[lane])];
  for (const el of order) pegLayer.appendChild(el);
}

function press(index) {
  if (index !== next || queue.length || current) return;
  queue = plan(index);
  next = index === 8 ? 0 : index + 1;
  if (still.matches) {
    for (const p of queue) { p.begin && p.begin(); p.update && p.update(1); p.end && p.end(); }
    queue = [];
    s.lit = [];
    say(summary(index));
  } else pendingSay = index;
  kick();
}
function say(value) { status.textContent = value; }
function summary(index) {
  const c = costOf(conditionsOf());
  return [
    "Loaded 32 values of x, one per thread. Every mask light is on.",
    "Compared x > 0 in one slot: " + c.yes + " lanes true, " + c.no + " false.",
    "The warp split. Trays pushed for the else side and the rejoin; the if side ran sqrt for 4 slots with " + c.no + " lanes dark.",
    "Popped to the else tray: y = 0 ran for 1 slot on the other " + c.no + " lanes.",
    "Rejoined at z = y + 1. " + c.slots + " slots, " + c.useful + " of " + c.total + " lane-slots useful: " + pct(c.use) + ".",
    "All 32 agree: the else side is skipped. 6 slots, 100% of lanes used.",
    "Sorted by condition: an all-true warp (6 slots) and an all-false warp (3) take 9 slots instead of 14.",
    "Lopsided loop: the warp ran 1,000 iterations for one slow lane. 1,310 of 32,000 lane-iterations useful, 95.9% wasted.",
    "New warp drawn. Start again from step 1.",
  ][index];
}

// ---------- drawing ----------
function needleAt(share) {
  const a = SWEEP[0] + share * SWEEP[1];
  const [x, y] = DIAL.at;
  const R = DIAL.r;
  return lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (R - 4), y - Math.cos(a) * (R - 4)], DIAL_TOP + 0.2, P);
}
function arcTo(share) {
  if (share < 0.004) return "";
  const n = Math.max(2, Math.ceil(share * 40));
  const [x, y] = DIAL.at;
  const R = DIAL.r - 2;
  return onTop(Array.from({ length: n + 1 }, (_, i) => { const a = SWEEP[0] + (i / n) * share * SWEEP[1]; return [x + Math.sin(a) * R, y - Math.cos(a) * R]; }), DIAL_TOP, P);
}
function vcoil(cx, cy, r, z0, z1, turns) {
  const back = [], front = [];
  let run = [], near = null;
  const n = Math.round(turns * 18);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * turns * Math.PI * 2;
    const p = iso([cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + ((z1 - z0) * i) / n], P);
    const facing = depthOf([Math.cos(a), Math.sin(a), 0], P) > 0;
    if (near === null) near = facing;
    if (facing !== near) { run.push(p); (near ? front : back).push(pathOf(run)); run = [p]; near = facing; continue; }
    run.push(p);
  }
  if (run.length > 1) (near ? front : back).push(pathOf(run));
  return { back: back.join(""), front: front.join("") };
}
function platform(topZ) {
  const plan = { x: TRAY.x + 1, y: TRAY.y + 1, w: TRAY.w - 2, d: TRAY.d - 2, r: 1 };
  // each spring sits in a seat cup on the floor and under a cup on the platform's underside
  const coils = SPRINGS.map((x) => vcoil(x, SPRING_Y, SPRING_R, FLOOR + 0.4, topZ - 1.6, 5));
  const cups = SPRINGS.map((x) => ring(x, SPRING_Y, SPRING_R + 0.6, FLOOR + 0.4, P, 24) + ring(x, SPRING_Y, SPRING_R + 0.6, topZ - 1.6, P, 24));
  springBack.setAttribute("d", coils.map((c) => c.back).join("") + cups.join(""));
  springFront.setAttribute("d", coils.map((c) => c.front).join(""));
  platformEl.innerHTML = solidSvg(slabOf(plan, topZ - 1.6, 1.6, P, 2, 0.3), { tone: "lo", crease: "lo" });
}
const shift = (v, f) => (f ? "translate(" + (v[0] * f).toFixed(2) + " " + (v[1] * f).toFixed(2) + ")" : "");

function draw(dt) {
  let moving = false;
  const m = mask();
  const program = s.program === "loop" ? LOOP_PROGRAM : PROGRAM;
  const loopMode = s.program === "loop";

  // lanes
  for (const lane of range) {
    const dark = s.on && !m[lane];
    for (const el of laneEls[lane]) setFlag(el, "data-masked", dark);
    setFlag(cores[lane], "data-lit", !!s.lit[lane]);
    setFlag(lights[lane], "data-lit", s.on && m[lane]);
    setFlag(pleds[lane], "data-lit", !loopMode && s.p[lane] === true);
    if (loopMode && s.loop) {
      text(values.x[lane], String(s.loop.need[lane]));
      text(values.y[lane], String(Math.min(s.loop.done, s.loop.need[lane])));
      text(values.z[lane], "");
    } else {
      text(values.x[lane], num(s.x[lane]));
      text(values.y[lane], num(s.y[lane]));
      text(values.z[lane], num(s.z[lane]));
    }
  }
  text(legends.x, loopMode ? "n" : "x");
  text(legends.y, loopMode ? "i" : "y");
  text(legends.z, loopMode ? "" : "z");

  // tape and read head
  program.forEach((row, pc) => {
    text(tapeText[pc], row.text);
    text(tapeNote[pc], row.note);
    const cur = s.on && s.pc === pc;
    setFlag(tapeText[pc], "data-cur", cur);
    setFlag(tapeN[pc], "data-cur", cur);
  });
  const pcGoal = s.pc === null ? 0 : s.pc;
  const lastPc = shown.pc;
  shown.pc = follow(shown.pc, pcGoal, dt, 0.14);
  if (Math.abs(shown.pc - pcGoal) < 0.002) shown.pc = pcGoal; else moving = true;
  if (shown.pc !== lastPc || !headEl.dataset.set) { headEl.setAttribute("transform", shift(HEAD_DY, shown.pc)); headEl.dataset.set = "1"; }
  text(pcText, s.on && s.pc !== null ? String(s.pc) : "-");

  // mask stack: trays, platform and springs
  const n = s.trays.length;
  for (let i = 0; i < 3; i++) {
    const t = trayEls[i];
    const entry = s.trays[i];
    const offGoal = i < n ? -(n - 1 - i) * TRAY_H : 30;
    const alphaGoal = i < n ? 1 : 0;
    const lastOff = shown.off[i], lastAlpha = shown.alpha[i];
    shown.off[i] = follow(shown.off[i], offGoal, dt, 0.16);
    shown.alpha[i] = follow(shown.alpha[i], alphaGoal, dt, 0.12);
    if (Math.abs(shown.off[i] - offGoal) < 0.01) shown.off[i] = offGoal; else moving = true;
    if (Math.abs(shown.alpha[i] - alphaGoal) < 0.01) shown.alpha[i] = alphaGoal; else moving = true;
    if (shown.off[i] !== lastOff || shown.alpha[i] !== lastAlpha || !t.el.dataset.set) {
      t.el.setAttribute("transform", shift(UP, shown.off[i]));
      t.el.style.display = shown.alpha[i] > 0.01 ? "" : "none";
      t.el.style.opacity = shown.alpha[i].toFixed(2);
      t.el.dataset.set = "1";
    }
    if (entry) {
      t.bits.forEach((el, lane) => setFlag(el, "data-on", !!entry.mask[lane]));
      const nextPc = entry.next === null ? s.pc : entry.next;
      text(t.next, "PC " + (nextPc === null ? "-" : nextPc));
      text(t.rejoin, "↩ " + (entry.rejoin === null ? "—" : entry.rejoin));
    }
  }
  const platGoal = RIM - n * TRAY_H;
  const lastPlat = shown.plat;
  shown.plat = follow(shown.plat, platGoal, dt, 0.16);
  if (Math.abs(shown.plat - platGoal) < 0.01) shown.plat = platGoal; else moving = true;
  if (shown.plat !== lastPlat || !platformEl.dataset.set) { platform(shown.plat); platformEl.dataset.set = "1"; }

  // warp cartridges
  for (const lane of range) {
    const swaps = !s.cart.a[lane];
    const f = swaps ? ease(s.cart.f) : 0;
    const a = pegs.a[lane], b = pegs.b[lane];
    const lift = Math.sin(Math.PI * f) * 9;
    const ta = "translate(" + (PEG_DY[0] * f + UP[0] * lift).toFixed(2) + " " + (PEG_DY[1] * f + UP[1] * lift).toFixed(2) + ")";
    if (a.getAttribute("transform") !== ta) a.setAttribute("transform", ta);
    const tb = shift(PEG_DY, 1 - f) || "translate(0 0)";
    if (b.getAttribute("transform") !== tb) b.setAttribute("transform", tb);
    setFlag(a.firstElementChild, "data-lit", s.cart.show && s.cart.a[lane]);
    setFlag(b.firstElementChild, "data-lit", s.cart.show && s.cart.b[lane]);
  }

  // slot board: the last rows issued
  const rows = s.rows.slice(-BOARD_ROWS);
  for (let row = 0; row < BOARD_ROWS; row++) {
    const r = rows[row];
    cells[row].forEach((el, lane) => { setFlag(el, "data-used", !!r && !!r.cells[lane]); setFlag(el, "data-idle", !!r && !r.cells[lane]); });
    text(rowLabels[row], r ? r.label : "");
  }

  // gauge
  const total = s.slots * LANES;
  const use = total ? s.useful / total : 0;
  const lastUse = shown.use;
  shown.use = follow(shown.use, use, dt, 0.25);
  if (Math.abs(shown.use - use) < 0.0005) shown.use = use; else moving = true;
  if (shown.use !== lastUse || !needle.dataset.set) { needle.setAttribute("d", needleAt(shown.use)); dialArc.setAttribute("d", arcTo(shown.use)); needle.dataset.set = "1"; }
  rackLed.style.opacity = s.on ? "1" : "0.2";

  // displays and chips, all from the model
  const base = costOf(conditionsOf());
  const agree = costOf(ALL);
  const pair = sortedPair(conditionsOf(), conditionsOf().map((c) => !c));
  const lp = loopOf(loopNeed());
  const active = count(m);
  const unit = loopMode ? "lane-iterations" : "lane-slots";
  text(lcd.pc, s.on && s.pc !== null ? String(s.pc) : "-");
  text(lcd.instr, s.instr || (s.on ? "-" : "idle"));
  text(lcd.active, s.on ? active + "/" + LANES : "-");
  text(lcd.slots, s.on ? fmt(s.slots) : "-");
  text(lcd.useful, s.on ? fmt(s.useful) + "/" + fmt(total) : "-");
  text(lcd.use, total ? pct(use) : "-");
  const conds = s.conds;
  text(lcd.split, conds ? count(conds) + "T " + (LANES - count(conds)) + "F" : "-");
  text(lcd.mask, s.on ? maskHex(maskOf(m)).slice(2) : "-");
  text(lcd.diverged, base.slots + " · " + Math.round(base.use * 100) + "%");
  text(lcd.agree, agree.slots + " · " + Math.round(agree.use * 100) + "%");
  text(lcd.pair, pair.before + "→" + pair.after);
  text(lcd.loop, pct(lp.use));
  text(lcd.depth, s.on ? String(n) : "-");
  text(chips.slots, s.on ? fmt(s.slots) + (loopMode ? " iterations" : "") : "0");
  text(chips.useful, s.on ? fmt(s.useful) + " / " + fmt(total) + " " + unit : "0 / 0");
  text(chips.use, total ? pct(use) : "-");
  text(chips.pass, s.pass || "-");
  text(chips.diverged, "1 + 4 + 1 + 1 = " + base.slots + " slots · " + base.useful + " / " + base.total + " = " + pct(base.use));
  text(chips.agree, "1 + 4 + 1 = " + agree.slots + " slots · " + pct(agree.use));
  text(chips.pair, "7 + 7 = " + pair.before + " → sorted 6 + 3 = " + pair.after);
  text(chips.loop, LOOP.lanes + " × " + LOOP.short + " + " + fmt(LOOP.long) + " = " + fmt(lp.useful) + " of " + fmt(lp.total) + " · " + pct(lp.wasted) + " wasted");
  text(readout, !s.on ? "idle" : "pc " + (s.pc === null ? "-" : s.pc) + " · " + active + " of " + LANES + " lanes on · " + fmt(s.slots) + (loopMode ? " iterations" : " slots") + (total ? " · " + pct(use) + " used" : ""));

  buttons.forEach((button, i) => {
    const st = i < next ? "done" : i === next ? "next" : "later";
    if (button.dataset.state !== st) button.dataset.state = st;
    const enabled = i === next && !queue.length && !current;
    if (button.disabled === enabled) button.disabled = !enabled;
  });
  return moving;
}

function advance(dt) {
  let budget = dt;
  while (budget > 0) {
    if (!current) {
      if (!queue.length) return false;
      current = queue.shift();
      current.t = 0;
      current.begin && current.begin();
    }
    const room = current.dur - current.t;
    const use = Math.min(room, budget);
    current.t += use;
    budget -= use;
    current.update && current.update(current.dur ? current.t / current.dur : 1);
    if (current.t >= current.dur - 1e-9) {
      current.end && current.end();
      current = null;
      if (!queue.length) {
        if (pendingSay >= 0) { say(summary(pendingSay)); pendingSay = -1; }
        return false;
      }
    } else return true;
  }
  return true;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const busy = advance(dt);
  const moving = draw(dt);
  frame = visible && (busy || moving || current || queue.length) ? requestAnimationFrame(tick) : 0;
}
function kick() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } else if (!visible) draw(1); }

buttons.forEach((button, i) => button.addEventListener("click", () => press(i)));
const labelToggle = document.querySelector("[data-labels]");
function showLabels(on) {
  labelToggle.setAttribute("aria-pressed", String(on));
  labelToggle.textContent = "Labels: " + (on ? "on" : "off");
  stage.dataset.labels = on ? "on" : "off";
}
labelToggle.addEventListener("click", () => showLabels(labelToggle.getAttribute("aria-pressed") !== "true"));
// on a phone the figure is cropped at the sides, where the labels sit, so they start off
if (matchMedia("(max-width: 820px)").matches) showLabels(false);
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) kick(); }, { rootMargin: "120px 0px" }).observe(stage);
draw(1);

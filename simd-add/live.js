const stage = document.querySelector(".sd-stage");
const svg = stage.querySelector("svg");
const q = (selector) => svg.querySelector(selector);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]");
const status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll(".sd-step")];
const chips = Object.fromEntries([...document.querySelectorAll("[data-chip]")].map((el) => [el.dataset.chip, el]));
const lcd = Object.fromEntries([...svg.querySelectorAll("[data-lcd]")].map((el) => [el.dataset.lcd, el]));
const regText = [0, 1, 2].map((r) => Array.from({ length: 16 }, (_, lane) => svg.querySelector(`[data-reg="${r}"][data-lane="${lane}"]`)));
const sumText = Array.from({ length: 16 }, (_, lane) => svg.querySelector(`[data-sum="${lane}"]`));
const laneParts = Array.from({ length: 16 }, (_, lane) => [...svg.querySelectorAll(`[data-ln="${lane}"]`)]);
const adders = Array.from({ length: 16 }, (_, lane) => svg.querySelector(`[data-ln="${lane}"][data-row="adder"] .iso-solid`));
const slots = [0, 1, 2].map((r) => Array.from({ length: 16 }, (_, lane) => svg.querySelector(`[data-ln="${lane}"][data-row="zmm${r}"] .iso-solid`)));
const bits = Array.from({ length: 16 }, (_, lane) => svg.querySelector(`[data-bit="${lane}"]`));
const bitSolids = bits.map((el) => el.querySelector(".iso-solid"));
const done = Object.fromEntries(["a", "b", "c"].map((n) => [n, q(`[data-done="${n}"]`)]));
const hot = Object.fromEntries(["a", "b", "c"].map((n) => [n, q(`[data-hot="${n}"]`)]));
const gate = [q('[data-part="gate-back"]'), q('[data-part="gate-front"]')];
const carriageEl = q('[data-part="carriage"]');
const needle = q('[data-part="needle"]');
const dialArc = q('[data-part="dial-arc"]');
const knob = q('[data-part="knob"]');
const issue = q('[data-part="issue"]');
const decodeText = q('[data-part="decode-text"]');
const rackLed = q('[data-part="rack-led"]');
const packetLayer = q('[data-layer="packets"]');
const NS = "http://www.w3.org/2000/svg";
const packet = document.createElementNS(NS, "circle");
packet.setAttribute("class", "sd-packet");
packet.setAttribute("r", "2.4");
packet.style.display = "none";
packetLayer.appendChild(packet);

// ---------- state ----------
let seed = 1;
let data = arraysFor(seed);
const fresh = () => ({
  on: false, width: 32, regs: [[], [], []], sums: [], mask: 0xffff, lit: [], issuing: 0,
  scalar: 0, steps: 0, read: 0, written: 0, block: null, pointer: 0, instr: "", packet: null,
});
let s = fresh();
let next = 0;
let queue = [];
let current = null;
let shown = { gate: 1, pointer: 0, use: 0, knob: 0, bits: Array(16).fill(1) };
let frame = 0, last = 0, visible = false;

const loop = () => loopFor(ELEMENTS, s.width);
const lanes = () => lanesFor(s.width);
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pct = (x) => (x * 100).toFixed(1) + "%";
const follow = (value, goal, dt, seconds) => (still.matches ? goal : value + (goal - value) * (1 - Math.exp(-dt / seconds)));
const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const text = (el, value) => { if (el && el.textContent !== value) el.textContent = value; };
const setFlag = (el, name, on) => { if (!el) return; if (on) { if (!el.hasAttribute(name)) el.setAttribute(name, ""); } else if (el.hasAttribute(name)) el.removeAttribute(name); };
const reg = (index) => registerName(s.width, index);

// ---------- phases ----------
const phase = (dur, begin, update, end) => ({ dur, begin, update, end });
const wait = (dur) => phase(dur);
function loadPhase(which, start, count, dur, packetOn = true) {
  const r = which === "a" ? 0 : 1;
  return phase(dur,
    () => {
      s.block = { start, count, strips: [which] };
      s.pointer = start;
      const masked = count < lanes();
      s.instr = s.width < 128 ? `mov e${which === "a" ? "ax" : "bx"}, [${which}+${start * 4}]` : `vmovdqu32 ${reg(r)}${masked ? "{k1}{z}" : ""}, [${which}+${start * 4}]`;
      if (packetOn) s.packet = { path: [[CELL_X0 + (start + count / 2) * CELL, STRIPS[which].y + STRIPS[which].d / 2, STRIP_TOP + 0.4], ...LOAD_PATHS[which]], at: 0 };
    },
    (f) => { if (s.packet) s.packet.at = Math.min(1, f / 0.85); },
    () => {
      s.packet = null;
      s.regs[r] = Array.from({ length: 16 }, (_, lane) => (lane < lanes() ? (lane < count ? data[which][start + lane] : 0) : null));
      s.read = Math.max(s.read, start + count);
    });
}
function addPhase(start, count, dur) {
  return phase(dur,
    () => {
      s.instr = s.width < 128 ? "add eax, ebx" : `vpaddd ${reg(2)}${count < lanes() ? "{k1}{z}" : ""}, ${reg(0)}, ${reg(1)}`;
      s.issuing = 1;
      s.lit = Array.from({ length: 16 }, (_, lane) => lane < count);
      s.sums = Array.from({ length: 16 }, (_, lane) => (lane < count ? data.c[start + lane] : null));
      s.regs[2] = Array.from({ length: 16 }, (_, lane) => (lane < lanes() ? (lane < count ? data.c[start + lane] : 0) : null));
      if (s.width >= 128) s.steps += 1;
      else s.scalar += 1;
    },
    null,
    () => { s.issuing = 0; s.lit = []; });
}
function storePhase(start, count, dur, packetOn = true) {
  return phase(dur,
    () => {
      s.block = { start, count, strips: ["c"] };
      s.instr = s.width < 128 ? `mov [c+${start * 4}], eax` : `vmovdqu32 [c+${start * 4}]${count < lanes() ? "{k1}" : ""}, ${reg(2)}`;
      if (packetOn) s.packet = { path: [...STORE_PATH, [CELL_X0 + (start + count / 2) * CELL, STRIPS.c.y + STRIPS.c.d / 2, STRIP_TOP + 0.4]], at: 0 };
    },
    (f) => { if (s.packet) s.packet.at = Math.min(1, f / 0.85); },
    () => { s.packet = null; s.written = Math.max(s.written, start + count); s.sums = []; });
}
const clearRegs = () => { s.regs = [[], [], []]; s.sums = []; };

function plan(index) {
  const out = [];
  if (index === 0) {
    out.push(phase(0.4, () => { s = fresh(); s.on = true; s.width = 32; s.mask = 1; }));
    for (let i = 0; i < 24; i++) {
      const slow = i === 0;
      out.push(loadPhase("a", i, 1, slow ? 1.1 : 0.12, slow), loadPhase("b", i, 1, slow ? 1.1 : 0.12, slow), addPhase(i, 1, slow ? 0.8 : 0.1), storePhase(i, 1, slow ? 1.1 : 0.1, slow));
    }
    out.push(phase(0.2, () => { s.block = null; s.instr = "add eax, ebx  · ×1,000"; }));
  } else if (index === 1) {
    out.push(phase(0.5, () => { clearRegs(); s.written = 0; s.read = 0; s.block = null; s.pointer = 0; s.instr = ""; }));
    for (const width of [128, 256, 512]) out.push(phase(1.5, () => { s.width = width; s.mask = 2 ** lanesFor(width) - 1; clearRegs(); }));
  } else if (index === 2) out.push(loadPhase("a", 0, 16, 1.6));
  else if (index === 3) out.push(loadPhase("b", 0, 16, 1.6));
  else if (index === 4) out.push(addPhase(0, 16, 1.4));
  else if (index === 5) out.push(storePhase(0, 16, 1.6));
  else if (index === 6) {
    for (let k = 1; k < loop().full; k++) {
      const { start, count } = stepOf(loop(), k);
      out.push(loadPhase("a", start, count, 0.035, false), loadPhase("b", start, count, 0.035, false), addPhase(start, count, 0.05), storePhase(start, count, 0.035, false));
    }
    out.push(phase(0.3, () => { s.block = null; s.instr = `${loop().full} steps · ${ELEMENTS - loop().full * 16} left over`; }));
  } else if (index === 7) {
    const step = stepOf(loop(), loop().full);
    out.push(phase(1.2, () => { clearRegs(); s.pointer = step.start; s.block = { start: step.start, count: step.count, strips: ["a", "b", "c"] }; s.mask = step.mask; s.instr = `kmovw k1, ${maskHex(step.mask, 16)}`; }));
    out.push(loadPhase("a", step.start, step.count, 1.4), loadPhase("b", step.start, step.count, 1.4), addPhase(step.start, step.count, 1.3), storePhase(step.start, step.count, 1.4));
    out.push(phase(0.2, () => { s.block = null; }));
  } else if (index === 8) {
    out.push(phase(0.4, () => { seed += 1; data = arraysFor(seed); s = fresh(); }));
  }
  return out;
}

function press(index) {
  if (index !== next || queue.length || current) return;
  queue = plan(index);
  next = index === 8 ? 0 : index + 1;
  if (still.matches) {
    for (const p of queue) { p.begin && p.begin(); p.update && p.update(1); p.end && p.end(); }
    queue = [];
    s.packet = null; s.issuing = 0; s.lit = [];
    say(summary(index));
  } else pendingSay = index;
  kick();
}
let pendingSay = -1;
function say(value) { status.textContent = value; }
function summary(index) {
  const l = loop();
  return [
    "Scalar: one add instruction per element. 24 done; the whole array takes 1,000.",
    "Widened to 512 bits: 16 lanes, so the loop needs 62 full steps and one masked step, 63 adds.",
    "Loaded 16 values of a into " + reg(0) + " with one instruction.",
    "Loaded 16 values of b into " + reg(1) + ".",
    "One vpaddd: 16 sums in the same cycle.",
    "Stored 16 values of c with one instruction.",
    "Ran the loop: " + l.full + " vector adds cover " + fmt(l.full * 16) + " elements; " + l.tail + " are left.",
    "Masked step: k1 = " + maskHex(l.tailMask, 16) + ", 8 lanes on, 8 off. 63 adds in all, lane use " + pct(l.laneUse) + ".",
    "New arrays loaded. Start again from step 1.",
  ][index];
}

// ---------- drawing ----------
function strip(name, from, to) {
  if (to <= from) return "";
  const st = STRIPS[name];
  const x0 = CELL_X0 + from * CELL, x1 = CELL_X0 + to * CELL;
  return onTop([[x0, st.y + 0.4], [x1, st.y + 0.4], [x1, st.y + st.d - 0.4], [x0, st.y + st.d - 0.4]], STRIP_TOP + 0.02, P, true);
}
function needleAt(share) {
  const a = SWEEP[0] + share * SWEEP[1];
  const [x, y] = DIALS.use.at;
  const R = DIALS.use.r;
  return lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (R - 4), y - Math.cos(a) * (R - 4)], DIAL_TOP + 0.2, P);
}
function arcTo(share) {
  if (share < 0.004) return "";
  const n = Math.max(2, Math.ceil(share * 40));
  const [x, y] = DIALS.use.at;
  const R = DIALS.use.r - 2;
  return onTop(Array.from({ length: n + 1 }, (_, i) => { const a = SWEEP[0] + (i / n) * share * SWEEP[1]; return [x + Math.sin(a) * R, y - Math.cos(a) * R]; }), DIAL_TOP, P);
}
function knobLine(index) {
  const a = -0.75 * Math.PI + (index / 3) * 1.5 * Math.PI;
  const [kx, ky] = DIALS.width.at;
  const r = DIALS.width.r;
  return lineOnTop([kx + Math.sin(a) * 1.2, ky - Math.cos(a) * 1.2], [kx + Math.sin(a) * (r - 0.8), ky - Math.cos(a) * (r - 0.8)], KNOB_TOP, P);
}
function pointOn(path, f) {
  const lengths = [0];
  for (let i = 1; i < path.length; i++) lengths.push(lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]));
  const at = ease(f) * lengths[lengths.length - 1];
  let j = 1;
  while (j < lengths.length - 1 && lengths[j] < at) j++;
  const t = lengths[j] > lengths[j - 1] ? (at - lengths[j - 1]) / (lengths[j] - lengths[j - 1]) : 0;
  return path[j - 1].map((v, i) => v + (path[j][i] - v) * t);
}

function draw(dt) {
  const l = loop();
  const n = lanes();
  const vector = s.width >= 128;
  let moving = false;

  const gateGoal = s.on ? n : 1;
  const lastGate = shown.gate;
  shown.gate = follow(shown.gate, gateGoal, dt, 0.35);
  if (Math.abs(shown.gate - gateGoal) < 0.002) shown.gate = gateGoal; else moving = true;
  if (shown.gate !== lastGate || !gate[0].dataset.set) {
    const tr = "translate(" + (GATE_DX[0] * shown.gate).toFixed(2) + " " + (GATE_DX[1] * shown.gate).toFixed(2) + ")";
    gate.forEach((g) => g.setAttribute("transform", tr));
    gate[0].dataset.set = "1";
  }
  const knobGoal = WIDTH_STOPS.indexOf(s.width);
  const lastKnob = shown.knob;
  shown.knob = follow(shown.knob, knobGoal, dt, 0.25);
  if (Math.abs(shown.knob - knobGoal) < 0.002) shown.knob = knobGoal; else moving = true;
  if (shown.knob !== lastKnob || !knob.dataset.set) { knob.setAttribute("d", knobLine(shown.knob)); knob.dataset.set = "1"; }

  const lastPointer = shown.pointer;
  shown.pointer = follow(shown.pointer, s.pointer, dt, 0.18);
  if (Math.abs(shown.pointer - s.pointer) < 0.01) shown.pointer = s.pointer; else moving = true;
  if (shown.pointer !== lastPointer || !carriageEl.dataset.set) {
    carriageEl.setAttribute("transform", "translate(" + (CARRIAGE_DX[0] * shown.pointer).toFixed(2) + " " + (CARRIAGE_DX[1] * shown.pointer).toFixed(2) + ")");
    carriageEl.dataset.set = "1";
  }

  for (let lane = 0; lane < 16; lane++) {
    const off = lane >= n;
    const masked = !off && !((s.mask >> lane) & 1);
    for (const el of laneParts[lane]) { setFlag(el, "data-off", off); setFlag(el, "data-masked", masked); }
    setFlag(adders[lane], "data-lit", !!s.lit[lane]);
    const bitGoal = (s.mask >> lane) & 1;
    const lastBit = shown.bits[lane];
    shown.bits[lane] = follow(shown.bits[lane], bitGoal, dt, 0.12);
    if (Math.abs(shown.bits[lane] - bitGoal) < 0.01) shown.bits[lane] = bitGoal; else moving = true;
    if (shown.bits[lane] !== lastBit || !bits[lane].dataset.set) {
      const off01 = 1 - shown.bits[lane];
      bits[lane].setAttribute("transform", off01 ? "translate(" + (BIT_DY[0] * off01).toFixed(2) + " " + (BIT_DY[1] * off01).toFixed(2) + ")" : "");
      bits[lane].dataset.set = "1";
    }
    setFlag(bitSolids[lane], "data-lit", bitGoal === 1 && !off);
    for (let r = 0; r < 3; r++) {
      const value = s.regs[r][lane];
      text(regText[r][lane], value === null || value === undefined ? "" : String(value));
      setFlag(slots[r][lane], "data-lit", !!s.lit[lane] && r === 2 || (value !== null && value !== undefined && (s.issuing && r < 2 && s.lit[lane])));
    }
    const sum = s.sums[lane];
    text(sumText[lane], sum === null || sum === undefined || !s.lit[lane] ? "" : String(sum));
  }
  issue.style.opacity = s.issuing ? "1" : "0";
  rackLed.style.opacity = s.on ? "1" : "0.2";
  text(decodeText, s.instr || (s.on ? "" : "idle"));

  // memory strips
  done.a.setAttribute("d", strip("a", 0, s.read));
  done.b.setAttribute("d", strip("b", 0, s.read));
  done.c.setAttribute("d", strip("c", 0, s.written));
  for (const name of ["a", "b", "c"]) {
    const b = s.block && s.block.strips.includes(name) ? s.block : null;
    hot[name].setAttribute("d", b ? strip(name, b.start, b.start + b.count) : "");
  }

  if (s.packet) {
    const [x, y] = iso(pointOn(s.packet.path, s.packet.at), P);
    packet.setAttribute("cx", x.toFixed(2));
    packet.setAttribute("cy", y.toFixed(2));
    packet.style.display = "";
  } else packet.style.display = "none";

  const use = vector && s.steps ? progressOf(l, s.steps).laneUse : 0;
  const lastUse = shown.use;
  shown.use = follow(shown.use, use, dt, 0.25);
  if (Math.abs(shown.use - use) < 0.0005) shown.use = use; else moving = true;
  if (shown.use !== lastUse || !needle.dataset.set) { needle.setAttribute("d", needleAt(shown.use)); dialArc.setAttribute("d", arcTo(shown.use)); needle.dataset.set = "1"; }

  // displays and chips, all from the model
  const l128 = loopFor(ELEMENTS, 128), l256 = loopFor(ELEMENTS, 256), l512 = loopFor(ELEMENTS, 512);
  text(lcd.instr, s.instr || (s.on ? "-" : "idle"));
  text(lcd.width, s.on ? String(s.width) : "-");
  text(lcd.lanes, s.on ? String(n) : "-");
  text(lcd.step, vector ? s.steps + "/" + l.steps : "-");
  text(lcd.done, s.on ? String(s.written) : "-");
  text(lcd.vadd, vector ? String(s.steps) : "-");
  text(lcd.sadd, s.on && !vector ? String(s.scalar) : String(ELEMENTS));
  text(lcd.mask, s.on && vector ? maskHex(s.mask, 16).slice(2) : "-");
  text(lcd.w128, l128.steps + " ADDS");
  text(lcd.w256, l256.steps + " ADDS");
  text(lcd.w512, l512.full + "+1=" + l512.steps);
  text(lcd.use, vector && s.steps ? pct(use) : "-");
  text(chips.width, s.width + " bits · " + n + (n === 1 ? " lane" : " lanes"));
  text(chips.scalar, s.on && !vector ? fmt(s.scalar) + " of " + fmt(ELEMENTS) : fmt(ELEMENTS));
  text(chips.vector, vector ? String(s.steps) : "0");
  text(chips.plan, vector ? l.full + " full" + (l.tail ? " + 1 masked (" + l.tail + " lanes)" : "") + " = " + l.steps + " adds" : fmt(ELEMENTS) + " adds, one per element");
  text(chips.use, vector && s.steps ? pct(use) + " (" + fmt(s.written || progressOf(l, s.steps).done) + " / " + s.steps + " × " + n + ")" : "-");
  text(chips.fewer, vector ? fmt(ELEMENTS) + " / " + l.steps + " = " + l.fewerAdds.toFixed(1) + "× fewer adds (memory makes the real speedup smaller)" : "-");
  const state = !s.on ? "idle" : vector ? s.width + "-bit · " + s.steps + " of " + l.steps + " vector adds · c " + fmt(s.written) + " / " + fmt(ELEMENTS) : "scalar · " + fmt(s.scalar) + " of " + fmt(ELEMENTS) + " adds";
  text(readout, state);

  buttons.forEach((button, i) => {
    const st = i < next || (next === 0 && false) ? "done" : i === next ? "next" : "later";
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
labelToggle.addEventListener("click", () => {
  const on = labelToggle.getAttribute("aria-pressed") !== "true";
  labelToggle.setAttribute("aria-pressed", String(on));
  labelToggle.textContent = "Labels: " + (on ? "on" : "off");
  stage.dataset.labels = on ? "on" : "off";
});
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) kick(); }, { rootMargin: "120px 0px" }).observe(stage);
draw(1);

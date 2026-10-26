const stage = document.querySelector(".gl-stage");
const svg = stage.querySelector("svg");
const q = (selector) => svg.querySelector(selector);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]");
const status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll(".gl-step")];
const chips = Object.fromEntries([...document.querySelectorAll("[data-chip]")].map((el) => [el.dataset.chip, el]));
const lcd = Object.fromEntries([...svg.querySelectorAll("[data-lcd]")].map((el) => [el.dataset.lcd, el]));

const lanes = [];
svg.querySelectorAll("[data-lane]").forEach((el) => (lanes[Number(el.dataset.lane)] = el.querySelector(".iso-solid")));
const slots = [];
svg.querySelectorAll("[data-slot]").forEach((el) => (slots[Number(el.dataset.slot)] = { el, solid: el.querySelector(".iso-solid"), state: "", lift: -1 }));
const liquid = Object.fromEntries([...q('[data-part="liquid"]').children].map((el) => [el.dataset.k, el]));
const layers = { a: q('[data-layer="a"]'), b: q('[data-layer="b"]'), c: q('[data-layer="c"]') };
const vramLeds = [...svg.querySelectorAll('[data-part="vram-led"]')];
const powerLed = q('[data-part="power-led"]');
const consoleLed = q('[data-part="console-led"]');
const needle = q('[data-part="needle"]');
const dialArc = q('[data-part="dial-arc"]');
const knob = q('[data-part="knob"]');
const chart = q('[data-part="chart"]');
const bus = q('[data-part="bus"]');

const NS = "http://www.w3.org/2000/svg";
const packets = Array.from({ length: SM.maxWarps }, () => {
  const el = document.createElementNS(NS, "circle");
  el.setAttribute("class", "gl-packet");
  el.setAttribute("r", "1.7");
  el.style.display = "none";
  layers.c.appendChild(el);
  return { el, layer: "c", shown: false };
});

const COMPUTE = BASE.compute;
const SPEED = { hold: 0, until: 22, free: 48 };
let plan = null, run = null, t = 0, mode = "off", target = 0, next = 0, enableAt = 0, stepFrom = 0, announced = true;
let speed = 0, shownBusy = 0, shownLevel = 0, shownWait = 100, power = 0, busGlow = 0;
const chipGlow = [0, 0];
const firstSeen = [];
let frame = 0, last = 0, visible = false, custom = false;
function needText(burst, wait) {
  const need = warpsToHide(burst, wait);
  const whole = Math.ceil(need - 1e-9);
  return "1 + " + wait + "/" + burst + " = " + (Number.isInteger(need) ? need : need.toFixed(1) + " → " + whole);
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pct = (x) => (x * 100).toFixed(1) + "%";
const follow = (value, goal, dt, seconds) => (still.matches ? goal : value + (goal - value) * (1 - Math.exp(-dt / seconds)));
const smooth01 = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const waitNow = () => (plan ? entryAt(plan, t).wait : 100);

function resimulate(horizon) { run = simulate(plan, Math.max(horizon, Math.ceil(t) + 4000)); }

function press(index) {
  if (index !== next || !ready()) return;
  const step = STEPS[index];
  if (step.run === "reset") {
    plan = null; run = null; t = 0; mode = "off"; next = 0; enableAt = 0; firstSeen.length = 0;
    say("New kernel: the SM is empty and the card is idle. Launch again to replay.");
    kick();
    return;
  }
  custom = false;
  if (step.id === "launch") {
    plan = [{ at: 0, warps: 1, compute: COMPUTE, wait: step.wait }];
    t = 0; mode = "hold"; enableAt = 0;
  } else if (step.run === "until") {
    mode = "until"; target = step.to; enableAt = step.to;
  } else {
    const at = Math.ceil(t);
    const prev = plan[plan.length - 1];
    plan = [...plan.filter((entry) => entry.at < at), { at, warps: Math.max(prev.warps, step.warps), compute: COMPUTE, wait: step.wait }];
    mode = "free"; enableAt = at + COMPUTE + step.wait + COMPUTE;
  }
  stepFrom = t;
  resimulate(Math.ceil(t) + 6000);
  next = index + 1;
  announced = false;
  if (still.matches) t = Math.max(t, mode === "until" ? target : enableAt);
  kick();
}
const ready = () => next === 0 || (run && t >= enableAt - 1e-9);

function say(text) { status.textContent = text; }
function describe() {
  const warps = plan[plan.length - 1].warps;
  const share = measuredBusy(run, t);
  const step = STEPS[next - 1];
  const lines = {
    launch: "Kernel launched: warp 0 is resident, holding 1,024 of 65,536 registers.",
    compute: "Warp 0 computed for 10 cycles on all 32 lanes: busy 100% so far.",
    load: "Warp 0 waited 100 cycles for VRAM with nothing else to run: busy " + pct(share) + ".",
  };
  return lines[step.id] || "Busy " + pct(share) + " with " + warps + " warps and a " + waitNow() + "-cycle wait.";
}

function setLit(el, on) { if (!el) return; if (on) { if (!el.hasAttribute("data-lit")) el.setAttribute("data-lit", ""); } else if (el.hasAttribute("data-lit")) el.removeAttribute("data-lit"); }

function place(packet, route, s) {
  const total = route.lengths[route.lengths.length - 1];
  const at = s * total;
  let j = 1;
  while (j < route.lengths.length - 1 && route.lengths[j] < at) j++;
  const a = route.lengths[j - 1], b = route.lengths[j];
  const f = b > a ? Math.min(1, Math.max(0, (at - a) / (b - a))) : 0;
  const p0 = route.screen[j - 1], p1 = route.screen[j];
  let layer = route.layers[j];
  let alpha = 1;
  const hide = route.layers.indexOf("hide");
  const h0 = route.lengths[hide - 1], h1 = route.lengths[hide];
  if (at > h0 && at < h1) alpha = 0;
  else alpha = smooth01(Math.min(Math.abs(at - h0), Math.abs(at - h1)) / 5);
  if (layer === "hide") layer = at < (h0 + h1) / 2 ? "a" : "b";
  if (packet.layer !== layer) { layers[layer].appendChild(packet.el); packet.layer = layer; }
  packet.el.setAttribute("cx", (p0[0] + (p1[0] - p0[0]) * f).toFixed(2));
  packet.el.setAttribute("cy", (p0[1] + (p1[1] - p0[1]) * f).toFixed(2));
  packet.el.style.opacity = alpha.toFixed(2);
}

function liquidAt(level) {
  const plan = { x: TANK.x + 0.8, y: TANK.y + 0.8, w: TANK.w - 1.6, d: TANK.d - 1.6, r: 0.5 };
  if (level < 0.002) { for (const el of Object.values(liquid)) el.setAttribute("d", ""); return; }
  const paths = slabOf(plan, TANK_Z + 0.3, (TANK_H - 0.8) * level, P, 3);
  liquid.fill.setAttribute("d", paths.fill);
  paths.shades.forEach((d, i) => liquid["s" + i].setAttribute("d", d || ""));
  liquid.top.setAttribute("d", paths.top);
  liquid.outline.setAttribute("d", paths.outline);
}

function needleAt(share) {
  const a = SWEEP[0] + share * SWEEP[1];
  const [x, y] = DIAL;
  return lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (DIAL_R - 4), y - Math.cos(a) * (DIAL_R - 4)], DIAL_TOP + 0.2, P);
}
function arcTo(share) {
  if (share < 0.004) return "";
  const n = Math.max(2, Math.ceil(share * 40));
  const [x, y] = DIAL;
  return onTop(Array.from({ length: n + 1 }, (_, i) => { const a = SWEEP[0] + (i / n) * share * SWEEP[1]; return [x + Math.sin(a) * (DIAL_R - 2), y - Math.cos(a) * (DIAL_R - 2)]; }), DIAL_TOP, P);
}
function knobLine(wait) {
  const a = -Math.PI / 2 + ((wait - 100) / 200) * Math.PI;
  return lineOnTop([KNOB[0] + Math.sin(a) * 1.2, KNOB[1] - Math.cos(a) * 1.2], [KNOB[0] + Math.sin(a) * (KNOB_R - 0.8), KNOB[1] - Math.cos(a) * (KNOB_R - 0.8)], KNOB_TOP, P);
}
function chartPath(cells) {
  const x0 = CHART.x0 + 2, x1 = CHART.x1 - 2, hi = -(CHART.z1 - 3), lo = -(CHART.z0 + 3);
  const step = (x1 - x0) / cells.length;
  let d = "M" + x0.toFixed(1) + " " + (cells[0] ? hi : lo);
  for (let i = 1; i < cells.length; i++) if (cells[i] !== cells[i - 1]) { const x = (x0 + i * step).toFixed(1); d += "H" + x + "V" + (cells[i] ? hi : lo); }
  return d + "H" + x1.toFixed(1);
}
function text(el, value) { if (el && el.textContent !== value) el.textContent = value; }

function draw(dt, now) {
  const on = !!run;
  const s = on ? stateAt(run, t) : null;
  const busy = on ? measuredBusy(run, t) : 0;
  const wait = waitNow();
  power = follow(power, on ? 1 : 0, dt, 0.25);
  powerLed.style.opacity = (0.15 + 0.85 * power).toFixed(2);
  consoleLed.style.opacity = (0.2 + 0.8 * power).toFixed(2);

  const computing = on && s.active >= 0;
  lanes.forEach((el) => setLit(el, computing));
  busGlow = follow(busGlow, computing ? 1 : 0, dt, 0.06);
  bus.style.opacity = busGlow.toFixed(2);

  let moving = false;
  const atChip = [0, 0];
  slots.forEach((slot, i) => {
    const warp = on ? s.warps[i] : null;
    const state = warp && warp.state !== "out" ? warp.state : "out";
    if (state !== slot.state) {
      slot.el.style.display = state === "out" ? "none" : "";
      slot.el.dataset.state = state;
      setLit(slot.solid, state === "compute");
      slot.state = state;
      if (state === "out") firstSeen[i] = undefined;
    }
    if (state !== "out") {
      if (firstSeen[i] === undefined) firstSeen[i] = still.matches ? -1e9 : now;
      const share = smooth01((now - firstSeen[i]) / 450);
      const lift = Math.round((1 - share) * 140) / 10;
      if (lift !== slot.lift) { slot.el.setAttribute("transform", lift ? translateAlong(P, [0, 0, lift]) : ""); slot.lift = lift; }
      if (lift) moving = true;
    }
    const packet = packets[i];
    if (state === "wait") {
      const p = warp.share;
      const route = ROUTES[i % 2];
      const along = p < 0.4 ? p / 0.4 : p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      if (p >= 0.4 && p < 0.6) atChip[i % 2]++;
      place(packet, route, along);
      if (!packet.shown) { packet.el.style.display = ""; packet.shown = true; }
    } else if (packet.shown) { packet.el.style.display = "none"; packet.shown = false; }
  });
  vramLeds.forEach((el, i) => { chipGlow[i] = follow(chipGlow[i], Math.min(1, atChip[i] * 0.6), dt, 0.08); el.style.opacity = chipGlow[i].toFixed(2); if (Math.abs(chipGlow[i] - Math.min(1, atChip[i] * 0.6)) > 0.01) moving = true; });

  const level = on ? s.registers / SM.registers : 0;
  const lastLevel = shownLevel;
  shownLevel = follow(shownLevel, level, dt, 0.35);
  if (Math.abs(shownLevel - level) < 0.0004) shownLevel = level;
  if (shownLevel !== lastLevel || !liquid.top.getAttribute("d") !== !(shownLevel >= 0.002)) liquidAt(shownLevel);
  if (shownLevel !== level) moving = true;

  const lastBusy = shownBusy;
  shownBusy = follow(shownBusy, busy, dt, 0.22);
  if (Math.abs(shownBusy - busy) < 0.0005) shownBusy = busy;
  if (shownBusy !== lastBusy || !needle.dataset.ready) { needle.setAttribute("d", needleAt(shownBusy)); dialArc.setAttribute("d", arcTo(shownBusy)); needle.dataset.ready = "1"; }
  if (shownBusy !== busy) moving = true;

  const lastWait = shownWait;
  shownWait = follow(shownWait, wait, dt, 0.5);
  if (Math.abs(shownWait - wait) < 0.05) shownWait = wait;
  if (shownWait !== lastWait) knob.setAttribute("d", knobLine(shownWait));
  if (shownWait !== wait) moving = true;

  if (on) {
    const warps = s.resident;
    text(lcd.cycle, String(Math.floor(t)).padStart(6, "0"));
    text(lcd.busy, pct(busy));
    text(lcd.warps, String(warps).padStart(2, "0") + "/" + residentCap());
    text(lcd.regs, String(s.registers).padStart(5, "0"));
    text(lcd.wait, String(wait));
    const burst = entryAt(plan, t).compute;
    text(lcd.burst, String(burst));
    chart.setAttribute("d", chartPath(historyOf(run, Math.floor(t), CHART_SPAN)));
    text(chips.cycle, fmt(Math.floor(t)));
    text(chips.warps, warps + " / " + residentCap());
    text(chips.busy, pct(busy));
    text(chips.regs, fmt(s.registers) + " / " + fmt(SM.registers));
    text(chips.wait, wait + " cycles");
    text(chips.burst, burst + (burst === 1 ? " cycle" : " cycles"));
    text(chips.need, needText(burst, wait));
    text(chips.model, "min(1, " + warps + "×" + burst + "/" + (burst + wait) + ") = " + pct(busyShare(warps, burst, wait)));
    text(readout, "cycle " + fmt(Math.floor(t)) + " · " + warps + (warps === 1 ? " warp" : " warps") + " · busy " + pct(busy));
  } else {
    for (const el of Object.values(lcd)) text(el, "");
    chart.setAttribute("d", "");
    text(chips.cycle, "0"); text(chips.warps, "0 / " + residentCap()); text(chips.busy, "0.0%"); text(chips.regs, "0 / " + fmt(SM.registers));
    text(chips.wait, "100 cycles"); text(chips.burst, COMPUTE + " cycles"); text(chips.need, "1 + 100/10 = " + warpsToHide(COMPUTE, 100)); text(chips.model, "min(1, 0×10/110) = 0.0%");
    text(readout, "card idle · no kernel");
  }

  buttons.forEach((button, i) => {
    const state = i < next ? "done" : i === next ? "next" : "later";
    if (button.dataset.state !== state) button.dataset.state = state;
    const enabled = i === next && ready();
    if (button.disabled === enabled) button.disabled = !enabled;
    const fill = i === next && !enabled && run ? Math.min(1, Math.max(0, (t - stepFrom) / Math.max(1, enableAt - stepFrom))) : enabled ? 1 : 0;
    button.style.setProperty("--fill", fill.toFixed(3));
  });
  if (!announced && run && ready()) { announced = true; say(describe()); }
  return moving || power > 0.001 && power < 0.999;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const entry = plan ? entryAt(plan, t) : null;
  const goal = mode === "free" && custom && entry ? Math.min(400, Math.max(SPEED.free, (entry.compute + entry.wait) / 3)) : SPEED[mode] || 0;
  speed = still.matches ? goal : speed + (goal - speed) * (1 - Math.exp(-dt / 0.3));
  if (run && (mode === "until" || mode === "free")) {
    t += speed * dt;
    if (mode === "until" && t >= target) {
      t = target;
      mode = STEPS[next - 1].id === "load" ? "free" : "hold";
    }
    if (still.matches && mode === "free") mode = "hold";
    if (t > run.horizon - 2000) resimulate(run.horizon + 6000);
  }
  const moving = draw(dt, now);
  const busy = moving || (run && (mode === "until" || mode === "free"));
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
function kick() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } else if (!visible) draw(1, performance.now()); }

buttons.forEach((button, i) => button.addEventListener("click", () => press(i)));
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) kick(); }, { rootMargin: "120px 0px" }).observe(stage);
draw(1, performance.now());

const labelToggle = document.querySelector("[data-labels]");
labelToggle.addEventListener("click", () => {
  const on = labelToggle.getAttribute("aria-pressed") !== "true";
  labelToggle.setAttribute("aria-pressed", String(on));
  labelToggle.textContent = "Labels: " + (on ? "on" : "off");
  stage.dataset.labels = on ? "on" : "off";
});

// ---------- your own numbers ----------
const form = document.querySelector("[data-custom]");
const fields = { warps: form.elements.warps, compute: form.elements.compute, wait: form.elements.wait };
const LIMITS = { warps: [1, residentCap()], compute: [1, 100], wait: [0, 2000] };
const predict = form.querySelector("[data-predict]");
function readFields() {
  const values = {};
  let ok = true;
  for (const [key, el] of Object.entries(fields)) {
    const [lo, hi] = LIMITS[key];
    const value = Number(el.value);
    const valid = el.value.trim() !== "" && Number.isInteger(value) && value >= lo && value <= hi;
    el.toggleAttribute("aria-invalid", !valid);
    ok = ok && valid;
    values[key] = valid ? value : null;
  }
  return ok ? values : null;
}
function preview() {
  const v = readFields();
  form.elements.run.disabled = !v;
  if (!v) { predict.textContent = "Warps 1–" + residentCap() + ", burst 1–100, wait 0–2,000 (whole numbers)."; return; }
  predict.textContent = "Formula predicts " + pct(busyShare(v.warps, v.compute, v.wait)) + " busy · " + fmt(registersFor(v.warps)) + " registers · hiding the wait takes " + needText(v.compute, v.wait).split(" = ")[1] + " warps";
}
form.addEventListener("input", preview);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const v = readFields();
  if (!v) return;
  plan = [{ at: 0, warps: v.warps, compute: v.compute, wait: v.wait }];
  t = 0; mode = "free"; next = 0; enableAt = 0; firstSeen.length = 0; custom = true; announced = true;
  resimulate(6000);
  if (still.matches) t = 3 * (v.compute + v.wait) + v.warps * v.compute;
  say("Running your numbers: " + v.warps + " warps, " + v.compute + "-cycle bursts, " + v.wait + "-cycle wait. The formula predicts " + pct(busyShare(v.warps, v.compute, v.wait)) + " busy.");
  kick();
});
preview();

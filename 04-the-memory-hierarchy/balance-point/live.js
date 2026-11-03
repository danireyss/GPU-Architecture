const stageBox = document.querySelector(".bp-stage-box");
const svg = stageBox.querySelector("svg");
const q = (s) => svg.querySelector(s);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]");
const sayEl = document.querySelector("[data-say]");
const status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll(".bp-step")];
const chips = Object.fromEntries([...document.querySelectorAll("[data-chip]")].map((el) => [el.dataset.chip, el]));
const slider = document.querySelector("[data-slider]"), sliderBox = document.querySelector("[data-sliderbox]"), slideOut = document.querySelector("[data-slideout]");
const stages = [...svg.querySelectorAll("[data-from]")];
const nums = [...svg.querySelectorAll("[data-arr]")];
const dotsR = q('[data-dots="r"]'), dotsW = q('[data-dots="w"]');
const tags = { pipe: q('[data-tag="pipe"]'), lanes: q('[data-tag="lanes"]') };
const bars = { memory: q('[data-bar="memory"]'), lanes: q('[data-bar="lanes"]') };
const vals = { memory: q('[data-val="memory"]'), lanes: q('[data-val="lanes"]') };
const zones = { m: q(`[data-zone="m"]`), l: q(`[data-zone="l"]`) };
const zoneText = { m: q('[data-zt="m"]'), l: q('[data-zt="l"]') };

const B = GEO.BARS, L = GEO.LINE, F = GEO.LANES, Pp = GEO.PIPE;
const logX = (s, v) => s.x0 + ((Math.log10(Math.max(v, 10 ** s.lo)) - s.lo) / (s.hi - s.lo)) * (s.x1 - s.x0);
const text = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
const flag = (el, n, on) => { if (on) { if (!el.hasAttribute(n)) el.setAttribute(n, ""); } else if (el.hasAttribute(n)) el.removeAttribute(n); };
const show = (el, on) => { const d = on ? "" : "none"; if (el.style.display !== d) el.style.display = d; };
const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const follow = (v, g, dt, s) => (still.matches ? g : v + (g - v) * (1 - Math.exp(-dt / s)));
// 41.7 billion, 125 billion, 20 trillion, 42 thousand: three figures, no false precision
function per(n) {
  const u = n >= T ? [T, " trillion"] : n >= G ? [G, " billion"] : [1e6, " million"];
  const v = n / u[0];
  return (v >= 100 ? v.toFixed(0) : Number(v.toFixed(1)).toString()) + u[1];
}
const short = (n) => per(n).replace(" trillion", "T").replace(" billion", "B").replace(" million", "M");
const gb = (n) => (n / G).toLocaleString("en-US") + " GB/s";
// never let rounding reach 0% or 100% unless it is exact: 99.79% must not read as 100%
const pctOf = (x) => { const p = x * 100; return Math.abs(p - 100) < 1e-9 ? "100%" : p < 1e-9 ? "0%" : p >= 99 || p < 10 ? p.toFixed(2) + "%" : p.toFixed(0) + "%"; };
const perByteText = (x) => (x >= 10 ? x.toFixed(x % 1 ? 1 : 0) : x >= 1 ? Number(x.toFixed(1)).toString() : Number(x.toPrecision(x < 0.1 ? 2 : 3)).toString());

// ---------- state ----------
const s = { stage: -1, next: 0, card: CARDS.course, kernel: null, ops: 1, draw: 0, say: "Press <b>Open the pipe</b>. Everything a kernel works on has to come through it.", counted: false, shownMem: 8, shownLan: 8, shownMark: -2, shownBal: 1, shownFill: 0, shownBw: 0, playing: false, phase: null };
let frame = 0, last = 0, visible = false;
const flows = { r: { list: [], carry: 0 }, w: { list: [], carry: 0 } };
const say = (html) => { s.say = html; status.textContent = html.replace(/<[^>]+>/g, ""); };

const kernelNow = () => (s.kernel ? { ...s.kernel, ops: s.ops } : null);
const result = () => { const k = kernelNow(); return k ? run(s.card, k) : null; };
const fromSlider = (v) => Math.round(10 ** ((v / 1000) * Math.log10(30000)));
const toSlider = (ops) => Math.round((Math.log10(ops) / Math.log10(30000)) * 1000);

// ---------- what each stage means for the pipe ----------
function traffic() {
  if (s.stage < 0) return { r: 0, w: 0 };
  const k = kernelNow();
  if (!k) return { r: s.card.bandwidth, w: 0 };
  const R = run(s.card, k);
  return { r: R.rate * k.read, w: R.rate * k.write };
}
const DOT = 10 * G, SPEED = 300; // one dot for each 10 GB/s; units a second along the pipe
function moveDots(dt) {
  const t = traffic();
  const span = Pp.x1 - Pp.x0 - 12, y = { r: Pp.y + Pp.h / 4 + 2, w: Pp.y + (3 * Pp.h) / 4 - 2 };
  for (const key of ["r", "w"]) {
    const f = flows[key], rate = t[key] / DOT;
    if (still.matches) { f.list = Array.from({ length: Math.round((rate * span) / SPEED) }, (_, i) => ((i + 0.5) / ((rate * span) / SPEED)) * span); }
    else {
      f.carry += rate * dt;
      while (f.carry >= 1) { f.carry -= 1; f.list.push((f.carry / rate) * SPEED); }
      f.list = f.list.map((d) => d + SPEED * dt).filter((d) => d < span);
    }
    const d = f.list.map((p) => { const x = key === "r" ? Pp.x0 + 6 + p : Pp.x1 - 6 - p; return `M${(x - 1.6).toFixed(1)} ${y[key]}a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0Z`; }).join("");
    (key === "r" ? dotsR : dotsW).setAttribute("d", d);
  }
  return s.stage >= 0;
}

// ---------- drawing ----------
function draw(dt) {
  const k = kernelNow(), R = result();
  flag(svg, "data-open", s.stage >= 0);
  stages.forEach((el) => flag(el, "data-seen", s.stage >= Number(el.dataset.from)));
  const showNums = s.stage >= 2 && s.kernel && s.kernel.name === KERNELS.add.name;
  nums.forEach((el) => { const n = el.dataset.arr; el.setAttribute("data-on", showNums ? (n === "c" ? "w" : "r") : s.stage >= 0 && n !== "c" ? "r" : ""); });

  // pipe
  s.shownBw = follow(s.shownBw, s.stage >= 0 ? s.card.bandwidth : 0, dt, 0.15);
  if (Math.abs(s.shownBw - s.card.bandwidth) < 0.02 * s.card.bandwidth) s.shownBw = s.card.bandwidth;
  text(q("[data-bw]"), s.stage >= 0 ? Math.round(s.shownBw / G).toLocaleString("en-US") + " GB/s" : "pipe closed");
  const number = numbersPerSecond(s.card);
  text(q("[data-under]"), R ? `${per(R.rate)} elements a second` : s.stage >= 1 ? `${per(number)} 32-bit numbers a second` : "");
  text(q("[data-under2]"), R ? `${R.bytes} bytes each · pipe ${pctOf(R.pipeUse)} full` : s.stage >= 1 ? `${s.card.bandwidth / G} ÷ 4 = ${number / G}` : "");
  text(q("[data-ops]"), s.stage >= 3 ? per(s.card.ops) + " ops/s" : "");
  text(q("[data-busy]"), s.stage >= 3 && R ? pctOf(R.busy) + " busy" : "");
  text(q("[data-idle]"), s.stage >= 3 && R ? pctOf(1 - R.busy) + " idle" : "");
  // lanes, as an exact filled fraction of the 1,000-cell grid
  const goal = s.stage >= 3 && R ? R.busy : 0;
  s.shownFill = follow(s.shownFill, goal, dt, 0.25);
  if (Math.abs(s.shownFill - goal) < 1e-5) s.shownFill = goal;
  const cells = s.shownFill * F.cols * F.rows, whole = Math.floor(cells / F.cols);
  const fill = q("[data-fill]");
  // whole rows from the bottom, then the part of a row that remains
  const part = (cells - whole * F.cols) * F.cell;
  fill.setAttribute("d", "");
  fill.setAttribute("x", F.gx); fill.setAttribute("width", (F.cols * F.cell).toFixed(2));
  fill.setAttribute("y", (F.gy + (F.rows - whole) * F.cell).toFixed(2)); fill.setAttribute("height", (whole * F.cell).toFixed(2));
  let extra = q("[data-fill2]");
  if (!extra) { extra = fill.cloneNode(); extra.removeAttribute("data-fill"); extra.setAttribute("data-fill2", ""); fill.after(extra); }
  extra.setAttribute("x", F.gx); extra.setAttribute("width", part.toFixed(2)); extra.setAttribute("y", (F.gy + (F.rows - whole - 1) * F.cell).toFixed(2)); extra.setAttribute("height", whole >= F.rows ? 0 : F.cell);

  const limit = s.stage >= 2 && R ? R.limit : null;
  const labelled = s.stage >= 4 ? limit : s.stage >= 2 ? "pipe" : null; // until the lanes are on the board, only the pipe is known
  show(tags.pipe, labelled === "pipe" || labelled === "both");
  show(tags.lanes, labelled === "lanes" || labelled === "both");

  // bars
  if (R) {
    s.shownMem = follow(s.shownMem, Math.log10(R.memory), dt, 0.2);
    s.shownLan = follow(s.shownLan, Math.log10(R.lanes), dt, 0.2);
    const set = (name, logv, value) => {
      const x = logX(B, 10 ** logv);
      bars[name].setAttribute("width", Math.max(0, x - B.x0).toFixed(1));
      const inside = x > B.x1 - 120;
      vals[name].setAttribute("x", (inside ? x - 8 : x + 8).toFixed(1));
      vals[name].setAttribute("text-anchor", inside ? "end" : "start");
      vals[name].style.fill = inside ? "var(--anatomy-card)" : "";
      text(vals[name], per(value));
    };
    set("memory", s.shownMem, R.memory); set("lanes", s.shownLan, R.lanes);
    flag(bars.memory, "data-limit", R.limit !== "lanes"); flag(bars.lanes, "data-limit", R.limit !== "pipe");
    const x = logX(B, Math.min(10 ** s.shownMem, 10 ** s.shownLan));
    q("[data-run]").setAttribute("d", `M${x.toFixed(1)} ${B.y - 8}V${B.y + B.h + B.gap + 4}`);
    const lab = q("[data-runlabel]"); lab.setAttribute("x", Math.min(x, B.x1 - 70).toFixed(1)); text(lab, "runs at " + per(R.rate));
  }
  // number line
  const bal = s.card.ops / s.card.bandwidth;
  s.shownBal = follow(s.shownBal, Math.log10(bal), dt, 0.25);
  const bx = logX(L, 10 ** s.shownBal);
  q("[data-balance]").setAttribute("transform", `translate(${bx.toFixed(1)} 0)`);
  text(q("[data-baltext]"), `balance: ${per(s.card.ops)} ÷ ${(s.card.bandwidth / G).toLocaleString("en-US")} billion = ${bal} per byte`);
  q("[data-baltext]").setAttribute("text-anchor", bx > 700 ? "end" : "middle");
  zones.m.setAttribute("width", (bx - L.x0).toFixed(1));
  zones.l.setAttribute("x", bx.toFixed(1)); zones.l.setAttribute("width", (L.x1 - bx).toFixed(1));
  zoneText.m.setAttribute("x", ((L.x0 + bx) / 2).toFixed(1)); zoneText.l.setAttribute("x", ((L.x1 + bx) / 2).toFixed(1));
  flag(zones.m, "data-on", !!R && s.stage >= 4 && R.limit !== "lanes"); flag(zones.l, "data-on", !!R && s.stage >= 4 && R.limit !== "pipe");
  show(q("[data-marker]"), !!R);
  if (R) {
    s.shownMark = follow(s.shownMark, Math.log10(R.perByte), dt, 0.18);
    const mx = logX(L, 10 ** s.shownMark);
    q("[data-marker]").setAttribute("transform", `translate(${mx.toFixed(1)} 0)`);
    const label = q("[data-marktext]");
    label.setAttribute("x", Math.max(L.x0 + 170, Math.min(mx, L.x1 - 170)).toFixed(1));
    text(label, `${k.name === KERNELS.add.name && k.ops === 1 ? "c = a + b" : "this kernel"}: ${k.ops.toLocaleString("en-US")} ÷ ${R.bytes} = ${perByteText(R.perByte)} per byte`);
  }
  text(q("[data-wire]"), `${(wireBandwidth(WIRES) / G).toLocaleString("en-US")} GB/s`);

  // chips and the readout, one model
  text(chips.bw, s.stage >= 0 ? gb(s.card.bandwidth) : "-");
  text(chips.bytes, R ? String(R.bytes) : "-");
  text(chips.memory, R ? per(R.memory) + "/s" : s.stage >= 1 ? per(number) + " numbers/s" : "-");
  text(chips.lanes, R && s.stage >= 3 ? per(R.lanes) + "/s" : "-");
  text(chips.rate, R ? per(R.rate) + "/s" : "-");
  text(chips.busy, R && s.stage >= 3 ? pctOf(R.busy) : "-");
  text(chips.perbyte, R && s.stage >= 4 ? perByteText(R.perByte) : "-");
  text(chips.balance, s.stage >= 4 ? String(bal) : "-");
  text(chips.turn, R && s.stage >= 5 ? R.turnsAt.toLocaleString("en-US") + " ops per element" : "-");
  text(chips.limit, limit && s.stage >= 4 ? { pipe: "the pipe", lanes: "the lanes", both: "both, in balance" }[limit] : "-");
  text(readout, !R ? (s.stage >= 0 ? gb(s.card.bandwidth) : "pipe closed") : `${per(R.rate)} elements/s · ${s.stage >= 3 ? pctOf(R.busy) + " busy" : R.bytes + " bytes each"}`);
  text(slideOut, s.ops.toLocaleString("en-US"));
  if (sayEl.innerHTML !== s.say) sayEl.innerHTML = s.say;
  buttons.forEach((button, i) => {
    const st = i === s.next ? "next" : i < s.next ? "done" : "later";
    if (button.dataset.state !== st) button.dataset.state = st;
    const on = i === s.next && !s.playing;
    if (button.disabled === on) button.disabled = !on;
  });
}

// ---------- the steps ----------
function setOps(ops) { s.ops = ops; slider.value = toSlider(ops); }
function closing() {
  const R = result(), k = kernelNow();
  const side = R.limit === "pipe" ? `left of the balance point, so <span class="bp-r">the pipe is the limit</span>` : R.limit === "lanes" ? `right of the balance point, so <span class="bp-r">the lanes are the limit</span>` : `exactly on the balance point, so <span class="bp-r">pipe and lanes run out together</span>`;
  return `<b>${k.name}</b>: ${perByteText(R.perByte)} operations per byte, ${side}. It runs at <b>${per(R.rate)} elements a second</b> with the lanes ${pctOf(R.busy)} busy.`;
}
function sweep() {
  // the marker walks to twice the turning point and back, so both sides are seen
  const stops = [[0, 1], [1.8, 960], [2.6, 960], [3.4, 480]];
  s.playing = true; s.phase = { t: 0, stops };
  say("Add math per element. The bytes stay at 12, so the marker moves right.");
}
function press(index) {
  if (index !== s.next || s.playing) return;
  const c = CARDS.course;
  if (index === 0) { s.stage = 0; say(`The pipe from VRAM to the chip carries <b>${gb(c.bandwidth)}</b>. Each dot is 10 GB a second.`); }
  if (index === 1) { s.stage = 1; say(`Each 32-bit number is 4 bytes, so 500 ÷ 4 = <b>${per(numbersPerSecond(c))} numbers a second</b>. That is the pipe's whole width in numbers.`); }
  if (index === 2) { s.stage = 2; s.kernel = KERNELS.add; s.ops = 1; const R = result(); say(`<b>c = a + b</b> reads 2 numbers and writes 1: <b>${R.bytes} bytes per element</b>, so at most 500 ÷ 12 = <b>${per(R.memory)} elements a second</b>.`); }
  if (index === 3) { s.stage = 3; const R = result(); say(`The lanes could do ${per(c.ops)} additions a second and get ${per(R.rate)}. They are busy <b>${pctOf(R.busy)}</b> of the time and <span class="bp-r">idle over 99%</span>.`); }
  if (index === 4) { s.stage = 4; const R = result(); say(`Balance point: ${per(c.ops)} ÷ 500 billion = <b>${R.balance} operations per byte</b>. c = a + b does 1 ÷ 12 = <b>${perByteText(R.perByte)}</b>, far to the left, so <span class="bp-r">the pipe is the limit</span>.`); }
  if (index === 5) { s.stage = 5; sliderBox.removeAttribute("data-off"); slider.disabled = false; if (still.matches) { setOps(480); finish5(); } else sweep(); }
  if (index === 6) { s.stage = 6; s.card = CARDS.bigger; s.kernel = KERNELS.big; setOps(200); const R = result(); say(`The bigger card: ${per(s.card.ops)} operations, ${gb(s.card.bandwidth)}, balance <b>${R.balance}</b>. A kernel at ${perByteText(R.perByte)} per byte is still left of it: <span class="bp-r">memory-bound at ${per(R.rate)}</span> where the lanes alone could manage ${per(R.lanes)}, <b>${pctOf(R.busy)} busy</b>.`); }
  if (index === 7) { const nk = NEW_KERNELS[s.draw++ % NEW_KERNELS.length]; s.kernel = nk; setOps(nk.ops); say(closing()); }
  s.next = index >= 7 ? 7 : s.playing ? index : index + 1;
  kick();
}
function finish5() {
  const R = result();
  s.playing = false; s.phase = null; s.next = 6;
  say(`At 12 bytes the kernel turns compute-bound at 40 × 12 = <b>${R.turnsAt} operations per element</b>. Right there, pipe and lanes run out together, and the lanes are ${pctOf(R.busy)} busy. Try the slider.`);
}
function play(dt) {
  if (!s.phase) return;
  const p = s.phase; p.t += dt;
  const stops = p.stops, end = stops[stops.length - 1][0];
  let i = 0;
  while (i < stops.length - 2 && p.t > stops[i + 1][0]) i++;
  const [t0, a] = stops[i], [t1, b] = stops[i + 1];
  const f = ease((p.t - t0) / (t1 - t0));
  const ops = Math.round(10 ** (Math.log10(a) + (Math.log10(b) - Math.log10(a)) * f));
  setOps(ops);
  const R = result();
  if (R.limit === "lanes" && p.t < 2.6) say(`Past 480 operations <span class="bp-r">the lanes become the limit</span>: the pipe stops filling, and the dots thin out.`);
  if (p.t >= end) { setOps(480); finish5(); }
}
slider.addEventListener("input", () => {
  if (s.playing) return;
  let ops = fromSlider(Number(slider.value));
  const R0 = result(); if (Math.abs(Math.log10(ops / R0.turnsAt)) < 0.012) ops = Math.round(R0.turnsAt); // settle exactly on the turning point
  s.ops = ops; say(closing()); kick();
});

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  play(dt);
  const live_ = moveDots(dt);
  draw(dt);
  frame = visible && (live_ || s.playing) && !still.matches ? requestAnimationFrame(tick) : 0;
}
function kick() { if (still.matches || !visible) { moveDots(1); draw(1); return; } if (!frame) { last = 0; frame = requestAnimationFrame(tick); } }
buttons.forEach((b, i) => b.addEventListener("click", () => press(i)));
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) kick(); }, { rootMargin: "120px 0px" }).observe(stageBox);
draw(1);

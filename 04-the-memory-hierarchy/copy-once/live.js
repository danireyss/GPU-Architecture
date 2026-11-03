const box = document.querySelector(".co-stage-box");
const svg = box.querySelector("svg");
const q = (s) => svg.querySelector(s);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]"), sayEl = document.querySelector("[data-say]"), status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll(".co-step")];
const chips = Object.fromEntries([...document.querySelectorAll("[data-chip]")].map((el) => [el.dataset.chip, el]));
const barEls = [...svg.querySelectorAll("[data-b]")], ghostEls = [...svg.querySelectorAll("[data-g]")];
const flowP = q('[data-flow="pcie"]'), flowV = q('[data-flow="vram"]'), pipe = q("[data-pipe]"), hop = q("[data-hop]"), clockEl = q("[data-clock]"), chipBox = q("[data-chipbox]");
const levels = Object.fromEntries(["ram", "pin", "vram"].map((n) => [n, { bar: q(`[data-level="${n}"]`), text: q(`[data-gb="${n}"]`) }]));
const TL = GEO.TL;
const X = (sec) => TL.x0 + (Math.min(sec, TL.max) / TL.max) * (TL.x1 - TL.x0);
const text = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
const flag = (el, n, on) => { if (on) { if (!el.hasAttribute(n)) el.setAttribute(n, ""); } else if (el.hasAttribute(n)) el.removeAttribute(n); };
const show = (el, on) => { const d = on ? "" : "none"; if (el.style.display !== d) el.style.display = d; };
// seconds and gigabytes, trimmed: 0.32, 0.016, 1.4, 1.063
const sec = (v) => Number(v.toFixed(3)).toString() + " s";
const gbs = (v) => Number(v.toFixed(2)).toString() + " GB";
const pct = (x) => Number((x * 100).toFixed(1)).toString() + "%";
const trillion = (ops) => (ops / 1e12).toFixed(1) + " trillion";

const s = { next: 0, index: -1, plan: null, t: 0, hopLeft: 0, playing: false, job: null, draw: 0, phase: 0, phaseV: 0, say: "Press <b>Copy 8 GB over</b>. The data starts in pinned memory on the host side of the narrow pipe.", result: null };
let frame = 0, last = 0, visible = false;
const say = (html) => { s.say = html; status.textContent = html.replace(/<[^>]+>/g, ""); };

// Where the data is at time t, from the copy that started last.
function where() {
  const p = s.plan;
  if (!p) return { host: 0, vram: 0 };
  const copies = p.bars.filter((b) => b.row === "copy" && b.t0 <= s.t).sort((a, b) => a.t0 - b.t0);
  const b = copies[copies.length - 1];
  if (!b) return { host: p.gb, vram: 0 };
  const f = Math.min(1, (s.t - b.t0) / (b.t1 - b.t0));
  const on = b.dir === "in" ? f * p.gb : (1 - f) * p.gb;
  return { host: p.gb - on, vram: on };
}
function setLevel(name, gb, full) {
  const b = GEO.boxes[name], l = levels[name], h = full ? (Math.min(gb, full) / full) * 40 : 0;
  l.bar.setAttribute("height", h.toFixed(1)); l.bar.setAttribute("y", (b.y + 80 - h).toFixed(1));
  text(l.text, gb > 0.0005 ? gbs(gb) : "empty");
}
function draw() {
  const p = s.plan, t = s.t, rate = p ? p.rate : LINK.board;
  const copying = p && p.bars.find((b) => b.row === "copy" && t >= b.t0 && t < b.t1 && s.hopLeft <= 0);
  const computing = p && p.bars.find((b) => b.row === "compute" && t >= b.t0 && t < b.t1 && s.hopLeft <= 0);
  const race = p && s.index < 2 && s.hopLeft <= 0 && t > 0 && t < p.ghost[0].t1;
  // pipes, width and dashes from the model
  const h = rate * GEO.PX_PER_GBS;
  pipe.setAttribute("height", h.toFixed(2)); pipe.setAttribute("y", (GEO.CY - h / 2).toFixed(2));
  flowP.style.strokeWidth = (h * 0.7).toFixed(2);
  flag(flowP, "data-on", !!copying); flag(flowV, "data-on", !!(computing || race));
  flag(chipBox, "data-on", !!computing);
  text(q('[data-rate="pcie"]'), rate + " GB/s");
  text(q("[data-narrower]"), Number(narrower(rate).toFixed(2)) + " times narrower");
  text(q('[data-move="pcie"]'), p ? `${gbs(p.gb)} in ${sec(copyTime(p.gb, rate))}` : "");
  text(q('[data-move="vram"]'), p ? `${gbs(p.gb)} in ${sec(copyTime(p.gb, LINK.vram))}` : "");
  text(q("[data-chipstate]"), !p ? "" : computing ? "computing" : t >= p.total && s.hopLeft <= 0 ? "done" : "waiting");

  // the data's location
  const w = where(), full = p ? p.gb : 0;
  const inRam = !!(p && p.source === "ram" && s.hopLeft > 0);
  const hopF = inRam ? s.hopLeft / 1.3 : 0;
  setLevel("ram", inRam ? p.gb * hopF : 0, full);
  setLevel("pin", p ? (inRam ? p.gb * (1 - hopF) : w.host) : 0, full);
  setLevel("vram", w.vram, full);
  flag(hop, "data-on", inRam); flag(hop, "data-off", !!p && p.source !== "ram");
  text(q("[data-hoptext]"), !p ? "" : p.source === "ram" ? "extra hop: cost varies, not counted" : s.index === 0 ? "pinned memory skips this hop" : "");

  // timeline bars grow with the clock
  barEls.forEach((el, i) => {
    const b = p && p.bars[i];
    const on = b && t > b.t0;
    show(el, !!on);
    if (!on) return;
    el.setAttribute("data-row", b.row);
    el.setAttribute("x", X(b.t0).toFixed(1)); el.setAttribute("y", b.row === "copy" ? TL.copy : TL.compute);
    el.setAttribute("width", (X(Math.min(t, b.t1)) - X(b.t0)).toFixed(1)); el.setAttribute("height", TL.h);
  });
  ghostEls.forEach((el, i) => {
    const b = p && p.ghost && p.ghost[i];
    const end = b ? (s.index < 2 ? Math.min(t, b.t1) : b.t1) : 0;
    show(el, !!b && end > b.t0);
    if (!b) return;
    el.setAttribute("data-row", b.row); el.setAttribute("x", X(b.t0).toFixed(1)); el.setAttribute("width", Math.max(0, X(end) - X(b.t0)).toFixed(1));
  });
  text(q("[data-ghostname]"), p ? p.ghostName : "");
  show(clockEl, !!p);
  if (p) clockEl.setAttribute("transform", `translate(${(X(t) - TL.x0).toFixed(1)} 0)`);
  const wait = q("[data-wait]");
  const noCompute = p && !p.bars.some((b) => b.row === "compute" && b.t0 < t + 1e-9);
  text(wait, noCompute && t > 0 ? "empty: the GPU has nothing to do" : ""); wait.setAttribute("x", (X(0) + 8).toFixed(1));

  // the cost panel counts up during the 8 GB copy, from the model
  const seconds = p && s.index < 2 ? Math.min(t, p.total) : copyTime(8, LINK.board);
  const counting = s.next > 0 || p;
  text(q("[data-costs]"), counting ? `× ${sec(seconds)} of copying` : "× the copy");
  text(q("[data-lost]"), counting ? trillion(lostOps(seconds)) : "-");
  text(q("[data-about]"), counting && seconds >= copyTime(8, LINK.board) - 1e-9 ? "about 6 trillion" : "");

  const R = s.result;
  text(q("[data-total]"), p ? sec(Math.min(t, p.total)) : "-");
  text(q("[data-l1]"), R ? R.l1 : ""); text(q("[data-v1]"), R ? R.v1 : "");
  text(q("[data-l2]"), R ? R.l2 : ""); text(q("[data-v2]"), R ? R.v2 : "");
  text(q("[data-sum]"), R ? R.sum : "");
  text(chips.link, rate + " GB/s");
  text(chips.narrow, Number(narrower(rate).toFixed(2)) + " times");
  text(chips.copy, p ? sec(copyTime(p.gb, rate)) : "-");
  text(chips.compute, R && R.compute !== undefined ? sec(R.compute) : "-");
  text(chips.total, p && !s.playing ? sec(p.total) : "-");
  text(chips.share, R && R.share !== undefined ? pct(R.share) : "-");
  text(chips.rate, R && R.rate !== undefined ? Number(R.rate.toFixed(2)).toString() : "-");
  text(chips.save, R && R.save !== undefined ? R.save : "-");
  text(readout, !p ? "nothing copied yet" : `${sec(Math.min(t, p.total))} · ${computing ? "computing" : copying ? "copying at " + rate + " GB/s" : s.hopLeft > 0 ? "extra hop" : "done"}`);
  if (sayEl.innerHTML !== s.say) sayEl.innerHTML = s.say;
  buttons.forEach((button, i) => {
    const st = i === s.next ? "next" : i < s.next ? "done" : "later";
    if (button.dataset.state !== st) button.dataset.state = st;
    const on = i === s.next && !s.playing;
    if (button.disabled === on) button.disabled = !on;
    button.style.setProperty("--fill", i === s.next && s.playing && p ? String(Math.min(1, s.t / p.total)) : "0");
  });
}

// ---------- what each step concludes, all from the plan ----------
function conclude(i) {
  const p = s.plan, copy = copyTime(p.gb, p.rate);
  if (i === 0) { s.result = { l1: "VRAM would take", v1: sec(copyTime(8, LINK.vram)), l2: "the link is", v2: narrower(LINK.board) + " times narrower", sum: `8 ÷ 25 = ${sec(copy)}, and 8 ÷ 500 = ${sec(copyTime(8, LINK.vram))}` }; return `8 ÷ 25 = <b>${sec(copy)}</b>. VRAM would move it in <b>${sec(copyTime(8, LINK.vram))}</b>. In those ${sec(copy)} the GPU could have done about 6 trillion operations.`; }
  if (i === 1) { s.result = { l1: "extra hop", v1: "not counted", l2: "copy still", v2: sec(copy), sum: "The hop's cost varies by system, so the timeline does not change." }; return `Ordinary RAM goes through the <b>pinned staging buffer</b> first, an extra hop that pinned memory skips. Its cost varies by system, so it is shown but not counted.`; }
  if (i === 2) { const step = p.step; s.result = { compute: BATCH.compute, share: p.share, rate: 1 / step, l1: "a step", v1: sec(step), l2: "batches a second", v2: String(1 / step), sum: `${sec(copy)} copy + ${sec(BATCH.compute)} compute = ${sec(step)}, ${pct(p.share)} of it copying` }; return `A 2 GB batch at 20 GB/s takes <b>${sec(copy)}</b>, then ${sec(BATCH.compute)} of computing: <b>${sec(step)} a step</b>, ${pct(p.share)} of it copying, <b>${1 / step} batches a second</b>.`; }
  if (i === 3) { s.result = { compute: BATCH.compute, rate: 1 / p.step, save: pct(p.gain) + " more", l1: "a step, once running", v1: sec(p.step), l2: "batches a second", v2: String(1 / p.step), sum: `the longer of ${sec(copy)} and ${sec(BATCH.compute)} is ${sec(p.step)}` }; return `The next copy runs during this step's computing, so a step takes <span class="co-g">${sec(p.step)}</span>: <b>${1 / p.step} batches a second</b>, ${pct(p.gain)} more from the same hardware.`; }
  if (i === 4) { s.result = { compute: 3 * BATCH.compute, share: p.copying / p.total, l1: "copies", v1: "6", l2: "total", v2: sec(p.total), sum: `3 × (${copy} + ${BATCH.compute} + ${copy}) = ${sec(p.total)}` }; return `Three kernels on the same 2 GB, each copying in and out: 3 × (0.1 + 0.4 + 0.1) = <span class="co-r">${sec(p.total)}</span>, with a third of it spent copying.`; }
  const g = totalOf(p.ghost), saved = g - p.total, work = p.kernels * (p.job ? p.job.compute : BATCH.compute);
  s.result = { compute: work, share: p.copying / p.total, save: saved > 1e-9 ? sec(saved) + ", " + pct(saved / g) : "nothing", l1: "copies", v1: "2", l2: "round trips took", v2: sec(g), sum: `${Number(copy.toFixed(3))} + ${Number(work.toFixed(3))} + ${Number(copy.toFixed(3))} = ${sec(p.total)}` };
  if (i === 5) return `Copied in once, chained in VRAM and copied back once: 0.1 + 1.2 + 0.1 = <span class="co-g">${sec(p.total)}</span>, against ${sec(g)}. The computing never changed. Only the copies went.`;
  return saved > 1e-9 ? `<b>${p.job.name}</b>: ${sec(g)} with round trips, <span class="co-g">${sec(p.total)}</span> kept on the GPU.` : `<b>${p.job.name}</b>: ${sec(p.total)} either way. With one kernel there is nothing to save.`;
}
function start(i) {
  s.index = i;
  s.plan = plan(i, s.job || undefined); s.t = 0; s.result = null;
  s.hopLeft = s.plan.hop ? 1.3 : 0;
  s.playing = true;
  say(i === 0 ? "The whole 8 GB has to squeeze through the narrow pipe while the GPU waits." : i === 1 ? "The data starts in ordinary RAM, so it has to reach the pinned buffer first." : i === 2 ? "Each batch copies, then computes. Three batches in a row." : i === 3 ? "The copy for the next batch starts while this one computes." : i === 4 ? "Every kernel copies its data in and back out." : i === 5 ? "The data stays in VRAM between kernels." : "A new job, kept on the GPU, with round trips below for comparison.");
  if (still.matches) { s.t = s.plan.total; s.hopLeft = 0; finish(i); } else kick();
}
function finish(i) { s.t = s.plan.total; s.playing = false; say(conclude(i)); s.next = i >= 6 ? 6 : i + 1; draw(); }
function press(i) {
  if (i !== s.next || s.playing) return;
  if (i === 6) s.job = JOBS[s.draw++ % JOBS.length];
  start(i);
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (s.playing) {
    if (s.hopLeft > 0) s.hopLeft = Math.max(0, s.hopLeft - dt);
    else { s.t += dt / s.plan.slow; if (s.t >= s.plan.total) finish(s.index); }
  }
  // dashes run at the link's own rate: one row of dashes at 25 GB/s moves 240 units a second
  const rate = s.plan ? s.plan.rate : LINK.board;
  const going = s.plan && s.plan.bars.find((b) => b.row === "copy" && s.t >= b.t0 && s.t < b.t1);
  s.phase += ((going && going.dir === "out" ? 1 : -1) * 240 * (rate / LINK.board)) * dt;
  s.phaseV -= 240 * dt;
  flowP.style.strokeDashoffset = s.phase.toFixed(1); flowV.style.strokeDashoffset = s.phaseV.toFixed(1);
  draw();
  frame = visible && s.playing ? requestAnimationFrame(tick) : 0;
}
function kick() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } else if (!frame) draw(); }
buttons.forEach((b, i) => b.addEventListener("click", () => press(i)));
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) kick(); }, { rootMargin: "120px 0px" }).observe(box);
draw();

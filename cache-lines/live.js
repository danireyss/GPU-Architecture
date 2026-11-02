const stage = document.querySelector(".cl-stage");
const svg = stage.querySelector("svg");
const q = (s) => svg.querySelector(s);
const qa = (s) => [...svg.querySelectorAll(s)];
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]");
const sayEl = document.querySelector("[data-say]");
const status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll(".cl-step")];
const chips = Object.fromEntries([...document.querySelectorAll("[data-chip]")].map((el) => [el.dataset.chip, el]));
const lcd = Object.fromEntries(qa("[data-lcd]").map((el) => [el.dataset.lcd, el]));
const rows = Object.fromEntries([...document.querySelectorAll("[data-pass-row]")].map((el) => [el.dataset.passRow, [...el.children]]));
const rowEls = [...document.querySelectorAll("[data-pass-row]")];
const pool = (attr, count) => Array.from({ length: count }, (_, i) => q(`[${attr}="${i}"]`));
const trayParts = (el) => ({ el, cells: [...el.querySelectorAll("[data-c]")], digits: [...el.querySelectorAll("[data-d]")] });
const slotEls = pool("data-slot", 16).map(trayParts);
const flyers = qa("[data-flyer]").map((el) => ({ ...trayParts(el), busy: false }));
const ejectors = qa("[data-ejector]").map((el) => ({ ...trayParts(el), busy: false }));
const chitEls = qa("[data-chit]").map((el) => ({ el, text: el.querySelector("[data-chit-t]"), busy: false }));
const strips = qa("[data-strip]").map((el) => ({ ...trayParts(el), name: el.querySelector("[data-name]"), tag: null }));
const tagText = pool("data-tagtext", 16), tagName = pool("data-tagname", 16), cmp = pool("data-cmp", 16), oldest = pool("data-oldest", 16);
const bits = Array.from({ length: ADDR.bits }, (_, i) => q(`[data-bit="${i}"]`));
const threads = pool("data-thread", 32);
const queueLamps = pool("data-q", 4);
const addrEl = q("[data-addr]"), mapEl = q("[data-map]"), warpEl = q("[data-warp]"), bytesEl = q("[data-bytes]"), passEl = q("[data-pass]"), readEl = q("[data-read]");
const gantryLamp = q("[data-gantry]");
const tally_ = { hit: q('[data-tally="hit"]'), miss: q('[data-tally="miss"]') };
const fills = { fetched: q('[data-fill="fetched"]'), used: q('[data-fill="used"]') };
const cars = { fetched: q('[data-car="fetched"]'), used: q('[data-car="used"]') };
const reels = { l: q('[data-reel="l"]'), r: q('[data-reel="r"]') };

const SCRIPT = script();
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pct = (x) => (x === null ? "-" : (Math.round(x * 1000) / 10).toFixed(1) + "%");
const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, "0");
const shift = (x, y, z) => "translate(" + (AX.x[0] * x + AX.y[0] * y + AX.z[0] * z).toFixed(2) + " " + (AX.x[1] * x + AX.y[1] * y + AX.z[1] * z).toFixed(2) + ")";
const text = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
const flag = (el, name, on) => { if (!el) return; if (on) { if (!el.hasAttribute(name)) el.setAttribute(name, ""); } else if (el.hasAttribute(name)) el.removeAttribute(name); };
const attr = (el, name, v) => { if (!el) return; if (v === null) el.removeAttribute(name); else if (el.getAttribute(name) !== v) el.setAttribute(name, v); };
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const show = (el, on) => { const d = on ? "" : "none"; if (el.style.display !== d) el.style.display = d; };
const lineName = (tag) => { const n = nameOf(tag * CACHE.lineBytes); return n ? `${n.array}[${n.i}]` : ""; };
const cellAddress = (tag, c) => tag * CACHE.lineBytes + c * CACHE.cellBytes;

// ---------- what the page currently shows ----------
const fresh = () => ({
  slots: Array.from({ length: 16 }, () => null), // {tag, used} as landed in the rack
  next: 0, part: null, pass: null, passEvents: [], last: null, warp: null, warpLit: 0, freeSlots: 16, oldest: null,
  fetchedTags: [], readByTag: new Map(), ledger: {}, stripPos: 0, stripGoal: 0,
});
let s = fresh();
let queue = [];       // parts still to play in this step
let play = null;      // { step, part, i, wait, sched }
let tweens = [];
let timers = [];
let clock = 0, frame = 0, last = 0, visible = false, doneStep = -1;
let say = "Press <b>Read a[0]</b>. The array a is 320 numbers in a row, 4 bytes each, so 32 of them share each 128-byte line.";

const after = (delay, fn) => timers.push({ at: clock + delay, fn });
const tween = (dur, update, end) => tweens.push({ t: 0, dur, update, end });

// ---------- trays ----------
function fillTray(tray, tag, used, digits = true) {
  tray.cells.forEach((cell, c) => {
    const on = !!(used & (1 << c));
    flag(cell, "data-u", on);
    attr(cell, "data-now", null);
    if (digits && tray.digits[c]) { flag(tray.digits[c], "data-u", on); text(tray.digits[c], String(valueAt(cellAddress(tag, c))).padStart(2, "0")); }
  });
}
function paintSlot(i) {
  const line = s.slots[i];
  show(slotEls[i].el, !!line);
  if (line) fillTray(slotEls[i], line.tag, line.used);
  text(tagText[i], line ? hex(line.tag, 3) : "---");
  text(tagName[i], line ? lineName(line.tag) : "");
}
const syncRack = (cache) => { cache.slots.forEach((line, i) => { s.slots[i] = line ? { tag: line.tag, used: line.used } : null; paintSlot(i); }); };

// A tray's route from the strip, up the ramp, along the deck, into its slot.
function routeTo(row) {
  const dx = GEO.DECK_DX, R = GEO.RAMP;
  const y = GEO.rows[row];
  return [[dx, GEO.TAPE_Y, GEO.TAPE_Z], [dx, GEO.TAPE_Y, 32], [dx, R.y1 + 2, R.z1 + 3], [dx, R.y0, GEO.TZ], [dx, y, GEO.TZ], [0, y, GEO.TZ]];
}
function along(route, f) {
  const lengths = route.slice(1).map((p, i) => Math.hypot(p[0] - route[i][0], p[1] - route[i][1], p[2] - route[i][2]));
  const total = lengths.reduce((a, b) => a + b, 0);
  let d = f * total;
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] || i === lengths.length - 1) { const t = lengths[i] ? Math.min(1, d / lengths[i]) : 1; return route[i].map((v, j) => v + (route[i + 1][j] - v) * t); }
    d -= lengths[i];
  }
  return route[route.length - 1];
}
function launch(event, duration, onLand) {
  const flyer = flyers.find((f) => !f.busy);
  if (!flyer) { onLand(); return; } // the pool only runs out if timings are wrong; state stays true regardless
  flyer.busy = true;
  fillTray(flyer, event.tag, 1 << event.cell);
  attr(flyer.cells[event.cell], "data-now", "miss");
  const route = routeTo(event.slot);
  // the tray lives at y = 0 in its own group, so route points are plain offsets
  const place = (f) => { const [x, y, z] = along(route, f); flyer.el.setAttribute("transform", shift(x, y, z - GEO.TZ)); };
  place(0);
  show(flyer.el, true);
  tween(duration, (t) => place(ease(t)), () => { show(flyer.el, false); flyer.busy = false; onLand(); });
}
function eject(row, tag, used, duration) {
  const tray = ejectors.find((e) => !e.busy);
  if (!tray) return;
  tray.busy = true;
  fillTray(tray, tag, used, false);
  const y = GEO.rows[row];
  const place = (x, z, alpha) => { tray.el.setAttribute("transform", shift(x, y, z - GEO.TZ)); tray.el.style.opacity = alpha >= 1 ? "" : alpha.toFixed(2); };
  place(0, GEO.TZ, 1);
  show(tray.el, true);
  tween(duration, (t) => {
    const slide = ease(t / 0.55), drop = ease((t - 0.55) / 0.45);
    place(slide * GEO.DECK_DX, GEO.TZ - drop * (GEO.TZ - GEO.BIN_Z), 1 - ease((t - 0.7) / 0.3));
  }, () => { show(tray.el, false); tray.busy = false; });
}
function deliver(event, duration) {
  const chit = chitEls.find((c) => !c.busy);
  if (!chit) return;
  chit.busy = true;
  text(chit.text, String(event.value).padStart(2, "0"));
  const from = [GEO.X0 + (event.cell + 0.5) * GEO.CELL, GEO.rows[event.slot], GEO.TZ + 3];
  const [hx, hy, hz] = GEO.HOP;
  const route = [from, [from[0], from[1], 84], [hx, hy, 84], [hx, hy, hz]];
  const place = (f) => { const [x, y, z] = along(route, f); chit.el.setAttribute("transform", shift(x, y, z)); };
  place(0);
  show(chit.el, true);
  tween(duration, (t) => place(ease(t)), () => { show(chit.el, false); chit.busy = false; });
}

// ---------- the strip ----------
function paintStrip() {
  const pos = s.stripPos;
  const first = Math.floor(pos) - 3;
  const wanted = new Set();
  for (let tag = Math.max(0, first); tag <= first + 5; tag++) wanted.add(tag);
  strips.forEach((st, g) => {
    const tag = [...wanted].find((t) => t % 6 === g);
    if (tag === undefined) { show(st.el, false); st.tag = null; return; }
    if (st.tag !== tag || st.mask !== (s.readByTag.get(tag) || 0)) {
      st.tag = tag; st.mask = s.readByTag.get(tag) || 0;
      const named = nameOf(tag * CACHE.lineBytes);
      st.cells.forEach((cell, c) => { const on = !!(st.mask & (1 << c)); flag(cell, "data-u", on); flag(st.digits[c], "data-u", on); text(st.digits[c], named ? String(valueAt(cellAddress(tag, c))).padStart(2, "0") : "··"); });
      text(st.name, named ? `${named.array}[${named.i}]…  line ${hex(tag, 3)}` : `line ${hex(tag, 3)} · unused`);
    }
    show(st.el, true);
    st.el.setAttribute("transform", shift((tag - pos) * GEO.STEP_X, 0, 0));
  });
  const turn = pos * 0.9;
  for (const [name, el] of Object.entries(reels)) {
    const [x, y] = GEO.REEL[name];
    const a = turn * (name === "l" ? 1 : 0.7);
    el.setAttribute("d", lineOnTop([x + Math.cos(a) * 9, y + Math.sin(a) * 9], [x + Math.cos(a) * 21, y + Math.sin(a) * 21], GEO.REEL.z, P));
  }
}
const mapPath = () => s.fetchedTags.map((tag) => { const x = GEO.MAP.x0 + (tag / 512) * (GEO.MAP.x1 - GEO.MAP.x0); return lineOnTop([x, GEO.MAP.y], [x, GEO.MAP.y + GEO.MAP.d], GEO.TAPE_Z - 3.4, P); }).join("");

// ---------- playing a read ----------
function setAddress(event) {
  bits.forEach((el, i) => flag(el, "data-on", !!((event.address >> i) & 1)));
  text(addrEl, "0x" + hex(event.address, 4));
}
function compare(event) {
  cmp.forEach((el, i) => {
    const line = s.slots[i];
    attr(el, "data-on", line ? (line.tag === event.tag ? "hit" : null) : null);
  });
  if (!event.hit) cmp.forEach((el) => attr(el, "data-on", "miss"));
  attr(tally_.hit, "data-on", event.hit ? "hit" : null);
  attr(tally_.miss, "data-on", event.hit ? null : "miss");
  queueLamps.forEach((el, i) => attr(el, "data-on", i === 0 ? "lit" : null));
}
function clearLamps() {
  cmp.forEach((el) => attr(el, "data-on", null));
  attr(tally_.hit, "data-on", null); attr(tally_.miss, "data-on", null);
  attr(gantryLamp, "data-on", null);
  queueLamps.forEach((el) => attr(el, "data-on", null));
}
function fire(event, gap, fast) {
  s.last = event;
  s.passEvents.push(event);
  s.readByTag.set(event.tag, (s.readByTag.get(event.tag) || 0) | (1 << event.cell));
  setAddress(event);
  compare(event);
  s.freeSlots = event.freeSlots;
  s.oldest = event.oldest;
  if (event.hit) {
    const line = s.slots[event.slot];
    if (line) line.used = (line.used | (1 << event.cell)) >>> 0;
    const tray = slotEls[event.slot];
    flag(tray.cells[event.cell], "data-u", true); flag(tray.digits[event.cell], "data-u", true);
    attr(tray.cells[event.cell], "data-now", "hit");
    after(Math.max(0.05, gap * 0.8), () => attr(tray.cells[event.cell], "data-now", null));
    deliver(event, fast ? 0.12 : 0.55);
  } else {
    s.stripGoal = event.tag;
    s.fetchedTags.push(event.tag);
    mapEl.setAttribute("d", mapPath());
    attr(gantryLamp, "data-on", "miss");
    const flight = fast ? 0.2 : 1.0;
    const evicted = event.evicted === null ? null : s.slots[event.slot];
    if (evicted) {
      eject(event.slot, evicted.tag, evicted.used, fast ? 0.18 : 0.7);
      s.slots[event.slot] = null; paintSlot(event.slot);
    }
    launch(event, flight, () => {
      s.slots[event.slot] = { tag: event.tag, used: (1 << event.cell) >>> 0 };
      paintSlot(event.slot);
      attr(slotEls[event.slot].cells[event.cell], "data-now", "miss");
      after(0.25, () => attr(slotEls[event.slot].cells[event.cell], "data-now", null));
      deliver(event, fast ? 0.12 : 0.5);
    });
  }
  if (s.warp) { s.warpLit += 1; attr(threads[s.warpLit - 1], "data-on", event.hit ? "hit" : "miss"); }
}

// How long each read holds the stage. The first few are slow enough to follow, then it runs.
const PACE = [
  { slow: 1, hit: 0.6, miss: 1.7 },
  { slow: 3, hit: 0.075, miss: 1.7, first: 0.75 },
  { slow: 0, hit: 0.016, miss: 0.34 },
  { slow: 2, hit: 0.016, miss: 0.3, first: 0.6 },
  { slow: 8, hit: 0.016, miss: 0.03, storm: true },
  { slow: 2, hit: 0.016, miss: 0.028, storm: true },
  { slow: 1, hit: 0.06, miss: 0.2, first: 0.5, warp: 0.17 },
];
function gapOf(step, part, i, event) {
  const pace = PACE[step];
  const missFast = part === 1 ? pace.warp : pace.miss;
  const fast = event.hit ? pace.hit : missFast;
  if (i >= pace.slow) {
    const over = i - pace.slow;
    if (pace.storm) return { gap: fast + 0.5 * Math.pow(0.72, over), fast: over > 2 };
    return { gap: fast, fast: !(part === 1) };
  }
  const slowGap = event.hit ? pace.first || 0.75 : 1.8;
  return { gap: slowGap, fast: false };
}

function startPart() {
  const step = SCRIPT[s.part.step];
  const part = step.parts[s.part.index];
  if (s.pass !== part.name) { s.pass = part.name; s.passEvents = []; }
  if (s.part.step === 6) {
    s.warp = part.name;
    s.warpLit = 0;
    threads.forEach((el) => attr(el, "data-on", null));
  }
  play = { part, i: 0, wait: 0.15 };
}
function press(index) {
  if (index !== s.next || play || tweens.length || timers.length) return;
  doneStep = -1;
  if (SCRIPT[index].pass === "empty") return emptyAll();
  s.part = { step: index, index: 0 };
  if (still.matches) { instant(index); return; }
  startPart();
  kick();
}
function instant(index) {
  SCRIPT[index].parts.forEach((part, p) => {
    if (s.pass !== part.name) { s.pass = part.name; s.passEvents = []; }
    s.passEvents.push(...part.events);
    part.events.forEach((e) => { s.readByTag.set(e.tag, (s.readByTag.get(e.tag) || 0) | (1 << e.cell)); if (!e.hit) s.fetchedTags.push(e.tag); });
    const e = part.events[part.events.length - 1];
    s.last = e; s.freeSlots = e.freeSlots; s.oldest = e.oldest; s.stripGoal = s.stripPos = part.events.filter((x) => !x.hit).length ? part.events.filter((x) => !x.hit).pop().tag : s.stripGoal;
    if (index === 6) { s.warp = part.name; s.warpLit = 32; threads.forEach((el, i) => attr(el, "data-on", part.events[i].hit ? "hit" : "miss")); }
    if (p === SCRIPT[index].parts.length - 1) finishStep(index);
    else record(part);
  });
  setAddress(s.last);
  mapEl.setAttribute("d", mapPath());
  draw(); 
}
function record(part) { s.ledger[part.name] = tally(s.passEvents); }
function finishStep(index) {
  const parts = SCRIPT[index].parts;
  const final = parts[parts.length - 1];
  const drift = final.after.slots.some((line, i) => (line ? line.tag : null) !== (s.slots[i] ? s.slots[i].tag : null));
  if (drift && !still.matches) console.error("rack differs from the model after step", index);
  syncRack(final.after); // the rack must end exactly as the model says
  parts.forEach((part) => { if (part.name === s.pass) record(part); });
  clearLamps();
  s.next = index + 1;
  doneStep = index;
  s.part = null;
  say = closing(index);
  status.textContent = say.replace(/<[^>]+>/g, "");
}
function emptyAll() {
  s.part = null;
  const trays = s.slots.map((line, i) => ({ line, i })).filter((x) => x.line);
  if (!still.matches) trays.forEach(({ line, i }, n) => after(n * 0.07, () => { eject(i, line.tag, line.used, 0.5); s.slots[i] = null; paintSlot(i); }));
  const wait = still.matches ? 0 : trays.length * 0.07 + 0.5;
  say = "Every tray leaves the rack. VRAM still holds the numbers, so nothing is lost.";
  const reset = () => {
    s = fresh(); doneStep = -1;
    s.stripPos = 0;
    for (let i = 0; i < 16; i++) paintSlot(i);
    threads.forEach((el) => attr(el, "data-on", null));
    mapEl.setAttribute("d", "");
    bits.forEach((el) => flag(el, "data-on", false));
    text(addrEl, "0x----");
    clearLamps();
    say = "Empty, and every slot is free. Press <b>Read a[0]</b> to run it again.";
    status.textContent = "Cache empty.";
    draw();
  };
  if (still.matches) reset(); else { after(wait, reset); kick(); }
}

const lead = (t) => `<span class="cl-m">${t}</span>`;
function closing(index) {
  const T = (p = 0) => SCRIPT[index].parts[p].totals;
  const t = T();
  if (index === 0) return lead("Miss.") + " The rack was empty, so a whole tray came up: <b>1 line, 128 bytes</b>, for the 4 bytes that were asked for. The other 31 cells came along.";
  if (index === 1) return `<span class="cl-h">31 hits.</span> Each neighbour was already on the tray, so VRAM did nothing. <b>128 bytes fetched, 128 used.</b>`;
  if (index === 2) return `<b>${t.misses} misses, ${t.hits} hits.</b> One miss every 32 reads, and that miss pays for the next 31. ${fmt(t.fetched)} bytes fetched, ${fmt(t.used)} used: <b>${pct(t.useful)} useful</b>.`;
  if (index === 3) return `<span class="cl-h">${t.hits} hits, 0 bytes from VRAM.</span> 10 lines fit in 16 slots, so every tray was still there.`;
  if (index === 4) return `The same number of reads, but ${lead(t.misses + " misses")}: each read lands on a new line. <b>${fmt(t.fetched)} bytes</b> fetched for ${fmt(t.used)} used, <b>${pct(t.useful)} useful</b>. ${t.intoFree} lines took free slots and ${t.evictions} evicted an older line.`;
  if (index === 5) return `${lead(t.misses + " misses again.")} 320 lines take turns in 16 slots, so each line was evicted before it came round. Another ${fmt(t.fetched)} bytes.`;
  if (index === 6) { const n = T(0), c = T(1); return `One warp, 32 reads each way. Neighbours: <b>${n.lines} line, ${fmt(n.fetched)} bytes</b>. Scattered: <b>${c.lines} lines, ${fmt(c.fetched)} bytes</b>. The layout alone made it ${c.lines} times the traffic.`; }
  return "";
}
function during() {
  if (!s.part) return say;
  const e = s.last;
  if (!e) return say;
  const n = nameOf(e.address);
  const who = n ? `${n.array}[${n.i}]` : "";
  if (s.part.step === 6) return s.warp === "neighbours" ? "32 threads read 32 neighbours. The first miss brings the tray, and the other 31 threads find it there." : "32 threads read 32 scattered values. Every thread needs its own tray.";
  if (e.hit) return `<b>${who}</b>: tag ${hex(e.tag, 3)} matches slot ${e.slot}. <span class="cl-h">Hit</span>: the value comes straight off the tray.`;
  return `<b>${who}</b>: no slot holds tag ${hex(e.tag, 3)}. <span class="cl-m">Miss</span>: the whole line comes up` + (e.evicted === null ? ", into a free slot." : `, and the oldest tray (${hex(e.evicted, 3)}) slides out.`);
}

// ---------- drawing ----------
function draw() {
  paintStrip();
  const t = tally(s.passEvents);
  const has = s.passEvents.length > 0;
  text(lcd.hits, fmt(t.hits)); text(lcd.misses, fmt(t.misses));
  text(lcd["c-hits"], fmt(t.hits)); text(lcd["c-misses"], fmt(t.misses));
  text(lcd["c-rate"], has ? pct(t.hits / t.reads) : "-");
  text(lcd.free, String(s.freeSlots));
  text(lcd.evicted, fmt(t.evictions));
  text(bytesEl, fmt(t.fetched));
  text(lcd.useful, pct(t.useful));
  const e = s.last, n = e ? nameOf(e.address) : null;
  text(lcd.load, n ? `${n.array}[${n.i}] = ${String(e.value).padStart(2, "0")}` : "-");
  if (!e) text(addrEl, "0x----");
  text(readEl, n ? `${n.array}[${n.i}]` : "-");
  text(passEl, s.pass ? (PASSES.find((p) => p.key === s.pass) || {}).label || "" : "idle");
  text(warpEl, s.warp ? `${t.lines} LINE${t.lines === 1 ? "" : "S"} · ${fmt(t.fetched)} B` : "-");
  oldest.forEach((el, i) => show(el, s.oldest === i));
  // meter carriages, true to scale
  const B = GEO.BYTES, z = GEO.METER_TOP + 0.02;
  for (const [i, name] of [[0, "fetched"], [1, "used"]]) {
    const v = name === "fetched" ? t.fetched : t.used;
    const x = B.x0 + (Math.min(v, B.max) / B.max) * (B.x1 - B.x0);
    const y = GEO.METER.y + 41 + i * 22;
    fills[name].setAttribute("d", v ? onTop([[B.x0, y], [x, y], [x, y + 7], [B.x0, y + 7]], z, P, true) : "");
    cars[name].setAttribute("transform", shift(x - B.x0, 0, 0));
  }
  text(chips.reads, fmt(t.reads)); text(chips.hits, fmt(t.hits)); text(chips.misses, fmt(t.misses));
  text(chips.fetched, fmt(t.fetched) + " B"); text(chips.used, fmt(t.used) + " B"); text(chips.useful, pct(t.useful));
  text(chips.free, fmt(t.intoFree)); text(chips.evict, fmt(t.evictions)); text(chips.lines, fmt(t.lines));
  for (const p of PASSES) {
    const got = s.pass === p.key && has ? t : s.ledger[p.key];
    const cells = rows[p.key];
    const values = got ? [fmt(got.reads), fmt(got.hits), fmt(got.misses), fmt(got.fetched) + " B", fmt(got.used) + " B", pct(got.useful), fmt(got.intoFree), fmt(got.evictions), fmt(got.lines)] : Array(9).fill("·");
    values.forEach((v, i) => text(cells[i + 1], v));
  }
  rowEls.forEach((row) => flag(row, "data-on", row.dataset.passRow === s.pass));
  const sentence = during();
  if (sayEl.innerHTML !== sentence) sayEl.innerHTML = sentence;
  text(readout, !has ? (s.slots.some(Boolean) ? "idle" : "cache empty") : `${fmt(t.hits)} hit${t.hits === 1 ? "" : "s"} · ${fmt(t.misses)} miss${t.misses === 1 ? "" : "es"} · ${fmt(t.fetched)} B from VRAM`);
  const busy = !!(play || tweens.length || timers.length);
  buttons.forEach((button, i) => {
    const st = i < s.next ? "done" : i === s.next ? "next" : "later";
    if (button.dataset.state !== st) button.dataset.state = st;
    const enabled = i === s.next && !busy;
    if (button.disabled === enabled) button.disabled = !enabled;
    const part = play && s.part && s.part.step === i;
    button.style.setProperty("--fill", part ? String((play.i + 1) / play.part.events.length) : "0");
  });
}

function advance(dt) {
  clock += dt;
  const due = timers.filter((x) => x.at <= clock);
  timers = timers.filter((x) => x.at > clock);
  due.forEach((x) => x.fn());
  for (const tw of [...tweens]) {
    tw.t += dt;
    const f = Math.min(1, tw.t / tw.dur);
    tw.update(f);
    if (f >= 1) { tweens.splice(tweens.indexOf(tw), 1); tw.end && tw.end(); }
  }
  const k = 1 - Math.exp(-dt / (play && play.i > 10 ? 0.03 : 0.16));
  s.stripPos += (s.stripGoal - s.stripPos) * k;
  if (Math.abs(s.stripGoal - s.stripPos) < 0.002) s.stripPos = s.stripGoal;
  if (play) {
    play.wait -= dt;
    while (play && play.wait <= 0) {
      if (play.i >= play.part.events.length) {
        if (tweens.length) { play.wait = 0.02; break; }
        const step = SCRIPT[s.part.step];
        if (s.part.index + 1 < step.parts.length) { record(play.part); s.part.index += 1; play = null; timers.push({ at: clock + 1.1, fn: startPart }); }
        else { const index = s.part.step; play = null; finishStep(index); }
        break;
      }
      const event = play.part.events[play.i];
      const { gap, fast } = gapOf(s.part.step, s.part.index, play.i, event);
      fire(event, gap, fast);
      if (gap > 0.1) after(gap * 0.7, () => { cmp.forEach((el) => attr(el, "data-on", null)); attr(tally_.hit, "data-on", null); attr(tally_.miss, "data-on", null); });
      play.i += 1;
      play.wait += gap;
    }
  }
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  advance(dt);
  draw();
  const moving = play || tweens.length || timers.length || s.stripPos !== s.stripGoal;
  frame = visible && moving ? requestAnimationFrame(tick) : 0;
  if (!moving) { last = 0; }
}
function kick() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } }

buttons.forEach((button, i) => button.addEventListener("click", () => press(i)));
const toggle = document.querySelector("[data-labels]");
const setLabels = (on) => { toggle.setAttribute("aria-pressed", String(on)); toggle.textContent = "Labels: " + (on ? "on" : "off"); stage.dataset.labels = on ? "on" : "off"; };
toggle.addEventListener("click", () => setLabels(toggle.getAttribute("aria-pressed") !== "true"));
if (matchMedia("(max-width: 820px)").matches) setLabels(false);
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) kick(); }, { rootMargin: "120px 0px" }).observe(stage);
for (let i = 0; i < 16; i++) paintSlot(i);
draw();

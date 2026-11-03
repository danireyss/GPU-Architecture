const box = document.querySelector(".of-stage-box");
const svg = box.querySelector("svg");
const q = (s) => svg.querySelector(s);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]"), sayEl = document.querySelector("[data-say]"), status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll(".of-step")];
const chips = Object.fromEntries([...document.querySelectorAll("[data-chip]")].map((el) => [el.dataset.chip, el]));
const stages = [...svg.querySelectorAll("[data-from]")];
const paths = Object.fromEntries([...svg.querySelectorAll("[data-path]")].map((el) => [el.dataset.path, el]));
const fills = Object.fromEntries([...svg.querySelectorAll("[data-arr]")].map((el) => [el.dataset.arr, el]));
const fillT = Object.fromEntries([...svg.querySelectorAll("[data-arrt]")].map((el) => [el.dataset.arrt, el]));
const set = (name, v) => { const el = q(`[data-${name}]`); if (el && el.textContent !== v) el.textContent = v; };
const text = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
const fmt = (n) => n.toLocaleString("en-US");
const ms = (sec) => Number((sec * 1e3).toPrecision(3)).toString() + " ms";
const mb = (bytes) => (bytes >= 1e6 ? Number((bytes / 1e6).toPrecision(3)) + " MB" : Number((bytes / 1e3).toPrecision(3)) + " KB");
const pct = (x) => (x === 0 ? "0%" : (x * 100 >= 1 ? (x * 100).toFixed(1) : (x * 100).toFixed(2)) + "%");
const wait = (m) => (still.matches ? Promise.resolve() : new Promise((done) => setTimeout(done, m)));
const tween = (dur, update) => new Promise((done) => {
  if (still.matches) { update(1); done(); return; }
  const start = performance.now();
  const step = (now) => { const f = Math.min(1, (now - start) / dur); update(f); if (f < 1) requestAnimationFrame(step); else done(); };
  requestAnimationFrame(step);
});
const ease = (x) => x * x * (3 - 2 * x);

const s = { next: 0, busy: false, stage: -1, L: launch(FIRST), wave: -1, started: 0, finished: 0, run: 0, mem: { ramAB: 0, vramAB: 0, vramC: 0, ramC: 0 }, draw: 0, thread: null, blockIndex: 2, compare: null, say: "Press <b>Write the kernel</b>. It describes what one thread does to one element." };
const say = (html) => { s.say = html; status.textContent = html.replace(/<[^>]+>/g, ""); };

// ---------- the grid, one square for each block ----------
function layoutGrid(blocks) {
  const cols = Math.ceil(Math.sqrt(blocks)), p = Math.min(16, GEO.FIELD.w / cols);
  return { cols, p, size: Math.max(0.9, p * 0.78), at: (i) => [GEO.FIELD.x + (i % cols) * p, GEO.FIELD.y + Math.floor(i / cols) * p] };
}
let G = layoutGrid(s.L.blocks);
function drawGrid() {
  if (s.stage < 2) { paths.wait.setAttribute("d", ""); paths.run.setAttribute("d", ""); paths.done.setAttribute("d", ""); return; }
  const L = s.L, sz = G.size.toFixed(2), part = { wait: [], run: [], done: [] };
  for (let i = 0; i < s.shownBlocks; i++) {
    const [x, y] = G.at(i), key = i >= s.started ? "wait" : i >= s.finished ? "run" : "done";
    part[key].push(`M${x.toFixed(1)} ${y.toFixed(1)}h${sz}v${sz}h-${sz}z`);
  }
  for (const key of ["wait", "run", "done"]) paths[key].setAttribute("d", part[key].join(""));
}
function slotPos(L, j) { const { sm, slot } = slotOf(L, j), S = GEO.SMS; return [S.x + (sm % 8) * S.pitch + 1 + (slot % 8 % 4) * S.cell, S.y + Math.floor(sm / 8) * S.pitch + 1 + Math.floor(slot / 4) * 9]; }
function slotsPath(L, count) {
  const S = GEO.SMS, w = (S.cell - 0.8).toFixed(1), out = [];
  for (let j = 0; j < count; j++) { const [x, y] = slotPos(L, j); out.push(`M${x.toFixed(1)} ${y}h${w}v8h-${w}z`); }
  return out.join("");
}
function ticks() {
  const el = q("[data-ticks]");
  if (s.stage < 2 || s.shownBlocks < 3) { el.setAttribute("d", ""); [0, 1, 2, 3].forEach((i) => text(q(`[data-bl="${i}"]`), "")); return; }
  const d = [];
  [0, 1, 2].forEach((i) => { const [x, y] = G.at(i); d.push(`M${GEO.FIELD.x + i * 24 + 6} 64L${(x + G.size / 2).toFixed(1)} ${y}`); text(q(`[data-bl="${i}"]`), "B" + i); });
  text(q('[data-bl="3"]'), "…");
  el.setAttribute("d", d.join(""));
}
// ---------- the opened block ----------
function drawBlock() {
  const L = s.L, O = GEO.OPEN, c = O.cell, w = (c - 0.8).toFixed(1), blue = [], idle = [], lit = [];
  if (s.stage >= 4) {
    for (let warp = 0; warp < L.warpsPerBlock; warp++) for (let lane = 0; lane < WARP; lane++) {
      const t = warp * WARP + lane, x = (O.x + lane * c).toFixed(1), y = O.y + warp * O.pitch, cell = `M${x} ${y}h${w}v10h-${w}z`;
      if (t >= L.block) idle.push(cell); else if (s.thread !== null && t <= s.lit) lit.push(cell); else blue.push(cell);
    }
  }
  paths.warp.setAttribute("d", blue.join("")); paths.idle.setAttribute("d", idle.join("")); paths.lit.setAttribute("d", lit.join(""));
  const cursor = q("[data-cursor]");
  if (s.thread !== null && s.stage >= 4) { const x = O.x + (s.thread % WARP) * c - 1, y = O.y + Math.floor(s.thread / WARP) * O.pitch - 1; cursor.setAttribute("d", `M${x.toFixed(1)} ${y}h${(c + 1.2).toFixed(1)}v12h-${(c + 1.2).toFixed(1)}z`); } else cursor.setAttribute("d", "");
}
function draw() {
  const L = s.L;
  stages.forEach((el) => { if (s.stage >= Number(el.dataset.from)) el.setAttribute("data-seen", ""); else el.removeAttribute("data-seen"); });
  // memory
  const m = s.mem, row = { "ram-a": m.ramAB, "ram-b": m.ramAB, "ram-c": m.ramC, "vram-a": m.vramAB, "vram-b": m.vramAB, "vram-c": m.vramC };
  const each = L.bytesBack;
  for (const key in row) { fills[key].setAttribute("width", (76 * row[key]).toFixed(1)); text(fillT[key], row[key] > 0.001 ? mb(each * row[key]) : ""); }
  set("m1", s.stage >= 1 ? `a, b in: ${mb(L.bytesIn)}` : ""); set("m2", s.stage >= 1 ? ms(L.copyIn) : ""); set("m3", s.stage >= 5 ? `c back: ${mb(L.bytesBack)}` : ""); set("m4", s.stage >= 5 ? ms(L.copyBack) : "");
  // grid and SMs
  set("g1", s.stage >= 2 ? fmt(L.blocks) : ""); set("g2", s.stage >= 2 ? fmt(L.threads) : ""); set("g3", s.stage >= 2 ? fmt(L.off) : "");
  set("g4", s.stage >= 2 ? `${fmt(L.n)} ÷ ${L.block}, rounded up` : ""); set("g5", s.stage >= 2 && L.off ? `last block: ${L.block - L.off} threads work` : "");
  set("g6", s.stage >= 2 ? fmt(s.shownBlocks - s.started) : "");
  set("s1", s.stage >= 3 ? fmt(L.atOnce) : ""); set("s2", s.stage >= 3 ? `${L.sms} SMs × ${L.perSM} blocks` : "");
  set("s3", s.stage >= 3 ? (s.wave >= 0 ? `${s.wave + 1} of ${L.waves}` : "-") : ""); set("s4", s.stage >= 3 ? fmt(s.run) : "");
  set("s5", s.stage >= 3 ? `${Math.max(0, L.waves - 1)} full wave${L.waves === 2 ? "" : "s"}` : ""); set("s6", s.stage >= 3 ? `and a last wave of ${fmt(L.lastWave)}` : "");
  // the opened block and one thread's sum
  const t = s.thread, i = t === null ? null : elementOf(s.blockIndex, t, L.block);
  set("o0", s.stage >= 4 ? `B${s.blockIndex}: ${L.warpsPerBlock} warps of 32` : "");
  set("o1", t !== null ? `thread ${t} of block ${s.blockIndex}` : ""); set("o2", t !== null ? `warp ${Math.floor(t / WARP)}, lane ${t % WARP}` : "");
  q('[data-e="a"]').textContent = t !== null ? `a[${fmt(i)}] = ${fmt(i)}` : ""; q('[data-e="b"]').textContent = t !== null ? `b[${fmt(i)}] = ${fmt(2 * i)}` : ""; q('[data-e="c"]').textContent = t !== null ? `c[${fmt(i)}] = ${fmt(3 * i)}` : "";
  set("o3", s.stage >= 4 ? fmt(L.warps) : ""); set("o4", s.stage >= 4 ? `${fmt(L.blocks)} × ${L.warpsPerBlock}` : ""); set("o5", s.stage >= 4 ? (L.lanesIdlePerBlock ? `last warp: ${L.lastWarp}, with ${L.lanesIdlePerBlock} idle` : "every warp is full") : "");
  const rows = s.compare || [{ name: `blocks of ${L.block}`, idle: L.idle }];
  [0, 1].forEach((n) => { const row = rows[n]; text(q(`[data-il="${n}"]`), s.stage >= 4 && row ? `${row.name}: ${pct(row.idle)}` : ""); q(`[data-ib="${n}"]`).setAttribute("width", s.stage >= 4 && row ? (150 * row.idle).toFixed(1) : 0); });
  set("w1", t !== null ? `block ${s.blockIndex}, thread ${t}` : "");
  set("w2", t !== null ? `i = ${s.blockIndex} × ${L.block} + ${t}` : ""); set("w3", t !== null ? `i = ${fmt(i)}` : ""); set("w4", t !== null ? (i < L.n ? "i < n, so this thread works" : "i ≥ n, so the if switches it off") : "");
  drawBlock();
  const shown = s.stage >= 2;
  text(chips.n, s.stage >= 0 ? fmt(L.n) : "-"); text(chips.block, s.stage >= 0 ? String(L.block) : "-");
  text(chips.blocks, shown ? fmt(L.blocks) : "-"); text(chips.threads, shown ? fmt(L.threads) : "-"); text(chips.off, shown ? fmt(L.off) : "-");
  text(chips.warps, s.stage >= 4 ? `${L.warpsPerBlock} a block · ${fmt(L.warps)}` : "-"); text(chips.waves, s.stage >= 3 ? String(L.waves) : "-"); text(chips.last, s.stage >= 3 ? fmt(L.lastWave) : "-");
  text(chips.in, s.stage >= 1 ? ms(L.copyIn) : "-"); text(chips.back, s.stage >= 5 ? ms(L.copyBack) : "-"); text(chips.idle, s.stage >= 4 ? pct(L.idle) : "-");
  text(readout, s.stage < 0 ? "nothing written yet" : s.stage < 2 ? "one function" : s.stage === 3 && s.wave >= 0 && s.busy ? `wave ${s.wave + 1} of ${L.waves} · ${fmt(s.shownBlocks - s.started)} waiting` : `${fmt(L.blocks)} blocks · ${fmt(L.threads)} threads`);
  if (sayEl.innerHTML !== s.say) sayEl.innerHTML = s.say;
  buttons.forEach((button, i) => {
    const st = i === s.next ? "next" : i < s.next ? "done" : "later";
    if (button.dataset.state !== st) button.dataset.state = st;
    const on = i === s.next && !s.busy;
    if (button.disabled === on) button.disabled = !on;
  });
}

// ---------- the steps ----------
async function runWaves(first, fast) {
  const L = s.L;
  s.started = 0; s.finished = 0;
  for (let w = 0; w < L.waves; w++) {
    const { first: start, count } = waveOf(L, w);
    s.wave = w; s.run = count;
    const slow = fast ? 0 : w === 0 || w === L.waves - 1 ? 1 : 0.45;
    // the blocks of this wave cross to their slots
    const from = Array.from({ length: count }, (_, j) => G.at(start + j)), to = Array.from({ length: count }, (_, j) => slotPos(L, j));
    s.started = start + count; drawGrid();
    if (w === L.waves - 1 && !fast) say(`The last wave: <b>${fmt(count)} blocks</b>, and the other slots stay free.`);
    draw();
    await tween(fast ? 120 : 650 * Math.max(slow, 0.5), (f) => { const e = ease(f); paths.fly.setAttribute("d", from.map(([x, y], j) => `M${(x + (to[j][0] - x) * e).toFixed(1)} ${(y + (to[j][1] - y) * e).toFixed(1)}h3v3h-3z`).join("")); });
    paths.fly.setAttribute("d", ""); paths.slots.setAttribute("d", slotsPath(L, count));
    await wait(fast ? 90 : 520 * Math.max(slow, 0.5));
    s.finished = start + count; drawGrid();
    s.mem.vramC = s.finished / L.blocks;
    paths.slots.setAttribute("d", ""); draw();
  }
  s.run = 0;
}
async function copy(field, other, dur) {
  await tween(dur, (f) => { s.mem[field] = f; if (other) s.mem[other] = other === "ramC" ? f : s.mem[other]; const pkt = q("[data-pkt]"); pkt.style.display = f < 1 ? "" : "none"; const y = field === "vramAB" ? 204 + f * 58 : 262 - f * 58; pkt.setAttribute("y", y.toFixed(1)); draw(); });
  q("[data-pkt]").style.display = "none";
}
function setLaunch(config) {
  s.L = launch(config); G = layoutGrid(s.L.blocks); s.shownBlocks = s.L.blocks; s.started = 0; s.finished = 0; s.wave = -1; s.run = 0; s.thread = null; s.compare = null;
  s.blockIndex = Math.min(2, s.L.blocks - 1);
}
async function act(i) {
  const L0 = s.L;
  if (i === 0) { s.stage = 0; s.mem.ramAB = 1; say("One function, for one element. It works out <b>i</b> from the thread's position, and adds a[i] and b[i]."); draw(); return; }
  if (i === 1) { s.stage = 1; say(`a and b are 4 MB each: <b>8 MB at 25 GB/s = ${ms(L0.copyIn)}</b>.`); draw(); await copy("vramAB", null, 1600); return; }
  if (i === 2) {
    s.stage = 2; s.shownBlocks = 0; draw();
    await tween(1100, (f) => { s.shownBlocks = Math.round(L0.blocks * f); drawGrid(); ticks(); draw(); });
    s.shownBlocks = L0.blocks; drawGrid(); ticks();
    say(`1,000,000 ÷ 256, rounded up, is <b>${fmt(L0.blocks)} blocks</b>, so <b>${fmt(L0.threads)} threads</b>. The ${L0.off} extra threads are switched off by the if.`); return;
  }
  if (i === 3) {
    s.stage = 3; say(`${L0.sms} SMs holding ${L0.perSM} blocks each run <b>${L0.atOnce} blocks at once</b>. The rest wait their turn.`); draw();
    await runWaves();
    say(`<b>${L0.waves - 1} full waves and a last wave of ${L0.lastWave}.</b> ${fmt(L0.blocks)} blocks in all.`); return;
  }
  if (i === 4) {
    s.stage = 4; s.lit = -1; s.thread = 0; draw();
    for (let t = 0; t <= 5; t++) { s.thread = t; s.lit = t; say(`Thread ${t} of block 2: i = 2 × 256 + ${t} = <b>${elementOf(2, t, L0.block)}</b>.`); draw(); await wait(520); }
    await tween(1100, (f) => { s.lit = Math.round(5 + (L0.block - 6) * f); s.thread = s.lit; draw(); });
    s.thread = 5; s.lit = L0.block - 1;
    say(`Each block is <b>${L0.warpsPerBlock} warps</b> of 32, <b>${fmt(L0.warps)} warps</b> in all. <b>Thread 5 of block 2 handles element ${elementOf(2, 5, L0.block)}.</b>`); return;
  }
  if (i === 5) { s.stage = 5; say(`c is 4 MB: <b>${ms(L0.copyBack)}</b> back over the same link.`); draw(); await copy("ramC", null, 800); say(`c is back in RAM after ${ms(L0.copyBack)}. One function ran ${fmt(L0.n)} times.`); return; }
  if (i === 6) {
    const big = L0;
    setLaunch(SMALL); s.compare = [{ name: "blocks of 256", idle: big.idle }, { name: "blocks of 100", idle: s.L.idle }]; drawGrid(); ticks(); draw();
    const L = s.L;
    await runWaves(0, true);
    s.thread = L.block - 1; s.lit = L.block - 1; s.blockIndex = 2;
    say(`<b>${fmt(L.blocks)} blocks of ${L.warpsPerBlock} warps.</b> The 4th warp holds ${L.lastWarp} threads and leaves ${L.lanesIdlePerBlock} lanes idle: ${fmt(L.warps)} warps, <b>${pct(L.idle)} of lanes idle</b> against ${pct(big.idle)}.`); return;
  }
  const config = NEW_LAUNCHES[s.draw++ % NEW_LAUNCHES.length];
  const was = s.L;
  setLaunch(config); s.compare = null; s.mem.vramC = 0; s.mem.ramC = 0; drawGrid(); ticks(); draw();
  await runWaves(0, true);
  s.mem.ramC = 1; s.thread = Math.min(5, s.L.block - 1); s.lit = s.L.block - 1;
  say(`<b>${fmt(s.L.n)} elements in blocks of ${s.L.block}:</b> ${fmt(s.L.blocks)} blocks, ${fmt(s.L.warps)} warps, ${s.L.waves} wave${s.L.waves === 1 ? "" : "s"}, ${pct(s.L.idle)} of lanes idle.`);
}
s.shownBlocks = s.L.blocks;
buttons.forEach((b, i) => b.addEventListener("click", async () => {
  if (i !== s.next || s.busy) return;
  s.busy = true; draw();
  await act(i);
  s.busy = false; s.next = i >= 7 ? 7 : i + 1; drawGrid(); draw();
}));
draw();

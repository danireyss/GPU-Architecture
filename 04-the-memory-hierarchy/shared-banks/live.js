const box = document.querySelector(".sb-stage");
const svg = box.querySelector("svg");
const q = (s) => svg.querySelector(s);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]"), sayEl = document.querySelector("[data-say]"), status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll(".sb-step")];
const chips = Object.fromEntries([...document.querySelectorAll("[data-chip]")].map((el) => [el.dataset.chip, el]));
const rowEls = Object.fromEntries([...document.querySelectorAll("[data-row]")].map((el) => [el.dataset.row, el]));
const list = (name, n) => Array.from({ length: n }, (_, i) => q(`[${name}="${i}"]`));
const words = list("data-w", 1056), wordN = list("data-wn", 1056), lines = list("data-l", 32), tokens = list("data-tk", 32), threadEls = list("data-th", 32), countT = list("data-c", 32), countB = list("data-cb", 32);
const texels = Object.fromEntries([...svg.querySelectorAll("[data-t]")].map((el) => [el.dataset.t, el]));
const many = q("[data-many]");
const fmt = (n) => n.toLocaleString("en-US");
const text = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
const flag = (el, n, on) => { if (on) { if (!el.hasAttribute(n)) el.setAttribute(n, ""); } else if (el.hasAttribute(n)) el.removeAttribute(n); };
const attr = (el, n, v) => { if (v === null) { if (el.hasAttribute(n)) el.removeAttribute(n); } else if (el.getAttribute(n) !== String(v)) el.setAttribute(n, String(v)); };
const show = (el, on) => { el.style.display = on ? "" : "none"; };
const wait = (ms) => (still.matches ? Promise.resolve() : new Promise((done) => setTimeout(done, ms)));

const s = { next: 0, busy: false, wide: 32, seed: 0, loaded: 0, cycle: 0, read: null, step: null, depth: new Array(32).fill(null), say: "Press <b>Load a 32 × 32 tile</b>. Its words are dealt across the banks, one bank per word." };
const say = (html) => { s.say = html; status.textContent = html.replace(/<[^>]+>/g, ""); };

// ---------- cells ----------
function setWord(w) {
  const p = place(w, s.wide);
  flag(words[w], "data-full", !p.pad); flag(words[w], "data-pad", p.pad);
  text(wordN[w], p.pad ? "" : String(w));
  const tex = texels[p.row + "." + p.col];
  if (tex) { flag(tex, "data-pad", p.pad); attr(tex, "data-tone", p.pad ? null : toneAt(s.seed, p.row, p.col)); }
}
function clearCells() {
  words.forEach((el, w) => { flag(el, "data-full", false); flag(el, "data-pad", false); attr(el, "data-on", null); text(wordN[w], ""); flag(wordN[w], "data-dark", false); });
  for (const key in texels) { flag(texels[key], "data-pad", false); attr(texels[key], "data-tone", null); attr(texels[key], "data-on", null); }
}
function mark(w, state) {
  attr(words[w], "data-on", state); flag(wordN[w], "data-dark", !!state);
  const p = place(w, s.wide); attr(texels[p.row + "." + p.col], "data-on", state);
}
function clearRead() {
  words.forEach((el, w) => { attr(el, "data-on", null); flag(wordN[w], "data-dark", false); });
  for (const key in texels) attr(texels[key], "data-on", null);
  lines.forEach((el) => { flag(el, "data-drawn", false); flag(el, "data-go", false); el.setAttribute("d", ""); });
  tokens.forEach((el) => show(el, false));
  threadEls.forEach((el) => attr(el, "data-on", null));
  countB.forEach((el) => attr(el, "data-on", null));
  s.depth = new Array(32).fill(null); s.cycle = 0; text(many, "");
}
async function deal(wide) {
  const L = layout(wide);
  const slow = wide === 32 && s.loaded === 0 ? [0, 1, 32] : [];
  for (let w = 0; w < L.words;) {
    if (slow.includes(w)) {
      setWord(w); s.loaded = w + 1; mark(w, "go"); say(`Word ${w}: ${w} mod 32 = <b>bank ${bankOf(w)}</b>.` + (w === 32 ? " Back to bank 0, one row down." : "")); draw();
      await wait(650); mark(w, null); w++; continue;
    }
    const stop = Math.min(L.words, ...slow.filter((x) => x > w), w + Math.ceil(L.words / 60));
    for (; w < stop; w++) setWord(w);
    s.loaded = w; draw();
    await wait(16);
  }
}
async function load(step) {
  s.busy = true; s.wide = 32; s.seed = step.seed; s.loaded = 0; s.read = null; s.step = null;
  clearRead(); clearCells();
  Object.values(rowEls).forEach((row) => [...row.children].slice(2).forEach((td) => { td.textContent = "·"; }));
  say("The tile comes in: 32 × 32 = <b>1,024 words</b>, <b>4 KB</b>."); draw();
  await wait(500);
  await deal(32);
  s.busy = false; s.next = 1;
  say("Word 0 is in bank 0, word 1 in bank 1, and word 32 back in bank 0. <b>A row of the tile crosses all 32 banks. A column sits in one bank.</b>");
  draw();
}

// ---------- a warp read ----------
function lineFor(thread, word) {
  const G = GEO, b = bankOf(word), x = G.x0 + b * G.pitch + G.cell / 2, y = G.top + 4 + Math.floor(word / 32) * G.rowH + 4;
  return `M${G.x0 + thread * G.pitch + G.cell / 2} ${G.thY + G.thH}L${x} ${G.cntY - 12}V${y}`;
}
const tokenAt = (el, bank, pos) => { el.setAttribute("x", GEO.x0 + bank * GEO.pitch + 2.5); el.setAttribute("y", GEO.queueBase - GEO.tokenH); el.style.transform = `translateY(${(-pos * GEO.tokenH).toFixed(1)}px)`; };
function passes(R, c) { // serve cycle c
  R.schedule[c].forEach((entry) => {
    s.depth[entry.bank] -= 1;
    attr(countB[entry.bank], "data-on", s.depth[entry.bank] ? "wait" : "go");
    mark(entry.word, "go");
    entry.threads.forEach((thread) => { flag(lines[thread], "data-go", true); attr(threadEls[thread], "data-on", "go"); });
    show(tokens[entry.threads[0]], false);
    R.banks[entry.bank].forEach((later, pos) => { if (pos > c) tokenAt(tokens[later.threads[0]], entry.bank, pos - c - 1); });
  });
  if (R.distinct === 1) text(many, "");
  s.cycle = c + 1;
}
async function read(index) {
  const step = STEPS[index], R = step.read;
  s.busy = true; s.step = index; s.read = R;
  clearRead();
  if (step.wide !== s.wide) {
    say("Each row grows by one unused word, so every row starts one bank later than the row above."); 
    s.wide = step.wide; clearCells(); draw();
    await wait(300); await deal(33); await wait(400);
  }
  R.words.forEach((word, thread) => {
    lines[thread].setAttribute("d", lineFor(thread, word));
    attr(threadEls[thread], "data-on", "wait"); mark(word, "wait");
  });
  svg.getBoundingClientRect(); // so the lines animate from zero length
  lines.forEach((el) => flag(el, "data-drawn", true));
  say(`Thread t reads <b>${step.words}</b>. A line runs from each thread to the word it wants.`); draw();
  await wait(750);
  R.banks.forEach((queue, bank) => {
    if (!queue.length) return;
    s.depth[bank] = queue.length;
    attr(countB[bank], "data-on", queue.length > 1 ? "wait" : "go");
    queue.forEach((entry, pos) => { const el = tokens[entry.threads[0]]; show(el, true); tokenAt(el, bank, pos); });
  });
  if (R.distinct === 1) { const b = bankOf(R.words[0]); many.setAttribute("x", GEO.x0 + b * GEO.pitch + GEO.cell + 4); many.setAttribute("y", GEO.queueBase - 26); text(many, "one word, 32 threads"); }
  draw();
  await wait(650);
  const period = R.cycles > 8 ? 380 : 800;
  for (let c = 0; c < R.cycles; c++) { passes(R, c); say(R.cycles === 1 ? (R.distinct === 1 ? "One word leaves its bank once and is broadcast to all 32 threads." : `All ${R.banksUsed} banks are served together.`) : `Cycle ${c + 1}: ${R.schedule[c].length} bank${R.schedule[c].length === 1 ? "" : "s"} serve${R.schedule[c].length === 1 ? "s" : ""} one word, and the rest wait.`); draw(); await wait(period); }
  const cells = rowEls[step.name].children;
  [String(R.banksUsed), String(R.mostThreads), String(Math.max(...R.depth)), step.rule === null ? "32, rule does not apply" : String(step.rule), String(R.cycles)].forEach((v, i) => text(cells[i + 2], v));
  s.busy = false; s.next = index + 1;
  say(closing(index)); draw();
}
function closing(index) {
  const R = STEPS[index].read, P33 = layout(33);
  if (index === 1) return `<span class="sb-g">${R.banksUsed} banks, ${R.cycles} cycle.</span> Thread t reads word t, so every thread has its own bank.`;
  if (index === 2) return `<b>${R.banksUsed} banks with ${R.mostThreads} threads each: ${R.cycles} cycles.</b> Even words only, so half the banks get two threads and half get none.`;
  if (index === 3) return `<span class="sb-g">32 different banks, ${R.cycles} cycle.</span> 3 and 32 share no factor, so stride 3 still reaches every bank once.`;
  if (index === 4) return `<span class="sb-r">All 32 threads in bank 0: ${R.cycles} cycles.</span> A column of a 32-wide tile is one bank, which is what a matrix transpose runs into.`;
  if (index === 5) return `<span class="sb-g">Thread t lands in bank t: ${R.cycles} cycle.</span> The padding costs ${P33.padWords} words (${P33.padBytes} bytes, ${(P33.padShare * 100).toFixed(1)}% of the tile). It is the grey column on the tile, and a grey diagonal across the banks.`;
  if (index === 6) return `<span class="sb-g">All 32 threads, one word, ${R.cycles} cycle.</span> It is fetched once and broadcast. Identical words count once, so this is the one case where gcd(stride, 32) does not apply.`;
  return "";
}
function draw() {
  const R = s.read, step = s.step === null ? null : STEPS[s.step], L = layout(s.wide);
  countT.forEach((el, b) => text(el, s.depth[b] === null ? "" : String(s.depth[b])));
  const rule = !step ? "-" : step.rule === null ? "stride 0: not this rule" : `gcd(${step.stride}, 32) = ${step.rule}`;
  text(q("[data-cycle]"), String(s.cycle));
  text(q("[data-banks]"), R ? String(R.banksUsed) : "-");
  text(q("[data-most]"), R ? String(R.mostThreads) + (R.distinct === 1 ? ", 1 word" : "") : "-");
  text(q("[data-rule]"), rule);
  text(q("[data-reads]"), step ? "thread t reads " + step.words : "");
  text(q("[data-tilesize]"), s.loaded ? `${L.wide} × ${L.rows}` : "");
  text(q("[data-tilenote]"), !s.loaded ? "" : s.wide === 33 ? `${fmt(L.words)} words · grey column: padding` : `${fmt(L.data)} words · ${L.dataBytes / 1024} KB`);
  text(chips.cycles, R ? String(s.cycle) + " of " + R.cycles : "-");
  text(chips.banks, R ? String(R.banksUsed) : "-");
  text(chips.most, R ? R.mostThreads + (R.distinct === 1 ? " threads, 1 word" : R.mostThreads === 1 ? " thread" : " threads") : "-");
  text(chips.rule, rule);
  text(chips.tile, s.loaded ? `${L.wide} × ${L.rows} · ${fmt(L.words)} words · ${(L.bytes / 1024).toFixed(L.bytes % 1024 ? 2 : 0)} KB` : "-");
  text(chips.pad, s.wide === 33 ? `${L.padWords} words · ${L.padBytes} B · ${(L.padShare * 100).toFixed(1)}%` : "none");
  text(readout, !s.loaded ? "shared memory empty" : R && step ? `${step.name} · ${R.banksUsed} bank${R.banksUsed === 1 ? "" : "s"} · cycle ${s.cycle} of ${R.cycles}` : `${fmt(s.loaded)} of ${fmt(L.words)} words loaded`);
  for (const [name, row] of Object.entries(rowEls)) flag(row, "data-on", !!(step && step.name === name));
  if (sayEl.innerHTML !== s.say) sayEl.innerHTML = s.say;
  buttons.forEach((button, i) => {
    const st = i === s.next ? "next" : i < s.next ? "done" : "later";
    if (button.dataset.state !== st) button.dataset.state = st;
    const on = i === s.next && !s.busy;
    if (button.disabled === on) button.disabled = !on;
    button.style.setProperty("--fill", i === s.next && s.busy && R ? String(s.cycle / R.cycles) : "0");
  });
}
buttons.forEach((b, i) => b.addEventListener("click", () => {
  if (i !== s.next || s.busy) return;
  const step = STEPS[i];
  if (step.kind === "load") load(step); else read(i);
}));
draw();

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/danielreyes/.claude/skills/anatomy/kit/iso-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 1000, H = 668;
// A flat board. x0 and pitch place the 32 banks; every bank is one column.
const G = { x0: 346, pitch: 19.6, cell: 18.6, thY: 50, thH: 18, queueBase: 196, tokenH: 3.2, cntY: 208, top: 214, rowH: 9 };
const xOf = (b) => G.x0 + b * G.pitch;
const cx = (b) => xOf(b) + G.cell / 2;
const TILE = { x: 36, y: 276, cell: 6.6 };
const t = (x, y, text, cls = "sb-t", attrs = "") => `<text class="${cls}" x="${x}" y="${y}" ${attrs}>${text}</text>`;
const r = (x, y, w, h, cls, attrs = "") => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`;
const mid = 'text-anchor="middle"';

function map() {
  const o = [r(20, 20, 252, 208, "sb-panel"), t(32, 40, "THE WHOLE GPU", "sb-h"), r(30, 50, 232, 170, "sb-box")];
  for (let i = 0; i < 4; i++) o.push(r(92 + i * 28, 56, 22, 10, "sb-chip"), r(92 + i * 28, 204, 22, 10, "sb-chip"));
  for (const y of [84, 124, 164]) o.push(r(38, y, 10, 24, "sb-chip"), r(244, y, 10, 24, "sb-chip"));
  o.push(r(60, 72, 172, 126, "sb-box2"));
  for (let c = 0; c < 6; c++) for (let row = 0; row < 2; row++) o.push(r(68 + c * 27, 80 + row * 72, 23, 38, "sb-sm"));
  o.push(r(68, 124, 158, 22, "sb-l2"), t(147, 139, "L2 cache", "sb-s", mid));
  // one SM, with its shared memory lit
  o.push(r(68 + 4 * 27, 80, 23, 38, "sb-sm-on"), r(68 + 4 * 27 + 3, 104, 17, 11, "sb-hl"));
  o.push(`<path class="sb-zoom" d="M${68 + 4 * 27 + 20} 104L286 50M${68 + 4 * 27 + 20} 115L286 214"/>`);
  o.push(t(32, 216, "", "sb-s", ""), `<text class="sb-s sb-b" x="146" y="66" text-anchor="middle" style="display:none"></text>`);
  return o.join("");
}
function tile() {
  const o = [r(20, 238, 252, 270, "sb-panel"), t(32, 258, "THE TILE", "sb-h"), t(260, 258, "", "sb-s sb-mid", 'text-anchor="end" data-tilesize')];
  for (let row = 0; row < 32; row++) for (let c = 0; c < 33; c++) o.push(r(TILE.x + c * TILE.cell, TILE.y + row * TILE.cell, TILE.cell - 0.7, TILE.cell - 0.7, "sb-tex", `data-t="${row}.${c}"`));
  o.push(t(TILE.x, TILE.y + 32 * TILE.cell + 12, "", "sb-s sb-mid", "data-tilenote"));
  return o.join("");
}
function key() {
  const o = [r(20, 518, 252, 130, "sb-panel"), t(32, 538, "HOW TO READ THIS BOARD", "sb-h")];
  [["sb-k-go", "served this cycle or earlier"], ["sb-k-wait", "waiting in a queue"], ["sb-k-pad", "padding: holds no data"]].forEach(([cls, label], i) => o.push(r(32, 550 + i * 22, 14, 12, cls), t(54, 560 + i * 22, label, "sb-s")));
  o.push(t(32, 636, "one token: one different word", "sb-s sb-mid"));
  return o.join("");
}
function board() {
  const o = [r(286, 20, 700, 628, "sb-panel"), t(298, 40, "SHARED MEMORY · 32 BANKS OF 4-BYTE WORDS", "sb-h")];
  // threads
  o.push(t(338, G.thY + 13, "threads", "sb-s sb-mid", 'text-anchor="end"'));
  for (let i = 0; i < 32; i++) { o.push(r(xOf(i), G.thY, G.cell, G.thH, "sb-thread", `data-th="${i}"`), t(cx(i), G.thY + 13, i, "sb-tiny", mid)); }
  // queue stacks
  o.push(t(338, 150, "queues", "sb-s sb-mid", 'text-anchor="end"'), `<path class="sb-rule" d="M${G.x0} ${G.queueBase + 1}H${xOf(32)}"/>`);
  o.push(`<g data-lines>${Array.from({ length: 32 }, (_, i) => `<path class="sb-line" data-l="${i}" pathLength="1" d=""/>`).join("")}</g>`);
  for (let i = 0; i < 32; i++) o.push(r(0, 0, G.cell - 5, G.tokenH - 0.7, "sb-token", `data-tk="${i}" style="display:none"`));
  o.push(t(0, 0, "", "sb-many", "data-many"));
  // queue counters
  o.push(t(338, G.cntY - 1, "waiting", "sb-s sb-mid", 'text-anchor="end"'));
  for (let b = 0; b < 32; b++) o.push(r(xOf(b), G.cntY - 11, G.cell, 14, "sb-count", `data-cb="${b}"`), t(cx(b), G.cntY, "", "sb-count-t", `${mid} data-c="${b}"`));
  // the grid
  o.push(t(338, G.top + 8, "word", "sb-s sb-mid", 'text-anchor="end"'), t(338, G.top + 19, "slots", "sb-s sb-mid", 'text-anchor="end"'));
  for (let w = 0; w < 1056; w++) { const b = w % 32, row = Math.floor(w / 32), y = G.top + 4 + row * G.rowH; o.push(r(xOf(b), y, G.cell, G.rowH - 0.8, "sb-word", `data-w="${w}"`), t(cx(b), y + 6.7, "", "sb-word-n", `${mid} data-wn="${w}"`)); }
  for (let b = 0; b < 32; b += 1) o.push(t(cx(b), G.top + 4 + 33 * G.rowH + 10, b, "sb-tiny", mid));
  o.push(t(338, G.top + 4 + 33 * G.rowH + 10, "bank", "sb-s sb-mid", 'text-anchor="end"'));
  // readouts
  const y = 580;
  o.push(t(298, y, "cycles", "sb-s sb-mid"), t(298, y + 30, "", "sb-huge", "data-cycle"), t(420, y, "banks used", "sb-s sb-mid"), t(420, y + 24, "", "sb-big", "data-banks"), t(540, y, "most in one bank", "sb-s sb-mid"), t(540, y + 24, "", "sb-big", "data-most"), t(680, y, "cycles = gcd(stride, 32)", "sb-s sb-mid"), t(680, y + 24, "", "sb-big", "data-rule"));
  o.push(t(298, y + 54, "", "sb-t", "data-reads"));
  return o.join("");
}
const svg = `<svg class="iso-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A flat board. Top left, a map of a GPU with shared memory inside one SM highlighted. Below it, the tile. To the right, a grid of 32 bank columns of 4-byte words, with word 0 in bank 0, word 1 in bank 1 and word 32 back in bank 0. Above the grid are a queue counter for each bank and a row of 32 threads, with a line from each thread to the word it wants.">${map()}${tile()}${key()}${board()}</svg>`;

const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `${modelSource}\nconst GEO = ${JSON.stringify(G)};\n${readFileSync(join(HERE, "live.js"), "utf8")}`;
const css = readFileSync(join(HERE, "shared-banks.css"), "utf8");
const steps = M.STEPS.map((step, i) => `<button class="sb-step" type="button" data-step="${i}"${i === 0 ? "" : " disabled"}><span class="sb-step-n">${String(i + 1).padStart(2, "0")}</span><span>${step.label}</span><span class="sb-step-fill" aria-hidden="true"></span></button>`).join("");
const chips = [["cycles", "cycles"], ["banks", "banks used"], ["most", "most in one bank"], ["rule", "cycles = gcd(stride, 32)"], ["tile", "tile"], ["pad", "padding"]].map(([key, name]) => `<span class="sb-chip"><span class="sb-chip-name">${name}</span><span class="sb-chip-value" data-chip="${key}">-</span></span>`).join("");
const reads = M.STEPS.filter((s) => s.kind === "read");
const ledger = `<div class="sb-ledger-wrap"><table class="sb-ledger" aria-label="Each read, from the model"><thead><tr><th>read</th><th>thread t reads</th><th>banks used</th><th>threads in fullest bank</th><th>different words in it</th><th>gcd(stride, 32)</th><th>cycles</th></tr></thead><tbody>${reads.map((s) => `<tr data-row="${s.name}"><td>${s.name}</td><td>${s.words}</td>${"<td>·</td>".repeat(5)}</tr>`).join("")}</tbody></table></div>`;
const plateBox = k.plateHtml({
  fig: "Fig 6", title: "One cycle or thirty-two", hint: "Press the lit step", readout: "shared memory empty",
  keys: [{ mark: "green", label: "A bank with one request: served in the first cycle" }, { mark: "red", label: "A bank with several: they queue and drain one per cycle" }],
  caption: "",
  body: `<div class="iso-stage sb-stage">${svg}<span class="sb-sr" role="status" aria-live="polite" data-status></span></div><p class="sb-swipe">Swipe the board sideways to see all of it.</p>`,
});
const facts = `<ul class="sb-facts"><li><b>The model assumes 32 banks of 4-byte words, as on recent NVIDIA GPUs.</b> 8-byte accesses and other vendors work differently.</li><li><b>The rule has one exception.</b> cycles = gcd(stride, 32) holds for strides from 1 up, and was checked against the model for 1 to 200. All threads reading one word is stride 0, where gcd(0, 32) is 32 but the read takes 1 cycle, because identical words count once.</li><li><b>The extra grey column is on the tile.</b> In the bank grid those same 32 padding words land on a diagonal, because each one's bank is still its index mod 32.</li></ul>`;
const notes = `<details class="sb-notes"><summary>Where the numbers come from</summary><ul>
<li><b>The model:</b> one pure function, written and tested before anything was drawn. A word's bank is its index mod 32, and a warp read takes as many cycles as the largest number of different words requested from any one bank. Identical words count once. The counters, queues, lines and table are all driven by its output.</li>
<li><b>Why gcd:</b> the words st for t = 0 to 31 fall in 32 ÷ gcd(s, 32) banks, with gcd(s, 32) threads in each. So 2 gives 16 banks of 2, 3 gives every bank once, 32 gives one bank of 32, and 33 behaves like 1.</li>
<li><b>Real, from secondary sources:</b> 32 banks, successive 32-bit words in successive banks, different addresses in one bank serialised, identical addresses broadcast with no conflict, and the a[32][33] padding fix are all described in NVIDIA conference slides, course notes and blog posts. I could not reach the current CUDA guides, and much of this material dates from Fermi to Kepler. Compute capability 1.x GPUs had 16 banks. Check the current guide before relying on it for a specific GPU.</li>
<li><b>A cycle here is one pass of the banks, not total latency.</b> A real load also has a fixed pipeline latency that this model leaves out, so "1 cycle" means no extra waiting from bank conflicts, not that the value arrives one clock later.</li>
<li><b>Padding:</b> 33 wide stores 33 × 32 = 1,056 words: 32 more words, 128 bytes, 3.1% of the 4 KB tile. Each row starts one bank later than the row above, so a column runs diagonally across all 32 banks.</li>
<li><b>Bank conflicts only happen within one warp's instruction.</b> The model has one warp and one load. The order threads pass within a bank is a choice made for the drawing.</li>
<li><b>Made up for the figure:</b> the tile's picture is a placeholder, and the broadcast word is word 7. Any single word gives the same answer. Loading the tile is not timed.</li>
<li><b>Grid depth:</b> the board shows only the 33 rows this tile needs. Real shared memory is much deeper, with tens of kilobytes or more per SM.</li>
</ul></details>`;
const links = `<p class="sb-sources">Sources: <a href="https://developer.download.nvidia.com/GTC/PDF/1083_Wang.pdf">NVIDIA GTC talk</a>, <a href="https://leimao.github.io/blog/CUDA-Shared-Memory-Bank">Lei Mao on shared memory banks</a>, <a href="https://cvw.cac.cornell.edu/cuda-intro/gpu-performance-topics/banks">Cornell Virtual Workshop</a>, <a href="https://people.cs.vt.edu/~yongcao/teaching/cs5234/spring2013/slides/Lecture6.pdf">Virginia Tech lecture slides</a>.</p>`;
const body = `<style>${css}</style><div class="sb-layout"><nav class="sb-steps" aria-label="Steps">${steps}</nav><div class="sb-main">${plateBox}<p class="sb-say" data-say aria-live="polite"></p><div class="sb-chips" aria-label="Live numbers">${chips}</div><p class="sb-idea"><b>The big idea:</b> threads on different banks are served together; threads on one bank wait in line.</p>${facts}${ledger}${notes}${links}</div></div>`;
const name = theme === "light" ? "shared-banks-light.html" : "shared-banks.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Shared Memory Banks", theme, body, script: live, width: 1240 }));
console.log("wrote", name, (svg.length / 1024).toFixed(0) + " KB svg");

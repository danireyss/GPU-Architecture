import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/danielreyes/.claude/skills/anatomy/kit/iso-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 1000, H = 640;

// A flat board, drawn in plain SVG. Everything is in viewBox units.
const PIPE = { x0: 410, x1: 716, y: 100, h: 56 };
const VRAM = { x: 298, y: 66, w: 112, h: 124 };
const LANES = { x: 716, y: 44, w: 262, h: 180, gx: 730, gy: 96, cell: 4.68, cols: 50, rows: 20 };
const BARS = { x0: 444, x1: 970, y: 310, h: 26, gap: 36, lo: 8, hi: 14 };
const LINE = { x0: 310, x1: 966, y: 562, lo: -2, hi: 4 };
const logX = (s, v) => s.x0 + ((Math.log10(v) - s.lo) / (s.hi - s.lo)) * (s.x1 - s.x0);
const fmtDecade = (e) => ["100M", "1B", "10B", "100B", "1T", "10T", "100T"][e - 8];
const t = (x, y, text, cls = "bp-t", attrs = "") => `<text class="${cls}" x="${x}" y="${y}" ${attrs}>${text}</text>`;
const r = (x, y, w, h, cls, attrs = "") => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`;

function map() {
  const o = [`<g class="bp-map">`, r(20, 20, 252, 208, "bp-panel"), t(32, 40, "THE WHOLE GPU", "bp-h")];
  const die = { x: 84, y: 72, w: 126, h: 112 };
  o.push(r(30, 50, 232, 170, "bp-box"));
  o.push(r(die.x, die.y, die.w, die.h, "bp-box2"));
  for (let c = 0; c < 6; c++) for (let row = 0; row < 2; row++) o.push(r(die.x + 8 + c * 19, die.y + 8 + row * 38 + (row ? 26 : 0), 15, 28, "bp-sm", `data-sm="${c}.${row}"`));
  o.push(r(die.x + 8, die.y + 46, 110, 20, "bp-l2"), t(die.x + 63, die.y + 60, "L2 cache", "bp-s", 'text-anchor="middle"'));
  for (let i = 0; i < 4; i++) { o.push(r(die.x + 10 + i * 28, 56, 22, 12, "bp-chip"), r(die.x + 10 + i * 28, 188, 22, 12, "bp-chip")); }
  for (const y of [84, 120]) { o.push(r(40, y, 12, 26, "bp-chip"), r(242, y, 12, 26, "bp-chip")); }
  // the highlighted path: one VRAM chip, through the pins, into L2 and on to an SM
  const path = `M253 126H210H${die.x + 118}V${die.y + 56}H${die.x + 100}V${die.y + 36}`;
  o.push(`<path class="bp-hl" data-hl d="${path}"/>`, r(242, 120, 12, 26, "bp-chip bp-chip-on", "data-hlbox"));
  o.push(r(die.x + 95, die.y + 8, 15, 28, "bp-sm bp-chip-on", "data-hlbox"));
  o.push(t(146, 214, "the path we zoom into", "bp-s bp-mid", 'text-anchor="middle"'));
  // the zoom guides
  o.push(`<path class="bp-zoom" d="M254 120L298 66M254 146L298 190"/>`);
  o.push(`</g>`);
  return o.join("");
}
function wires() {
  const o = [`<g data-from="6" class="bp-stage">`, r(20, 240, 252, 240, "bp-panel"), t(32, 260, "WHERE BANDWIDTH COMES FROM", "bp-h")];
  const lines = [];
  for (let i = 0; i < 24; i++) lines.push(`M${36 + i * 9.4} 276V330`);
  o.push(`<path class="bp-wire" d="${lines.join("")}"/>`, t(146, 346, "drawn: 24 of 384 wires", "bp-s bp-mid", 'text-anchor="middle"'));
  o.push(t(146, 374, "384 wires", "bp-t", 'text-anchor="middle"'), t(146, 392, "× 21 gigabits a second", "bp-t", 'text-anchor="middle"'), t(146, 410, "÷ 8 bits in a byte", "bp-t", 'text-anchor="middle"'));
  o.push(`<path class="bp-rule" d="M60 420H232"/>`, t(146, 442, "", "bp-big", 'text-anchor="middle" data-wire'), t(146, 462, "about 1,000 GB/s", "bp-s bp-mid", 'text-anchor="middle"'), `</g>`);
  return o.join("");
}
function key() {
  const o = [r(20, 490, 252, 130, "bp-panel"), t(32, 510, "HOW TO READ THIS BOARD", "bp-h")];
  o.push(`<circle class="bp-dot-r" cx="38" cy="530" r="3"/><circle class="bp-dot-w" cx="38" cy="550" r="3"/>`, t(50, 534, "read traffic", "bp-s"), t(50, 554, "write traffic", "bp-s"), t(32, 574, "one dot: 10 GB a second", "bp-s bp-mid"));
  o.push(r(32, 586, 58, 16, "bp-tag"), t(61, 598, "LIMIT", "bp-tag-t", 'text-anchor="middle"'), t(98, 598, "sets the speed", "bp-s"));
  return o.join("");
}
function flow() {
  const o = [r(286, 20, 700, 228, "bp-panel"), t(298, 40, "THE ZOOM: VRAM → PIPE → LANES", "bp-h")];
  // VRAM
  o.push(r(VRAM.x, VRAM.y, VRAM.w, VRAM.h, "bp-box2"), t(VRAM.x + 56, VRAM.y + 20, "VRAM", "bp-t bp-b", 'text-anchor="middle"'));
  for (const [i, n] of ["a", "b", "c"].entries()) {
    const y = VRAM.y + 34 + i * 28;
    o.push(t(VRAM.x + 10, y + 14, n, "bp-t bp-b"));
    for (let c = 0; c < 8; c++) o.push(r(VRAM.x + 24 + c * 10, y, 9, 20, "bp-num", `data-arr="${n}"`));
  }
  // pipe
  const { x0, x1, y, h } = PIPE;
  o.push(`<path class="bp-pipe" d="M${x0} ${y}H${x1}V${y + h}H${x0}Z"/>`, `<path class="bp-mid-line" d="M${x0} ${y + h / 2}H${x1}"/>`);
  o.push(`<path class="bp-valve" data-valve d="M${x0 + 2} ${y + 2}V${y + h - 2}"/>`);
  o.push(t(x0 + 4, y - 6, "reads →", "bp-s bp-mid"), t(x1 - 4, y - 6, "← writes", "bp-s bp-mid", 'text-anchor="end"'));
  o.push(`<path class="bp-dot-r" data-dots="r" d=""/><path class="bp-dot-w" data-dots="w" d=""/>`);
  o.push(t((x0 + x1) / 2, y - 22, "", "bp-big", 'text-anchor="middle" data-bw'), t((x0 + x1) / 2, y + h + 22, "", "bp-t bp-b", 'text-anchor="middle" data-under'), t((x0 + x1) / 2, y + h + 40, "", "bp-s bp-mid", 'text-anchor="middle" data-under2'));
  o.push(`<g data-tag="pipe" style="display:none">${r((x0 + x1) / 2 - 42, y - 62, 84, 18, "bp-tag")}${t((x0 + x1) / 2, y - 49, "THE LIMIT", "bp-tag-t", 'text-anchor="middle"')}</g>`);
  // lanes
  const L = LANES;
  o.push(r(L.x, L.y, L.w, L.h, "bp-box2"), t(L.x + 14, L.y + 19, "LANES", "bp-t bp-b"), t(L.x + L.w - 14, L.y + 19, "", "bp-t bp-b", 'text-anchor="end" data-ops'));
  o.push(t(L.x + 14, L.y + 40, "", "bp-big", "data-busy"), t(L.x + L.w - 14, L.y + 40, "", "bp-s bp-mid", 'text-anchor="end" data-idle'));
  o.push(`<g data-from="3" class="bp-stage">`);
  o.push(r(L.gx - 1, L.gy - 1, L.cols * L.cell + 2, L.rows * L.cell + 2, "bp-grid-bg"));
  o.push(r(L.gx, L.gy, 0, 0, "bp-fill", "data-fill"));
  const grid = [];
  for (let c = 0; c <= L.cols; c++) grid.push(`M${(L.gx + c * L.cell).toFixed(2)} ${L.gy}V${L.gy + L.rows * L.cell}`);
  for (let row = 0; row <= L.rows; row++) grid.push(`M${L.gx} ${(L.gy + row * L.cell).toFixed(2)}H${L.gx + L.cols * L.cell}`);
  o.push(`<path class="bp-grid" d="${grid.join("")}"/>`, t(L.x + 14, L.y + L.h - 4 - 4, "1,000 cells: each is 0.1% of the lanes", "bp-s bp-mid"), `</g>`);
  o.push(`<g data-tag="lanes" style="display:none">${r(L.x + L.w - 94, L.y - 11, 84, 18, "bp-tag")}${t(L.x + L.w - 52, L.y + 2, "THE LIMIT", "bp-tag-t", 'text-anchor="middle"')}</g>`);
  return o.join("");
}
function bars() {
  const B = BARS;
  const o = [`<g data-from="3" class="bp-stage">`, r(286, 258, 700, 150, "bp-panel"), t(298, 276, "ELEMENTS A SECOND · LOG SCALE, EACH MARK IS × 10", "bp-h")];
  for (let e = B.lo; e <= B.hi; e++) { const x = logX(B, 10 ** e); o.push(`<path class="bp-rule" d="M${x} ${B.y - 8}V${B.y + B.h + B.gap + 4}"/>`, t(x, B.y + B.h + B.gap + 17, fmtDecade(e), "bp-s bp-mid", 'text-anchor="middle"')); }
  o.push(t(B.x0 - 12, B.y + 18, "memory allows", "bp-t", 'text-anchor="end"'), t(B.x0 - 12, B.y + B.gap + 18, "the lanes could do", "bp-t", 'text-anchor="end"'));
  o.push(r(B.x0, B.y, 0, B.h, "bp-bar-m", 'data-bar="memory"'), r(B.x0, B.y + B.gap, 0, B.h, "bp-bar-l", 'data-bar="lanes"'));
  o.push(t(0, B.y + 18, "", "bp-t bp-b", 'data-val="memory"'), t(0, B.y + B.gap + 18, "", "bp-t bp-b", 'data-val="lanes"'));
  o.push(`<path class="bp-run" data-run d=""/>`, t(0, B.y - 11, "", "bp-s bp-b", 'data-runlabel text-anchor="middle"'), `</g>`);
  return o.join("");
}
function line() {
  const L = LINE;
  const o = [`<g data-from="4" class="bp-stage">`, r(286, 416, 700, 204, "bp-panel"), t(298, 436, "OPERATIONS PER BYTE · LOG SCALE", "bp-h")];
  o.push(r(L.x0, L.y - 34, 0, 34, "bp-zone-m", `data-zone="m"`), r(0, L.y - 34, 0, 34, "bp-zone-l", `data-zone="l"`));
  o.push(t(0, L.y - 13, "memory-bound", "bp-t", 'data-zt="m" text-anchor="middle"'), t(0, L.y - 13, "compute-bound", "bp-t", 'data-zt="l" text-anchor="middle"'));
  o.push(`<path class="bp-axis" d="M${L.x0} ${L.y}H${L.x1}"/>`);
  const labels = ["0.01", "0.1", "1", "10", "100", "1,000", "10,000"];
  for (let e = L.lo; e <= L.hi; e++) { const x = logX(L, 10 ** e); o.push(`<path class="bp-axis" d="M${x} ${L.y}V${L.y + 7}"/>`, t(x, L.y + 22, labels[e - L.lo], "bp-s", 'text-anchor="middle"')); for (let m = 2; m < 10 && e < L.hi; m++) { const u = logX(L, m * 10 ** e); o.push(`<path class="bp-rule" d="M${u} ${L.y}V${L.y + 4}"/>`); } }
  o.push(`<g data-balance><path class="bp-bal" d="M0 ${L.y - 46}V${L.y + 10}"/>${t(0, L.y - 52, "", "bp-t bp-b", 'data-baltext text-anchor="middle"')}</g>`);
  o.push(`<g data-marker><path class="bp-mark" d="M0 ${L.y + 2}L-6 ${L.y + 12}H6Z"/></g>`, t(0, L.y + 44, "", "bp-t bp-b", 'data-marktext text-anchor="middle"'), `</g>`);
  return o.join("");
}
const svg = `<svg class="iso-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A flat board. Top left, a map of a whole GPU with the path from one VRAM chip to the chip highlighted. To its right a flow diagram: VRAM, a pipe labelled in gigabytes a second, and a box of lanes with the share busy filled in. Below, two log-scale bars compare the elements a second memory allows with what the lanes could do, and a log number line of operations per byte marks the balance point and the current kernel.">${map()}${wires()}${key()}${flow()}${bars()}${line()}</svg>`;

const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `${modelSource}\nconst GEO = ${JSON.stringify({ PIPE, LANES, BARS, LINE })};\n${readFileSync(join(HERE, "live.js"), "utf8")}`;
const css = readFileSync(join(HERE, "balance-point.css"), "utf8");
const steps = M.STEPS.map((label, i) => `<button class="bp-step" type="button" data-step="${i}"${i === 0 ? "" : " disabled"}><span class="bp-step-n">${String(i + 1).padStart(2, "0")}</span><span>${label}</span><span class="bp-step-fill" aria-hidden="true"></span></button>`).join("");
const chips = [["bw", "pipe"], ["bytes", "bytes per element"], ["memory", "memory allows"], ["lanes", "lanes could do"], ["rate", "runs at"], ["busy", "lanes busy"], ["perbyte", "operations per byte"], ["balance", "balance point"], ["turn", "compute-bound from"], ["limit", "the limit"]].map(([key, name]) => `<span class="bp-chip"><span class="bp-chip-name">${name}</span><span class="bp-chip-value" data-chip="${key}">-</span></span>`).join("");
const slider = `<div class="bp-slider" data-sliderbox data-off><label for="bp-ops">Operations per element</label><input id="bp-ops" type="range" min="0" max="1000" value="0" step="1" disabled data-slider><output data-slideout>1</output></div>`;
const plateBox = k.plateHtml({
  fig: "Fig 7", title: "Each byte has to carry math", hint: "Press the lit step", readout: "pipe closed",
  keys: [{ mark: "lit", label: "Each dot is 10 GB a second through the pipe, at the rate the model gives" }, { mark: "red", label: "The limit: the part that sets the speed" }],
  caption: "",
  body: `<div class="iso-stage bp-stage-box">${svg}<span class="bp-sr" role="status" aria-live="polite" data-status></span></div><p class="bp-swipe">Swipe the board sideways to see all of it.</p>${slider}`,
});
const facts = `<ul class="bp-facts"><li><b>500 GB/s and 20 trillion operations a second are the course's example chip, not one real product.</b> So are the bigger card's 1,000 GB/s and 30 trillion.</li><li><b>The board rounds 41.7 billion to 42.</b> This page shows 41.7, because the model gives 500 ÷ 12 = 41.67.</li></ul>`;
const notes = `<details class="bp-notes"><summary>Where the numbers come from</summary><ul>
<li><b>The model:</b> one pure function, written and tested before drawing: elements a second = the smaller of bandwidth ÷ bytes per element and operations a second ÷ operations per element. Every number, bar, dot, marker and label on the board comes from it.</li>
<li><b>Real: 384 wires × 21 gigabits.</b> That is the published memory of the GeForce RTX 4090, a 384-bit bus of GDDR6X at 21 Gbps. 384 × 21 ÷ 8 = 1,008 GB/s, which rounds to about 1,000. Spec sheets also list it as 1,008 or about 1,010.</li>
<li><b>Not checked: 30 trillion operations a second.</b> It comes from your brief. A real card's figure depends on what counts as an operation, and this page does not claim it matches the RTX 4090.</li>
<li><b>Busy</b> means the share of the lanes' capacity in use, not power or a utilisation meter. A tool such as nvidia-smi reports something different: a GPU can show 100% while its lanes wait on memory like this.</li>
<li><b>What the model leaves out:</b> every byte here crosses the pipe, once. Real caches let a kernel that reuses data do much more math per byte than this suggests, and a bus loses time to refresh and to switching between reads and writes, so 500 GB/s is a peak rather than a sustained rate.</li>
<li><b>One operation is one lane doing one thing for one clock.</b> Real kernels mix cheap and expensive operations.</li>
<li><b>New kernel</b> operation counts are round figures chosen for the figure, not measurements. The Mandelbrot kernel reads nothing and takes 8 operations for each of about 100 steps. The n-body kernel takes 20 for each of 1,000 neighbours and assumes no caching.</li>
<li><b>The pipe's two directions</b> are drawn as two lanes for clarity. Real memory shares its wires between reads and writes, which is why the model adds them together. The dots run at 1 for each 10 GB a second: their spacing is true, and the speed along the pipe means nothing.</li>
</ul></details>`;
const links = `<p class="bp-sources">Sources for the 384 × 21 figure: <a href="https://techpowerup.com/review/nvidia-geforce-rtx-4090-founders-edition">TechPowerUp RTX 4090 review</a>, <a href="https://www.notebookcheck.net/NVIDIA-GeForce-RTX-4090-GPU-Benchmarks-and-Specs.674574.0.html">Notebookcheck RTX 4090 specs</a>.</p>`;
const body = `<style>${css}</style><div class="bp-layout"><nav class="bp-steps" aria-label="Steps">${steps}</nav><div class="bp-main">${plateBox}<p class="bp-say" data-say aria-live="polite"></p><div class="bp-chips" aria-label="Live numbers">${chips}</div><p class="bp-idea"><b>The big idea:</b> each byte has to carry enough math, or memory sets the speed.</p>${facts}${notes}${links}</div></div>`;
const name = theme === "light" ? "balance-point-light.html" : "balance-point.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Balance Point", theme, body, script: live, width: 1240 }));
console.log("wrote", name, (svg.length / 1024).toFixed(0) + " KB svg");

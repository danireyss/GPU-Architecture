import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/danielreyes/.claude/skills/anatomy/kit/iso-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 1000, H = 640;
const FIELD = { x: 418, y: 92, w: 182 };
const SMS = { x: 634, y: 56, pitch: 21.6, box: 20, cell: 4.4 };
const OPEN = { x: 824, y: 62, cell: 4.9, pitch: 13 };
const t = (x, y, text, cls = "of-t", attrs = "") => `<text class="${cls}" x="${x}" y="${y}" ${attrs}>${text}</text>`;
const r = (x, y, w, h, cls, attrs = "") => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`;
const mid = 'text-anchor="middle"', end = 'text-anchor="end"';
const panel = (x, y, w, h, kind, title) => r(x, y, w, h, "of-panel") + r(x, y, w, 3, `of-${kind}`) + t(x + 10, y + 19, title, "of-h");

function map() {
  const o = [panel(16, 16, 222, 164, "cpu", "THE WHOLE GPU")];
  o.push(r(26, 44, 52, 40, "of-cpu-box"), t(52, 68, "RAM", "of-s", mid));
  o.push(`<path class="of-mem-line" d="M78 64H104V100H118"/>`, t(90, 116, "PCIe", "of-tiny", mid));
  o.push(r(118, 44, 112, 128, "of-box"));
  for (let i = 0; i < 4; i++) o.push(r(126 + i * 25, 50, 20, 12, "of-mem"));
  o.push(r(126, 68, 96, 96, "of-box2"));
  for (let c = 0; c < 6; c++) for (let row = 0; row < 3; row++) o.push(r(132 + c * 14.6, 74 + row * 29, 12, 25, "of-sm"));
  o.push(`<path class="of-mem-line" d="M146 62V74"/>`, t(26, 142, "RAM → PCIe", "of-tiny"), t(26, 156, "→ VRAM → SMs", "of-tiny"));
  return o.join("");
}
function card() {
  const o = [panel(16, 188, 222, 150, "cpu", "THE KERNEL"), r(26, 216, 202, 112, "of-code")];
  o.push(t(34, 232, "for one element:", "of-tiny"));
  M.KERNEL.forEach((line, i) => o.push(`<text class="of-mono" x="34" y="${252 + i * 18}" xml:space="preserve">${line.replace(/</g, "&lt;")}</text>`));
  return `<g data-from="0" class="of-stage">${o.join("")}</g>`;
}
function worked() {
  const o = [panel(16, 346, 222, 116, "cpu", "ONE THREAD'S SUM"), t(26, 386, "", "of-t of-b", "data-w1"), t(26, 408, "", "of-t", "data-w2"), t(26, 430, "", "of-t", "data-w3"), t(26, 450, "", "of-s of-mid", "data-w4")];
  return `<g data-from="4" class="of-stage">${o.join("")}</g>`;
}
function key() {
  const o = [panel(16, 470, 222, 154, "cpu", "COLOURS")];
  [["of-cpu-k", "grey: runs on the CPU"], ["of-mem", "teal: memory"], ["of-sm-k", "blue: the SMs"], ["of-idle", "hollow: an idle lane"]].forEach(([cls, label], i) => o.push(r(26, 504 + i * 26, 14, 12, cls), t(48, 514 + i * 26, label, "of-s")));
  return o.join("");
}
const arrays = (y, name, x = 258) => ["a", "b", "c"].map((n, i) => {
  const ry = y + i * 34;
  return t(x, ry + 12, n, "of-t of-b") + r(x + 14, ry, 76, 16, "of-track") + r(x + 14, ry, 0, 16, "of-fill", `data-arr="${name}-${n}"`) + t(x + 132, ry + 12, "", "of-tiny of-b", `${end} data-arrt="${name}-${n}"`);
}).join("");
function memory() {
  const o = [panel(246, 16, 152, 608, "mem", "MEMORY")];
  o.push(t(322, 62, "RAM", "of-t of-b", mid), t(322, 76, "on the host", "of-tiny", mid), arrays(90, "ram"));
  o.push(`<path class="of-mem-line" data-link d="M322 204V274"/>`, t(330, 232, "PCIe", "of-s of-mid"), t(330, 248, "25 GB/s", "of-s of-b"), r(316, 0, 12, 12, "of-pkt", 'data-pkt style="display:none"'));
  o.push(t(322, 296, "VRAM", "of-t of-b", mid), t(322, 310, "on the card", "of-tiny", mid), arrays(324, "vram"));
  o.push(t(258, 460, "copy time", "of-s of-mid"), t(258, 482, "", "of-t of-b", "data-m1"), t(258, 502, "", "of-big", "data-m2"), t(258, 530, "", "of-t of-b", "data-m3"), t(258, 550, "", "of-big", "data-m4"), t(258, 600, "1 MB = 1,000,000 bytes", "of-tiny"));
  return o.join("");
}
function grid() {
  const o = [panel(406, 16, 206, 608, "sm", "THE GRID")];
  o.push(`<path class="of-rule" data-ticks d=""/>`);
  ["B0", "B1", "B2", "…"].forEach((name, i) => o.push(t(FIELD.x + i * 24, 60, "", "of-tiny of-b", `data-bl="${i}" data-name="${name}"`)));
  o.push(`<path class="of-b-wait" data-path="wait" d=""/><path class="of-b-run" data-path="run" d=""/><path class="of-b-done" data-path="done" d=""/>`);
  o.push(t(418, 306, "blocks", "of-s of-mid"), t(418, 330, "", "of-big", "data-g1"), t(418, 354, "threads", "of-s of-mid"), t(418, 378, "", "of-big", "data-g2"), t(418, 402, "switched off by the if", "of-s of-mid"), t(418, 426, "", "of-big", "data-g3"), t(418, 452, "", "of-s of-mid", "data-g4"), t(418, 472, "", "of-s of-mid", "data-g5"));
  o.push(t(418, 520, "waiting their turn", "of-s of-mid"), t(418, 544, "", "of-big", "data-g6"));
  return `<g data-from="2" class="of-stage">${o.join("")}</g>`;
}
function sms() {
  const o = [panel(620, 16, 188, 608, "sm", "80 SMs · 8 SLOTS EACH")];
  for (let i = 0; i < 80; i++) { const x = SMS.x + (i % 8) * SMS.pitch, y = SMS.y + Math.floor(i / 8) * SMS.pitch; o.push(r(x, y, SMS.box, SMS.box, "of-smbox")); }
  const slots = [];
  for (let i = 0; i < 80; i++) for (let s = 0; s < 8; s++) { const x = SMS.x + (i % 8) * SMS.pitch + 1 + (s % 4) * SMS.cell, y = SMS.y + Math.floor(i / 8) * SMS.pitch + 1 + Math.floor(s / 4) * 9; slots.push(`M${x.toFixed(1)} ${y}h${SMS.cell - 0.8}v8h-${SMS.cell - 0.8}z`); }
  o.push(`<path class="of-slot" d="${slots.join("")}"/><path class="of-slot-on" data-path="slots" d=""/><path class="of-fly" data-path="fly" d=""/>`);
  o.push(t(632, 306, "running at once", "of-s of-mid"), t(632, 330, "", "of-big", "data-s1"), t(632, 354, "", "of-s of-mid", "data-s2"), t(632, 378, "wave", "of-s of-mid"), t(632, 402, "", "of-big", "data-s3"), t(632, 426, "in this wave", "of-s of-mid"), t(632, 450, "", "of-big", "data-s4"), t(632, 490, "", "of-s of-mid", "data-s5"), t(632, 508, "", "of-s of-mid", "data-s6"));
  return `<g data-from="3" class="of-stage">${o.join("")}</g>`;
}
function opened() {
  const o = [panel(816, 16, 170, 608, "sm", "ONE BLOCK, OPENED"), t(826, 52, "", "of-s of-b", "data-o0")];
  o.push(`<path class="of-warp" data-path="warp" d=""/><path class="of-idle-p" data-path="idle" d=""/><path class="of-lit-p" data-path="lit" d=""/>`);
  o.push(`<path class="of-b-run" data-cursor d=""/>`);
  o.push(t(826, 190, "", "of-t of-b", "data-o1"), t(826, 208, "", "of-s of-mid", "data-o2"));
  for (const [i, n] of ["a", "b", "c"].entries()) { const y = 222 + i * 26; o.push(r(826, y, 150, 20, "of-track"), t(832, y + 14, "", "of-s of-b", `data-e="${n}"`)); }
  o.push(t(826, 322, "warps in all", "of-s of-mid"), t(826, 346, "", "of-big", "data-o3"), t(826, 372, "", "of-s of-mid", "data-o4"), t(826, 390, "", "of-s of-mid", "data-o5"));
  o.push(t(826, 424, "lanes idle", "of-s of-mid"));
  [0, 1].forEach((i) => { const y = 434 + i * 36; o.push(t(826, y + 10, "", "of-s", `data-il="${i}"`), r(826, y + 14, 150, 8, "of-track"), r(826, y + 14, 0, 8, "of-idle", `data-ib="${i}"`)); });
  return `<g data-from="4" class="of-stage">${o.join("")}</g>`;
}
const svg = `<svg class="iso-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A flat board. Top left, a map of a GPU with the path from RAM through PCIe and VRAM to the SMs highlighted. Then, left to right: the kernel's source on a card; RAM and VRAM holding arrays a, b and c; the grid as a field of 3,907 small block squares; 80 SM boxes with 8 block slots each; and one block opened up into 8 warps of 32 threads.">${map()}${card()}${worked()}${key()}${memory()}${grid()}${sms()}${opened()}</svg>`;

const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `${modelSource}\nconst GEO = ${JSON.stringify({ FIELD, SMS, OPEN })};\n${readFileSync(join(HERE, "live.js"), "utf8")}`;
const css = readFileSync(join(HERE, "one-function.css"), "utf8");
const steps = M.STEPS.map(([label, kind], i) => `<button class="of-step" type="button" data-kind="${kind}" data-step="${i}"${i === 0 ? "" : " disabled"}><span class="of-step-n">${String(i + 1).padStart(2, "0")}</span><span>${label}</span><span class="of-step-fill" aria-hidden="true"></span></button>`).join("");
const chips = [["n", "n"], ["block", "block size"], ["blocks", "blocks"], ["threads", "threads"], ["off", "switched off"], ["warps", "warps"], ["waves", "waves"], ["last", "last wave"], ["in", "copy in"], ["back", "copy back"], ["idle", "lanes idle"]].map(([key, name]) => `<span class="of-chip"><span class="of-chip-name">${name}</span><span class="of-chip-value" data-chip="${key}">-</span></span>`).join("");
const plateBox = k.plateHtml({
  fig: "Fig 9", title: "One function, a million threads", hint: "Press the lit step", readout: "nothing written yet",
  keys: [{ mark: "dim", label: "Grey: the CPU" }, { mark: "green", label: "Teal: memory" }, { mark: "blue", label: "Blue: the SMs" }],
  caption: "",
  body: `<div class="iso-stage of-stage-box">${svg}<span class="of-sr" role="status" aria-live="polite" data-status></span></div><p class="of-swipe">Swipe the board sideways to see all of it.</p>`,
});
const facts = `<ul class="of-facts">
<li><b>80 SMs is a V100,</b> the number it ships with enabled. The full die has 84.</li>
<li><b>8 blocks per SM is Lesson 3.2's 32-register case.</b> The real number depends on the kernel. 65,536 registers ÷ (32 × 256) = 8, and 64 warp slots ÷ 8 warps = 8.</li>
<li><b>25 GB/s is Lesson 4.4's PCIe figure.</b> Real links and real copies differ.</li>
<li><b>Blocks of 100 keep 8 blocks per SM,</b> so that only one thing changes, which gives 16 waves. By the limits above, blocks of 100 could fit 16 per SM (64 warp slots ÷ 4 warps), giving 8 waves.</li>
</ul>`;
const notes = `<details class="of-notes"><summary>Where the numbers come from</summary><ul>
<li><b>The model:</b> one pure function, written and tested before drawing. Blocks = n ÷ block size rounded up; threads = blocks × block size; warps per block = block size ÷ 32 rounded up; waves = blocks ÷ (SMs × blocks per SM) rounded up; copy time = bytes ÷ link speed.</li>
<li><b>Lanes idle:</b> lanes = warps × 32, and idle = (lanes − n) ÷ lanes. With blocks of 256 the only idle lanes are the 192 threads the if switches off: 192 ÷ 1,000,192 = 0.02%. With blocks of 100 it is 28 lanes in each of 10,000 blocks: 280,000 ÷ 1,280,000 = 21.9%.</li>
<li><b>Waves are a simplification.</b> A real GPU does not wait for a whole wave to finish. As soon as a block ends, the next waiting block takes its slot, and which SM a block lands on is not something a program can rely on. Seven waves is how many SM-loads of blocks there are, not a timing measurement.</li>
<li><b>Bytes:</b> a, b and c hold 1,000,000 4-byte ints, so 4 MB each. Copy times use 1 MB = 1,000,000 bytes, and leave out latency and setup. They are drawn far slower than real time so they can be seen.</li>
<li><b>V100's SM count</b> comes from reviews and spec tables, not from NVIDIA's whitepaper, which I did not read.</li>
<li><b>Placeholder values:</b> the board uses a[i] = i and b[i] = 2i so that each sum can be checked by eye. New launch sizes are round cases chosen for the figure.</li>
<li><b>The grid squares are drawn to count:</b> one square for each block. The opened block is B2, because it holds element 517, and in the wave plan here it sits in slot 2 of the first SM.</li>
<li><b>Left out:</b> how long the kernel runs, launch overhead, and the real scheduling between warps inside an SM.</li>
</ul></details>`;
const links = `<p class="of-sources">Sources for the SM count: <a href="https://at-web1.www.anandtech.com/show/12170/nvidia-titan-v-preview-titanomachy/3">AnandTech on Titan V and V100</a>, <a href="https://wccftech.com/nvidia-volta-gv100-gpu-tesla-v100-architecture-specifications-deep-dive">Wccftech spec table</a>.</p>`;
const body = `<style>${css}</style><div class="of-layout"><nav class="of-steps" aria-label="Steps">${steps}</nav><div class="of-main">${plateBox}<p class="of-say" data-say aria-live="polite"></p><div class="of-chips" aria-label="Live numbers">${chips}</div><p class="of-idea"><b>The big idea:</b> you write code for one element, and the GPU stamps it out a million times.</p>${facts}${notes}${links}</div></div>`;
const name = theme === "light" ? "one-function-light.html" : "one-function.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "One Function", theme, body, script: live, width: 1320 }));
console.log("wrote", name, (svg.length / 1024).toFixed(0) + " KB svg");

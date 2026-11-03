import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/danielreyes/.claude/skills/anatomy/kit/iso-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 1000, H = 640;
const CY = 150, PX_PER_GBS = 0.14; // pipe width: 70 units for 500 GB/s, 3.5 for 25
const RAM = { x: 298, y: 96, w: 72, h: 108 }, PIN = { x: 386, y: 96, w: 102, h: 108 }, VRAM = { x: 664, y: 96, w: 96, h: 108 }, CHIP = { x: 876, y: 96, w: 96, h: 108 };
const PCIE = { x0: 488, x1: 664 }, VP = { x0: 760, x1: 876 };
const TL = { x0: 400, x1: 972, max: 2, copy: 342, compute: 382, h: 32, ghost: 432, gh: 16, axis: 458 };
const X = (s) => TL.x0 + (s / TL.max) * (TL.x1 - TL.x0);
const t = (x, y, text, cls = "co-t", attrs = "") => `<text class="${cls}" x="${x}" y="${y}" ${attrs}>${text}</text>`;
const r = (x, y, w, h, cls, attrs = "") => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" ${attrs}/>`;
const mid = 'text-anchor="middle"';

function map() {
  const o = [r(20, 20, 252, 208, "co-panel"), t(32, 40, "THE WHOLE GPU", "co-h"), r(30, 50, 232, 144, "co-box")];
  const die = { x: 96, y: 76, w: 100, h: 92 };
  o.push(r(die.x, die.y, die.w, die.h, "co-box2"));
  for (let c = 0; c < 5; c++) for (let row = 0; row < 2; row++) o.push(r(die.x + 7 + c * 18, die.y + 7 + row * 54, 14, 24, "co-sm"));
  o.push(r(die.x + 7, die.y + 36, 86, 20, "co-l2"), t(die.x + 50, die.y + 50, "L2", "co-s", mid));
  for (let i = 0; i < 4; i++) o.push(r(100 + i * 24, 56, 18, 12, "co-chip"), r(40 + (i % 2) * 0, 74 + i * 22, 12, 16, "co-chip"), r(240, 74 + i * 22, 12, 16, "co-chip"));
  o.push(t(36, 186, "VRAM chips", "co-s co-mid"));
  // the card's edge connector, down to the host
  o.push(`<path class="co-hl" d="M146 168V194"/>`, r(102, 194, 88, 8, "co-hlbox"), t(146, 218, "PCIe link to the host", "co-s co-b", mid));
  o.push(`<path class="co-zoom" d="M190 194L${PCIE.x0} ${CY - 50}M190 202L${PCIE.x0} ${CY + 58}"/>`);
  return o.join("");
}
function cost() {
  const o = [r(20, 238, 252, 170, "co-panel"), t(32, 258, "WHAT THE 8 GB COPY COSTS", "co-h")];
  o.push(t(146, 290, "20 trillion a second", "co-t", mid), t(146, 310, "", "co-t", `${mid} data-costs`), `<path class="co-rule" d="M56 322H236"/>`);
  o.push(t(146, 350, "", "co-big", `${mid} data-lost`), t(146, 370, "operations not done", "co-s co-mid", mid), t(146, 390, "", "co-s co-mid", `${mid} data-about`));
  return o.join("");
}
function real() {
  const o = [r(20, 418, 252, 202, "co-panel"), t(32, 438, "REAL LINKS, TO SCALE", "co-h")];
  const rows = [["PCIe 3", 16], ["PCIe 4", 32], ["PCIe 5", 64], ["course VRAM", 500]];
  const scale = 166 / 500;
  rows.forEach(([name, rate], i) => {
    const y = 456 + i * 38;
    o.push(t(32, y + 8, name, "co-s"), r(32, y + 13, rate * scale, 8, i === 3 ? "co-bar-v" : "co-bar-p"), t(32 + rate * scale + 6, y + 21, `about ${rate} GB/s`.replace("about 500", "500"), "co-s co-mid"));
  });
  o.push(t(32, 610, "full width, one way, before overheads", "co-s co-mid"));
  return o.join("");
}
const tank = (b, name, title, sub) => [r(b.x, b.y, b.w, b.h, "co-box2"), t(b.x + b.w / 2, b.y + 16, title, "co-s co-b", mid), t(b.x + b.w / 2, b.y + 30, sub, "co-s co-mid", mid), r(b.x + 10, b.y + 40, b.w - 20, 40, "co-tank"), r(b.x + 10, b.y + 80, b.w - 20, 0, "co-level", `data-level="${name}"`), t(b.x + b.w / 2, b.y + 98, "", "co-t co-b", `${mid} data-gb="${name}"`)].join("");
function path() {
  const o = [r(286, 20, 700, 270, "co-panel"), t(298, 40, "THE ZOOM: RAM → PINNED BUFFER → PCIe → VRAM → GPU CHIP", "co-h")];
  o.push(tank(RAM, "ram", "ordinary", "RAM"), tank(PIN, "pin", "pinned", "staging buffer"), tank(VRAM, "vram", "VRAM", "on the card"));
  // the extra hop
  o.push(`<path class="co-hop" data-hop d="M${RAM.x + RAM.w} ${CY}H${PIN.x}"/>`, t(RAM.x, 226, "", "co-s co-mid", "data-hoptext"));
  // pipes, widths set by the model
  o.push(r(PCIE.x0, CY - 1.75, PCIE.x1 - PCIE.x0, 3.5, "co-pipe", "data-pipe"), `<path class="co-flow-p" data-flow="pcie" d="M${PCIE.x0} ${CY}H${PCIE.x1}"/>`);
  o.push(r(VP.x0, CY - 35, VP.x1 - VP.x0, 70, "co-pipe"));
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(`M${VP.x0} ${CY - 33.25 + i * 3.5}H${VP.x1}`);
  o.push(`<path class="co-flow-v" data-flow="vram" d="${rows.join("")}"/>`);
  o.push(t((PCIE.x0 + PCIE.x1) / 2, 76, "", "co-big", `${mid} data-rate="pcie"`), t((PCIE.x0 + PCIE.x1) / 2, 94, "PCIe link", "co-s co-mid", mid), t((PCIE.x0 + PCIE.x1) / 2, 186, "", "co-t co-b", `${mid} data-move="pcie"`));
  o.push(t((VP.x0 + VP.x1) / 2, 76, "500 GB/s", "co-big", mid), t((VP.x0 + VP.x1) / 2, 94, "VRAM link", "co-s co-mid", mid), t((VP.x0 + VP.x1) / 2, 204, "", "co-s co-b", `${mid} data-move="vram"`));
  // chip
  o.push(r(CHIP.x, CHIP.y, CHIP.w, CHIP.h, "co-chipbox", "data-chipbox"), t(CHIP.x + CHIP.w / 2, CHIP.y + 16, "GPU chip", "co-s co-b", mid), t(CHIP.x + CHIP.w / 2, CHIP.y + 60, "", "co-t co-b", `${mid} data-chipstate`));
  // the scale bracket
  o.push(t((PCIE.x0 + VP.x1) / 2, 260, "", "co-big", `${mid} data-narrower`), t((PCIE.x0 + VP.x1) / 2, 278, "both pipes are drawn to one scale", "co-s co-mid", mid));
  return o.join("");
}
function timeline() {
  const o = [r(286, 300, 700, 320, "co-panel"), t(298, 320, "TIMELINE · SECONDS, TO SCALE", "co-h")];
  for (let s = 0; s <= 20; s++) { const x = X(s / 10), major = s % 5 === 0; o.push(`<path class="${major ? "co-axis" : "co-rule"}" d="M${x} ${major ? TL.copy - 6 : TL.axis}V${TL.axis + (major ? 8 : 4)}"/>`); if (major) o.push(t(x, TL.axis + 22, (s / 10).toFixed(1), "co-s", mid)); }
  o.push(`<path class="co-axis" d="M${TL.x0} ${TL.axis}H${TL.x1}"/>`);
  o.push(t(388, TL.copy + 21, "copying", "co-t", 'text-anchor="end"'), t(388, TL.compute + 21, "computing", "co-t", 'text-anchor="end"'), t(388, TL.ghost + 12, "", "co-s co-mid", 'text-anchor="end" data-ghostname'));
  for (let i = 0; i < 12; i++) o.push(r(0, 0, 0, 0, "co-bar", `data-b="${i}" style="display:none"`));
  for (let i = 0; i < 12; i++) o.push(r(0, TL.ghost, 0, TL.gh, "co-ghost", `data-g="${i}" style="display:none"`));
  o.push(t(0, TL.compute + 21, "", "co-s co-mid", "data-wait"));
  o.push(`<path class="co-clock" data-clock d="M${TL.x0} ${TL.copy - 8}V${TL.axis + 4}" style="display:none"/>`);
  o.push(t(298, 524, "total", "co-s co-mid"), t(298, 548, "", "co-big", "data-total"));
  o.push(t(470, 524, "", "co-s co-mid", "data-l1"), t(470, 548, "", "co-big", "data-v1"));
  o.push(t(690, 524, "", "co-s co-mid", "data-l2"), t(690, 548, "", "co-big", "data-v2"));
  o.push(t(298, 590, "", "co-t", "data-sum"));
  return o.join("");
}
const svg = `<svg class="iso-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="A flat board. Top left, a map of a GPU with its PCIe link highlighted. Beside it a path from ordinary RAM through a pinned staging buffer, a narrow PCIe pipe, VRAM and a pipe 20 times wider, to the GPU chip. Below, a timeline in seconds shows copying and computing bars to scale.">${map()}${cost()}${real()}${path()}${timeline()}</svg>`;

const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `${modelSource}\nconst GEO = ${JSON.stringify({ TL, CY, PX_PER_GBS, boxes: { ram: RAM, pin: PIN, vram: VRAM } })};\n${readFileSync(join(HERE, "live.js"), "utf8")}`;
const css = readFileSync(join(HERE, "copy-once.css"), "utf8");
const steps = M.STEPS.map((label, i) => `<button class="co-step" type="button" data-step="${i}"${i === 0 ? "" : " disabled"}><span class="co-step-n">${String(i + 1).padStart(2, "0")}</span><span>${label}</span><span class="co-step-fill" aria-hidden="true"></span></button>`).join("");
const chips = [["link", "PCIe"], ["narrow", "narrower than VRAM"], ["copy", "one copy"], ["compute", "computing"], ["total", "total"], ["share", "time copying"], ["rate", "batches a second"], ["save", "saved"]].map(([key, name]) => `<span class="co-chip"><span class="co-chip-name">${name}</span><span class="co-chip-value" data-chip="${key}">-</span></span>`).join("");
const plateBox = k.plateHtml({
  fig: "Fig 8", title: "Copy once", hint: "Press the lit step", readout: "nothing copied yet",
  keys: [{ mark: "red", label: "Copying over the host link" }, { mark: "green", label: "Computing on the GPU" }, { mark: "dim", label: "Each row of dashes in a pipe carries 25 GB/s" }],
  caption: "",
  body: `<div class="iso-stage co-stage-box">${svg}<span class="co-sr" role="status" aria-live="polite" data-status></span></div><p class="co-swipe">Swipe the board sideways to see all of it.</p>`,
});
const facts = `<ul class="co-facts">
<li><b>The board uses 25 GB/s and the check question 20 GB/s.</b> The 8 GB copy runs at 25. The training and kernel examples run at 20, so the pipe is drawn thinner there and is 25 times narrower than VRAM, not 20.</li>
<li><b>Full-width PCIe 3, 4 and 5 carry about 16, 32 and 64 GB/s,</b> and real copies get somewhat less.</li>
<li><b>The extra hop from ordinary RAM is shown without a cost,</b> because it varies by system. The timeline does not change between steps 1 and 2.</li>
<li><b>The three-kernel example assumes each kernel's output is also 2 GB.</b></li>
</ul>`;
const notes = `<details class="co-notes"><summary>Where the numbers come from</summary><ul>
<li><b>The model:</b> one pure function, written and tested before drawing. Copy time = bytes ÷ link speed, and a step takes copy + compute in sequence, or the longer of the two when they overlap. Every bar, level, readout and chip comes from it.</li>
<li><b>PCIe figures:</b> a full-width link is 16 lanes. PCIe 3 runs 8 gigatransfers a second per lane with 128b/130b coding, so 8 × 16 × 128/130 ÷ 8 = 15.75 GB/s one way. PCIe 4 and 5 double that each time, to 31.5 and 63. Packet overheads take more off, which is why real copies get less.</li>
<li><b>The course's example chip:</b> 500 GB/s of VRAM and 20 trillion operations a second are example figures, not one real product. "About 6 trillion" is 6.4 trillion rounded, and it assumes the lanes could have been fully busy for all 0.32 s.</li>
<li><b>Overlapping:</b> the 0.4 s a step holds once the run is under way. The first batch still takes 0.5 s, because nothing has been copied ahead of it. On the timeline, three batches take 1.3 s against 1.5 s. The 25% is the steady rate, 2.5 against 2 batches a second. It needs an asynchronous copy, and a real one is rarely this cleanly timed.</li>
<li><b>Keeping it on the GPU</b> saves 0.4 s of 1.8 s because 4 of the 6 copies disappear. With one kernel there is nothing to save, and "New job" shows that case.</li>
<li><b>Pinned memory:</b> pageable memory can be moved by the operating system, so the driver copies it into a pinned staging buffer before the GPU's copy engine reads it. Allocating pinned memory skips that hop. This is from my knowledge of NVIDIA's CUDA guidance and PyTorch's pin_memory option, and I did not recheck it for this page.</li>
<li><b>New job</b> sizes and computing times are round figures chosen for the figure, on the real PCIe speeds above. They assume each kernel's output is the same size as its input.</li>
<li><b>Drawing choices:</b> the VRAM pipe's dashes run while the chip computes, to show it working from VRAM, but the model does not use that rate for computing. The clock runs 4 to 8 times slower than real time, and the rate is what matters, not the speed of the dashes on screen. The pipe's dashes do scale with the link's rate.</li>
<li><b>Left out:</b> latency and setup for each copy, the time to allocate memory, and a machine with NVLink or shared memory, where the host link can be much wider.</li>
</ul></details>`;
const body = `<style>${css}</style><div class="co-layout"><nav class="co-steps" aria-label="Steps">${steps}</nav><div class="co-main">${plateBox}<p class="co-say" data-say aria-live="polite"></p><div class="co-chips" aria-label="Live numbers">${chips}</div><p class="co-idea"><b>The big idea:</b> the host link is 20 times narrower, so copy once and keep the data on the GPU.</p>${facts}${notes}</div></div>`;
const name = theme === "light" ? "copy-once-light.html" : "copy-once.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Copy Once", theme, body, script: live, width: 1240 }));
console.log("wrote", name, (svg.length / 1024).toFixed(0) + " KB svg");

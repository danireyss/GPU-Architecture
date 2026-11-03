import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/danielreyes/.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "/Users/danielreyes/.claude/skills/anatomy/kit/lathe.mjs";
import { kitScript } from "/Users/danielreyes/.claude/skills/anatomy/scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 1000;
const HEIGHT = 610;

// World: x across the bench, y from the back (SM, cache) to the front (VRAM), z up.
const BENCH = { x: -448, y: -250, w: 930, d: 512, r: 10 };
const CELL = 5, CELLS = 32, LINE_W = CELL * CELLS, TRAY_LEN = LINE_W + 4, TRAY_D = 8, TRAY_H = 2.2;
const PITCH = 10;
const ROW0 = -210; // centre of slot 0
const rowY = (i) => ROW0 + i * PITCH;
const X0 = -96; // first cell of a tray in the rack
const DECK_DX = 176; // from a rack slot to the deck beside it
const TZ = 61; // underside of a tray in the rack and on the deck
const HOUSE = { x: -184, y: -226, w: 256, d: 214, r: 2 };
const HOUSE_TOP = 58;
const WALL_TOP = 96;
const SILL = 62;
const LATCH = { x: -176, y: -48, w: 240, d: 26, r: 0.8 };
const TAGS = { x0: -168, x1: -106 };
const BAR = { x: -177, w: 4 };
const FRONT = HOUSE.y + HOUSE.d;
const RAIL = { x0: 74, x1: 246 };
const DECK_Y = [-222, -40];
const RAMP = { y0: -40, z0: TZ - 2, y1: 76, z1: 22 };
const STRIP = { x0: -306, x1: 408, y0: 78, y1: 134, z: 8 };
const TAPE = { y0: 95, y1: 119, z: 11.5 };
const PICK_X = X0 + DECK_DX; // the first cell of the line under the gantry
const STRIP_GAP = 2;
const STEP_X = LINE_W + STRIP_GAP;
const MAP = { x0: -296, x1: 398, y: 84, d: 7 };
const CHIP = { x: 58, y: 158, w: 286, d: 92, r: 2 };
const LOAD = { x: -318, y: -176, w: 112, d: 110, r: 2 };
const LOAD_TOP = 62;
const SM = { x: -436, y: -238, w: 244, d: 300, r: 3 };
const SM_Z = 7;
const COUNT = { x: -432, y: 146, w: 454, d: 104, r: 2 };
const COUNT_TOP = 16;
const METER = { x: 266, y: -96, w: 196, d: 112, r: 2 };
const METER_TOP = 30;

const P = k.fitProjection(
  [...k.boxCorners(BENCH, -16, 0), ...k.boxCorners(HOUSE, 0, WALL_TOP + 6)],
  WIDTH, HEIGHT, { pad: 10, azimuth: 66, elevation: 36 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth = (x, y, z = 0) => k.depthOf([x, y, z], P);
const byDepth = (list, centre) => [...list].sort((a, b) => depth(...centre(a)) - depth(...centre(b)));
const planeOf = (y) => k.sideMatrix([0, y], 0, P, "left");
const box = (x, y, w, d, z, h, tone = "mid", extra = {}) => S(k.slabOf({ x, y, w, d, r: extra.r ?? 0.4 }, z, h, P, 2, extra.bevel ?? 0.25), { tone, crease: "lo", ...extra.style });
const flat = (x0, z0, x1, z1, r, steps = 4) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const rect = (x0, z0, x1, z1) => `M${x0.toFixed(2)} ${(-z0).toFixed(2)}H${x1.toFixed(2)}V${(-z1).toFixed(2)}H${x0.toFixed(2)}Z`;
const screwAt = (x, y, z, r = 1.3) => L(k.ring(x, y, r, z, P, 12), { tone: "lo" }) + D([at([x, y, z])], { size: 0.4 });
const topText = (x, y, z, text, size, attrs = "", cls = "cl-engrave", anchor = "middle") => `<text class="${cls}" ${attrs} transform="${k.topMatrix([x, y], z, P, "x")}" x="0" y="${(size * 0.36).toFixed(2)}" font-size="${size}" text-anchor="${anchor}">${text}</text>`;
const frontText = (x, y, z, text, size, attrs = "", cls = "cl-engrave", anchor = "middle") => `<g transform="${planeOf(y)}"><text class="${cls}" ${attrs} x="${x}" y="${-z}" font-size="${size}" text-anchor="${anchor}">${text}</text></g>`;
const lamp = (x, y, z, r, attrs) => `<path class="cl-lamp" ${attrs} d="${k.ring(x, y, r, z, P, 12)}Z"/>` + L(k.ring(x, y, r, z, P, 12), { tone: "lo" });
const vents = (x0, count, gap, w, z0, z1, y) => `<g transform="${planeOf(y)}">${L(Array.from({ length: count }, (_, i) => flat(x0 + i * gap, z0, x0 + i * gap + w, z1, 0.6, 2)).join(""), { tone: "lo" })}</g>`;

// ---------- recessed windows on the y faces, as on the earlier figures ----------
let clips = 0;
function recess({ x0, x1, z0, z1, r, deep }, y, back = "") {
  const id = `cl-clip-${clips++}`;
  const shape = flat(x0, z0, x1, z1, r);
  const top = k.pathOf([at([x0, y, z1]), at([x1, y, z1]), at([x1, y - deep, z1]), at([x0, y - deep, z1])], true);
  const side = k.pathOf([at([x0, y, z0]), at([x0, y, z1]), at([x0, y - deep, z1]), at([x0, y - deep, z0])], true);
  return [
    `<clipPath id="${id}"><path transform="${planeOf(y)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})"><path class="iso-shade" data-shade="0" d="${side}"/><path class="iso-top" d="${top}"/>`,
    `<g transform="${planeOf(y - deep)}"><path class="cl-lcd" d="${shape}"/>${back}<path class="iso-line" data-tone="faint" d="${shape}"/></g></g>`,
    `<g transform="${planeOf(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}
function lcdAt(name, x0, x1, z0, z1, y, unit, size) {
  const unitSize = Math.min(3.2, (z1 - z0) * 0.26);
  const back = `<text class="cl-lcd-unit" x="${x0 + 1.8}" y="${-(z1 - unitSize - 0.7)}" font-size="${unitSize}">${unit}</text><text class="cl-lcd-text" data-lcd="${name}" x="${x1 - 2}" y="${-(z0 + 1.6)}" font-size="${size}" text-anchor="end"></text>`;
  return recess({ x0, x1, z0, z1, r: 0.8, deep: 1.2 }, y, back);
}

// ---------- bench ----------
function bench() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BENCH, -16, 12, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BENCH, 24), (p) => p)) {
    out.push(S(k.cylinder(x, y, 8, -16, 1.8, P, 24), { tone: "lo" }), S(k.cylinder(x, y, 6, -14.2, 2.2, P, 24), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BENCH, -12, 12, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BENCH, 5), 0, P), { tone: "lo" }));
  out.push(k.corners(BENCH, 11).map(([x, y]) => screwAt(x, y, 0, 2.1)).join(""));
  const strip = { x: BENCH.x + 30, y: BENCH.y + BENCH.d - 9, w: BENCH.w - 60, d: 6, r: 0.4 };
  out.push(L(k.planOutline(strip, 0, P, 2), { tone: "lo" }));
  const ticks = k.topTicks(strip.x, strip.x + strip.w, 10, 5, strip.y, 0, [2, 3.6], P, "x");
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  return out.join("");
}

// ---------- the SM corner ----------
function smCorner() {
  const out = [`<path class="iso-halo" d="${k.haloOf(SM, 0, 3, P)}" style="opacity:.6"/>`];
  out.push(S(k.slabOf(SM, 0, SM_Z, P, 2, 0.4), { tone: "lo", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(SM, 3), SM_Z, P, 2), { tone: "faint" }));
  for (const [x, y] of k.corners(SM, 7)) out.push(screwAt(x, y, SM_Z, 1.4));
  // four sub-units along the back: the register file, then three function units with fins
  const reg = { x: SM.x + 12, y: SM.y + 12, w: 96, d: 70, r: 0.8 };
  out.push(S(k.slabOf(reg, SM_Z, 16, P, 2, 0.4), { tone: "mid", crease: "lo", inner: L(k.sideSeam(reg, SM_Z + 4, P, 2), { tone: "faint" }) }));
  const grid = [];
  for (let i = 0; i <= 12; i++) grid.push(k.lineOnTop([reg.x + 4 + i * 7.33, reg.y + 4], [reg.x + 4 + i * 7.33, reg.y + reg.d - 16], SM_Z + 16, P));
  for (let i = 0; i <= 7; i++) grid.push(k.lineOnTop([reg.x + 4, reg.y + 4 + i * 7.14], [reg.x + 92, reg.y + 4 + i * 7.14], SM_Z + 16, P));
  out.push(L(grid.join(""), { tone: "lo" }), topText(reg.x + 48, reg.y + reg.d - 7, SM_Z + 16.02, "REGISTER FILE", 4.4));
  for (let u = 0; u < 3; u++) {
    const x = SM.x + 116 + u * 37, y = SM.y + 12;
    out.push(box(x, y, 32, 70, SM_Z, 20, "mid", { style: { inner: L(k.sideSeam({ x, y, w: 32, d: 70, r: 0.4 }, SM_Z + 3, P, 2), { tone: "faint" }) } }));
    const fins = [];
    for (let i = 0; i < 11; i++) fins.push(k.lineOnTop([x + 3, y + 5 + i * 5.2], [x + 29, y + 5 + i * 5.2], SM_Z + 20, P));
    out.push(L(fins.join(""), { tone: "lo" }), L(k.planOutline({ x: x + 3, y: y + 5, w: 26, d: 52, r: 0 }, SM_Z + 20, P, 1), { tone: "lo" }));
    out.push(topText(x + 16, y + 63, SM_Z + 20.02, ["ALU", "FPU", "SFU"][u], 4));
  }
  return out.join("");
}
function loadUnit() {
  const out = [`<path class="iso-halo" d="${k.haloOf(LOAD, SM_Z, 4, P)}" style="opacity:.7"/>`];
  out.push(S(k.slabOf(k.insetPlan(LOAD, 2), SM_Z, 5, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  out.push(S(k.slabOf(LOAD, SM_Z + 5, LOAD_TOP - SM_Z - 5, P, 2, 0.5), { tone: "mid", crease: "lo", inner: L(k.sideSeam(LOAD, LOAD_TOP - 3, P, 2) + k.sideSeam(LOAD, SM_Z + 9, P, 2), { tone: "faint" }) }));
  for (const [x, y] of k.corners(LOAD, 3)) out.push(screwAt(x, y, LOAD_TOP, 0.9));
  // the receiving hopper on top, where a value comes in
  const hop = { x: LOAD.x + 54, y: LOAD.y + 26, w: 46, d: 46, r: 1 };
  out.push(S(k.slabOf(hop, LOAD_TOP, 3, P, 2, 0.3), { tone: "hi", crease: "lo" }));
  out.push(`<path class="cl-well" d="${k.planOutline(k.insetPlan(hop, 3), LOAD_TOP + 3.01, P, 2)}"/>`, L(k.planOutline(k.insetPlan(hop, 3), LOAD_TOP + 3.01, P, 2), { tone: "lo" }));
  // a queue of four pending-load lamps
  for (let i = 0; i < 4; i++) out.push(lamp(LOAD.x + 14 + i * 9, LOAD.y + 12, LOAD_TOP + 0.02, 2.2, 'data-q="' + i + '"'));
  out.push(topText(LOAD.x + 27, LOAD.y + 22, LOAD_TOP + 0.02, "LOAD QUEUE", 3.2));
  out.push(L(k.planOutline({ x: LOAD.x + 8, y: LOAD.y + 34, w: 38, d: 62, r: 0.6 }, LOAD_TOP, P, 2), { tone: "lo" }));
  for (let i = 0; i < 6; i++) out.push(L(k.lineOnTop([LOAD.x + 8, LOAD.y + 42 + i * 9], [LOAD.x + 46, LOAD.y + 42 + i * 9], LOAD_TOP, P), { tone: "faint" }));
  const fy = LOAD.y + LOAD.d;
  out.push(lcdAt("load", LOAD.x + 5, LOAD.x + 107, 34, 54, fy, "LOAD UNIT · LAST READ", 8.4));
  out.push(vents(LOAD.x + 8, 15, 6.4, 3, 18, 28, fy));
  return out.join("");
}
function warpBar() {
  // one warp: 32 thread pads in a row, each lamp lit when that thread's read has come back
  const plan = { x: SM.x + 12, y: SM.y + 214, w: 220, d: 50, r: 1 };
  const out = [S(k.slabOf(plan, SM_Z, 7, P, 2, 0.4), { tone: "mid", crease: "lo" })];
  const z = SM_Z + 7;
  out.push(L(k.planOutline(k.insetPlan(plan, 2.4), z, P, 2), { tone: "faint" }));
  for (let i = 0; i < 32; i++) {
    const x = plan.x + 6.5 + i * 6.65;
    out.push(L(k.planOutline({ x: x - 2.4, y: plan.y + 8, w: 4.8, d: 15, r: 0.4 }, z, P, 1), { tone: "lo" }));
    out.push(lamp(x, plan.y + 15.5, z + 0.02, 1.7, `data-thread="${i}"`));
  }
  out.push(topText(plan.x + 56, plan.y + 31, z + 0.02, "ONE WARP · 32 THREADS", 4.2));
  out.push(`<g transform="${k.topMatrix([plan.x + 6, plan.y + 36], z + 0.02, P, "x")}">`);
  out.push(`<path class="cl-lcd" d="M0 0H208V10H0Z"/><text class="cl-lcd-text" data-warp x="204" y="7.7" font-size="6.2" text-anchor="end"></text><text class="cl-lcd-unit" x="3" y="6.6" font-size="3.2">LINES TOUCHED</text></g>`);
  out.push(L(k.planOutline({ x: plan.x + 6, y: plan.y + 36, w: 208, d: 10, r: 0 }, z + 0.02, P, 1), { tone: "lo" }));
  return out.join("");
}

// ---------- the L1 housing: pedestal, walls, the rack in its window ----------
function housing() {
  const out = [`<path class="iso-halo" d="${k.haloOf(HOUSE, 0, 4, P)}" style="opacity:.7"/>`];
  out.push(S(k.slabOf(k.insetPlan(HOUSE, 3), 0, 5, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  const seam = k.sideSeam(HOUSE, HOUSE_TOP - 4, P, 2) + k.sideSeam(HOUSE, 9, P, 2);
  out.push(S(k.slabOf(HOUSE, 5, HOUSE_TOP - 5, P, 2, 0.3), { tone: "mid", crease: "lo", className: "cl-case", inner: L(seam, { tone: "faint" }) }));
  // the floor of the cut: a darker cavity
  out.push(`<path class="cl-cavity" d="${k.planOutline(k.insetPlan(HOUSE, 1), HOUSE_TOP + 0.01, P, 2)}"/>`);
  // back wall and left wall stand; the rest of the case has been cut away
  const back = { x: HOUSE.x, y: HOUSE.y, w: HOUSE.w, d: 8, r: 0.4 };
  out.push(S(k.slabOf(back, HOUSE_TOP, WALL_TOP - HOUSE_TOP, P, 2, 0.3), { tone: "mid", crease: "lo" }));
  const left = { x: HOUSE.x, y: HOUSE.y + 8, w: 6, d: HOUSE.d - 8, r: 0.3 };
  out.push(S(k.slabOf(left, HOUSE_TOP, 12, P, 2, 0.3), { tone: "mid", crease: "lo" }));
  const lid = { x: HOUSE.x - 2, y: HOUSE.y - 2, w: HOUSE.w + 4, d: 15, r: 0.8 };
  out.push(S(k.slabOf(lid, WALL_TOP, 3, P, 2, 0.4), { tone: "mid", crease: "lo", className: "so" }));
  for (let x = lid.x + 8; x < lid.x + lid.w - 4; x += 30) out.push(screwAt(x, lid.y + 7.5, WALL_TOP + 3, 0.8));
  out.push(topText(lid.x + 200, lid.y + 7.5, WALL_TOP + 3.02, "L1 DATA · 16 LINES · 128 B", 4.6));
  // inside of the back wall: a rule of slot numbers would be noise; a row of vent slots is real
  out.push(vents(HOUSE.x + 14, 34, 7, 3.2, HOUSE_TOP + 12, HOUSE_TOP + 28, HOUSE.y + 8));
  // slot channels: 17 thin rails, one each side of a tray
  for (let i = 0; i <= 16; i++) {
    const y = rowY(i) - PITCH / 2;
    out.push(box(X0 - 4, y - 0.7, TRAY_LEN + 6, 1.4, HOUSE_TOP, 3.4, "lo", { bevel: 0, style: { crease: "none" } }));
  }
  // the tag lookup: a bus bar with one comparator per slot
  out.push(box(BAR.x, rowY(0) - 6, BAR.w, 172, HOUSE_TOP, 3, "hi"));
  for (let i = 0; i < 16; i++) {
    const y = rowY(i);
    out.push(L(k.lineOnTop([BAR.x + BAR.w, y], [TAGS.x0, y], HOUSE_TOP + 1.4, P), { tone: "mid" }));
    out.push(box(TAGS.x0, y - 4, TAGS.x1 - TAGS.x0, 8, HOUSE_TOP, 3, "mid"));
    const z = HOUSE_TOP + 3.01;
    out.push(`<g transform="${k.topMatrix([TAGS.x0 + 1.4, y - 3.1], z, P, "x")}"><path class="cl-lcd" d="M0 0H50V6.2H0Z"/><text class="cl-lcd-text" data-tagtext="${i}" x="2" y="4.9" font-size="4.6"></text><text class="cl-lcd-unit" data-tagname="${i}" x="48" y="4.9" font-size="3.8" text-anchor="end"></text></g>`);
    out.push(lamp(TAGS.x1 - 5.2, y, z, 2.1, `data-cmp="${i}"`));
    out.push(`<g data-oldest="${i}" style="display:none">${L(k.onTop([[X0 - 8, y - 2.4], [X0 - 4.6, y], [X0 - 8, y + 2.4]], HOUSE_TOP + 3.02, P, true), { tone: "lit" })}</g>`);
    out.push(topText(TAGS.x1 + 0.6, y, HOUSE_TOP + 0.04, String(i).padStart(2, "0"), 3.2, "", "cl-mark", "start"));
  }
  return out.join("");
}
function housingFront() {
  const out = [];
  // the saw-cut near wall, down to a sill, and the panel of counters on the case front
  const sill = { x: HOUSE.x + 6, y: FRONT - 5, w: HOUSE.w - 6, d: 5, r: 0.3 };
  out.push(S(k.slabOf(sill, HOUSE_TOP, SILL - HOUSE_TOP, P, 2, 0.2), { tone: "hi", crease: "lo", className: "cl-cut" }));
  out.push(lcdAt("hits", HOUSE.x + 8, HOUSE.x + 60, 30, 52, FRONT, "HITS · THIS PASS", 13));
  out.push(lcdAt("misses", HOUSE.x + 64, HOUSE.x + 116, 30, 52, FRONT, "MISSES · THIS PASS", 13));
  out.push(lcdAt("free", HOUSE.x + 120, HOUSE.x + 172, 30, 52, FRONT, "FREE SLOTS", 13));
  out.push(lcdAt("evicted", HOUSE.x + 176, HOUSE.x + 228, 30, 52, FRONT, "EVICTED", 13));
  out.push(vents(HOUSE.x + 12, 34, 6.8, 3, 13, 24, FRONT));
  for (const x of [HOUSE.x + 5, HOUSE.x + HOUSE.w - 5]) out.push(`<g transform="${planeOf(FRONT)}">${L(flat(x - 1.2, 54.2, x + 1.2, 56.6, 1.1), { tone: "lo" })}</g>`);
  return out.join("");
}
function latch() {
  const out = [S(k.slabOf(LATCH, HOUSE_TOP, 4, P, 2, 0.3), { tone: "mid", crease: "lo" })];
  const z = HOUSE_TOP + 4;
  // the address register: 16 bit pads, split into its three fields
  const fields = [{ n: M.ADDR.tagBits, name: "TAG · WHICH LINE" }, { n: M.ADDR.cellBits, name: "SLOT IN TRAY" }, { n: M.ADDR.byteBits, name: "BYTE" }];
  let x = LATCH.x + 4, bit = M.ADDR.bits - 1;
  for (const f of fields) {
    const start = x;
    for (let i = 0; i < f.n; i++) {
      out.push(L(k.planOutline({ x: x, y: LATCH.y + 3, w: 9, d: 11, r: 0.5 }, z, P, 1), { tone: "lo" }));
      out.push(`<path class="cl-bit" data-bit="${bit}" d="${k.planOutline({ x: x + 1.2, y: LATCH.y + 4.4, w: 6.6, d: 8.2, r: 0.3 }, z + 0.01, P, 1)}"/>`);
      x += 10; bit--;
    }
    out.push(L(k.onTop([[start, LATCH.y + 15], [start, LATCH.y + 17], [x - 1, LATCH.y + 17], [x - 1, LATCH.y + 15]], z, P), { tone: "mid", free: true }));
    out.push(topText((start + x - 1) / 2, LATCH.y + 21.5, z + 0.02, f.name, f.n < 3 ? 3.2 : 3.8));
    x += 2;
  }
  // the address in hex, and the bar that carries the tag to the comparators
  out.push(`<g transform="${k.topMatrix([LATCH.x + 174, LATCH.y + 3], z + 0.01, P, "x")}"><path class="cl-lcd" d="M0 0H62V19H0Z"/><text class="cl-lcd-unit" x="3" y="5" font-size="3.4">ADDRESS</text><text class="cl-lcd-text" data-addr x="59" y="16" font-size="10" text-anchor="end"></text></g>`);
  out.push(L(k.planOutline({ x: LATCH.x + 174, y: LATCH.y + 3, w: 62, d: 19, r: 0 }, z + 0.01, P, 1), { tone: "lo" }));
  return out.join("");
}

// One tray of 32 cells, built at y = 0 with its first cell at X0. Used for the rack, the bus and the bin.
function trayBody(y, z, digits = true) {
  const plan = { x: X0 - 2, y: y - TRAY_D / 2, w: TRAY_LEN, d: TRAY_D, r: 0.4 };
  const out = [S(k.slabOf(plan, z, TRAY_H, P, 2, 0), { tone: "hi", crease: "lo", className: "cl-tray" })];
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    cells.push(`<rect class="cl-cell" data-c="${i}" x="${i * CELL + 0.2}" y="0.5" width="${CELL - 0.4}" height="${TRAY_D - 1}"/>`);
    if (digits) cells.push(`<text class="cl-digit" data-d="${i}" x="${i * CELL + CELL / 2}" y="5.2" font-size="3.6" text-anchor="middle"></text>`);
  }
  out.push(`<g transform="${k.topMatrix([X0, y - TRAY_D / 2], z + TRAY_H + 0.01, P, "x")}">${cells.join("")}</g>`);
  return out.join("");
}
function rack() {
  return Array.from({ length: 16 }, (_, i) => `<g data-slot="${i}" style="display:none">${trayBody(rowY(i), TZ)}</g>`).join("");
}

// ---------- the bus: deck, ramp, bin ----------
function bin() {
  const plan = { x: 96, y: -206, w: 132, d: 128, r: 1 };
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, 3, P)}" style="opacity:.5"/>`, S(k.slabOf(plan, 0, 9, P, 2, 0.4), { tone: "mid", crease: "lo", inner: L(k.sideSeam(plan, 3, P, 2), { tone: "faint" }) })];
  const well = k.insetPlan(plan, 4);
  out.push(`<path class="cl-well" d="${k.planOutline(well, 9.01, P, 2)}"/>`, L(k.planOutline(well, 9.01, P, 2), { tone: "lo" }));
  for (const [x, y] of k.corners(plan, 2)) out.push(screwAt(x, y, 9, 0.7));
  return out.join("");
}
const slant = (o, end, poly) => { const a = G.unit3(G.sub3(end, o)); const F = G.frameOf(o, a, [1, 0, 0], G.cross3(a, [1, 0, 0])); return G.prismOf(F, poly, 0, G.len3(G.sub3(end, o)), P); };
function deckBack() {
  const out = [];
  // posts under the back of the deck and the ramp head
  for (const [x, y] of [[RAIL.x0, DECK_Y[0] + 4], [RAIL.x1, DECK_Y[0] + 4], [RAIL.x0, -128], [RAIL.x1, -128], [RAIL.x0, DECK_Y[1] - 4], [RAIL.x1, DECK_Y[1] - 4]]) {
    out.push(`<path class="iso-halo" d="${k.haloOf({ x: x - 5, y: y - 5, w: 10, d: 10, r: 1 }, 0, 2, P)}" style="opacity:.5"/>`);
    out.push(S(k.slabOf({ x: x - 4, y: y - 4, w: 8, d: 8, r: 0.5 }, 0, 2.4, P, 2, 0.2), { tone: "lo", crease: "lo" }));
    out.push(S(k.slabOf({ x: x - 1.8, y: y - 1.8, w: 3.6, d: 3.6, r: 0.3 }, 2.4, TZ - 5 - 2.4, P, 2, 0), { tone: "mid", crease: "lo" }));
  }
  return out.join("");
}
function deck() {
  const out = [];
  const z = TZ - 3;
  // cross ties, then the two long rails, then the row stops along the near rail
  for (const y of [DECK_Y[0] + 2, -128, DECK_Y[1] - 4]) out.push(box(RAIL.x0, y - 2, RAIL.x1 - RAIL.x0, 4, z - 2, 2, "lo"));
  for (const x of [RAIL.x0, RAIL.x1]) {
    out.push(S(k.slabOf({ x: x - 2, y: DECK_Y[0], w: 4, d: DECK_Y[1] - DECK_Y[0], r: 0.3 }, z, 3, P, 2, 0), { tone: "hi", crease: "lo" }));
  }
  const notches = [];
  for (let i = 0; i < 16; i++) notches.push(k.lineOnTop([RAIL.x1 - 2, rowY(i)], [RAIL.x1 + 2, rowY(i)], z + 3, P));
  out.push(L(notches.join(""), { tone: "lo" }));
  // the ramp: a sloped bed of 32 lanes between two sloped rails
  const a = [0, RAMP.y0, RAMP.z0], b = [0, RAMP.y1, RAMP.z1];
  const offset = (p, x, dz = 0) => [x, p[1], p[2] + dz];
  out.push(S(slant(offset(a, 160, -5), offset(b, 160, -5), [[-74, -1.2], [74, -1.2], [74, 1.2], [-74, 1.2]]), { tone: "lo", crease: "lo" }));
  const lanes = [];
  for (let i = 0; i <= 32; i++) { const x = 86 + i * (148 / 32); lanes.push(k.segment(offset(a, x, -3.6), offset(b, x, -3.6), P)); }
  const rungs = [];
  for (let i = 1; i < 8; i++) { const t = i / 8; const p = G.lerp3(a, b, t); rungs.push(k.segment(offset(p, 86, -3.6), offset(p, 234, -3.6), P)); }
  out.push(L(lanes.join(""), { tone: "faint" }), L(rungs.join(""), { tone: "lo" }));
  for (const x of [RAIL.x0, RAIL.x1]) out.push(S(slant(offset(a, x), offset(b, x), [[-2, -1.5], [2, -1.5], [2, 1.5], [-2, 1.5]]), { tone: "hi", crease: "lo" }));
  // two struts from the bench up to the ramp, near its foot
  return out.join("");
}

// ---------- the strip of numbers and the VRAM ----------
function stripBed() {
  const bed = { x: STRIP.x0, y: STRIP.y0, w: STRIP.x1 - STRIP.x0, d: STRIP.y1 - STRIP.y0, r: 1.2 };
  const out = [`<path class="iso-halo" d="${k.haloOf(bed, 0, 3, P)}" style="opacity:.6"/>`, S(k.slabOf(bed, 0, STRIP.z, P, 2, 0.4), { tone: "mid", crease: "lo" })];
  for (let x = bed.x + 8; x < bed.x + bed.w; x += 58) for (const y of [bed.y + 3, bed.y + bed.d - 3]) out.push(screwAt(x, y, STRIP.z, 0.7));
  // the address map: every tick is one line of the whole 16-bit space, 512 in all
  const ruler = { x: MAP.x0, y: MAP.y, w: MAP.x1 - MAP.x0, d: MAP.d, r: 0 };
  out.push(`<path class="cl-well" d="${k.planOutline(ruler, STRIP.z + 0.01, P, 1)}"/>`, L(k.planOutline(ruler, STRIP.z + 0.01, P, 1), { tone: "lo" }));
  const major = [];
  for (let i = 0; i <= 512; i += 64) { const x = mapX(i); major.push(k.lineOnTop([x, MAP.y], [x, MAP.y + MAP.d], STRIP.z + 0.02, P)); }
  out.push(L(major.join(""), { tone: "lo" }));
  out.push(`<path class="iso-line cl-map" data-map d=""/>`);
  // the tape channel and the window it runs under
  const channel = { x: STRIP.x0 + 2, y: TAPE.y0 - 2, w: STRIP.x1 - STRIP.x0 - 4, d: TAPE.y1 - TAPE.y0 + 4, r: 0 };
  out.push(`<path class="cl-well" d="${k.planOutline(channel, STRIP.z + 0.02, P, 1)}"/>`);
  return out.join("");
}
const mapX = (tag) => MAP.x0 + (tag / 512) * (MAP.x1 - MAP.x0);
function stripLine(g) {
  const cells = [];
  for (let i = 0; i < CELLS; i++) {
    cells.push(`<rect class="cl-cell" data-c="${i}" x="${i * CELL + 0.2}" y="0.5" width="${CELL - 0.4}" height="${TAPE.y1 - TAPE.y0 - 1}"/>`);
    cells.push(`<text class="cl-digit" data-d="${i}" x="${i * CELL + CELL / 2}" y="${(TAPE.y1 - TAPE.y0) / 2 + 1.5}" font-size="3.8" text-anchor="middle"></text>`);
  }
  return `<g data-strip="${g}" style="display:none"><g transform="${k.topMatrix([PICK_X, TAPE.y0], TAPE.z, P, "x")}"><rect class="cl-line-bg" x="-0.6" y="-1" width="${LINE_W + 1.2}" height="${TAPE.y1 - TAPE.y0 + 2}"/>${cells.join("")}<text class="cl-line-name" data-name x="1" y="-2" font-size="3.6"></text><path class="cl-line-end" d="M${LINE_W + 1} -1V${TAPE.y1 - TAPE.y0 + 1}"/></g></g>`;
}
function strip() {
  const c = [[STRIP.x0 + 2, TAPE.y0 - 7], [STRIP.x1 - 2, TAPE.y0 - 7], [STRIP.x1 - 2, TAPE.y1 + 2], [STRIP.x0 + 2, TAPE.y1 + 2]].map(([x, y]) => at([x, y, TAPE.z]));
  return `<clipPath id="cl-tape"><path d="${k.pathOf(c, true)}"/></clipPath><g clip-path="url(#cl-tape)">${Array.from({ length: 6 }, (_, g) => stripLine(g)).join("")}</g>`;
}
function reel(x, name) {
  const y = (TAPE.y0 + TAPE.y1) / 2, z = 8;
  const out = [S(k.cylinder(x, y, 27, z, 2.4, P, 48, 0.4), { tone: "mid", crease: "lo" })];
  out.push(S(k.cylinder(x, y, 19, z + 2.4, 13, P, 48, 0.4), { tone: "lo", crease: "lo" }));
  out.push(L(k.ring(x, y, 19, z + 15.41, P, 48).slice(0), { tone: "lo" }), S(k.cylinder(x, y, 27, z + 15.4, 1.8, P, 48, 0.3), { tone: "hi", crease: "lo" }));
  const face = z + 17.2;
  out.push(S(k.cylinder(x, y, 7, face, 3, P, 28, 0.3), { tone: "mid", crease: "lo" }));
  out.push(L(k.knurl(x, y, 7, face + 0.4, face + 2.6, 28, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(x, y, 22, face, P, 44), { tone: "faint" }));
  out.push(`<path class="iso-line" data-tone="mid" data-free="start" data-reel="${name}" d="${k.lineOnTop([x + 9, y], [x + 21, y], face, P)}"/>`);
  return out.join("");
}
function gantry() {
  const out = [];
  const x0 = RAIL.x0 - 7, x1 = RAIL.x1 + 3, y = 101;
  // the head that lifts a whole line clear of the strip
  for (const x of [x0, x1]) {
    out.push(box(x, y - 8, 4, 16, STRIP.z, 40, "hi"));
  }
  out.push(box(x0 - 2, y - 7, x1 - x0 + 8, 14, STRIP.z + 40, 5, "mid"));
  const z = STRIP.z + 45;
  for (let i = 0; i < 8; i++) out.push(screwAt(x0 + 8 + i * 25, y, z, 0.8));
  out.push(`<g transform="${planeOf(y + 7)}">${L(flat(x0 + 16, STRIP.z + 41, x1 - 12, STRIP.z + 44, 0.4, 2), { tone: "lo" })}</g>`);
  out.push(lamp(x0 + 6, y + 3.6, z + 0.02, 1.7, 'data-gantry'));
  return out.join("");
}
function chip() {
  const out = [];
  // a little PCB, solder balls at its edge, the package, the die lid
  const pcb = { x: CHIP.x - 16, y: CHIP.y - 16, w: CHIP.w + 32, d: CHIP.d + 22, r: 1.5 };
  out.push(`<path class="iso-halo" d="${k.haloOf(pcb, 0, 3, P)}" style="opacity:.6"/>`);
  out.push(S(k.slabOf(pcb, 0, 3, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  for (const [x, y] of k.corners(pcb, 3.5)) out.push(screwAt(x, y, 3, 0.9));
  // a flex tape from the strip bed to the package, its traces running edge to edge
  const flexTape = { x: 88, y: STRIP.y1, w: 148, d: CHIP.y - STRIP.y1 + 2, r: 0 };
  out.push(S(k.slabOf(flexTape, 0, 3.6, P, 2, 0), { tone: "lo", crease: "lo" }));
  const flex = [];
  for (let i = 0; i < 24; i++) { const x = 92 + i * 6; flex.push(k.lineOnTop([x, STRIP.y1], [x, CHIP.y + 2], 3.61, P)); }
  out.push(L(flex.join(""), { tone: "mid" }));
  out.push(S(k.slabOf(CHIP, 3, 2, P, 2, 0.2), { tone: "lo", crease: "lo" }));
  const pack = k.insetPlan(CHIP, 3);
  out.push(S(k.slabOf(pack, 5, 8, P, 2, 0.5), { tone: "mid", crease: "lo", inner: L(k.sideSeam(pack, 8, P, 2), { tone: "faint" }) }));
  const z = 13;
  // twelve memory banks under the lid, drawn as the outline of the package marking
  out.push(L(k.planOutline(k.insetPlan(pack, 3), z, P, 2), { tone: "faint" }));
  const banks = [];
  for (let c = 0; c < 8; c++) for (let r = 0; r < 2; r++) banks.push(k.planOutline({ x: pack.x + 8 + c * 33.8, y: pack.y + 8 + r * 31, w: 30, d: 26, r: 0.4 }, z, P, 1));
  out.push(L(banks.join(""), { tone: "lo" }));
  const dots = [];
  for (let c = 0; c < 8; c++) for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) dots.push(at([pack.x + 11 + c * 33.8 + i * 5.8, pack.y + 12 + r * 31 + j * 5.8, z]));
  out.push(D(dots, { size: 0.28, tone: "lo" }));
  out.push(L(k.ring(pack.x + 6, pack.y + pack.d - 6, 2, z, P, 14), { tone: "mid" }));
  return out.join("") + topText(pack.x + pack.w / 2, pack.y + pack.d - 9, z + 0.02, "VRAM · 128 B A LINE", 5.6);
}

// ---------- counters and the bytes meter ----------
function counters() {
  const out = [`<path class="iso-halo" d="${k.haloOf(COUNT, 0, 4, P)}" style="opacity:.7"/>`];
  out.push(S(k.slabOf(COUNT, 0, COUNT_TOP, P, 2, 0.4), { tone: "mid", crease: "lo", inner: L(k.sideSeam(COUNT, 4, P, 2), { tone: "faint" }) }));
  for (const [x, y] of k.corners(COUNT, 3)) out.push(screwAt(x, y, COUNT_TOP, 1));
  const z = COUNT_TOP;
  // two tally lamps, then three counters and the running line
  for (const [i, name, word] of [[0, "hit", "HIT"], [1, "miss", "MISS"]]) {
    const y = COUNT.y + 26 + i * 44;
    out.push(lamp(COUNT.x + 22, y, z + 0.02, 8, `data-tally=${name}`), L(k.ring(COUNT.x + 22, y, 10.5, z, P, 30), { tone: "mid" }));
    out.push(topText(COUNT.x + 22, y + 15, z + 0.02, word, 4.6));
  }
  out.push(lcdFlat("c-hits", COUNT.x + 42, COUNT.y + 7, 130, 50, z, "HITS", 24));
  out.push(lcdFlat("c-misses", COUNT.x + 178, COUNT.y + 7, 130, 50, z, "MISSES", 24));
  out.push(lcdFlat("c-rate", COUNT.x + 314, COUNT.y + 7, 134, 50, z, "HIT RATE", 24));
  out.push(`<g transform="${k.topMatrix([COUNT.x + 42, COUNT.y + 63], z + 0.01, P, "x")}"><path class="cl-lcd" d="M0 0H406V34H0Z"/><text class="cl-lcd-unit" x="4" y="7" font-size="4.2">RUNNING</text><text class="cl-lcd-text" data-pass x="4" y="27" font-size="11"></text><text class="cl-lcd-text" data-read x="402" y="27" font-size="15" text-anchor="end"></text></g>`);
  for (const [x, y, w, d] of [[42, 7, 130, 50], [178, 7, 130, 50], [314, 7, 134, 50], [42, 63, 406, 34]]) out.push(L(k.planOutline({ x: COUNT.x + x, y: COUNT.y + y, w, d, r: 0 }, z + 0.01, P, 1), { tone: "lo" }));
  return out.join("");
}
function meter() {
  const out = [`<path class="iso-halo" d="${k.haloOf(METER, 0, 4, P)}" style="opacity:.7"/>`];
  out.push(S(k.slabOf(METER, 0, METER_TOP, P, 2, 0.4), { tone: "mid", crease: "lo", inner: L(k.sideSeam(METER, 4, P, 2), { tone: "faint" }) }));
  const z = METER_TOP;
  for (const [x, y] of k.corners(METER, 3)) out.push(screwAt(x, y, z, 1));
  out.push(`<g transform="${k.topMatrix([METER.x + 6, METER.y + 6], z + 0.01, P, "x")}"><path class="cl-lcd" d="M0 0H184V30H0Z"/><text class="cl-lcd-unit" x="3" y="6" font-size="3.8">BYTES FROM VRAM · THIS PASS</text><text class="cl-lcd-text" data-bytes x="180" y="26.5" font-size="19" text-anchor="end"></text></g>`);
  // two slide scales, true to one another: 0 to 40,960 bytes
  for (const [i, name] of [[0, "fetched"], [1, "used"]]) {
    const y = METER.y + 41 + i * 22;
    const track = { x: BYTES.x0, y, w: BYTES.x1 - BYTES.x0, d: 7, r: 0 };
    out.push(`<path class="cl-well" d="${k.planOutline(track, z + 0.01, P, 1)}"/>`, `<path class="cl-fill" data-fill="${name}" d=""/>`, L(k.planOutline(track, z + 0.01, P, 1), { tone: "lo" }));
    const ticks = k.topTicks(BYTES.x0, BYTES.x1, (BYTES.x1 - BYTES.x0) / 40, 10, y + 7, z, [1.6, 3], P, "x");
    out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
    out.push(topText(METER.x + 6, y + 3.5, z + 0.02, name.toUpperCase(), 3.8, "", "cl-engrave", "start"));
    out.push(`<g data-car="${name}">${box(BYTES.x0 - 1.4, y - 1.6, 2.8, 10.2, z, 2.4, "hi")}</g>`);
  }
  out.push(lcdFlat("useful", METER.x + 6, METER.y + 88, 184, 18, z, "USEFUL = USED ÷ FETCHED", 12));
  out.push(vents(METER.x + 10, 26, 6.8, 3, 9, 22, METER.y + METER.d));
  return out.join("");
}
const BYTES = { x0: METER.x + 36, x1: METER.x + 188, max: 40960 };
const lcdFlat = (name, x, y, w, d, z, unit, size = 9) => `<g transform="${k.topMatrix([x, y], z + 0.01, P, "x")}"><path class="cl-lcd" d="M0 0H${w}V${d}H0Z"/><text class="cl-lcd-unit" x="3" y="${size > 9 ? 7 : 9}" font-size="${size > 9 ? 4.2 : 3.8}">${unit}</text><text class="cl-lcd-text" data-lcd="${name}" x="${w - 3}" y="${d - 4}" font-size="${size}" text-anchor="end"></text></g>`;

// ---------- pools of moving parts ----------
const FLYERS = 12, EJECTORS = 8, CHITS = 5;
const flyers = () => Array.from({ length: FLYERS }, (_, i) => `<g data-flyer="${i}" style="display:none">${trayBody(0, TZ)}</g>`).join("");
const ejectors = () => Array.from({ length: EJECTORS }, (_, i) => `<g data-ejector="${i}" style="display:none">${trayBody(0, TZ, false)}</g>`).join("");
function chits() {
  return Array.from({ length: CHITS }, (_, i) => `<g data-chit="${i}" style="display:none">${S(k.slabOf({ x: -5, y: -4, w: 10, d: 8, r: 0.4 }, 0, 2.2, P, 2, 0), { tone: "hi", crease: "lo", className: "cl-chit" })}<text class="cl-chit-t" data-chit-t transform="${k.topMatrix([0, 0], 2.21, P, "x")}" y="2.2" font-size="6" text-anchor="middle"></text></g>`).join("");
}

// ---------- labels ----------
const LABELS = [
  { name: "Load unit", at: [LOAD.x + 30, LOAD.y + 40, LOAD_TOP], off: [-46, -38], align: "end" },
  { name: "Warp", at: [SM.x + 40, SM.y + 230, SM_Z + 7], off: [-56, -30], align: "end" },
  { name: "Tag lookup", at: [TAGS.x0 + 20, rowY(2), HOUSE_TOP + 3], off: [-92, -100], align: "end" },
  { name: "Rack: 16 line slots", at: [10, rowY(1), TZ + 2], off: [30, -116] },
  { name: "Address, split", at: [LATCH.x + 2, LATCH.y + 24, HOUSE_TOP + 4], off: [-30, 76], align: "end" },
  { name: "Bus", at: [205, 26, 41], off: [46, 50] },
  { name: "Bin: dropped lines", at: [228, -160, 9], off: [104, -74] },
  { name: "Bytes meter", at: [METER.x + 150, METER.y + 12, METER_TOP], off: [40, -40] },
  { name: "Array, in 128-byte lines", at: [-20, 107, TAPE.z], off: [20, -24] },
  { name: "Address map: one tick, one line", at: [mapX(490), MAP.y, STRIP.z], off: [-8, 66] },
  { name: "VRAM chip", at: [CHIP.x + 240, CHIP.y + 70, 13], off: [40, 48] },
];
function labels() {
  const out = [];
  for (const label of LABELS) {
    const [ax, ay] = at(label.at);
    const tx = Math.round(ax + label.off[0]), ty = Math.round(ay + label.off[1]);
    const align = label.align || "start";
    const ex = align === "start" ? tx - 3 : tx + 3;
    out.push(L(k.pathOf([[ax, ay], [ex, ty - 2.6]]), { tone: "mid", free: "end", className: "cl-leader" }));
    out.push(`<circle class="cl-pin" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="1.5"/>`);
    out.push(`<text class="cl-label" x="${tx}" y="${ty}" text-anchor="${align}">${label.name}</text>`);
  }
  return `<g class="cl-labels">${out.join("")}</g>`;
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "A cache on a bench. At the back left is a corner of a GPU streaming multiprocessor with a register file, function units, a load unit and a warp of 32 thread lamps. Beside it a cabinet with its top cut open shows a 16-bit address register split into tag, slot in tray and byte, a row of 16 tag comparators, and a rack of 16 slots, each holding a tray of 32 cells. A ramp and a deck carry whole trays up from a long strip of numbers grouped into 128-byte lines, wired to a VRAM chip at the front. A bin under the deck takes evicted trays. Counters and a bytes-from-VRAM meter stand at the front.",
  body: [
    bench(),
    smCorner(),
    loadUnit(),
    warpBar(),
    housing(),
    latch(),
    rack(),
    housingFront(),
    bin(),
    deckBack(),
    deck(),
    stripBed(),
    strip(),
    reel(STRIP.x0 - 6, "l"),
    reel(STRIP.x1 + 6, "r"),
    `<g data-layer="moving">${ejectors()}${flyers()}</g>`,
    gantry(),
    chip(),
    counters(),
    meter(),
    `<g data-layer="chits">${chits()}</g>`,
    labels(),
  ],
});

// ---------- page ----------
const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const GEO = { X0, CELL, TZ, DECK_DX, rows: Array.from({ length: 16 }, (_, i) => rowY(i)), PICK_X, STEP_X, TAPE_Y: (TAPE.y0 + TAPE.y1) / 2, TAPE_Z: TAPE.z, RAMP, DECK_Y, STRIP, MAP, BYTES, METER, METER_TOP, REEL: { l: [STRIP.x0 - 6, (TAPE.y0 + TAPE.y1) / 2], r: [STRIP.x1 + 6, (TAPE.y0 + TAPE.y1) / 2], z: 25.2 }, HOP: [LOAD.x + 77, LOAD.y + 49, LOAD_TOP + 3], BIN_Z: 10 };
const live = `
${modelSource}
const P = ${JSON.stringify(P)};
const GEO = ${JSON.stringify(GEO)};
const AX = ${JSON.stringify({ x: k.axisVector(P, [1, 0, 0]), y: k.axisVector(P, [0, 1, 0]), z: k.axisVector(P, [0, 0, 1]) })};
${readFileSync(join(HERE, "live.js"), "utf8")}
`;
const css = readFileSync(join(HERE, "cache-lines.css"), "utf8");

const steps = M.STEPS.map((step, i) => `<button class="cl-step" type="button" data-step="${i}"${i === 0 ? "" : " disabled"}><span class="cl-step-n">${String(i + 1).padStart(2, "0")}</span><span>${step.label}</span><span class="cl-step-fill" aria-hidden="true"></span></button>`).join("");
const chips = [["reads", "reads"], ["hits", "hits"], ["misses", "misses"], ["fetched", "fetched"], ["used", "used"], ["useful", "useful"], ["free", "into free slots"], ["evict", "evicted a line"], ["lines", "lines touched"]]
  .map(([key, name]) => `<span class="cl-chip"><span class="cl-chip-name">${name}</span><span class="cl-chip-value" data-chip="${key}">-</span></span>`).join("");
const ledger = `<div class="cl-ledger-wrap"><table class="cl-ledger" aria-label="Each pass, from the model"><thead><tr><th>pass</th><th>reads</th><th>hits</th><th>misses</th><th>fetched</th><th>used</th><th>useful</th><th>free slots filled</th><th>evictions</th><th>lines</th></tr></thead><tbody>${M.PASSES.map((p) => `<tr data-pass-row="${p.key}"><td>${p.label}</td>${"<td>·</td>".repeat(9)}</tr>`).join("")}</tbody></table></div>`;

const plateBox = k.plateHtml({
  fig: "Fig 5",
  title: "Why neighbours are cheap",
  hint: "Press the lit step",
  readout: "cache empty",
  keys: [
    { mark: "lit", label: "A lit cell: the program asked for it. Dark cells came along in the same tray" },
    { mark: "green", label: "Hit: the value comes off a tray already in the rack, and VRAM does nothing" },
    { mark: "red", label: "Miss: a whole tray comes up from VRAM. The arrow marks the oldest tray, next out" },
  ],
  caption: "",
  body: `<div class="iso-stage cl-stage">${svg}<span class="cl-sr" role="status" aria-live="polite" data-status></span></div>`,
});
const toy = `<ul class="cl-facts"><li><b>16 lines is a toy size,</b> chosen so eviction is visible. A real GPU L1 holds on the order of a hundred kilobytes, so about a thousand lines.</li><li><b>Hit and miss latencies are left out on purpose.</b> This model counts lines and bytes, not time, and the speed of the animation means nothing.</li></ul>`;
const notes = `<details class="cl-notes"><summary>Where the numbers come from</summary><ul>
<li><b>The model:</b> one pure function, written and tested before anything was drawn. It reads a list of addresses into a 16-line cache with 128-byte lines and least-recently-used eviction. Every counter, display, chip and table row comes from its output, and the trays land where it says.</li>
<li><b>Fetched and used:</b> fetched is misses × 128 bytes. Used counts each 4-byte cell the pass asked for once. Useful is used ÷ fetched.</li>
<li><b>Why re-reading every 32nd misses:</b> the pass touches 320 lines in a loop, the rack holds 16, and LRU evicts the line that will come back soonest in this pattern. No line survives until its turn comes round.</li>
<li><b>Real, and not the whole story: 128-byte lines.</b> NVIDIA forum answers and an H100 course slide describe L1 lines of 128 bytes, each split into four 32-byte sectors with its own status bits, and a miss fetches only the sectors it needs. So on real hardware a miss can bring 32 bytes rather than the whole 128, and this page's every-32nd case would be about 12.5% useful rather than 3.1%. The idea survives at a smaller grain: neighbours within a sector come along free. These are secondary sources and the details vary by GPU.</li>
<li><b>Fully associative:</b> any line can sit in any slot, which is what lets one LRU order cover all 16. So no address bits pick the rack slot: the tag is compared against all 16 at once, and the other field of the address picks the slot in the tray. Real L1s are set-associative, and the associativity and replacement policy vary and are mostly not published.</li>
<li><b>32 threads to a warp</b> is standard for NVIDIA GPUs. "Scattered" here means 32 different lines of a separate array, in a fixed shuffled order.</li>
<li><b>Made up for the figure:</b> the two-digit values in the cells are placeholders, and the addresses of the arrays are chosen so that they share no lines. Reads run one at a time.</li>
<li><b>Left out:</b> L2 and the memory controller, which a real miss goes through; prefetching; writes (a dropped tray here is simply gone, because VRAM still has the copy); several misses in flight on the same line.</li>
<li><b>The strip slides only so the figure can show the line in reach.</b> VRAM is not a tape, and any line can be reached directly. The address map on the bed behind the strip is to scale: 512 ticks, one per line of the 16-bit space.</li>
</ul></details>`;
const links = `<p class="cl-sources">Sources for the sector detail: <a href="https://forums.developer.nvidia.com/t/questions-about-cacheline-sector/325647">NVIDIA forum, cacheline and sector</a>, <a href="https://forums.developer.nvidia.com/t/the-granularity-of-l1-and-l2-caches/290065">NVIDIA forum, L1 and L2 granularity</a>, <a href="https://cudacourseh100.github.io/H100-Course/slides/1.%20Introduction%20to%20H100.pdf">H100 course slides</a>.</p>`;

const body = `<style>${css}</style><div class="cl-layout"><nav class="cl-steps" aria-label="Steps">${steps}<button class="cl-toggle" type="button" aria-pressed="true" data-labels>Labels: on</button></nav><div class="cl-main">${plateBox}<p class="cl-say" data-say aria-live="polite"></p><div class="cl-chips" aria-label="Live numbers">${chips}</div><p class="cl-idea"><b>The big idea:</b> a cache moves whole lines, so neighbours come along free.</p>${toy}${ledger}${notes}${links}</div></div>`;

const name = theme === "light" ? "cache-lines-light.html" : "cache-lines.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Cache Lines", theme, body, script: kitScript() + live, width: 1240 }));
console.log("wrote", name, (svg.length / 1024).toFixed(0) + " KB svg");

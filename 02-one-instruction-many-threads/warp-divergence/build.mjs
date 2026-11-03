import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/danielreyes/.claude/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "/Users/danielreyes/.claude/skills/anatomy/scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 900;
const HEIGHT = 640;

// World: x along the 32 lanes, y from the readout rack (back) to the slot board (front), z up.
const PLATE = { x: -304, y: -228, w: 588, d: 404, r: 10 };
const RACK = { x: -290, y: -220, w: 560, d: 34, r: 4 };
const RACK_TOP = 54;
const RACK_FRONT = RACK.y + RACK.d;

// Lanes: 32 columns, 12.5 units apart, lined up through the tray, the mask lights, the lanes,
// the warp cartridges and the slot board.
const LANE = { x0: -168, pitch: 12.5, w: 10.6 };
const laneX = (lane) => LANE.x0 + lane * LANE.pitch + (LANE.pitch - LANE.w) / 2;
const laneMid = (lane) => LANE.x0 + lane * LANE.pitch + LANE.pitch / 2;
const BANK = { x0: -172, x1: 236 };
const HOUSE = { x: -186, y: -180, w: 456, d: 186, r: 3 };
const FLOOR = 8; // top of the SM floor
const WALL = 34; // full wall height
const SILL = 15; // the cut-down near walls
const WELL = { x: -180, y: -174, w: 444, d: 42 };
const RIM = 32; // top of the top tray
const TRAY = { x: -177, y: -171, w: 438, d: 36, r: 1.2 };
const TRAY_H = 4;
const TRAY_DOT_Y = -159;
const SPRINGS = [-150, -70, 10, 90, 170, 245];
const SPRING_Y = -153;
const SPRING_R = 5.5;
const MASKR = { y: -126, d: 13, top: 16 };
const LIGHT_Y = MASKR.y + MASKR.d / 2;
const LANEBOX = { y: -108, d: 100 };
const CORE = { y: -106, d: 20, top: 22 };
const PLED_Y = -80;
const DISPLAY = { y: -74, d: 62, top: 15 };
const ROW_Y = { x: -64, y: -48, z: -32 };
const RULER = { y: -6, d: 5 };

// In front of the SM: two warp cartridges, then the slot board.
const DOCK = { x: -186, y: 14, w: 456, d: 70, r: 3 };
const CART = { a: { y: 22, d: 16 }, b: { y: 52, d: 16 } };
const CART_TOP = 10;
const PEG_R = 3.1;
const PEG_H = 3.2;
const BOARD = { x: -186, y: 92, w: 456, d: 78, r: 3 };
const BOARD_ROWS = 9;
const BOARD_ROW0 = 100;
const BOARD_PITCH = 7.6;

// The instruction tape on the left, with its read head carrying the program counter.
const BED = { x: -290, y: -150, w: 80, d: 222, r: 2 };
const BED_TOP = 5;
const TAPE = { x: -278, w: 56 };
const ROW0 = -146;
const ROW_D = 36;
const rowY = (pc) => ROW0 + pc * ROW_D + ROW_D / 2;
const RAILS_X = [-288, -214];
const HEAD_Z = 16;
const BOX_BACK = { x: -294, y: -180, w: 88, d: 26, r: 2 };
const BOX_FRONT = { x: -294, y: 76, w: 88, d: 30, r: 2 };
const CODE = { x: -294, y: 116, w: 88, d: 52, r: 1.5 };

const DIAL = { at: [234, -203], r: 14 };
const DIAL_TOP = RACK_TOP + 7;
const SWEEP = [-0.75 * Math.PI, 1.5 * Math.PI];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -16, 0), ...k.boxCorners(RACK, 0, DIAL_TOP + 2), [WELL.x, WELL.y, RIM + 40]],
  WIDTH,
  HEIGHT,
  { pad: 16, azimuth: 50, elevation: 40 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth = (x, y, z = 0) => k.depthOf([x, y, z], P);
const byDepth = (list, centre) => [...list].sort((a, b) => depth(...centre(a)) - depth(...centre(b)));
const planeOf = (y) => k.sideMatrix([0, y], 0, P, "left");
const flat = (x0, z0, x1, z1, r, steps = 6) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const screwAt = (x, y, z, r = 1.6) => L(k.ring(x, y, r, z, P, 14), { tone: "lo" }) + D([at([x, y, z])], { size: 0.45 });
const span = (x0, x1, y, d, r = 1) => ({ x: x0, y, w: x1 - x0, d, r });
const topText = (x, y, z, text, size, attrs = "", cls = "wd-val", anchor = "middle") => `<text class="${cls}" ${attrs} transform="${k.topMatrix([x, y], z, P, "x")}" x="0" y="${(size * 0.36).toFixed(2)}" font-size="${size}" text-anchor="${anchor}">${text}</text>`;

// ---------- windows on the rack's front face ----------
let clips = 0;
function recess({ x0, x1, z0, z1, r, depth: deep }, y, back = "") {
  const id = `wd-clip-${clips++}`;
  const ring = k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 4);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const { sinA } = k.cameraOf(P);
  const tops = [];
  const sides = [[], [], [], []];
  ring.forEach(([ax, az], index) => {
    const [bx, bz] = ring[(index + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [(bz - az) / length, -(bx - ax) / length];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    if (nx <= 0 && nz <= 0) return;
    const quad = k.pathOf([at([ax, y, az]), at([bx, y, bz]), at([bx, y - deep, bz]), at([ax, y - deep, az])], true);
    if (nz >= nx) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((nx * -sinA + 1) / 2) * 4)))].push(quad);
  });
  const shape = flat(x0, z0, x1, z1, r, 4);
  return [
    `<clipPath id="${id}"><path transform="${planeOf(y)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d}"/>` : "")),
    `<g transform="${planeOf(y - deep)}"><path class="wd-lcd" d="${shape}"/>${back}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    `</g>`,
    `<g transform="${planeOf(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}

// ---------- bench plate ----------
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -16, 12, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 26), (p) => p)) {
    out.push(S(k.cylinder(x, y, 8, -16, 1.8, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, -14.2, 2.2, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -12, 12, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  out.push(k.corners(PLATE, 11).map(([x, y]) => screwAt(x, y, 0, 2.2)).join(""));
  return out.join("");
}

// ---------- the readout rack along the back ----------
const LCD = {
  pc: { x0: -284, x1: -250, z0: 33, z1: 47 },
  instr: { x0: -244, x1: -128, z0: 33, z1: 47 },
  active: { x0: -122, x1: -78, z0: 33, z1: 47 },
  slots: { x0: -72, x1: -36, z0: 33, z1: 47 },
  useful: { x0: -30, x1: 28, z0: 33, z1: 47 },
  use: { x0: 34, x1: 78, z0: 33, z1: 47 },
  split: { x0: -284, x1: -228, z0: 14, z1: 28 },
  mask: { x0: -222, x1: -160, z0: 14, z1: 28 },
  diverged: { x0: -154, x1: -110, z0: 14, z1: 28 },
  agree: { x0: -104, x1: -60, z0: 14, z1: 28 },
  pair: { x0: -54, x1: 4, z0: 14, z1: 28 },
  loop: { x0: 10, x1: 78, z0: 14, z1: 28 },
  depth: { x0: 84, x1: 118, z0: 14, z1: 28 },
};
for (const w of Object.values(LCD)) Object.assign(w, { r: 1, depth: 1.6 });
const LCD_UNITS = { pc: "PC", instr: "INSTRUCTION", active: "ACTIVE", slots: "SLOTS", useful: "LANE-SLOTS", use: "LANE USE", split: "TRUE · FALSE", mask: "MASK", diverged: "DIVERGED", agree: "ALL AGREE", pair: "2 WARPS", loop: "LOOP USE", depth: "STACK" };

function lcdText(name) {
  const w = LCD[name];
  const size = name === "instr" ? 5 : 6;
  return [
    `<text class="wd-lcd-unit" x="${w.x0 + 2.2}" y="${-(w.z1 - 3.8)}" font-size="2.9">${LCD_UNITS[name]}</text>`,
    `<text class="wd-lcd-text" data-lcd="${name}" x="${w.x1 - 2.4}" y="${-(w.z0 + 2.2)}" font-size="${size}" text-anchor="end"></text>`,
  ].join("");
}

function rack() {
  const out = [`<path class="iso-halo" d="${k.haloOf(RACK, 0, 6, P)}"/>`];
  out.push(S(k.slabOf(k.insetPlan(RACK, 3), 0, 4, P, 6), { tone: "lo" }));
  out.push(S(k.slabOf(RACK, 4, RACK_TOP - 4, P, 6, 1.2), { tone: "mid", inner: L(k.sideSeam(RACK, 9, P, 6), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(RACK, 3.5), RACK_TOP, P, 6), { tone: "faint" }));
  for (const [x, y] of k.corners(RACK, 7)) out.push(screwAt(x, y, RACK_TOP, 1.4));
  out.push(L(Array.from({ length: 34 }, (_, i) => k.planOutline({ x: -270 + i * 7, y: RACK.y + 9, w: 2.6, d: 18, r: 1.3 }, RACK_TOP, P, 3)).join(""), { tone: "faint" }));
  // lane-use gauge
  const [x, y] = DIAL.at;
  const R = DIAL.r;
  out.push(S(k.cylinder(x, y, R, RACK_TOP, DIAL_TOP - RACK_TOP, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, R, DIAL_TOP - 3, DIAL_TOP, 64, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, R, DIAL_TOP - 3, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, R - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, R - 2, 20, 5, DIAL_TOP, [1.2, 2.6], P, SWEEP[0], SWEEP[1]);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(`<path data-part="dial-arc" class="iso-line" data-tone="lit" style="stroke-width:1.1" d=""/>`);
  out.push(L(k.ring(x, y, 1.5, DIAL_TOP, P, 16), { tone: "mid" }));
  out.push(`<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.1" d="${needleAt(0)}"/>`);
  out.push(D([at([x, y, DIAL_TOP + 0.2])], { size: 0.8, tone: "hi" }));
  // a second, smaller knob: the warp selector, purely mechanical
  out.push(S(k.cylinder(196, -203, 9, RACK_TOP, 1, P, 32), { tone: "lo" }));
  out.push(S(k.cylinder(196, -203, 6.5, RACK_TOP + 1, 4, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(196, -203, 6.5, RACK_TOP + 1, RACK_TOP + 5, 28, P), { tone: "lo" }));
  out.push(L(k.lineOnTop([196, -202], [196, -197.5], RACK_TOP + 5, P), { tone: "hi", free: "end" }));
  for (const name of Object.keys(LCD)) out.push(recess(LCD[name], RACK_FRONT, lcdText(name)));
  out.push(`<g transform="${planeOf(RACK_FRONT)}">${L(Array.from({ length: 16 }, (_, i) => flat(128 + i * 8, 16, 130.4 + i * 8, 26, 1.2, 3)).join(""), { tone: "lo" })}</g>`);
  out.push(`<g data-part="rack-led" class="wd-led" style="opacity:.2">${D([at([258, RACK_FRONT, 10])], { size: 1, tone: "hi" })}</g>`);
  return out.join("");
}
function needleAt(share) {
  const a = SWEEP[0] + share * SWEEP[1];
  const [x, y] = DIAL.at;
  const R = DIAL.r;
  return k.lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (R - 4), y - Math.cos(a) * (R - 4)], DIAL_TOP + 0.2, P);
}

// ---------- the instruction tape ----------
function lidBox(plan, top, { tone = "mid", reel = true } = {}) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, 3, P)}" style="opacity:.6"/>`];
  out.push(S(k.slabOf(plan, 0, top - 1.4, P, 3, 0.6), { tone }));
  const lid = k.insetPlan(plan, 1);
  out.push(S(k.slabOf(lid, top - 1.4, 1.4, P, 3, 0.4), { tone, crease: "lo" }));
  for (const [x, y] of k.corners(lid, 3.4)) out.push(screwAt(x, y, top, 1));
  if (reel) {
    const cx = plan.x + plan.w / 2, cy = plan.y + plan.d / 2;
    const r = Math.min(plan.d / 2 - 3, 12);
    out.push(`<path class="wd-lcd" d="${k.ring(cx, cy, r, top, P, 48)}Z"/>`);
    out.push(L(k.ring(cx, cy, r, top, P, 48), { tone: "lo" }));
    out.push(L(k.ring(cx, cy, r * 0.72, top, P, 40), { tone: "mid" }));
    out.push(L(k.ring(cx, cy, r * 0.3, top, P, 24), { tone: "mid" }));
    const spokes = [0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2; return k.lineOnTop([cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3], [cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72], top, P); });
    out.push(L(spokes.join(""), { tone: "mid" }));
  }
  return out.join("");
}
function tape() {
  const out = [];
  out.push(S(k.slabOf(BED, 0, BED_TOP, P, 3, 0.6), { tone: "lo", crease: "lo" }));
  for (const x of RAILS_X) out.push(S(k.slabOf({ x: x - 1, y: BED.y + 3, w: 3, d: BED.d - 6, r: 0.6 }, BED_TOP, 2.4, P, 2, 0.3), { tone: "mid" }));
  // the paper tape itself, with sprocket holes and a fold line between instructions
  const strip = { x: TAPE.x, y: BED.y - 2, w: TAPE.w, d: BED.d + 4, r: 0 };
  out.push(S(k.slabOf(strip, BED_TOP, 0.5, P, 1), { tone: "hi", crease: "none", className: "wd-paper" }));
  const holes = [];
  for (let y = BED.y + 2; y < BED.y + BED.d - 1; y += 6) for (const x of [TAPE.x + 3.4, TAPE.x + TAPE.w - 3.4]) holes.push(at([x, y, BED_TOP + 0.5]));
  out.push(D(holes, { size: 0.55, tone: "lo" }));
  const folds = [];
  for (let pc = 0; pc <= 6; pc++) folds.push(k.lineOnTop([TAPE.x, ROW0 + pc * ROW_D], [TAPE.x + TAPE.w, ROW0 + pc * ROW_D], BED_TOP + 0.5, P));
  out.push(L(folds.join(""), { tone: "lo" }));
  for (let pc = 0; pc < 6; pc++) {
    const y = rowY(pc);
    out.push(topText(TAPE.x + 8, y - 5, BED_TOP + 0.52, String(pc), 5, `data-tape-pc="${pc}"`, "wd-tape-n", "start"));
    out.push(topText(TAPE.x + 14, y - 5, BED_TOP + 0.52, "", 4.2, `data-tape="${pc}"`, "wd-tape", "start"));
    out.push(topText(TAPE.x + 14, y + 5, BED_TOP + 0.52, "", 3.2, `data-tape-note="${pc}"`, "wd-tape-note", "start"));
  }
  // scale on the right rail: one tick per instruction
  const ticks = [];
  for (let pc = 0; pc <= 6; pc++) ticks.push(k.lineOnTop([RAILS_X[1] + 2, ROW0 + pc * ROW_D], [RAILS_X[1] + 5, ROW0 + pc * ROW_D], BED_TOP, P));
  out.push(L(ticks.join(""), { tone: "mid" }));
  return out.join("");
}
// The read head: a bridge riding both rails, a lit line over the current instruction, and the
// program counter on its left post. Built at pc 0 and moved along y.
function head() {
  const y = rowY(0);
  const out = [];
  for (const x of RAILS_X) {
    out.push(S(k.slabOf({ x: x - 2.4, y: y - 5, w: 5.8, d: 10, r: 1 }, BED_TOP + 2.4, 2, P, 2, 0.3), { tone: "mid" }));
    out.push(S(k.slabOf({ x: x - 1.4, y: y - 3, w: 3.8, d: 6, r: 0.6 }, BED_TOP + 4.4, HEAD_Z - BED_TOP - 4.4, P, 2, 0.3), { tone: "mid" }));
  }
  const bar = { x: RAILS_X[0] - 2, y: y - 4, w: RAILS_X[1] - RAILS_X[0] + 5, d: 8, r: 1 };
  out.push(S(k.slabOf(bar, HEAD_Z, 3, P, 2, 0.4), { tone: "hi", crease: "lo" }));
  out.push(`<path class="iso-line" data-tone="lit" style="stroke-width:1.2" d="${k.lineOnTop([bar.x, y], [bar.x + bar.w, y], HEAD_Z + 3, P)}"/>`);
  for (const x of [bar.x + 4, bar.x + bar.w - 4]) out.push(screwAt(x, y, HEAD_Z + 3, 0.9));
  // the PC counter box on the left post
  const box = { x: RAILS_X[0] - 16, y: y - 7, w: 14, d: 14, r: 1 };
  out.push(S(k.slabOf(box, BED_TOP + 2.4, HEAD_Z + 3 - BED_TOP - 2.4, P, 2, 0.4), { tone: "mid" }));
  const window = { x: box.x + 2, y: box.y + 2.5, w: box.w - 4, d: box.d - 5, r: 0.6 };
  out.push(`<path class="wd-lcd" d="${k.planOutline(window, HEAD_Z + 3, P, 2)}"/>`);
  out.push(L(k.planOutline(window, HEAD_Z + 3, P, 2), { tone: "lo" }));
  out.push(topText(box.x + box.w / 2, y, HEAD_Z + 3.02, "", 5, 'data-part="pc-text"', "wd-lcd-text"));
  return out.join("");
}
function codePlate() {
  const out = [S(k.slabOf(CODE, 0, 1.2, P, 3, 0.3), { tone: "lo", crease: "lo" })];
  for (const [x, y] of k.corners(CODE, 3.4)) out.push(screwAt(x, y, 1.2, 0.9));
  const lines = ["if (x > 0)", "  y = sqrt(x);", "else", "  y = 0;", "z = y + 1;"];
  lines.forEach((line, i) => out.push(topText(CODE.x + 8, CODE.y + 9 + i * 8.4, 1.22, line.replace(/ /g, " "), 4.6, "", "wd-code", "start")));
  return out.join("");
}

// ---------- the SM housing, cut open ----------
function houseBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf(HOUSE, 0, 5, P)}" style="opacity:.7"/>`];
  out.push(S(k.slabOf(HOUSE, 0, FLOOR, P, 4, 0.6), { tone: "lo", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(HOUSE, 3), FLOOR, P, 3), { tone: "faint" }));
  out.push(S(k.slabOf(span(HOUSE.x, HOUSE.x + HOUSE.w, HOUSE.y, 3, 0.4), FLOOR, WALL - FLOOR, P, 2, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf({ x: HOUSE.x, y: HOUSE.y + 3, w: 3, d: HOUSE.d - 3, r: 0.4 }, FLOOR, WALL - FLOOR, P, 2, 0.4), { tone: "mid" }));
  // screws along the top of the back wall
  for (let x = HOUSE.x + 14; x < HOUSE.x + HOUSE.w - 6; x += 44) out.push(screwAt(x, HOUSE.y + 1.5, WALL, 0.8));
  return out.join("");
}
function houseFront() {
  const out = [];
  out.push(S(k.slabOf(span(HOUSE.x + 3, HOUSE.x + HOUSE.w, HOUSE.y + HOUSE.d - 3, 3, 0.4), FLOOR, SILL - FLOOR, P, 2, 0.4), { tone: "hi", crease: "lo", className: "wd-cut" }));
  out.push(S(k.slabOf({ x: HOUSE.x + HOUSE.w - 3, y: HOUSE.y + 3, w: 3, d: HOUSE.d - 6, r: 0.4 }, FLOOR, SILL - FLOOR, P, 2, 0.4), { tone: "hi", crease: "lo", className: "wd-cut" }));
  return out.join("");
}

// The mask stack: a well with springs under a platform, trays stacked on it.
const vcoil = (cx, cy, r, z0, z1, turns) => {
  const back = [], front = [];
  let run = [], near = null;
  const count = Math.round(turns * 18);
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * turns * Math.PI * 2;
    const p = at([cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + ((z1 - z0) * i) / count]);
    const facing = k.depthOf([Math.cos(a), Math.sin(a), 0], P) > 0;
    if (near === null) near = facing;
    if (facing !== near) { run.push(p); (near ? front : back).push(k.pathOf(run)); run = [p]; near = facing; continue; }
    run.push(p);
  }
  if (run.length > 1) (near ? front : back).push(k.pathOf(run));
  return { back: back.join(""), front: front.join("") };
};
function wellBack() {
  const out = [];
  out.push(`<path class="wd-hole" d="${k.planOutline({ ...WELL, r: 1 }, FLOOR + 0.02, P, 2)}"/>`);
  out.push(L(k.planOutline({ ...WELL, r: 1 }, FLOOR + 0.02, P, 2), { tone: "lo" }));
  // inner divider between the well and the mask rail, cut to a sill
  out.push(`<g data-part="springs"><path class="iso-line" data-tone="lo" data-k="back" d=""/><path class="iso-line" data-tone="mid" data-k="front" d=""/></g>`);
  out.push(`<g data-part="platform"></g>`);
  for (let i = 0; i < 3; i++) out.push(`<g data-tray="${i}" style="display:none">${trayBody(i)}</g>`);
  return out.join("");
}
function trayBody(i) {
  const out = [S(k.slabOf(TRAY, RIM - TRAY_H, TRAY_H, P, 2, 0.4), { tone: i % 2 ? "mid" : "hi", crease: "lo" })];
  out.push(L(k.planOutline({ x: BANK.x0, y: TRAY_DOT_Y - 4, w: BANK.x1 - BANK.x0, d: 8, r: 1 }, RIM, P, 2), { tone: "lo" }));
  for (let lane = 0; lane < M.LANES; lane++) {
    out.push(`<path class="wd-tray-bit" data-tray-bit="${lane}" d="${k.ring(laneMid(lane), TRAY_DOT_Y, 2, RIM + 0.02, P, 14)}Z"/>`);
  }
  out.push(L(k.planOutline({ x: BANK.x1 + 2, y: TRAY.y + 4, w: 21, d: TRAY.d - 8, r: 1 }, RIM, P, 2), { tone: "lo" }));
  out.push(topText(BANK.x1 + 12.5, TRAY.y + 12, RIM + 0.02, "", 3.6, 'data-tray-next=""', "wd-tag"));
  out.push(topText(BANK.x1 + 12.5, TRAY.y + 22, RIM + 0.02, "", 3.6, 'data-tray-rejoin=""', "wd-tag"));
  // finger notches at both ends
  out.push(L([TRAY.x + 4, TRAY.x + TRAY.w - 4].map((x) => k.planOutline({ x: x - 1.5, y: TRAY.y + 10, w: 3, d: 16, r: 1.5 }, RIM, P, 3)).join(""), { tone: "faint" }));
  return out.join("");
}
function wellFront() {
  const out = [];
  // the well's near wall and right wall, cut down so the trays and springs show
  out.push(S(k.slabOf(span(WELL.x, WELL.x + WELL.w, WELL.y + WELL.d, 2.5, 0.4), FLOOR, 18 - FLOOR, P, 2, 0.4), { tone: "hi", crease: "lo", className: "wd-cut" }));
  out.push(L(k.lineOnTop([WELL.x, WELL.y + WELL.d + 1.25], [WELL.x + WELL.w, WELL.y + WELL.d + 1.25], 18, P), { tone: "faint" }));
  return out.join("");
}

function maskRail() {
  const plan = span(BANK.x0, BANK.x1, MASKR.y, MASKR.d, 1);
  const out = [S(k.slabOf(plan, FLOOR, MASKR.top - FLOOR, P, 2, 0.4), { tone: "mid" })];
  out.push(L(k.lineOnTop([BANK.x0, MASKR.y + 2], [BANK.x1, MASKR.y + 2], MASKR.top, P), { tone: "faint" }));
  for (let lane = 0; lane < M.LANES; lane++) {
    const x = laneMid(lane);
    out.push(`<g data-ln="${lane}" data-row="mask">`);
    out.push(L(k.ring(x, LIGHT_Y, 4, MASKR.top, P, 18), { tone: "lo" }));
    out.push(S(k.cylinder(x, LIGHT_Y, 3, MASKR.top, 1.8, P, 18, 0.5), { tone: "hi", crease: "lo", className: "wd-on wd-light" }));
    out.push(`</g>`);
  }
  // bit numbers every 8 on the rail's front lip
  for (const lane of [0, 8, 16, 24, 31]) out.push(topText(laneMid(lane), MASKR.y + MASKR.d - 1.6, MASKR.top + 0.02, String(lane), 2.4, "", "wd-mark"));
  return out.join("");
}

function laneModule(lane) {
  const x = laneX(lane);
  const cx = laneMid(lane);
  const out = [`<g data-ln="${lane}" data-row="lane">`];
  out.push(S(k.slabOf({ x, y: LANEBOX.y, w: LANE.w, d: LANEBOX.d, r: 0.8 }, FLOOR, 3, P, 2, 0.3), { tone: "mid", crease: "lo" }));
  out.push(S(k.slabOf({ x: x + 0.6, y: CORE.y, w: LANE.w - 1.2, d: CORE.d, r: 0.8 }, FLOOR + 3, CORE.top - FLOOR - 3, P, 2, 0.4), { tone: "mid", crease: "lo", className: "wd-on wd-core" }));
  out.push(L([0, 1, 2].map((i) => k.lineOnTop([x + 2.2, CORE.y + 5 + i * 4], [x + LANE.w - 2.2, CORE.y + 5 + i * 4], CORE.top, P)).join(""), { tone: "lo", className: "wd-fins" }));
  out.push(S(k.cylinder(cx, PLED_Y, 1.7, FLOOR + 3, 1.2, P, 14, 0.3), { tone: "lo", crease: "none", className: "wd-on wd-pled" }));
  const box = { x: x + 0.4, y: DISPLAY.y, w: LANE.w - 0.8, d: DISPLAY.d, r: 0.8 };
  out.push(S(k.slabOf(box, FLOOR + 3, DISPLAY.top - FLOOR - 3, P, 2, 0.3), { tone: "mid", crease: "lo" }));
  const glass = { x: box.x + 0.9, y: box.y + 2, w: box.w - 1.8, d: box.d - 4, r: 0.6 };
  out.push(`<path class="wd-lcd" d="${k.planOutline(glass, DISPLAY.top, P, 2)}"/>`);
  out.push(L(k.planOutline(glass, DISPLAY.top, P, 2), { tone: "lo" }));
  out.push(L([ROW_Y.x + 8, ROW_Y.y + 8].map((y) => k.lineOnTop([glass.x + 0.8, y], [glass.x + glass.w - 0.8, y], DISPLAY.top + 0.01, P)).join(""), { tone: "faint" }));
  for (const name of ["x", "y", "z"]) out.push(topText(cx, ROW_Y[name], DISPLAY.top + 0.02, "", 3.7, `data-v="${name}" data-lane="${lane}"`, "wd-lcd-text wd-v"));
  out.push(`</g>`);
  return out.join("");
}
function lanes() {
  const out = [];
  // row legends at the left end of the bank
  for (const name of ["x", "y", "z"]) out.push(topText(BANK.x0 - 4.5, ROW_Y[name], FLOOR + 0.02, name, 4.4, `data-legend="${name}"`, "wd-letter"));
  out.push(topText(BANK.x0 - 4.5, PLED_Y, FLOOR + 0.02, "p", 3.6, "", "wd-letter"));
  for (let lane = 0; lane < M.LANES; lane++) out.push(laneModule(lane));
  // lane ruler on the floor in front
  const ruler = span(BANK.x0, BANK.x1, RULER.y, RULER.d, 0.5);
  out.push(S(k.slabOf(ruler, FLOOR, 0.6, P, 2), { tone: "lo", crease: "none" }));
  const minor = [], major = [];
  for (let lane = 0; lane <= M.LANES; lane++) {
    const x = LANE.x0 + lane * LANE.pitch;
    (lane % 8 === 0 ? major : minor).push(k.lineOnTop([x, RULER.y], [x, RULER.y + (lane % 8 === 0 ? 4.2 : 2)], FLOOR + 0.6, P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  for (const lane of [0, 8, 16, 24]) out.push(topText(laneMid(lane) + 2, RULER.y + 2.8, FLOOR + 0.62, String(lane), 2.6, "", "wd-mark", "start"));
  return out.join("");
}

// ---------- warp cartridges and slot board ----------
function dock() {
  const out = [`<path class="iso-halo" d="${k.haloOf(DOCK, 0, 3, P)}" style="opacity:.6"/>`];
  out.push(S(k.slabOf(DOCK, 0, 4, P, 3, 0.6), { tone: "lo", crease: "lo" }));
  for (const [x, y] of k.corners(DOCK, 4)) out.push(screwAt(x, y, 4, 1));
  for (const [name, cart] of Object.entries(CART)) {
    const plan = span(BANK.x0, BANK.x1 + 26, cart.y, cart.d, 1.2);
    out.push(S(k.slabOf(plan, 4, CART_TOP - 4, P, 2, 0.4), { tone: "mid", crease: "lo" }));
    out.push(L(k.lineOnTop([BANK.x0, cart.y + 2], [BANK.x1 + 26, cart.y + 2], CART_TOP, P), { tone: "faint" }));
    for (let lane = 0; lane < M.LANES; lane++) out.push(`<path class="wd-hole" d="${k.ring(laneMid(lane), cart.y + cart.d / 2, PEG_R + 0.6, CART_TOP + 0.01, P, 16)}Z"/>`);
    out.push(S(k.slabOf({ x: BANK.x1 + 4, y: cart.y + 2, w: 18, d: cart.d - 4, r: 0.8 }, CART_TOP, 0.8, P, 2), { tone: "hi", crease: "lo" }));
    out.push(topText(BANK.x1 + 13, cart.y + cart.d / 2, CART_TOP + 0.82, "WARP " + name.toUpperCase(), 3, "", "wd-tag-ink"));
  }
  // guide slot between the cartridges for pegs to cross
  out.push(L(k.planOutline({ x: BANK.x0, y: CART.a.y + CART.a.d + 3, w: BANK.x1 - BANK.x0, d: 8, r: 1 }, 4, P, 2), { tone: "faint" }));
  const pegs = [];
  for (const name of ["a", "b"]) for (let lane = 0; lane < M.LANES; lane++) pegs.push({ name, lane });
  out.push(`<g data-part="pegs">`);
  for (const { name, lane } of byDepth(pegs, (p) => [laneMid(p.lane), CART[p.name].y, CART_TOP])) {
    out.push(`<g data-peg="${name}${lane}">${S(k.cylinder(laneMid(lane), CART.a.y + CART.a.d / 2, PEG_R, CART_TOP - 1, PEG_H + 1, P, 18, 0.5), { tone: "mid", crease: "lo", className: "wd-on wd-peg" })}</g>`);
  }
  out.push(`</g>`);
  return out.join("");
}
function board() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BOARD, 0, 3, P)}" style="opacity:.6"/>`];
  out.push(S(k.slabOf(BOARD, 0, 5, P, 3, 0.6), { tone: "mid", crease: "lo" }));
  for (const [x, y] of k.corners(BOARD, 4)) out.push(screwAt(x, y, 5, 1));
  const inset = span(BANK.x0, BANK.x1, BOARD_ROW0 - 3, BOARD_ROWS * BOARD_PITCH + 2.4, 1);
  out.push(`<path class="wd-lcd" d="${k.planOutline(inset, 5.01, P, 2)}"/>`);
  out.push(L(k.planOutline(inset, 5.01, P, 2), { tone: "lo" }));
  for (let row = 0; row < BOARD_ROWS; row++) {
    const y = BOARD_ROW0 + row * BOARD_PITCH;
    for (let lane = 0; lane < M.LANES; lane++) out.push(`<path class="wd-cell" data-cell="${row}-${lane}" d="${k.planOutline({ x: laneX(lane) + 0.6, y, w: LANE.w - 1.2, d: BOARD_PITCH - 2.2, r: 0.4 }, 5.03, P, 1)}"/>`);
    out.push(topText(BANK.x1 + 3, y + (BOARD_PITCH - 2.2) / 2, 5.02, "", 3.2, `data-row-label="${row}"`, "wd-row-label", "start"));
  }
  out.push(topText(BANK.x1 + 3, BOARD_ROW0 - 6, 5.02, "SLOT · OP", 2.6, "", "wd-mark", "start"));
  return out.join("");
}

// ---------- labels ----------
const LABELS = [
  { name: "Readout rack", at: [-190, RACK_FRONT, 50], text: [330, 64], align: "end" },
  { name: "Read head + PC", at: [-298, rowY(0), HEAD_Z + 3], text: [214, 84], align: "end", rides: true },
  { name: "Instruction tape", at: [-250, -40, BED_TOP + 0.5], text: [176, 190], align: "end" },
  { name: "Source code", at: [-250, 160, 1.2], text: [118, 424] },
  { name: "Lane-use gauge", at: [234, -203, DIAL_TOP], text: [818, 258] },
  { name: "Mask stack", at: [BANK.x1 + 12.5, -153, RIM], text: [818, 330] },
  { name: "Mask lights", at: [236, LIGHT_Y, MASKR.top], text: [818, 372] },
  { name: "32 lanes: x y z", at: [234, -40, DISPLAY.top], text: [818, 414] },
  { name: "Warps A, B", at: [262, 30, CART_TOP], text: [818, 470] },
  { name: "Slot board", at: [262, 130, 5], text: [818, 540] },
];
function labels(rides = false) {
  const out = [];
  for (const label of LABELS.filter((l) => !!l.rides === rides)) {
    const [ax, ay] = at(label.at);
    const [tx, ty] = label.text;
    const align = label.align || "start";
    const ex = align === "start" ? tx - 3 : align === "end" ? tx + 3 : tx;
    const ey = ty - 2.6;
    out.push(L(k.pathOf([[ax, ay], [ex, ey]]), { tone: "mid", free: "end", className: "wd-leader" }));
    out.push(`<circle class="wd-pin" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="1.5"/>`);
    out.push(`<text class="wd-label" x="${tx}" y="${ty}" text-anchor="${align}">${label.name}</text>`);
  }
  return `<g class="wd-labels">${out.join("")}</g>`;
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A piece of one streaming multiprocessor on a bench, cut open. On the left a paper instruction tape holds the program, six instructions long, and a read head carrying the program counter rides over it. In the opened housing, a spring-loaded well holds a stack of trays, each tray carrying a 32-bit mask and a rejoin address; in front of it a row of 32 mask lights, and under them 32 lanes side by side, each with a small display for its own x, y and z. In front of the housing two warp cartridges hold 32 pegs each, and a slot board records one row per issued instruction with a cell per lane. A readout rack at the back shows the program counter, the slot count, lane use and a gauge.",
  body: [
    plate(),
    rack(),
    lidBox(BOX_BACK, 14),
    tape(),
    `<g data-part="head">${head()}${labels(true)}</g>`,
    houseBack(),
    wellBack(),
    wellFront(),
    maskRail(),
    lanes(),
    houseFront(),
    lidBox(BOX_FRONT, 14),
    codePlate(),
    dock(),
    board(),
    labels(),
  ],
});

// ---------- page ----------
const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${modelSource}
const P = ${JSON.stringify(P)};
const DIAL = ${JSON.stringify(DIAL)}, DIAL_TOP = ${DIAL_TOP}, SWEEP = ${JSON.stringify(SWEEP)};
const RIM = ${RIM}, TRAY_H = ${TRAY_H}, FLOOR = ${FLOOR}, TRAY = ${JSON.stringify(TRAY)};
const SPRINGS = ${JSON.stringify(SPRINGS)}, SPRING_Y = ${SPRING_Y}, SPRING_R = ${SPRING_R};
const CART = ${JSON.stringify(CART)};
const HEAD_DY = ${JSON.stringify(k.axisVector(P, [0, ROW_D, 0]))};
const PEG_DY = ${JSON.stringify(k.axisVector(P, [0, CART.b.y - CART.a.y, 0]))};
const UP = ${JSON.stringify(k.axisVector(P, [0, 0, 1]))};
const BOARD_ROWS = ${BOARD_ROWS};
${readFileSync(join(HERE, "live.js"), "utf8")}
`;
const css = readFileSync(join(HERE, "warp-divergence.css"), "utf8");

const STEPS = ["Load 32 values", "Compare x > 0", "Run the if side", "Run the else side", "Rejoin", "Make them all agree", "Sort two warps", "Run a lopsided loop", "New warp"];
const steps = STEPS.map((label, i) => `<button class="wd-step" type="button" data-step="${i}"${i === 0 ? "" : " disabled"}><span class="wd-step-n">${String(i + 1).padStart(2, "0")}</span><span>${label}</span><span class="wd-step-fill" aria-hidden="true"></span></button>`).join("");

const base = M.costOf(M.conditionsOf());
const chips = [
  ["pattern", "condition pattern", "T T F F T F F T × 4 → 16 true · 16 false"],
  ["slots", "slots so far", "0"],
  ["useful", "useful lane-slots", "0 / 0"],
  ["use", "lane use", "-"],
  ["pass", "this pass", "-"],
  ["diverged", "diverged", `1 + 4 + 1 + 1 = ${base.slots} slots · ${base.useful} / ${base.total} = ${(base.use * 100).toFixed(1)}%`],
  ["agree", "all agree", "1 + 4 + 1 = 6 slots · 100%"],
  ["pair", "two warps", "7 + 7 = 14 → sorted 6 + 3 = 9"],
  ["loop", "lopsided loop", "31 × 10 + 1,000 = 1,310 of 32,000 · 95.9% wasted"],
]
  .map(([key, name, value]) => `<span class="wd-chip"><span class="wd-chip-name">${name}</span><span class="wd-chip-value" data-chip="${key}">${value}</span></span>`)
  .join("");

const plateHtml = k.plateHtml({
  fig: "Fig 3",
  title: "When a warp disagrees",
  hint: "Press the lit step",
  readout: "idle",
  keys: [
    { mark: "lit", label: "Lit: mask lights that are on, lanes computing now, and true pegs" },
    { mark: "raised", label: "Trays: the mask stack, one tray per open branch, top tray in use next" },
    { mark: "flat", label: "Slot board: one row per issued slot, a lit cell per lane that did useful work" },
  ],
  caption: "",
  body: `<div class="iso-stage wd-stage">${svg}<span class="wd-sr" role="status" aria-live="polite" data-status></span></div>`,
});

const notes = `<details class="wd-notes"><summary>Where the numbers come from</summary><ul>
<li><b>32 threads per warp</b> is real for NVIDIA GPUs (CUDA C++ Programming Guide). AMD GPUs run wavefronts of 64 or 32.</li>
<li><b>The slot costs are illustrative:</b> compare 1, sqrt 4, y = 0 is 1, z = y + 1 is 1, and the branch bookkeeping is free. Real costs depend on the GPU: sqrt runs on a special-function unit with fewer lanes than the main ALUs, and branches cost something.</li>
<li><b>A branch this short is usually not a branch at all.</b> Compilers normally turn it into a select (or predicated instructions): every lane computes both sides and keeps one, with no jump and no mask stack. The figure uses a real branch so you can watch the mask work.</li>
<li><b>The mask stack</b> is the classic textbook model of how GPUs before Volta reconverged (a "SIMT stack" of mask, next PC and rejoin PC). Volta and later NVIDIA GPUs track each thread's own PC and rejoin at convergence barriers, but a warp still issues one instruction for all its active lanes, so the slot counts come out the same.</li>
<li>The arithmetic: diverged 1 + 4 + 1 + 1 = 7 slots and 32×1 + 16×4 + 16×1 + 32×1 = 144 useful lane-slots of 7 × 32 = 224, which is 64.3%. All agree: 6 slots, 192 of 192. Sorting two mixed warps into one all-true and one all-false warp: 7 + 7 = 14 becomes 6 + 3 = 9. Lopsided loop: 31 × 10 + 1,000 = 1,310 useful lane-iterations of 32 × 1,000 = 32,000, so 95.9% wasted.</li>
<li>Every y and z on the lane displays is computed in the page from that lane's x. The x values are random (positive where the pattern says true, zero or negative where it says false), and "New warp" draws new ones.</li>
</ul></details>`;

const body = `<style>${css}</style><div class="wd-layout"><nav class="wd-steps" aria-label="Steps">${steps}<button class="wd-toggle" type="button" aria-pressed="true" data-labels>Labels: on</button></nav><div class="wd-main">${plateHtml}<div class="wd-chips" aria-label="Live numbers">${chips}</div><p class="wd-idea"><b>The big idea:</b> a warp takes every path that any of its threads takes.</p>${notes}</div></div>`;

const name = theme === "light" ? "warp-divergence-light.html" : "warp-divergence.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "When a warp disagrees", theme, body, script: kitScript() + live, width: 1180 }));
console.log("wrote", name, (svg.length / 1024).toFixed(0) + " KB svg");

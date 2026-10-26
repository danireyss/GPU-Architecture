import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/danielreyes/.claude/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "/Users/danielreyes/.claude/skills/anatomy/scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 900;
const HEIGHT = 470;

// World: x across the die (left column of SMs to right column), y from the HBM stacks (back)
// to the dispatcher and conveyor (front), z up. One unit is about one pixel of the drawing.
const PLATE = { x: -296, y: -270, w: 592, d: 498, r: 10 };
const SUB = { x: -284, y: -258, w: 568, d: 474, r: 5 };
const SUB_Z = 4;
const DIE = { x: -264, y: -178, w: 528, d: 374, r: 2 };
const DIE_Z = 8;
const HBM_X = [-190, -64, 64, 190];
const HBM = { y: -246, d: 58, w: 104 };
const SM_W = 238;
const SM_D = 120;
const COLS = [-252, 14];
const ROWS = [-160, 0];
const L2 = { x: -252, y: -34, w: 504, d: 26, r: 1.5 };

// The opened SM: front row, right column.
const SMX = COLS[1];
const SMY = ROWS[1];
const FLOOR = 11;
const WALL = 38;
const SILL = 22;
const FRONT = SMY + SM_D; // 120
const RIGHT = SMX + SM_W; // 252
const CAB = { y: 6, d: 34 };
const CAB_FRONT = CAB.y + CAB.d;
const CAB_TOP = 92;
const PLINTH = 24;
const RACK = { x: 22, w: 90 };
const BOARD = { x: 120, w: 56 };
const SHELF = { x: 184, w: 62 };
const GRID = {
  rack: { x0: 25, x1: 109, z0: PLINTH + 2, z1: CAB_TOP - 4, cols: 16, rows: 16 },
  board: { x0: 123, x1: 173, z0: PLINTH + 2, z1: CAB_TOP - 4, cols: 8, rows: 8 },
  shelf: { x0: 187, x1: 243, z0: PLINTH + 2, z1: CAB_TOP - 4, cols: 8, rows: 12 },
};
const GAUGES = {
  regs: { at: [RACK.x + RACK.w / 2, CAB.y + CAB.d / 2], r: 12.5, cab: RACK },
  slots: { at: [BOARD.x + BOARD.w / 2, CAB.y + CAB.d / 2], r: 12.5, cab: BOARD },
  shared: { at: [SHELF.x + SHELF.w / 2, CAB.y + CAB.d / 2], r: 12.5, cab: SHELF },
};
const DIAL_Z = CAB_TOP + 4;
const SWEEP = [-0.75 * Math.PI, 1.5 * Math.PI];

// Crates ride at one height everywhere: conveyor belt, transfer, and the roller deck inside.
const RIDE = 16;
const CRATE = { s: 19, h: 10 };
const LANE_Y = 91;
const DECK = { x: 22, y: 76, w: 226, d: 30, r: 1 };
const DOOR = { x0: 23, x1: 47, cx: 35 };
const POSTS = [[18, 23], [47, 52]];
const GATE_TOP = 48;
const CONV = { x0: -150, x1: 48, y0: 133, y1: 159 };
const CONV_Y = (CONV.y0 + CONV.y1) / 2;
const WAIT = [DOOR.cx, 131];
const QUEUE_X = (i) => (i === 0 ? WAIT[0] : 11 - (i - 1) * 24);
const BAY_X = (i) => 230 - i * 24;
const SPAWN_X = -150;
const DISP = { x: -252, y: 126, w: 100, d: 62, r: 2 };
const DISP_TOP = 50;

const P = k.fitProjection(
  [...k.boxCorners({ x: DISP.x - 4, y: SMY - 2, w: RIGHT - DISP.x + 10, d: DIE.y + DIE.d - SMY + 4 }, 0, 0), ...k.boxCorners({ x: 14, y: 6, w: 238, d: 34 }, 0, DIAL_Z + 2), [DISP.x, DISP.y, DISP_TOP + 22]],
  WIDTH,
  HEIGHT,
  { pad: 12, azimuth: 66, elevation: 34 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth = (x, y, z = 0) => k.depthOf([x, y, z], P);
const byDepth = (list, centre) => [...list].sort((a, b) => depth(...centre(a)) - depth(...centre(b)));
const planeOf = (y) => k.sideMatrix([0, y], 0, P, "left");
const flat = (x0, z0, x1, z1, r, steps = 6) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const rect = (x0, z0, x1, z1) => `M${x0.toFixed(2)} ${(-z0).toFixed(2)}H${x1.toFixed(2)}V${(-z1).toFixed(2)}H${x0.toFixed(2)}Z`;
const screwAt = (x, y, z, r = 1.6) => L(k.ring(x, y, r, z, P, 14), { tone: "lo" }) + D([at([x, y, z])], { size: 0.45 });
const span = (x0, x1, y, d, r = 1) => ({ x: x0, y, w: x1 - x0, d, r });
// a closed rectangle on the vertical face x = const, from y0 to y1 and z0 to z1
const faceX = (x, y0, y1, z0, z1) => k.pathOf([at([x, y0, z0]), at([x, y1, z0]), at([x, y1, z1]), at([x, y0, z1])], true);
const topText = (x, y, z, text, size, attrs = "", cls = "so-val", anchor = "middle") => `<text class="${cls}" ${attrs} transform="${k.topMatrix([x, y], z, P, "x")}" x="0" y="${(size * 0.36).toFixed(2)}" font-size="${size}" text-anchor="${anchor}">${text}</text>`;

// ---------- recessed windows on vertical faces ----------
let clips = 0;
function recess({ x0, x1, z0, z1, r, depth: deep }, y, back = "", cls = "so-lcd") {
  const id = `so-clip-${clips++}`;
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
    `<g transform="${planeOf(y - deep)}"><path class="${cls}" d="${shape}"/>${back}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    `</g>`,
    `<g transform="${planeOf(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}
function lcd(name, w, unit, size = 4.4) {
  return [
    `<text class="so-lcd-unit" x="${w.x0 + 1.8}" y="${-(w.z1 - 3)}" font-size="2.4">${unit}</text>`,
    `<text class="so-lcd-text" data-lcd="${name}" x="${w.x1 - 1.8}" y="${-(w.z0 + 1.6)}" font-size="${size}" text-anchor="end"></text>`,
  ].join("");
}
const lcdAt = (name, x0, x1, z0, z1, y, unit, size) => {
  const w = { x0, x1, z0, z1, r: 0.8, depth: 1.2 };
  return recess(w, y, lcd(name, w, unit, size));
};

// ---------- bench, package, HBM ----------
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -16, 12, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 26), (p) => p)) {
    out.push(S(k.cylinder(x, y, 8, -16, 1.8, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, -14.2, 2.2, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -12, 12, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  out.push(k.corners(PLATE, 11).map(([x, y]) => screwAt(x, y, 0, 2.2)).join(""));
  // a ruler along the front edge of the bench, 10 units a tick
  const ticks = k.topTicks(PLATE.x + 30, PLATE.x + PLATE.w - 30, 10, 5, PLATE.y + PLATE.d - 9, 0, [2, 3.6], P, "x");
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  return out.join("");
}
function substrate() {
  const out = [S(k.slabOf(SUB, 0, SUB_Z, P, 4, 0.6), { tone: "lo", crease: "lo", className: "so-sub" })];
  out.push(L(k.planOutline(k.insetPlan(SUB, 4), SUB_Z, P, 3), { tone: "faint" }));
  // decoupling capacitors in rows along the left and right edges and the front
  const caps = [];
  for (let y = SUB.y + 40; y < SUB.y + SUB.d - 30; y += 15) for (const x of [SUB.x + 8, SUB.x + SUB.w - 13]) caps.push({ x, y, w: 5, d: 8 });
  for (let x = SUB.x + 40; x < SUB.x + SUB.w - 40; x += 14) caps.push({ x, y: SUB.y + SUB.d - 12, w: 8, d: 5 });
  for (const c of byDepth(caps, (c) => [c.x, c.y, SUB_Z])) {
    out.push(S(k.slabOf({ ...c, r: 0 }, SUB_Z, 1.8, P, 1, 0), { tone: "mid", crease: "lo", className: "so-cap" }));
    const end = c.w > c.d ? [c.x + 1.4, c.x + c.w - 1.4].map((x) => k.lineOnTop([x, c.y], [x, c.y + c.d], SUB_Z + 1.8, P)) : [c.y + 1.4, c.y + c.d - 1.4].map((y) => k.lineOnTop([c.x, y], [c.x + c.w, y], SUB_Z + 1.8, P));
    out.push(L(end.join(""), { tone: "lo" }));
  }
  // fiducial and pin-1 mark
  out.push(L(k.ring(SUB.x + 14, SUB.y + 14, 3, SUB_Z, P, 20), { tone: "mid" }) + D([at([SUB.x + 14, SUB.y + 14, SUB_Z])], { size: 0.7 }));
  out.push(L(k.onTop([[SUB.x + SUB.w - 22, SUB.y + 8], [SUB.x + SUB.w - 8, SUB.y + 8], [SUB.x + SUB.w - 8, SUB.y + 22]], SUB_Z, P, true), { tone: "mid" }));
  return out.join("");
}
function hbm(cx) {
  const plan = { x: cx - HBM.w / 2, y: HBM.y, w: HBM.w, d: HBM.d, r: 1.2 };
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, SUB_Z, 3, P)}" style="opacity:.5"/>`];
  // base logic die, then eight DRAM dies, then the thick top die
  out.push(S(k.slabOf(plan, SUB_Z, 3, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  const core = k.insetPlan(plan, 2);
  const layers = [];
  for (let i = 1; i < 8; i++) layers.push(i * 1.6);
  out.push(S(k.slabOf(core, SUB_Z + 3, 13, P, 2, 0.3), { tone: "mid", crease: "lo", inner: L(layers.map((h) => k.sideSeam(core, SUB_Z + 3 + h, P, 2)).join(""), { tone: "lo" }) }));
  out.push(L(k.planOutline(k.insetPlan(core, 4), SUB_Z + 16, P, 2), { tone: "faint" }));
  out.push(topText(cx, HBM.y + HBM.d / 2, SUB_Z + 16.02, "HBM", 5, "", "so-engrave"));
  out.push(L([-1, 1].map((s) => k.lineOnTop([cx - HBM.w / 2 + 6, HBM.y + HBM.d / 2 + s * 8], [cx + HBM.w / 2 - 6, HBM.y + HBM.d / 2 + s * 8], SUB_Z + 16, P)).join(""), { tone: "faint" }));
  return out.join("");
}

// ---------- the die ----------
function die() {
  const out = [`<path class="iso-halo" d="${k.haloOf(DIE, SUB_Z, 4, P)}" style="opacity:.7"/>`];
  out.push(S(k.slabOf(DIE, SUB_Z, DIE_Z - SUB_Z, P, 2, 0.4), { tone: "mid", crease: "lo", className: "so-die" }));
  // seal ring
  out.push(L(k.planOutline(k.insetPlan(DIE, 2.5), DIE_Z, P, 2), { tone: "lo" }));
  // HBM PHY along the back edge: a row of pads behind each stack
  for (const cx of HBM_X) {
    out.push(L(k.planOutline({ x: cx - 46, y: DIE.y + 5, w: 92, d: 11, r: 0.6 }, DIE_Z, P, 2), { tone: "lo" }));
    const pads = [];
    for (let i = 0; i < 22; i++) for (const y of [DIE.y + 8, DIE.y + 13]) pads.push(at([cx - 42 + i * 4, y, DIE_Z]));
    out.push(D(pads, { size: 0.35, tone: "mid" }));
  }
  // PCIe PHY along the front edge, right of the dispatcher
  out.push(L(k.planOutline({ x: 60, y: DIE.y + DIE.d - 14, w: 190, d: 9, r: 0.6 }, DIE_Z, P, 2), { tone: "lo" }));
  const pcie = [];
  for (let i = 0; i < 46; i++) pcie.push(at([64 + i * 4, DIE.y + DIE.d - 9.5, DIE_Z]));
  out.push(D(pcie, { size: 0.35, tone: "mid" }));
  out.push(topText(-30, DIE.y + DIE.d - 10, DIE_Z + 0.02, "PCIe · NVLINK", 3.2, "", "so-engrave"));
  return out.join("");
}
// A lidded SM: a box with a cover engraved with its four processing blocks and its L1 strip.
function lidded(x, y, n) {
  const plan = { x, y, w: SM_W, d: SM_D, r: 1.5 };
  const out = [S(k.slabOf(plan, DIE_Z, 24, P, 2, 0.4), { tone: "mid", crease: "lo", inner: L(k.sideSeam(plan, DIE_Z + 21, P, 2), { tone: "faint" }) })];
  const lid = k.insetPlan(plan, 1.2);
  const top = DIE_Z + 24;
  out.push(L(k.planOutline(k.insetPlan(plan, 4), top, P, 2), { tone: "lo" }));
  // four processing blocks, each with a register file grid, its ALU rows and a tensor block
  const qw = (SM_W - 16) / 4;
  const lines = [];
  const faint = [];
  for (let q = 0; q < 4; q++) {
    const qx = x + 6 + q * (qw + 1.3);
    const block = { x: qx, y: y + 8, w: qw - 2, d: SM_D - 34, r: 0.8 };
    lines.push(k.planOutline(block, top, P, 2));
    for (let i = 1; i < 8; i++) faint.push(k.lineOnTop([qx + 3, y + 12 + i * 3], [qx + qw - 5, y + 12 + i * 3], top, P));
    faint.push(k.planOutline({ x: qx + 3, y: y + 12, w: qw - 8, d: 24, r: 0.4 }, top, P, 1));
    lines.push(k.planOutline({ x: qx + 6, y: y + 42, w: qw - 14, d: 14, r: 0.6 }, top, P, 1));
    faint.push(k.planOutline({ x: qx + 4, y: y + 60, w: qw - 10, d: SM_D - 90, r: 0 }, top, P, 1));
    for (let i = 1; i < 5; i++) faint.push(k.lineOnTop([qx + 4 + i * ((qw - 10) / 5), y + 60], [qx + 4 + i * ((qw - 10) / 5), y + SM_D - 30], top, P));
  }
  // L1 / shared memory strip and texture units along the front of the SM
  lines.push(k.planOutline({ x: x + 6, y: y + SM_D - 22, w: SM_W - 50, d: 14, r: 0.8 }, top, P, 2));
  for (let i = 1; i < 12; i++) faint.push(k.lineOnTop([x + 6 + i * ((SM_W - 50) / 12), y + SM_D - 22], [x + 6 + i * ((SM_W - 50) / 12), y + SM_D - 8], top, P));
  for (let i = 0; i < 4; i++) lines.push(k.planOutline({ x: x + SM_W - 40 + (i % 2) * 17, y: y + SM_D - 24 + Math.floor(i / 2) * 9, w: 14, d: 7, r: 0.5 }, top, P, 1));
  out.push(L(lines.join(""), { tone: "lo" }), L(faint.join(""), { tone: "faint" }));
  for (const [cx, cy] of k.corners(lid, 3)) out.push(screwAt(cx, cy, top, 1));
  out.push(topText(x + SM_W - 24, y + 5.2, top + 0.02, "SM " + n, 3.6, "", "so-engrave"));
  // cooling slots and a nameplate on the front face, slots on the right face
  const front = y + SM_D;
  const vents = [];
  for (let i = 0; i < 26; i++) vents.push(flat(x + 12 + i * 6.2, DIE_Z + 7, x + 15.4 + i * 6.2, DIE_Z + 17, 1.2, 2));
  out.push(`<g transform="${planeOf(front)}">${L(vents.join(""), { tone: "lo" })}${L(flat(x + SM_W - 54, DIE_Z + 7, x + SM_W - 12, DIE_Z + 17, 0.8, 2), { tone: "mid" })}</g>`);
  out.push(`<g transform="${planeOf(front)}"><text class="so-engrave" x="${x + SM_W - 33}" y="${-(DIE_Z + 10.6)}" font-size="3.6" text-anchor="middle">SM ${n}</text></g>`);
  const side = [];
  for (let i = 0; i < 12; i++) side.push(faceX(x + SM_W, y + 10 + i * 8.4, y + 14 + i * 8.4, DIE_Z + 7, DIE_Z + 17));
  out.push(L(side.join(""), { tone: "lo" }));
  return out.join("");
}
function l2() {
  const out = [S(k.slabOf(L2, DIE_Z, 10, P, 2, 0.3), { tone: "mid", crease: "lo" })];
  const top = DIE_Z + 10;
  const banks = [];
  for (const half of [[L2.x + 4, -26], [26, L2.x + L2.w - 4]]) {
    const [x0, x1] = half;
    const n = 20;
    for (let i = 0; i < n; i++) for (let row = 0; row < 2; row++) banks.push(k.planOutline({ x: x0 + (i * (x1 - x0)) / n + 0.6, y: L2.y + 3 + row * 10.4, w: (x1 - x0) / n - 1.2, d: 9.2, r: 0.3 }, top, P, 1));
  }
  out.push(L(banks.join(""), { tone: "faint" }));
  // the crossbar in the middle, a little proud of the cache
  const xbar = { x: -22, y: L2.y - 1, w: 44, d: L2.d + 2, r: 1 };
  out.push(S(k.slabOf(xbar, DIE_Z, 14, P, 2, 0.3), { tone: "hi", crease: "lo" }));
  const grid = [];
  grid.push(k.planOutline({ x: xbar.x + 3, y: xbar.y + 3, w: xbar.w - 6, d: xbar.d - 6, r: 0 }, DIE_Z + 14, P, 1));
  for (let i = 1; i < 8; i++) grid.push(k.lineOnTop([xbar.x + i * 5.5, xbar.y + 3], [xbar.x + i * 5.5, xbar.y + xbar.d - 3], DIE_Z + 14, P));
  for (let i = 1; i < 4; i++) grid.push(k.lineOnTop([xbar.x + 3, xbar.y + 3 + i * ((xbar.d - 6) / 4)], [xbar.x + xbar.w - 3, xbar.y + 3 + i * ((xbar.d - 6) / 4)], DIE_Z + 14, P));
  out.push(L(grid.join(""), { tone: "lo" }));
  out.push(topText(-120, L2.y + L2.d / 2, top + 0.02, "L2", 4, "", "so-engrave"));
  return out.join("");
}

// ---------- the opened SM ----------
function smBack() {
  const plan = { x: SMX, y: SMY, w: SM_W, d: SM_D, r: 1.5 };
  const out = [S(k.slabOf(plan, DIE_Z, FLOOR - DIE_Z, P, 2, 0.4), { tone: "lo", crease: "lo" })];
  out.push(L(k.planOutline(k.insetPlan(plan, 3.5), FLOOR, P, 2), { tone: "faint" }));
  out.push(S(k.slabOf(span(SMX, RIGHT, SMY, 3, 0.4), FLOOR, WALL - FLOOR, P, 2, 0.3), { tone: "mid" }));
  out.push(S(k.slabOf({ x: SMX, y: SMY + 3, w: 3, d: SM_D - 3, r: 0.4 }, FLOOR, WALL - FLOOR, P, 2, 0.3), { tone: "mid" }));
  for (let x = SMX + 14; x < RIGHT - 6; x += 38) out.push(screwAt(x, SMY + 1.5, WALL, 0.8));
  for (let y = SMY + 16; y < FRONT - 6; y += 34) out.push(screwAt(SMX + 1.5, y, WALL, 0.8));
  // a cable tray across the floor between the cabinets and the deck: the warp dispatch bus
  const tray = { x: SMX + 6, y: CAB_FRONT + 8, w: SM_W - 12, d: 12, r: 0.6 };
  out.push(S(k.slabOf(tray, FLOOR, 2.4, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  const well = k.insetPlan(tray, 1.2);
  out.push(`<path class="so-hole" d="${k.planOutline(well, FLOOR + 2.41, P, 2)}"/>`);
  const rungs = [k.planOutline(well, FLOOR + 2.42, P, 2)];
  for (let x = well.x + 6; x < well.x + well.w - 3; x += 6) rungs.push(k.lineOnTop([x, well.y], [x, well.y + well.d], FLOOR + 2.42, P));
  out.push(L(rungs.join(""), { tone: "mid" }));
  // three cable bundles in the tray, one to each cabinet
  out.push(L([3, 6, 9].map((dy) => k.lineOnTop([well.x, well.y + dy * 0.8 + 1], [well.x + well.w, well.y + dy * 0.8 + 1], FLOOR + 2.44, P)).join(""), { tone: "lo" }));
  return out.join("");
}
function cabinet(c, top = CAB_TOP) {
  const plan = { x: c.x, y: CAB.y, w: c.w, d: CAB.d, r: 1 };
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, FLOOR, 3, P)}" style="opacity:.55"/>`];
  out.push(S(k.slabOf(k.insetPlan(plan, 1.5), FLOOR, PLINTH - FLOOR, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  out.push(S(k.slabOf(plan, PLINTH, top - PLINTH, P, 2, 0.5), { tone: "mid", crease: "lo", inner: L(k.sideSeam(plan, top - 2.2, P, 2), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(plan, 2), top, P, 2), { tone: "faint" }));
  for (const [x, y] of k.corners(plan, 2.6)) out.push(screwAt(x, y, top, 0.9));
  for (const x of [c.x + 3.5, c.x + c.w - 3.5]) out.push(screwAt(x, CAB_FRONT + 2.2, FLOOR, 1));
  return out.join("");
}
function rack() {
  const g = GRID.rack;
  const out = [cabinet(RACK)];
  const pw = (g.x1 - g.x0) / g.cols;
  const ph = (g.z1 - g.z0) / g.rows;
  const cells = [];
  for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++) {
    const i = row * g.cols + col;
    const x0 = g.x0 + col * pw + 0.35, x1 = x0 + pw - 0.7;
    const z0 = g.z0 + row * ph + 0.3, z1 = z0 + ph - 0.6;
    cells.push(`<path class="so-cell so-drawer" data-drawer="${i}" d="${rect(x0, z0, x1, z1)}"/>`);
  }
  const handles = [];
  for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++) {
    const cx = g.x0 + (col + 0.5) * pw;
    const cz = g.z0 + (row + 0.5) * ph;
    handles.push(`M${(cx - 0.9).toFixed(2)} ${(-cz).toFixed(2)}H${(cx + 0.9).toFixed(2)}`);
  }
  const back = cells.join("") + `<path class="so-handle" d="${handles.join("")}"/>`;
  out.push(recess({ x0: g.x0 - 1, x1: g.x1 + 1, z0: g.z0 - 1, z1: g.z1 + 1, r: 0.8, depth: 2 }, CAB_FRONT, back, "so-bay"));
  // row ticks every 4 drawers down the right frame
  const ticks = [];
  for (let row = 0; row <= g.rows; row++) ticks.push(`M${g.x1 + 1.4} ${(-(g.z0 + row * ph)).toFixed(2)}h${row % 4 ? 0.8 : 1.6}`);
  out.push(`<g transform="${planeOf(CAB_FRONT)}"><path class="iso-line" data-tone="lo" d="${ticks.join("")}"/></g>`);
  out.push(lcdAt("regs-calc", RACK.x + 3, RACK.x + 61, 12.2, 22, CAB_FRONT, "REGISTERS ÷ PER BLOCK", 4.2));
  out.push(lcdAt("regs-free", RACK.x + 64, RACK.x + RACK.w - 3, 12.2, 22, CAB_FRONT, "FREE", 4.2));
  return out.join("");
}
function board() {
  const g = GRID.board;
  const out = [cabinet(BOARD)];
  const pw = (g.x1 - g.x0) / g.cols;
  const ph = (g.z1 - g.z0) / g.rows;
  const back = [];
  for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++) {
    const i = row * g.cols + col;
    const x0 = g.x0 + col * pw + 0.5, x1 = x0 + pw - 1;
    const z0 = g.z0 + row * ph + 0.5, z1 = z0 + ph - 1;
    back.push(`<path class="so-pocket" d="${rect(x0, z0, x1, z1)}"/>`);
    back.push(`<path class="so-cell so-tag" data-slot="${i}" d="${rect(x0 + 0.7, z0 + 0.5, x1 - 0.7, z1 - 1.4)}"/>`);
    back.push(`<text class="so-tag-n" data-slot-n="${i}" x="${((x0 + x1) / 2).toFixed(2)}" y="${(-(z0 + 1.9)).toFixed(2)}" font-size="2.2" text-anchor="middle"></text>`);
  }
  out.push(recess({ x0: g.x0 - 1, x1: g.x1 + 1, z0: g.z0 - 1, z1: g.z1 + 1, r: 0.8, depth: 2 }, CAB_FRONT, back.join(""), "so-bay"));
  out.push(lcdAt("slots-calc", BOARD.x + 3, BOARD.x + BOARD.w - 3, 12.2, 22, CAB_FRONT, "WARP SLOTS ÷ 8", 4.2));
  return out.join("");
}
function shelves() {
  const g = GRID.shelf;
  const out = [cabinet(SHELF)];
  const pw = (g.x1 - g.x0) / g.cols;
  const ph = (g.z1 - g.z0) / g.rows;
  const back = [];
  for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++) {
    const i = row * g.cols + col;
    const x0 = g.x0 + col * pw + 0.7, x1 = x0 + pw - 1.4;
    const z0 = g.z0 + row * ph + 0.55, z1 = z0 + ph - 1.1;
    back.push(`<path class="so-cell so-box" data-shelf="${i}" d="${rect(x0, z0, x1, z1)}"/>`);
  }
  // shelf boards and uprights
  const boards = [];
  for (let row = 0; row <= g.rows; row++) boards.push(`M${g.x0} ${(-(g.z0 + row * ph)).toFixed(2)}H${g.x1}`);
  for (let col = 0; col <= g.cols; col += 4) boards.push(`M${(g.x0 + col * pw).toFixed(2)} ${-g.z0}V${-g.z1}`);
  back.push(`<path class="iso-line" data-tone="mid" d="${boards.join("")}"/>`);
  out.push(recess({ x0: g.x0 - 1, x1: g.x1 + 1, z0: g.z0 - 1, z1: g.z1 + 1, r: 0.8, depth: 2 }, CAB_FRONT, back.join(""), "so-bay"));
  out.push(lcdAt("shared-calc", SHELF.x + 3, SHELF.x + SHELF.w - 3, 12.2, 22, CAB_FRONT, "96 KB ÷ PER BLOCK", 4.2));
  return out.join("");
}
// A gauge on each cabinet top: how many more blocks that resource would still allow.
function gauge(name) {
  const { at: [x, y], r: R, cab } = GAUGES[name];
  const out = [`<g data-gauge="${name}">`];
  out.push(S(k.cylinder(x, y, R, CAB_TOP, DIAL_Z - CAB_TOP, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, R, DIAL_Z - 3, DIAL_Z, 64, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(x, y, R - 1.6, DIAL_Z, P, 64), { tone: "lo" }));
  out.push(`<path class="so-face" d="${k.ring(x, y, R - 1.7, DIAL_Z + 0.01, P, 64)}Z"/>`);
  const ticks = k.radialTicks(x, y, R - 1.8, 18, 4, DIAL_Z + 0.02, [1, 2.2], P, SWEEP[0], SWEEP[1]);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  for (const [v, label] of [[0, "0"], [8, "8"], [16, "16"], [18, "∞"]]) {
    const a = SWEEP[0] + (v / 18) * SWEEP[1];
    out.push(topText(x + Math.sin(a) * (R - 5.4), y - Math.cos(a) * (R - 5.4), DIAL_Z + 0.03, label, 2.4, "", "so-dial-n"));
  }
  out.push(`<path class="iso-line so-arc" data-part="arc" data-tone="lit" style="stroke-width:1.1" d=""/>`);
  out.push(L(k.ring(x, y, 1.3, DIAL_Z + 0.2, P, 16), { tone: "mid" }));
  out.push(`<path class="iso-line so-needle" data-part="needle" data-tone="lit" data-free="start" style="stroke-width:1" d="${needleAt(name, 18)}"/>`);
  out.push(D([at([x, y, DIAL_Z + 0.3])], { size: 0.7, tone: "hi" }));
  // digit window on the left, limit lamp on the right
  const side = R + 7.5;
  const win = { x: x - R - 14.5, y: y - 5, w: 12, d: 10, r: 0.6 };
  out.push(`<path class="so-lcd" d="${k.planOutline(win, CAB_TOP + 0.02, P, 2)}"/>`);
  out.push(L(k.planOutline(win, CAB_TOP + 0.02, P, 2), { tone: "lo" }));
  out.push(topText(win.x + win.w / 2, y, CAB_TOP + 0.04, "", 6.2, 'data-part="more"', "so-lcd-text"));
  out.push(S(k.cylinder(x + side, y, 2.6, CAB_TOP, 1, P, 20, 0.3), { tone: "lo" }));
  out.push(S(k.cylinder(x + side, y, 1.9, CAB_TOP + 1, 1.6, P, 18, 0.4), { tone: "mid", crease: "lo", className: "so-lamp" }));
  out.push(`</g>`);
  return out.join("");
}
function needleAt(name, value) {
  const { at: [x, y], r: R } = GAUGES[name];
  const a = SWEEP[0] + (Math.min(value, 18) / 18) * SWEEP[1];
  return k.lineOnTop([x - Math.sin(a) * 2.4, y + Math.cos(a) * 2.4], [x + Math.sin(a) * (R - 3.2), y - Math.cos(a) * (R - 3.2)], DIAL_Z + 0.2, P);
}
function deck() {
  const out = [];
  const spur = { x: DOOR.x0 + 1, y: DECK.y + DECK.d - 1, w: DOOR.x1 - DOOR.x0 - 2, d: FRONT - (DECK.y + DECK.d) + 1, r: 0.4 };
  out.push(S(k.slabOf(DECK, FLOOR, RIDE - FLOOR, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  out.push(S(k.slabOf(spur, FLOOR, RIDE - FLOOR, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  // rollers across the deck and the spur
  const rollers = [];
  for (let x = DECK.x + 3; x < DECK.x + DECK.w - 2; x += 4) rollers.push(k.lineOnTop([x, DECK.y + 3], [x, DECK.y + DECK.d - 3], RIDE, P));
  for (let y = DECK.y + DECK.d + 2; y < FRONT; y += 4) rollers.push(k.lineOnTop([spur.x + 2, y], [spur.x + spur.w - 2, y], RIDE, P));
  out.push(L(rollers.join(""), { tone: "lo" }));
  // the roller axles sit in two side rails along the deck and the spur
  const rails = [DECK.y + 3, DECK.y + DECK.d - 3].map((y) => k.lineOnTop([DECK.x + 1, y], [DECK.x + DECK.w - 1, y], RIDE, P));
  rails.push(...[spur.x + 2, spur.x + spur.w - 2].map((x) => k.lineOnTop([x, DECK.y + DECK.d - 3], [x, FRONT], RIDE, P)));
  out.push(L(rails.join(""), { tone: "mid" }));
  // bay plates, numbered 0 to 7, from the far end back to the door
  for (let i = 0; i < 8; i++) {
    const x = BAY_X(i);
    out.push(L(k.planOutline({ x: x - 10.5, y: DECK.y + 1.5, w: 21, d: DECK.d - 3, r: 0.8 }, RIDE + 0.01, P, 2), { tone: "faint" }));
    out.push(topText(x, DECK.y + DECK.d - 2.6, RIDE + 0.02, String(i), 2.4, `data-bay="${i}"`, "so-mark"));
  }
  return out.join("");
}
function smFront() {
  const out = [];
  // the near walls, cut down to sills, with the door gap on the left
  out.push(S(k.slabOf(span(SMX + 3, POSTS[0][0], FRONT - 3, 3, 0.4), FLOOR, SILL - FLOOR, P, 2, 0.3), { tone: "hi", crease: "lo", className: "so-cut" }));
  out.push(S(k.slabOf(span(POSTS[1][1], RIGHT, FRONT - 3, 3, 0.4), FLOOR, SILL - FLOOR, P, 2, 0.3), { tone: "hi", crease: "lo", className: "so-cut" }));
  out.push(S(k.slabOf({ x: RIGHT - 3, y: SMY + 3, w: 3, d: SM_D - 6, r: 0.4 }, FLOOR, SILL - FLOOR, P, 2, 0.3), { tone: "hi", crease: "lo", className: "so-cut" }));
  // SM status displays along the front sill
  out.push(lcdAt("blocks", 56, 86, 12.6, 20.4, FRONT, "BLOCKS", 4.6));
  out.push(lcdAt("warps", 89, 129, 12.6, 20.4, FRONT, "WARPS / 64", 4.6));
  out.push(lcdAt("occ", 132, 170, 12.6, 20.4, FRONT, "OCCUPANCY", 4.6));
  out.push(lcdAt("limit", 173, 248, 12.6, 20.4, FRONT, "LIMITED BY", 4.2));
  return out.join("");
}
function gatePost([x0, x1]) {
  const plan = { x: x0, y: FRONT - 4, w: x1 - x0, d: 5, r: 0.5 };
  return S(k.slabOf(plan, FLOOR, GATE_TOP - FLOOR, P, 2, 0.3), { tone: "mid", crease: "lo" }) + screwAt((x0 + x1) / 2, FRONT - 1.5, GATE_TOP, 0.7);
}
function gate() {
  const out = [];
  // the gate plate slides in the posts: down blocks the door, up lets a crate through
  const plate = { x: DOOR.x0, y: FRONT - 2.6, w: DOOR.x1 - DOOR.x0, d: 2.2, r: 0.3 };
  out.push(`<g data-part="gate">${S(k.slabOf(plate, RIDE, 14, P, 2, 0.2), { tone: "hi", crease: "lo", className: "so-gate", inner: L(k.sideSeam(plate, RIDE + 7, P, 2), { tone: "lo" }) })}</g>`);
  out.push(gatePost(POSTS[1]));
  const lintel = { x: POSTS[0][0], y: FRONT - 4.5, w: POSTS[1][1] - POSTS[0][0], d: 6, r: 0.6 };
  out.push(S(k.slabOf(lintel, GATE_TOP, 4, P, 2, 0.3), { tone: "mid", crease: "lo" }));
  out.push(S(k.cylinder(DOOR.cx, FRONT - 1.5, 2.2, GATE_TOP + 4, 1.6, P, 18, 0.4), { tone: "mid", crease: "lo", className: "so-lamp", lit: false }).replace('class="iso-solid', 'data-part="door-lamp" class="iso-solid'));
  return out.join("");
}

// ---------- dispatcher and conveyor ----------
function dispatcher() {
  const out = [`<path class="iso-halo" d="${k.haloOf(DISP, DIE_Z, 5, P)}" style="opacity:.7"/>`];
  out.push(S(k.slabOf(k.insetPlan(DISP, 2), DIE_Z, 4, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  out.push(S(k.slabOf(DISP, DIE_Z + 4, DISP_TOP - DIE_Z - 4, P, 2, 0.5), { tone: "mid", crease: "lo", inner: L(k.sideSeam(DISP, DISP_TOP - 3, P, 2) + k.sideSeam(DISP, DIE_Z + 8, P, 2), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(DISP, 3), DISP_TOP, P, 2), { tone: "faint" }));
  for (const [x, y] of k.corners(DISP, 3.4)) out.push(screwAt(x, y, DISP_TOP, 1));
  // the kernel's launch numbers on the front panel
  const fy = DISP.y + DISP.d;
  out.push(lcdAt("k-regs", DISP.x + 4, DISP.x + 49, 32, 43, fy, "REGISTERS / THREAD", 6));
  out.push(lcdAt("k-threads", DISP.x + 52, DISP.x + 96, 32, 43, fy, "THREADS / BLOCK", 6));
  out.push(lcdAt("k-shared", DISP.x + 4, DISP.x + 49, 17, 28, fy, "SHARED / BLOCK", 6));
  out.push(lcdAt("k-perblock", DISP.x + 52, DISP.x + 96, 17, 28, fy, "REGISTERS / BLOCK", 6));
  out.push(`<g transform="${planeOf(fy)}">${L(Array.from({ length: 12 }, (_, i) => flat(DISP.x + 6 + i * 7.6, 46, DISP.x + 8 + i * 7.6, 48.4, 0.8, 2)).join(""), { tone: "lo" })}</g>`);
  // output port on the right face, at belt height
  const px = DISP.x + DISP.w;
  const port = [[px, CONV.y0 + 2, RIDE], [px, CONV.y1 - 2, RIDE], [px, CONV.y1 - 2, RIDE + 16], [px, CONV.y0 + 2, RIDE + 16]];
  out.push(`<path class="so-hole" d="${k.pathOf(port.map(at), true)}"/>`);
  out.push(L(k.pathOf(port.map(at), true), { tone: "lo" }));
  // the hopper on top: the grid of blocks still to run, stacked grey crates
  const hop = { x: DISP.x + 10, y: DISP.y + 8, w: 64, d: 42, r: 1 };
  out.push(S(k.slabOf(hop, DISP_TOP, 3, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  const stacked = [];
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) stacked.push([hop.x + 11 + col * 21, hop.y + 11 + row * 20, DISP_TOP + 3]);
  stacked.push([hop.x + 21, hop.y + 21, DISP_TOP + 3 + CRATE.h], [hop.x + 42, hop.y + 21, DISP_TOP + 3 + CRATE.h]);
  for (const [x, y, z] of byDepth(stacked, (p) => p)) out.push(crateBody(x, y, z, true));
  out.push(topText(DISP.x + 88, DISP.y + DISP.d / 2, DISP_TOP + 0.02, "GIGATHREAD", 3, `transform-origin="0 0"`, "so-engrave").replace(/transform="([^"]+)"/, `transform="${k.topMatrix([DISP.x + 88, DISP.y + DISP.d / 2], DISP_TOP + 0.02, P, "y")}"`));
  return out.join("");
}
function conveyor() {
  const out = [];
  const belt = { x: CONV.x0, y: CONV.y0 + 2, w: CONV.x1 - CONV.x0, d: CONV.y1 - CONV.y0 - 4, r: 0.5 };
  // legs under the frame
  for (let x = CONV.x0 + 8; x < CONV.x1; x += 48) for (const y of [CONV.y0 + 1, CONV.y1 - 3]) out.push(S(k.slabOf({ x, y, w: 3, d: 2, r: 0.3 }, DIE_Z, RIDE - 3 - DIE_Z, P, 1), { tone: "lo", crease: "none" }));
  out.push(S(k.slabOf(belt, RIDE - 3, 3, P, 2, 0.3), { tone: "lo", crease: "lo", className: "so-belt" }));
  // the transfer joining the belt to the door
  const transfer = { x: DOOR.x0 + 1, y: FRONT, w: DOOR.x1 - DOOR.x0 - 2, d: CONV.y0 + 2 - FRONT, r: 0.3 };
  out.push(S(k.slabOf(transfer, RIDE - 3, 3, P, 2, 0.3), { tone: "lo", crease: "lo" }));
  const slats = [];
  for (let x = CONV.x0 + 3; x < CONV.x1 - 1; x += 5) slats.push(k.lineOnTop([x, belt.y + 1], [x, belt.y + belt.d - 1], RIDE, P));
  for (let y = FRONT + 3; y < CONV.y0 + 2; y += 4) slats.push(k.lineOnTop([transfer.x + 2, y], [transfer.x + transfer.w - 2, y], RIDE, P));
  out.push(`<path class="iso-line so-slats" data-tone="lo" d="${slats.join("")}"/>`);
  // side rails, the far one left open at the transfer
  const rail = (x0, x1, y) => S(k.slabOf(span(x0, x1, y, 2, 0.4), RIDE - 3, 5, P, 2, 0.3), { tone: "mid", crease: "lo" });
  out.push(rail(CONV.x0, DOOR.x0, CONV.y0));
  out.push(rail(DOOR.x1, CONV.x1, CONV.y0));
  out.push(S(k.slabOf({ x: CONV.x1, y: CONV.y0, w: 2, d: CONV.y1 - CONV.y0, r: 0.4 }, RIDE - 3, 5, P, 2, 0.3), { tone: "mid", crease: "lo" }));
  return out.join("");
}
function railFront() {
  return S(k.slabOf(span(CONV.x0, CONV.x1 + 2, CONV.y1 - 2, 2, 0.4), RIDE - 3, 5, P, 2, 0.3), { tone: "mid", crease: "lo" });
}
// One crate: a block of 256 threads, carrying 8 warp spools. Built centred at (x, y) on z.
function crateBody(x, y, z, grey = false) {
  const h = CRATE.s / 2;
  const plan = { x: x - h, y: y - h, w: CRATE.s, d: CRATE.s, r: 0.8 };
  const out = [];
  out.push(S(k.slabOf(plan, z, CRATE.h, P, 2, 0.4), { tone: "hi", crease: "lo", className: grey ? "so-crate so-grey" : "so-crate", inner: L(k.sideSeam(plan, z + 3.4, P, 2) + k.sideSeam(plan, z + 6.8, P, 2), { tone: "lo", className: "so-slat" }) }));
  const well = k.insetPlan(plan, 1.6);
  out.push(`<path class="so-well" d="${k.planOutline(well, z + CRATE.h + 0.01, P, 2)}"/>`);
  out.push(L(k.planOutline(well, z + CRATE.h + 0.01, P, 2), { tone: "lo" }));
  return out.join("");
}
function crate(i) {
  const z = RIDE;
  const out = [`<g data-crate="${i}" style="display:none">`, crateBody(0, 0, z)];
  const spools = [];
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) spools.push({ j: row * 4 + col, x: -6.3 + col * 4.2, y: -3 + row * 6 });
  for (const sp of byDepth(spools, (p) => [p.x, p.y, z])) {
    out.push(`<g data-spool="${sp.j}">${S(k.cylinder(sp.x, sp.y, 1.75, z + CRATE.h - 1, 3.4, P, 16, 0.3), { tone: "hi", crease: "lo", className: "so-spool" })}${L(k.ring(sp.x, sp.y, 0.7, z + CRATE.h + 2.4, P, 10), { tone: "lo" })}</g>`);
  }
  out.push(`</g>`);
  return out.join("");
}
const CRATES = 14;

// ---------- labels ----------
// Each label sits at an offset from the point it names, in drawing pixels.
const LABELS = [
  { name: "Dispatcher", at: [DISP.x + 30, DISP.y + 10, DISP_TOP + 3], off: [-34, -30], align: "end" },
  { name: "Blocks waiting (8 warps each)", at: [-60, CONV.y1, RIDE], off: [-20, 64], align: "end" },
  { name: "Door", at: [POSTS[1][1], FRONT, GATE_TOP + 2], off: [-6, 92] },
  { name: "Registers", at: [RACK.x + 10, CAB.y + 4, CAB_TOP], off: [-30, -26], align: "end" },
  { name: "Warp slots", at: [BOARD.x + 44, CAB.y + 4, CAB_TOP], off: [-6, -44] },
  { name: "Shared memory", at: [SHELF.x + 54, CAB.y + 6, CAB_TOP], off: [-4, -34] },
  { name: "Blocks on the SM", at: [BAY_X(0) + 9, LANE_Y + 9, RIDE], off: [-24, 78] },
];
function labels() {
  const out = [];
  for (const label of LABELS) {
    const [ax, ay] = at(label.at);
    const tx = Math.round(ax + label.off[0]), ty = Math.round(ay + label.off[1]);
    const align = label.align || "start";
    const ex = align === "start" ? tx - 3 : align === "end" ? tx + 3 : tx;
    const ey = ty - 2.6;
    out.push(L(k.pathOf([[ax, ay], [ex, ey]]), { tone: "mid", free: "end", className: "so-leader" }));
    out.push(`<circle class="so-pin" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="1.5"/>`);
    const lines = label.name.split("\n");
    out.push(`<text class="so-label" x="${tx}" y="${ty}" text-anchor="${align}">${lines.map((line, i) => `<tspan x="${tx}" dy="${i ? 9 : 0}">${line}</tspan>`).join("")}</text>`);
  }
  return `<g class="so-labels">${out.join("")}</g>`;
}

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A GPU package on a bench: four HBM memory stacks behind a die, and on the die four streaming multiprocessors around an L2 cache and crossbar. The front right SM has its lid off. Inside it, three cabinets stand side by side: a register rack of 256 drawers, each holding 256 registers; a warp scheduler board of 64 slots; and shared memory as 96 shelves of 1 KB. Each cabinet carries a gauge showing how many more thread blocks it would allow. At the front left of the die a dispatcher feeds a conveyor of crates, each crate a thread block of 8 warps, through a gated door into the SM, where they park in numbered bays.",
  body: [
    plate(),
    substrate(),
    die(),
    lidded(COLS[0], ROWS[0], 0),
    lidded(COLS[1], ROWS[0], 1),
    l2(),
    lidded(COLS[0], ROWS[1], 2),
    smBack(),
    rack(),
    board(),
    shelves(),
    gauge("regs"),
    gauge("slots"),
    gauge("shared"),
    deck(),
    gatePost(POSTS[0]),
    `<g data-layer="inside"></g>`,
    smFront(),
    gate(),
    dispatcher(),
    conveyor(),
    `<g data-layer="outside">${Array.from({ length: CRATES }, (_, i) => crate(i)).join("")}</g>`,
    railFront(),
    labels(),
  ],
});

// ---------- page ----------
const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${modelSource}
const P = ${JSON.stringify(P)};
const GAUGES = ${JSON.stringify(GAUGES)}, DIAL_Z = ${DIAL_Z}, SWEEP = ${JSON.stringify(SWEEP)};
const GEO = ${JSON.stringify({ WAIT, LANE_Y, CONV_Y, DOOR, FRONT, SPAWN_X, RIDE, CRATE, BAYS: Array.from({ length: 8 }, (_, i) => BAY_X(i)), QUEUE: Array.from({ length: 7 }, (_, i) => QUEUE_X(i)), CRATES })};
const AX = ${JSON.stringify({ x: k.axisVector(P, [1, 0, 0]), y: k.axisVector(P, [0, 1, 0]), z: k.axisVector(P, [0, 0, 1]) })};
${readFileSync(join(HERE, "live.js"), "utf8")}
`;
const css = readFileSync(join(HERE, "sm-occupancy.css"), "utf8");

const STEPS = ["Compile at 32 registers", "Dispatch blocks", "Cut to 16 registers", "Reserve 16 KB shared", "Grow to 64 registers", "Try 40 registers, 12 KB", "New kernel"];
const steps = STEPS.map((label, i) => `<button class="so-step" type="button" data-step="${i}"${i === 0 ? "" : " disabled"}><span class="so-step-n">${String(i + 1).padStart(2, "0")}</span><span>${label}</span><span class="so-step-fill" aria-hidden="true"></span></button>`).join("");

const chips = [
  ["needs", "each block needs", "-"],
  ["regs", "registers allow", "-"],
  ["slots", "warp slots allow", "-"],
  ["shared", "shared memory allows", "-"],
  ["fits", "blocks that fit", "-"],
  ["occ", "occupancy", "-"],
  ["left", "left over", "-"],
]
  .map(([key, name, value]) => `<span class="so-chip" data-chip-box="${key}"><span class="so-chip-name">${name}</span><span class="so-chip-value" data-chip="${key}">${value}</span></span>`)
  .join("");

const fmt = (n) => n.toLocaleString("en-US");
const ledgerRows = M.KERNELS.map((kern, i) => {
  const f = M.fit(kern);
  const allow = (v) => (v === Infinity ? "∞" : String(v));
  const exact = f.allow.regsExact % 1 ? ` (${f.allow.regsExact.toFixed(1)})` : "";
  return `<tr data-case="${i}"><td>${kern.regs} reg · ${kern.sharedKB} KB</td><td>${fmt(f.perBlock)}</td><td>${f.allow.regs}${exact}</td><td>${f.allow.slots}</td><td>${allow(f.allow.shared)}</td><td><b>${f.blocks}</b></td><td>${f.warps}</td><td>${Math.round(f.occupancy * 1000) / 10}%</td><td>${M.limitText(f.limits)}</td></tr>`;
}).join("");
const ledger = `<div class="so-ledger-wrap"><table class="so-ledger" aria-label="The five demo kernels, from the model"><thead><tr><th>kernel</th><th>reg / block</th><th>reg allow</th><th>warp slots allow</th><th>shared allows</th><th>blocks</th><th>warps</th><th>occupancy</th><th>decided by</th></tr></thead><tbody>${ledgerRows}<tr data-case="new"><td data-new="kernel">new kernel</td><td data-new="perblock">-</td><td data-new="regs">-</td><td data-new="slots">-</td><td data-new="shared">-</td><td data-new="blocks">-</td><td data-new="warps">-</td><td data-new="occ">-</td><td data-new="limit">-</td></tr></tbody></table></div>`;

const plateBox = k.plateHtml({
  fig: "Fig 4",
  title: "How many warps fit on one SM",
  hint: "Press the lit step",
  readout: "idle",
  keys: [
    { mark: "lit", label: "Each colour is one block, and so are the drawers, slots and shelves it takes" },
    { mark: "raised", label: "Each dial counts how many more blocks still fit" },
    { mark: "flat", label: "Red: the one that ran out first and stopped the next block" },
  ],
  caption: "",
  body: `<div class="iso-stage so-stage">${svg}<span class="so-sr" role="status" aria-live="polite" data-status></span></div>`,
});

const notes = `<details class="so-notes"><summary>Where the numbers come from</summary><ul>
<li><b>The model:</b> blocks that fit = the smallest of floor(65,536 / (registers per thread × 256)), floor(64 / 8) and floor(96 KB / shared memory per block). Occupancy = resident warps / 64. An SM only takes whole blocks. Every number in the figure, the chips and the table comes from that one function.</li>
<li><b>Real per-SM numbers:</b> 65,536 32-bit registers per SM is real for every NVIDIA GPU from Kepler to Hopper. The 64-warp cap (2,048 threads) is real for many of them (Volta V100, A100, H100), but it varies by generation: consumer Ampere and Ada GPUs (compute capability 8.6 and 8.9) cap at 48 warps, and Turing at 32. Up to 96 KB of shared memory per SM is real for Volta, but it varies too: A100 allows up to 164 KB, H100 228 KB, and consumer Ampere 100 KB. Source: the CUDA C++ Programming Guide, "Compute Capabilities" table.</li>
<li><b>What the model leaves out:</b> registers are handed out in chunks (per warp, in units of 256 registers on recent GPUs), so a kernel's real register use is rounded up. There is also a cap on resident blocks per SM (16 to 32, depending on the GPU) that can bind for small blocks. And on recent GPUs (Ampere and later) the CUDA runtime reserves 1 KB of shared memory for each block, so a block asking for 16 KB really takes 17 KB. All three can lower the counts shown here. NVIDIA's occupancy calculator (in Nsight Compute) includes them.</li>
<li><b>One drawer = one register for a whole block:</b> a drawer holds 256 registers, and a block has 256 threads, so a block using r registers per thread fills exactly r drawers. 40 registers × 256 threads = 10,240 per block, and 65,536 / 10,240 = 6.4, so 6 blocks fit and 16 drawers (4,096 registers) stay empty because no block fits in them.</li>
<li><b>The die</b> is drawn with four SMs to leave room for the open one. Real GPUs have from a handful to well over a hundred (H100 SXM has 132). The dispatcher stands for the GigaThread engine, the hardware that hands thread blocks to SMs.</li>
<li><b>Occupancy is not speed.</b> More resident warps give the scheduler more to switch between while others wait on memory, but a kernel at 50% occupancy that keeps more data in registers can still be faster.</li>
</ul></details>`;

const body = `<style>${css}</style><div class="so-layout"><nav class="so-steps" aria-label="Steps">${steps}<button class="so-toggle" type="button" aria-pressed="true" data-labels>Labels: on</button></nav><div class="so-main">${plateBox}<p class="so-say" data-say aria-live="polite"></p><div class="so-chips" aria-label="Live numbers">${chips}</div><p class="so-idea"><b>The big idea:</b> the tightest of three limits sets how many warps fit.</p>${ledger}${notes}</div></div>`;

const name = theme === "light" ? "sm-occupancy-light.html" : "sm-occupancy.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Warps per SM", theme, body, script: kitScript() + live, width: 1180 }));
console.log("wrote", name, (svg.length / 1024).toFixed(0) + " KB svg");

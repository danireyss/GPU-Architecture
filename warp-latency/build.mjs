import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/danielreyes/.claude/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "/Users/danielreyes/.claude/skills/anatomy/scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 900;
const HEIGHT = 560;

// World: x along the card, y across it (+y is the edge with the gold fingers), z up.
const PCB = { x: -300, y: -150, w: 568, d: 300, r: 4 };
const PCB_Z = 14;
const PCB_TOP = 17;
const PKG = { x: -212, y: -132, w: 400, d: 268, r: 6 };
const PKG_TOP = 19.5;
const DIE = { x: -204, y: -124, w: 384, d: 252, r: 2 };
const DIE_TOP = 22;
const L2 = { x: -198, y: -118, w: 346, d: 30, r: 1.5 };
const L2_TOP = 28;
const XBAR = { x: -198, y: -84, w: 346, d: 5, r: 0.6 };
const SM_Y = -75;
const SM_D = 197;
const SM_W = 112.6;
const SM_X = [35.4, -81.2, -197.8]; // SM 0 is nearest the viewer
const SM_TOP = 32;
const LID_TOP = 33.6;
const MC = [
  { x: 154, y: -118, w: 22, d: 110, r: 1.2 },
  { x: 154, y: 0, w: 22, d: 122, r: 1.2 },
];
const MC_TOP = 26.5;
const VRAM = [
  { x: 206, y: -100, w: 52, d: 54, r: 1.6 },
  { x: 206, y: 46, w: 52, d: 54, r: 1.6 },
];
const VRAM_TOP = PCB_TOP + 3.6;

// SM 0, opened: a tray whose two near walls are cut down to a sill.
// Its insides are laid out in local units on a 74 x 144 grid and stretched to the tray.
const S0 = { x: SM_X[0], y: SM_Y, w: SM_W, d: SM_D };
const UX = S0.w / 74;
const UY = S0.d / 144;
const lx = (x) => S0.x + x * UX;
const ly = (y) => S0.y + y * UY;
const local = ({ x, y, w, d, r = 1 }) => ({ x: lx(x), y: ly(y), w: w * UX, d: d * UY, r });
const FLOOR = DIE_TOP + 1;
const WALL = 2;
const SILL = FLOOR + 3.4;
const TANK = local({ x: 5, y: 6, w: 26, d: 22 });
const TANK_Z = FLOOR + 2;
const TANK_H = 32;
const L1 = local({ x: 38, y: 5, w: 31, d: 13 });
const L1_H = 8;
const LDST = local({ x: 38, y: 20.5, w: 31, d: 8 });
const LDST_H = 6;
const LANE = { x0: 6.2, pitch: 8, w: 6.2, y0: 35, rowPitch: 9.6, d: 7.4, z: FLOOR + 1, h: 5 };
const BUS = local({ x: 4, y: 74.4, w: 66, d: 3.4, r: 0.6 });
const SCHED = local({ x: 4, y: 81, w: 66, d: 58, r: 1.5 });
const SCHED_TOP = FLOOR + 3.4;

const CON = { x: -322, y: 186, w: 230, d: 54, r: 4 };
const CON_Z = 2.4;
const CON_TOP = 46;
const FRONT = CON.y + CON.d;
const DIAL = [-136, 211];
const DIAL_R = 19;
const DIAL_TOP = CON_TOP + 7;
const SWEEP = [-0.75 * Math.PI, 1.5 * Math.PI];
const KNOB = [-190, 214];
const KNOB_R = 6;
const KNOB_TOP = CON_TOP + 5;
const KNOB_AT = (wait) => -Math.PI / 2 + ((wait - 100) / 200) * Math.PI;

const P = k.fitProjection(
  [...k.boxCorners(PCB, 0, PCB_TOP), [-324, 166, 52], [-306, -157, 52], ...k.boxCorners(CON, 0, DIAL_TOP + 2), [TANK.x, TANK.y, TANK_Z + TANK_H + 2]],
  WIDTH,
  HEIGHT,
  { pad: 16, azimuth: 50, elevation: 38 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth = (x, y, z = 0) => k.depthOf([x, y, z], P);
const byDepth = (list, centre) => [...list].sort((a, b) => depth(...centre(a)) - depth(...centre(b)));
const mid = (plan) => [plan.x + plan.w / 2, plan.y + plan.d / 2];
const planeOf = (y) => k.sideMatrix([0, y], 0, P, "left");
const flat = (x0, z0, x1, z1, r, steps = 6) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const rect = (plan, z) => k.onTop(k.ringOf({ ...plan, r: 0 }, 1), z, P, true);
const fillOn = (plan, z, cls) => `<path class="${cls}" d="${rect(plan, z)}"/>`;
const screwAt = (x, y, z, r = 1.6) => L(k.ring(x, y, r, z, P, 14), { tone: "lo" }) + D([at([x, y, z])], { size: 0.45 });

// ---------- recess for windows on the console's front face (as in the desk computer) ----------
let clips = 0;
function recess({ x0, x1, z0, z1, r, depth: deep }, y, back = "", backClass = "gl-lcd") {
  const id = `gl-clip-${clips++}`;
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
    `<g transform="${planeOf(y - deep)}"><path class="${backClass}" d="${shape}"/>${back}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
    `</g>`,
    `<g transform="${planeOf(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}

// ---------- the bench and the card ----------
function standoffs() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PCB, 0, 6, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PCB, 18), (p) => [p[0], p[1]])) {
    out.push(S(k.cylinder(x, y, 7, 0, 2, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 4.4, 2, PCB_Z - 2, P, 24), { tone: "mid" }));
    out.push(L(k.sideArc(x, y, 4.4, 8, P, 16), { tone: "faint" }));
  }
  return out.join("");
}

function bracket() {
  const out = [];
  const plate = { x: -306, y: -157, w: 4, d: 314, r: 0.6 };
  out.push(S(k.slabOf(plate, 6, 44, P, 2, 0.4), { tone: "mid" }));
  // vent slots and port windows on its inner face (x = -322), as closed outlines
  const face = (y0, y1, z0, z1, r = 1) => k.pathOf(k.roundedPlan({ x: y0, y: z0, w: y1 - y0, d: z1 - z0, r }, 3).map(([y, z]) => at([-302, y, z])), true);
  const slots = [];
  for (let y = -140; y <= -80; y += 6) slots.push(face(y, y + 2.4, 14, 42, 1.2));
  out.push(L(slots.join(""), { tone: "lo" }));
  out.push(L([face(-66, -42, 22, 32, 1.5), face(-34, -10, 22, 32, 1.5), face(-2, 22, 22, 32, 1.5), face(30, 50, 22, 31, 1.5)].join(""), { tone: "mid" }));
  // top tab bent outward, with its screw slot
  const tab = { x: -324, y: 143, w: 22, d: 14, r: 1 };
  out.push(S(k.slabOf(tab, 46, 4, P, 3, 0.4), { tone: "mid" }));
  out.push(L(k.planOutline({ x: -320, y: 147.6, w: 10, d: 4.8, r: 2.4 }, 50, P, 4), { tone: "lo" }));
  return out.join("");
}

function pcb() {
  const out = [S(k.slabOf(PCB, PCB_Z, PCB_TOP - PCB_Z, P, 4, 0.8), { tone: "mid", crease: "lo" })];
  out.push(L(k.planOutline(k.insetPlan(PCB, 4), PCB_TOP, P, 4), { tone: "faint" }));
  for (const [x, y] of k.corners(PCB, 18)) out.push(L(k.ring(x, y, 4.2, PCB_TOP, P, 18), { tone: "lo" }), L(k.ring(x, y, 2.4, PCB_TOP, P, 14), { tone: "faint" }));
  // silkscreen frames round the VRAM chips and the package
  for (const chip of VRAM) out.push(L(k.planOutline(k.insetPlan(chip, -3), PCB_TOP, P, 2), { tone: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(PKG, -4), PCB_TOP, P, 4), { tone: "faint" }));
  return out.join("");
}

function fingers() {
  const tab = { x: -226, y: PCB.y + PCB.d - 1, w: 214, d: 11, r: 0.5 };
  const out = [S(k.slabOf(tab, PCB_Z, PCB_TOP - PCB_Z, P, 2, 0.4), { tone: "mid", crease: "lo" })];
  const pads = [];
  for (let x = tab.x + 4; x < tab.x + tab.w - 4; x += 4.2) {
    if (x > tab.x + 42 && x < tab.x + 50) continue; // the key notch
    pads.push(rect({ x, y: tab.y + 2, w: 2.6, d: 8.2 }, PCB_TOP));
  }
  out.push(`<path class="gl-cu" d="${pads.join("")}"/>`);
  // the key notch is a cut in the tab
  out.push(fillOn({ x: tab.x + 43, y: tab.y + 3.6, w: 5, d: 7.4 }, PCB_TOP, "gl-hole"));
  out.push(L(k.onTop([[tab.x + 43, tab.y + 11], [tab.x + 43, tab.y + 3.6], [tab.x + 48, tab.y + 3.6], [tab.x + 48, tab.y + 11]], PCB_TOP, P), { tone: "lo" }));
  return out.join("");
}

function vrm() {
  const out = [];
  const parts = [];
  for (let i = 0; i < 10; i++) parts.push({ kind: "choke", x: -196 + i * 36, y: -147 });
  for (let i = 0; i < 6; i++) parts.push({ kind: "choke", x: -234, y: -104 + i * 36 });
  for (let i = 0; i < 8; i++) parts.push({ kind: "cap", x: -262, y: -110 + i * 30 }, { kind: "cap", x: -248, y: -95 + i * 30 });
  for (let i = 0; i < 4; i++) parts.push({ kind: "cap", x: 204 + i * 14, y: -124 });
  for (const part of byDepth(parts, (p) => [p.x, p.y])) {
    if (part.kind === "choke") {
      const plan = { x: part.x, y: part.y, w: 14, d: 12, r: 1.2 };
      out.push(S(k.slabOf(plan, PCB_TOP, 9, P, 3, 0.4), { tone: "mid" }));
      out.push(L(k.planOutline(k.insetPlan(plan, 2.4), PCB_TOP + 9, P, 3), { tone: "faint" }));
      out.push(D([at([part.x + 3.4, part.y + 3.4, PCB_TOP + 9])], { size: 0.45, tone: "lo" }));
    } else {
      out.push(S(k.cylinder(part.x, part.y, 4.2, PCB_TOP, 10, P, 24, 0.5), { tone: "mid" }));
      out.push(L(k.sideArc(part.x, part.y, 4.2, PCB_TOP + 8.4, P, 16), { tone: "faint" }));
      out.push(L(k.lineOnTop([part.x - 2.4, part.y], [part.x + 2.4, part.y], PCB_TOP + 10, P) + k.lineOnTop([part.x, part.y - 2.4], [part.x, part.y + 2.4], PCB_TOP + 10, P), { tone: "lo", free: true }));
    }
  }
  return out.join("");
}

function ports() {
  const out = [];
  const list = [-66, -34, -2, 30].map((y, i) => ({ x: -300, y: y - 1, w: 20, d: i === 3 ? 22 : 26, r: 1 }));
  for (const plan of byDepth(list, mid)) {
    out.push(S(k.slabOf(plan, PCB_TOP, 12, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(plan, PCB_TOP + 4, P, 2), { tone: "faint" }) }));
    out.push(D([at([plan.x + 6, plan.y + 4, PCB_TOP + 12]), at([plan.x + 6, plan.y + plan.d - 4, PCB_TOP + 12])], { size: 0.45 }));
  }
  return out.join("");
}

function power() {
  const out = [];
  const body = { x: 234, y: -20, w: 18, d: 40, r: 1 };
  out.push(S(k.slabOf(body, PCB_TOP, 15, P, 2, 0.5), { tone: "mid" }));
  const holes = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) holes.push(k.planOutline({ x: body.x + 3 + j * 6.6, y: body.y + 4 + i * 8.6, w: 5, d: 6, r: 0.8 }, PCB_TOP + 15, P, 2));
  out.push(L(holes.join(""), { tone: "lo" }));
  out.push(S(k.slabOf({ x: body.x + body.w, y: -5, w: 3, d: 10, r: 0.6 }, PCB_TOP + 6, 8, P, 2), { tone: "mid" }));
  // power LED beside the connector
  out.push(S(k.slabOf({ x: 222, y: 26, w: 4, d: 3, r: 0.4 }, PCB_TOP, 1.6, P, 2), { tone: "mid" }));
  out.push(`<g data-part="power-led" class="gl-led">${D([at([224, 27.5, PCB_TOP + 1.7])], { size: 1, tone: "hi" })}</g>`);
  return out.join("");
}

// Copper traces: 8 lanes per chip from the memory controller across the package edge to the chip.
const TRACE_Y = (chip, i) => (chip === 0 ? -72 : 72) + (i - 3.5) * 3;
function tracePoints(chip, i) {
  const y0 = TRACE_Y(chip, i);
  const y1 = (chip === 0 ? -73 : 73) + (i - 3.5) * 5.6;
  return [
    [DIE.x + DIE.w, y0, PKG_TOP],
    [PKG.x + PKG.w, y0, PKG_TOP],
    [PKG.x + PKG.w, y0, PCB_TOP],
    [PKG.x + PKG.w + 3, y0, PCB_TOP],
    [PKG.x + PKG.w + 3 + Math.abs(y1 - y0) * 0.45 + 1, y1, PCB_TOP],
    [VRAM[chip].x, y1, PCB_TOP],
  ];
}
function traces() {
  const lines = [];
  for (const chip of [0, 1]) for (let i = 0; i < 8; i++) lines.push(k.pathOf(tracePoints(chip, i).map(at)));
  return `<path class="gl-trace" d="${lines.join("")}"/>`;
}

function vram() {
  const out = [];
  VRAM.forEach((chip, index) => {
    out.push(`<path class="iso-halo" d="${k.haloOf(chip, PCB_TOP, 1, P)}" style="opacity:.5"/>`);
    out.push(S(k.slabOf(chip, PCB_TOP, VRAM_TOP - PCB_TOP, P, 3, 0.6), { tone: "hi", crease: "lo" }));
    out.push(L(k.ring(chip.x + 6, chip.y + 6, 1.8, VRAM_TOP, P, 12), { tone: "lo" }));
    out.push(L([30, 22, 26].map((w, i) => k.lineOnTop([chip.x + 12, chip.y + 18 + i * 5], [chip.x + 12 + w, chip.y + 18 + i * 5], VRAM_TOP, P)).join(""), { tone: "lo", free: true }));
    out.push(`<g data-part="vram-led" data-chip="${index}" class="gl-led" style="opacity:0">${D([at([chip.x + chip.w / 2, chip.y + chip.d / 2, VRAM_TOP])], { size: 2.2, tone: "hi" })}</g>`);
    // termination resistors along the chip's inner edge
    const res = [];
    for (let i = 0; i < 6; i++) res.push({ x: chip.x - 9, y: chip.y + 4 + i * 9, w: 3.4, d: 2, r: 0.3 });
    for (const plan of res) out.push(S(k.slabOf(plan, PCB_TOP, 1, P, 1), { tone: "mid", crease: "none" }));
  });
  return out.join("");
}

// ---------- the package and the die ----------
function packageBase() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PKG, PCB_TOP, 1, P)}" style="opacity:.6"/>`];
  // cooler mounting bosses at the package corners
  for (const [x, y] of k.corners(k.insetPlan(PKG, -12), 0)) out.push(S(k.cylinder(x, y, 4.6, PCB_TOP, 4, P, 22, 0.4), { tone: "mid" }), L(k.ring(x, y, 2, PCB_TOP + 4, P, 14), { tone: "lo" }), D([at([x, y, PCB_TOP + 4])], { size: 0.5 }));
  out.push(S(k.slabOf(PKG, PCB_TOP, PKG_TOP - PCB_TOP, P, 4, 0.5), { tone: "lo", crease: "lo" }));
  // decoupling capacitors in the band round the die
  const caps = [];
  for (let x = DIE.x + 6; x < DIE.x + DIE.w - 4; x += 11) caps.push({ x, y: PKG.y + 4, w: 4, d: 2.6 }, { x, y: DIE.y + DIE.d + 4.2, w: 4, d: 2.6 });
  for (let y = DIE.y + 6; y < DIE.y + DIE.d - 4; y += 11) caps.push({ x: PKG.x + 4, y, w: 2.6, d: 4 });
  for (const plan of byDepth(caps.map((c) => ({ ...c, r: 0.3 })), mid)) out.push(S(k.slabOf(plan, PKG_TOP, 1.1, P, 1), { tone: "mid", crease: "none" }));
  return out.join("");
}

function die() {
  const out = [S(k.slabOf(DIE, PKG_TOP, DIE_TOP - PKG_TOP, P, 2, 0.4), { tone: "mid", crease: "lo" })];
  out.push(L(k.planOutline(k.insetPlan(DIE, 2), DIE_TOP, P, 2), { tone: "faint" }));
  return out.join("");
}

function l2() {
  const out = [S(k.slabOf(L2, DIE_TOP, L2_TOP - DIE_TOP, P, 2, 0.5), { tone: "mid" })];
  // 16 banks: lines across the top from edge to edge, plus the tag strip
  const banks = [];
  for (let i = 1; i < 16; i++) banks.push(k.lineOnTop([L2.x + (i * L2.w) / 16, L2.y], [L2.x + (i * L2.w) / 16, L2.y + L2.d], L2_TOP, P));
  out.push(L(banks.join(""), { tone: "faint" }));
  out.push(L(k.lineOnTop([L2.x, L2.y + 9], [L2.x + L2.w, L2.y + 9], L2_TOP, P), { tone: "faint" }));
  const dots = [];
  for (let i = 0; i < 16; i++) dots.push(at([L2.x + ((i + 0.5) * L2.w) / 16, L2.y + 4.5, L2_TOP]));
  out.push(D(dots, { size: 0.4, tone: "lo" }));
  out.push(S(k.slabOf(XBAR, DIE_TOP, 0.6, P, 1), { tone: "lo", crease: "none" }));
  const rungs = [];
  for (let x = XBAR.x + 6; x < XBAR.x + XBAR.w; x += 6) rungs.push(k.lineOnTop([x, XBAR.y], [x, XBAR.y + XBAR.d], DIE_TOP + 0.6, P));
  out.push(L(rungs.join(""), { tone: "faint" }));
  return out.join("");
}

function lidded(x0) {
  const plan = { x: x0, y: SM_Y, w: SM_W, d: SM_D, r: 1.6 };
  const lid = k.insetPlan(plan, 1.2);
  const out = [S(k.slabOf(plan, DIE_TOP, SM_TOP - DIE_TOP, P, 3, 0.6), { tone: "mid" })];
  out.push(S(k.slabOf(lid, SM_TOP, LID_TOP - SM_TOP, P, 3, 0.5), { tone: "mid", crease: "lo" }));
  for (const [x, y] of k.corners(lid, 5)) out.push(screwAt(x, y, LID_TOP, 1.4));
  const vents = [];
  for (let i = 0; i < 14; i++) vents.push(k.planOutline({ x: x0 + 18 + i * 5.6, y: SM_Y + 22, w: 2.4, d: 64, r: 1.2 }, LID_TOP, P, 3));
  out.push(L(vents.join(""), { tone: "faint" }));
  out.push(L(k.planOutline({ x: x0 + 14, y: SM_Y + 120, w: 84, d: 44, r: 1.4 }, LID_TOP, P, 3), { tone: "faint" }));
  out.push(L([44, 30, 36].map((w, i) => k.lineOnTop([x0 + 22, SM_Y + 130 + i * 10], [x0 + 22 + w, SM_Y + 130 + i * 10], LID_TOP, P)).join(""), { tone: "lo", free: true }));
  out.push(D([at([x0 + SM_W - 9, SM_Y + SM_D - 10, LID_TOP])], { size: 0.8, tone: "mid" }));
  return out.join("");
}

// ---------- SM 0, cut open ----------
const laneList = [];
for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) laneList.push({ ...local({ x: LANE.x0 + col * LANE.pitch, y: LANE.y0 + row * LANE.rowPitch, w: LANE.w, d: LANE.d, r: 0.6 }), index: row * 8 + col });
const slotList = [];
const SLOT = { pitchX: SCHED.w / 8, pitchY: SCHED.d / 8 };
for (let i = 0; i < 64; i++) {
  const col = i % 8;
  const row = Math.floor(i / 8);
  slotList.push({ index: i, x: SCHED.x + col * SLOT.pitchX + 0.9, y: SCHED.y + row * SLOT.pitchY + 0.9, w: SLOT.pitchX - 1.8, d: SLOT.pitchY - 1.8, r: 0.6 });
}

function smFloorAndFarWalls() {
  const out = [S(k.slabOf({ ...S0, r: 1.6 }, DIE_TOP, FLOOR - DIE_TOP, P, 3), { tone: "lo", crease: "lo" })];
  out.push(S(k.slabOf({ x: S0.x, y: S0.y, w: S0.w, d: WALL, r: 0.4 }, FLOOR, SM_TOP - FLOOR, P, 2, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf({ x: S0.x, y: S0.y + WALL, w: WALL, d: S0.d - WALL * 2, r: 0.4 }, FLOOR, SM_TOP - FLOOR, P, 2, 0.4), { tone: "mid" }));
  // floor grid: the routing channels between the units, edge to edge
  const grid = [];
  for (const y of [25.5, 77.8, 79.6].map(ly)) grid.push(k.lineOnTop([S0.x + WALL, y], [S0.x + S0.w - WALL, y], FLOOR, P));
  out.push(L(grid.join(""), { tone: "faint" }));
  return out.join("");
}

function tank() {
  const out = [];
  const base = k.insetPlan(TANK, -1.2);
  out.push(S(k.slabOf(base, FLOOR, TANK_Z - FLOOR, P, 3, 0.4), { tone: "lo" }));
  // the far edges of the glass, seen through it
  const z1 = TANK_Z + TANK_H;
  out.push(L(k.segment([TANK.x, TANK.y, TANK_Z], [TANK.x, TANK.y, z1], P) + k.lineOnTop([TANK.x, TANK.y], [TANK.x + TANK.w, TANK.y], TANK_Z, P) + k.lineOnTop([TANK.x, TANK.y], [TANK.x, TANK.y + TANK.d], TANK_Z, P), { tone: "faint" }));
  out.push(`<g data-part="liquid" class="gl-liquid">${["fill", "s0", "s1", "s2", "s3", "top", "outline"].map((key) => `<path data-k="${key}"/>`).join("")}</g>`);
  out.push(S(k.slabOf(TANK, TANK_Z, TANK_H, P, 3), { tone: "hi", crease: "lo", className: "gl-glass" }));
  // the warp ruler: a mark every 8 warps, from the glass's left edge on its front face
  const face = TANK.y + TANK.d;
  const marks = [];
  const majors = [];
  for (let w = 8; w <= 64; w += 8) {
    const z = TANK_Z + 0.5 + (TANK_H - 1) * (w / 64);
    (w % 32 === 0 ? majors : marks).push(k.segment([TANK.x, face, z], [TANK.x + (w % 32 === 0 ? 6 : 3.4), face, z], P));
  }
  out.push(L(marks.join(""), { tone: "lo" }), L(majors.join(""), { tone: "mid" }));
  const cap = k.insetPlan(TANK, -1.2);
  out.push(S(k.slabOf(cap, z1, 1.6, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(TANK.x + TANK.w - 6, TANK.y + 6, 2.4, z1 + 1.6, 2, P, 16, 0.3), { tone: "mid" }));
  out.push(screwAt(cap.x + 2.4, cap.y + cap.d - 2.4, z1 + 1.6, 1));
  return out.join("");
}

function l1() {
  const out = [S(k.slabOf(L1, FLOOR, L1_H, P, 2, 0.5), { tone: "mid" })];
  const lines = [];
  for (let i = 1; i < 8; i++) lines.push(k.lineOnTop([L1.x + (i * L1.w) / 8, L1.y], [L1.x + (i * L1.w) / 8, L1.y + L1.d], FLOOR + L1_H, P));
  out.push(L(lines.join(""), { tone: "faint" }));
  out.push(S(k.slabOf(LDST, FLOOR, LDST_H, P, 2, 0.4), { tone: "mid" }));
  out.push(L(k.lineOnTop([LDST.x, LDST.y + LDST.d / 2], [LDST.x + LDST.w, LDST.y + LDST.d / 2], FLOOR + LDST_H, P), { tone: "faint" }));
  out.push(D([0, 1, 2, 3].map((i) => at([LDST.x + 6 + i * 9, LDST.y + LDST.d * 0.75, FLOOR + LDST_H])), { size: 0.45, tone: "lo" }));
  return out.join("");
}

function lanes() {
  const out = [S(k.slabOf(local({ x: 4, y: 33, w: 66, d: 39.4 }), FLOOR, 1, P, 2), { tone: "lo", crease: "none" })];
  for (const lane of byDepth(laneList, mid)) {
    out.push(`<g data-lane="${lane.index}">${S(k.slabOf(lane, LANE.z, LANE.h, P, 2, 0.4), { tone: "mid", crease: "lo", className: "gl-on" })}</g>`);
  }
  out.push(S(k.slabOf(BUS, FLOOR, 1.2, P, 1), { tone: "lo", crease: "none" }));
  out.push(`<path data-part="bus" class="iso-line" data-tone="lit" style="opacity:0;stroke-width:1.2" d="${k.lineOnTop([BUS.x, BUS.y + BUS.d / 2], [BUS.x + BUS.w, BUS.y + BUS.d / 2], FLOOR + 1.2, P)}"/>`);
  return out.join("");
}

function scheduler() {
  const out = [S(k.slabOf(SCHED, FLOOR, SCHED_TOP - FLOOR, P, 3, 0.5), { tone: "mid" })];
  out.push(L(slotList.map((slot) => k.planOutline(slot, SCHED_TOP, P, 2)).join(""), { tone: "lo" }));
  for (const slot of byDepth(slotList, mid)) {
    const token = k.insetPlan(slot, 0.6);
    out.push(`<g data-slot="${slot.index}" style="display:none">${S(k.slabOf(token, SCHED_TOP, 1.8, P, 2, 0.3), { tone: "hi", crease: "lo", className: "gl-on" })}</g>`);
  }
  return out.join("");
}

function nearWalls() {
  const out = [];
  out.push(S(k.slabOf({ x: S0.x + S0.w - WALL, y: S0.y + WALL, w: WALL, d: S0.d - WALL * 2, r: 0.4 }, FLOOR, SILL - FLOOR, P, 2, 0.4), { tone: "hi", crease: "lo", className: "gl-cut" }));
  out.push(S(k.slabOf({ x: S0.x, y: S0.y + S0.d - WALL, w: S0.w, d: WALL, r: 0.4 }, FLOOR, SILL - FLOOR, P, 2, 0.4), { tone: "hi", crease: "lo", className: "gl-cut" }));
  out.push(k.faceTextSvg(k.sideMatrix([S0.x + 4, S0.y + S0.d], FLOOR + 0.6, P, "left"), "SM 0", { size: 2.2, tone: "mid" }));
  return out.join("");
}

function mcs() {
  const out = [];
  MC.forEach((plan) => {
    out.push(S(k.slabOf(plan, DIE_TOP, MC_TOP - DIE_TOP, P, 2, 0.4), { tone: "mid" }));
    const pads = [];
    for (let y = plan.y + 4; y < plan.y + plan.d - 2; y += 4) pads.push(at([plan.x + plan.w - 3, y, MC_TOP]));
    out.push(D(pads, { size: 0.45, tone: "lo" }));
    out.push(L(k.lineOnTop([plan.x + plan.w - 6, plan.y], [plan.x + plan.w - 6, plan.y + plan.d], MC_TOP, P), { tone: "faint" }));
  });
  return out.join("");
}

// ---------- the readout console on the bench ----------
const LCD = {
  chart: { x0: -334, x1: -226, z0: 28, z1: 41, r: 1, depth: 1.6 },
  cycle: { x0: -219, x1: -170, z0: 30, z1: 41, r: 1, depth: 1.6 },
  busy: { x0: -165, x1: -116, z0: 30, z1: 41, r: 1, depth: 1.6 },
  warps: { x0: -219, x1: -170, z0: 15, z1: 26, r: 1, depth: 1.6 },
  regs: { x0: -165, x1: -116, z0: 15, z1: 26, r: 1, depth: 1.6 },
  wait: { x0: -334, x1: -284, z0: 15, z1: 26, r: 1, depth: 1.6 },
  burst: { x0: -278, x1: -226, z0: 15, z1: 26, r: 1, depth: 1.6 },
};
const LCD_UNITS = { cycle: "CYC", busy: "BUSY", warps: "WARPS", regs: "REGS", wait: "WAIT", burst: "BURST" };
const CHART_SPAN = 220;

function lcdText(name, value) {
  const w = LCD[name];
  return [
    `<text class="gl-lcd-unit" x="${w.x0 + 2.2}" y="${-(w.z1 - 3.6)}" font-size="2.9">${LCD_UNITS[name]}</text>`,
    `<text class="gl-lcd-text" data-lcd="${name}" x="${w.x1 - 2.2}" y="${-(w.z0 + 2)}" font-size="6.2" text-anchor="end">${value}</text>`,
  ].join("");
}

function console_() {
  const out = [`<path class="iso-halo" d="${k.haloOf(CON, 0, 6, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(CON, 9), (p) => p)) out.push(S(k.cylinder(x, y, 4, 0, CON_Z, P, 18), { tone: "lo" }));
  out.push(S(k.slabOf(CON, CON_Z, CON_TOP - CON_Z, P, 6, 1.2), { tone: "mid", inner: L(k.sideSeam(CON, 10, P, 6), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(CON, 3.5), CON_TOP, P, 6), { tone: "faint" }));
  for (const [x, y] of k.corners(CON, 7)) out.push(screwAt(x, y, CON_TOP, 1.4));
  // label plate on top
  const label = { x: -328, y: 188, w: 46, d: 12, r: 1 };
  out.push(S(k.slabOf(label, CON_TOP, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L([32, 22].map((w, i) => k.lineOnTop([label.x + 4, label.y + 3.6 + i * 4], [label.x + 4 + w, label.y + 3.6 + i * 4], CON_TOP + 0.8, P)).join(""), { tone: "lo", free: true }));
  // the wait knob: memory timing, 100 to 300 cycles
  out.push(S(k.cylinder(KNOB[0], KNOB[1], KNOB_R + 2.4, CON_TOP, 1, P, 32), { tone: "lo" }));
  const marks = k.radialTicks(KNOB[0], KNOB[1], KNOB_R + 2.2, 2, 1, CON_TOP + 1, [1.6, 1.6], P, KNOB_AT(100), Math.PI);
  out.push(L(marks.major + marks.minor, { tone: "mid" }));
  out.push(S(k.cylinder(KNOB[0], KNOB[1], KNOB_R, CON_TOP + 1, KNOB_TOP - CON_TOP - 1, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(KNOB[0], KNOB[1], KNOB_R, CON_TOP + 1, KNOB_TOP, 30, P), { tone: "lo" }));
  out.push(`<path data-part="knob" class="iso-line" data-tone="hi" data-free="end" style="stroke-width:1" d="${knobLine(100)}"/>`);
  // the busy gauge
  const [x, y] = DIAL;
  out.push(S(k.cylinder(x, y, DIAL_R, CON_TOP, DIAL_TOP - CON_TOP, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3, DIAL_TOP, 72, P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, DIAL_R, DIAL_TOP - 3, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, DIAL_R - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, DIAL_R - 2, 20, 5, DIAL_TOP, [1.3, 2.8], P, SWEEP[0], SWEEP[1]);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  const ring = k.onTop(Array.from({ length: 41 }, (_, i) => { const a = SWEEP[0] + (i / 40) * SWEEP[1]; return [x + Math.sin(a) * (DIAL_R - 2), y - Math.cos(a) * (DIAL_R - 2)]; }), DIAL_TOP, P);
  out.push(`<path data-part="dial-arc" class="iso-line" data-tone="lit" style="stroke-width:1.1" d=""/>`);
  out.push(L(k.ring(x, y, 1.6, DIAL_TOP, P, 16), { tone: "mid" }));
  out.push(`<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.1" d="${needleAt(0)}"/>`);
  out.push(D([at([x, y, DIAL_TOP + 0.2])], { size: 0.8, tone: "hi" }));
  void ring;
  // front face windows
  const chart = `<path class="iso-line gl-grid" data-tone="faint" d="M${LCD.chart.x0} ${-(LCD.chart.z0 + 3)}H${LCD.chart.x1}M${LCD.chart.x0} ${-(LCD.chart.z1 - 3)}H${LCD.chart.x1}"/><path data-part="chart" class="gl-chart" d=""/>`;
  out.push(recess(LCD.chart, FRONT, chart));
  out.push(recess(LCD.cycle, FRONT, lcdText("cycle", "-")));
  out.push(recess(LCD.busy, FRONT, lcdText("busy", "-")));
  out.push(recess(LCD.warps, FRONT, lcdText("warps", "-")));
  out.push(recess(LCD.regs, FRONT, lcdText("regs", "-")));
  out.push(recess(LCD.wait, FRONT, lcdText("wait", "-")));
  out.push(recess(LCD.burst, FRONT, lcdText("burst", "-")));
  // vents and status light under the windows
  out.push(`<g transform="${planeOf(FRONT)}">${L(Array.from({ length: 14 }, (_, i) => flat(-334 + i * 4.2, 5, -332 + i * 4.2, 10, 1, 3)).join(""), { tone: "lo" })}</g>`);
  out.push(`<g data-part="console-led" class="gl-led" style="opacity:.2">${D([at([-120, FRONT, 8])], { size: 1, tone: "hi" })}</g>`);
  return out.join("");
}

function needleAt(share) {
  const a = SWEEP[0] + share * SWEEP[1];
  const [x, y] = DIAL;
  return k.lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (DIAL_R - 4), y - Math.cos(a) * (DIAL_R - 4)], DIAL_TOP + 0.2, P);
}
function knobLine(wait) {
  const a = KNOB_AT(wait);
  return k.lineOnTop([KNOB[0] + Math.sin(a) * 1.2, KNOB[1] - Math.cos(a) * 1.2], [KNOB[0] + Math.sin(a) * (KNOB_R - 0.8), KNOB[1] - Math.cos(a) * (KNOB_R - 0.8)], KNOB_TOP, P);
}

// ---------- labels: a dot on the part, a short leader, its name ----------
const LABELS = [
  { name: "I/O bracket", at: [-304, 60, 50], text: [118, 112], align: "end" },
  { name: "Display outputs", at: [-290, 10, 29], text: [232, 104], align: "middle" },
  { name: "VRM power stages", at: [-40, -141, 26], text: [612, 138] },
  { name: "L2 cache (shared)", at: [-60, -103, 28], text: [452, 150], align: "end" },
  { name: "SM 2", at: [-141, 25, 33.6], text: null },
  { name: "SM 1", at: [-25, 25, 33.6], text: null },
  { name: "Register file · 65,536", at: [57, -60, 57], text: [690, 214] },
  { name: "L1 cache", at: [100, -60, 31], text: [752, 244] },
  { name: "Load/store unit", at: [100, -38, 29], text: [774, 272] },
  { name: "Memory controller", at: [165, -40, 26.5], text: [812, 300] },
  { name: "32 lanes", at: [70, 8, 29], text: [520, 262], align: "end" },
  { name: "SM 0 (cut open)", at: [70, 122, 26.4], text: [446, 412], align: "end" },
  { name: "Warp scheduler · 64 slots", at: [91, 70, 26.4], text: [472, 456], align: "end" },
  { name: "Copper bus traces", at: [195, 73, 17], text: [628, 520], align: "end" },
  { name: "VRAM chip", at: [232, 73, 20.6], text: [702, 520] },
  { name: "VRAM chip", at: [232, -73, 20.6], text: [852, 400] },
  { name: "8-pin power", at: [243, 0, 32], text: [818, 452] },
  { name: "PCIe edge connector", at: [-120, 155, 17], text: [246, 474], align: "middle" },
  { name: "GPU die", at: [-190, 100, 22], text: [262, 246], align: "middle" },
  { name: "Busy gauge", at: [-136, 211, 53], text: [268, 300] },
  { name: "Memory wait knob", at: [-190, 214, 51], text: [120, 268], align: "end" },
  { name: "Readout displays", at: [-230, 240, 30], text: [96, 432], align: "middle" },
];
function labels() {
  const out = [];
  for (const label of LABELS) {
    const [ax, ay] = at(label.at);
    if (!label.text) {
      out.push(`<text class="gl-label gl-label-on" x="${ax.toFixed(1)}" y="${(ay + 2.6).toFixed(1)}" text-anchor="middle">${label.name}</text>`);
      continue;
    }
    const [tx, ty] = label.text;
    const align = label.align || "start";
    const ex = align === "start" ? tx - 3 : align === "end" ? tx + 3 : tx;
    const ey = align === "middle" ? (ty > ay ? ty - 9 : ty + 4) : ty - 2.6;
    out.push(L(k.pathOf([[ax, ay], [ex, ey]]), { tone: "mid", free: "end", className: "gl-leader" }));
    out.push(`<circle class="gl-pin" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="1.5"/>`);
    out.push(`<text class="gl-label" x="${tx}" y="${ty}" text-anchor="${align}">${label.name}</text>`);
  }
  return `<g class="gl-labels" data-part="labels">${out.join("")}</g>`;
}

// ---------- the load path: LD/ST → L1 → L2 → memory controller → copper → VRAM ----------
// Each leg says which painter layer it is drawn in; "hide" is the hop through the SM's back wall.
const PX = lx(54);
const legsTo = (chip) => {
  const yc = chip === 0 ? -72 : 72;
  const y0 = TRACE_Y(chip, 3.5);
  const trace = tracePoints(chip, 3.5);
  return [
    { layer: "a", points: [[PX, LDST.y + LDST.d / 2, FLOOR + LDST_H + 0.4], [PX, L1.y + L1.d / 2, FLOOR + L1_H + 0.4], [PX, S0.y + 1, SM_TOP + 0.4]] },
    { layer: "hide", points: [[PX, S0.y + 1, SM_TOP + 0.4], [PX, L2.y + 20, L2_TOP + 0.4]] },
    { layer: "b", points: [[PX, L2.y + 20, L2_TOP + 0.4], [L2.x + L2.w, L2.y + 20, L2_TOP + 0.4], [MC[0].x + 2, L2.y + 20, MC_TOP + 0.4]] },
    { layer: "c", points: [[MC[0].x + 2, L2.y + 20, MC_TOP + 0.4], [MC[0].x + 11, L2.y + 20, MC_TOP + 0.4], [MC[0].x + 11, y0, MC_TOP + 0.4], [MC[0].x + MC[0].w, y0, MC_TOP + 0.4], [DIE.x + DIE.w, y0, DIE_TOP + 0.4], ...trace.slice(1).map(([x, y, z]) => [x, y, z + 0.4]), [VRAM[chip].x + 4, trace[5][1], VRAM_TOP + 0.4], [VRAM[chip].x + VRAM[chip].w / 2, yc, VRAM_TOP + 0.4]] },
  ];
};
const ROUTES = [0, 1].map((chip) => {
  const points = [];
  const layers = [];
  for (const leg of legsTo(chip)) {
    leg.points.forEach((point, i) => {
      if (points.length && i === 0) return;
      points.push(point);
      layers.push(leg.layer);
    });
  }
  // screen points and cumulative 3D length
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1], points[i][2] - points[i - 1][2]));
  return { screen: points.map(at), layers, lengths };
});

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A graphics card on standoffs with its cooler off. On the GPU die an L2 cache runs along the back, a memory controller along the side, and a row of four lidded streaming multiprocessors along the front; the nearest, SM 0, is cut open to show its warp scheduler with 64 slots, a glass register-file tank, 32 lanes, a load/store unit and L1. Copper traces run from the memory controller to two VRAM chips. A readout console on the bench shows the lanes' busy share on a gauge and the cycle, warps, registers and memory wait on small displays.",
  body: [
    standoffs(),
    bracket(),
    pcb(),
    fingers(),
    vrm(),
    ports(),
    packageBase(),
    die(),
    l2(),
    `<g data-layer="b"></g>`,
    lidded(SM_X[2]),
    lidded(SM_X[1]),
    smFloorAndFarWalls(),
    tank(),
    l1(),
    lanes(),
    scheduler(),
    `<g data-layer="a"></g>`,
    nearWalls(),
    mcs(),
    traces(),
    vram(),
    power(),
    `<g data-layer="c"></g>`,
    console_(),
    labels(),
  ],
});

// ---------- page ----------
const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${modelSource}
const P = ${JSON.stringify(P)};
const ROUTES = ${JSON.stringify(ROUTES)};
const TANK = ${JSON.stringify(TANK)}, TANK_Z = ${TANK_Z}, TANK_H = ${TANK_H};
const DIAL = ${JSON.stringify(DIAL)}, DIAL_R = ${DIAL_R}, DIAL_TOP = ${DIAL_TOP}, SWEEP = ${JSON.stringify(SWEEP)};
const KNOB = ${JSON.stringify(KNOB)}, KNOB_R = ${KNOB_R}, KNOB_TOP = ${KNOB_TOP};
const CHART = ${JSON.stringify(LCD.chart)}, CHART_SPAN = ${CHART_SPAN};
${live_source()}
`;

function live_source() {
  return readFileSync(join(HERE, "live.js"), "utf8");
}

const css = readFileSync(join(HERE, "warp.css"), "utf8");

const steps = M.STEPS.map((step, i) => `<button class="gl-step" type="button" data-step="${i}"${i === 0 ? "" : " disabled"}><span class="gl-step-n">${String(i + 1).padStart(2, "0")}</span><span class="gl-step-label">${step.label}</span><span class="gl-step-fill" aria-hidden="true"></span></button>`).join("");

const chips = [
  ["cycle", "cycle", "0"],
  ["warps", "resident warps", "0 / 64"],
  ["busy", "core busy", "0.0%"],
  ["regs", "registers", "0 / 65,536"],
  ["wait", "VRAM wait", "100 cycles"],
  ["burst", "compute burst", "10 cycles"],
  ["need", "warps to hide it", "1 + 100/10 = 11"],
  ["model", "formula", "min(1, 0×10/110) = 0.0%"],
]
  .map(([key, name, value]) => `<span class="gl-chip"><span class="gl-chip-name">${name}</span><span class="gl-chip-value" data-chip="${key}">${value}</span></span>`)
  .join("");

const plate = k.plateHtml({
  fig: "Fig 1",
  title: "Latency hiding on one SM",
  hint: "Press the lit step",
  readout: "card off",
  keys: [
    { mark: "lit", label: "Lit: the warp on the lanes now, its 32 lanes, and loads in flight to VRAM" },
    { mark: "raised", label: "Scheduler slots: one token per resident warp, dim while it waits on memory" },
    { mark: "flat", label: "Register tank: 1,024 registers per warp, full at 64 warps (65,536)" },
  ],
  caption: "",
  body: `<div class="iso-stage gl-stage">${svg}<span class="gl-sr" role="status" aria-live="polite" data-status></span></div>`,
});

const notes = `<details class="gl-notes"><summary>Where the numbers come from</summary><ul>
<li><b>65,536 registers per SM</b> and <b>64 resident warps per SM</b> are real limits, from NVIDIA's CUDA C++ Programming Guide (the per-compute-capability table) for data-centre parts: V100 (7.0), A100 (8.0), H100 (9.0). Consumer Ampere and Ada (8.6, 8.9) cap at 48 warps, not 64.</li>
<li><b>1,024 registers per warp</b> is 32 threads × 32 registers per thread. That's a choice made for this kernel, not a hardware constant. At 32 registers per thread the register file and the warp cap both run out at 64 warps.</li>
<li><b>10-cycle compute bursts</b> and the <b>100-cycle VRAM wait</b> are teaching numbers, chosen so the sums come out round. Real DRAM latency on recent NVIDIA GPUs is several hundred core cycles; microbenchmark studies such as Jia et al., <i>Dissecting the NVIDIA Volta GPU Architecture via Microbenchmarking</i> (2018), measure around 400 or more. The 300-cycle step is closer to real hardware.</li>
<li><b>One issue port feeding 32 lanes</b> is a simplification. A real SM has four schedulers, one per sub-partition, but the reasoning is the same for each.</li>
<li>Busy share = min(1, N × 10 / (10 + W)), and you need 1 + W/10 warps to cover the wait (Little's law). The gauge and the displays don't show this formula. They show a cycle-by-cycle simulation of the same machine, measured over the last 10 + W cycles, and in steady state it lands on exactly the formula's numbers.</li>
</ul></details>`;

const body = `${`<style>${css}</style>`}<div class="gl-layout"><nav class="gl-steps" aria-label="Steps">${steps}<button class="gl-toggle" type="button" aria-pressed="true" data-labels>Labels: on</button><form class="gl-custom" data-custom novalidate><span class="gl-custom-title">Try your own numbers</span><label>Warps<input name="warps" type="number" inputmode="numeric" min="1" max="${M.residentCap()}" step="1" value="8"></label><label>Compute burst<input name="compute" type="number" inputmode="numeric" min="1" max="100" step="1" value="10"></label><label>VRAM wait<input name="wait" type="number" inputmode="numeric" min="0" max="2000" step="1" value="400"></label><p class="gl-predict" data-predict aria-live="polite"></p><button class="gl-run" name="run" type="submit">Run these numbers</button></form></nav><div class="gl-main">${plate}<div class="gl-chips" aria-label="Live numbers">${chips}</div><p class="gl-idea"><b>The big idea:</b> while one warp waits for memory, another one computes.</p>${notes}<section class="gl-tl" aria-labelledby="gl-tl-title"><div class="gl-tl-head"><h2 class="gl-tl-title" id="gl-tl-title">Warp timeline</h2><span class="gl-tl-source" data-tl-source>No kernel yet</span></div><div class="gl-tl-legend" aria-hidden="true"><span><i class="gl-sw" data-sw="compute"></i>computing</span><span><i class="gl-sw" data-sw="wait"></i>waiting on VRAM</span><span><i class="gl-sw" data-sw="ready"></i>ready (queued)</span><span><i class="gl-sw" data-sw="idle"></i>lanes idle</span></div><svg class="gl-tl-svg" data-tl-svg viewBox="0 0 960 90" role="img" aria-label="Timeline of every resident warp: computing, waiting on VRAM, or ready and queued"><defs><pattern id="gl-tl-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="gl-tl-hatch-bg" width="5" height="5"></rect><line class="gl-tl-hatch-line" x1="0" y1="0" x2="0" y2="5"></line></pattern></defs><g data-tl-grid></g><path class="gl-tl-idle" data-tl-path="idle"></path><path class="gl-tl-ready" data-tl-path="ready"></path><path class="gl-tl-wait" data-tl-path="wait"></path><path class="gl-tl-compute" data-tl-path="compute"></path><line class="gl-tl-now" data-tl-now x1="0" x2="0" y1="0" y2="0"></line></svg><p class="gl-tl-totals" data-tl-totals>Launch the kernel, or run your own numbers, to fill the timeline.</p></section></div></div>`;

const name = theme === "light" ? "warp-latency-light.html" : "warp-latency.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Hiding memory latency", theme, body, script: kitScript() + live, width: 1180 }));
console.log("wrote", name, (svg.length / 1024).toFixed(0) + " KB svg");

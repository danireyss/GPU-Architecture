import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "/Users/danielreyes/.claude/skills/anatomy/kit/iso-kit.mjs";
import { kitScript } from "/Users/danielreyes/.claude/skills/anatomy/scripts/inline-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 900;
const HEIGHT = 600;

// World: x along the lanes and the memory strips, y from the readout rack (back) to memory (front), z up.
const PLATE = { x: -244, y: -238, w: 488, d: 406, r: 10 };
const RACK = { x: -228, y: -230, w: 456, d: 36, r: 4 };
const RACK_TOP = 54;
const RACK_FRONT = RACK.y + RACK.d;
const SOCKET = { x: -226, y: -184, w: 452, d: 240, r: 4 };
const PKG = { x: -218, y: -177, w: 436, d: 228, r: 4 };
const DIE = { x: -212, y: -171, w: 424, d: 217, r: 2 };
const DIE_TOP = 10;

// Lanes: 16 columns, 15 units apart, lined up through every row of the vector unit.
const LANE = { x0: -120, pitch: 15, w: 12.2 };
const laneX = (lane) => LANE.x0 + lane * LANE.pitch + (LANE.pitch - LANE.w) / 2;
const laneMid = (lane) => LANE.x0 + lane * LANE.pitch + LANE.pitch / 2;
const BANK = { x0: -126, x1: 126 };
const STACK = { y: -162, d: 34, top: 22 };
const ROWS = { zmm0: { y: -122, d: 18 }, zmm1: { y: -100, d: 18 }, zmm2: { y: -20, d: 18 } };
const BAR_TOP = 18;
const K1 = { y: -78, d: 11, top: 14 };
const VU = { y: -63, d: 39 };
const VU_FLOOR = DIE_TOP + 1;
const ADDER = { y: -57, d: 27, z: VU_FLOOR, top: VU_FLOOR + 8 };
const L1 = { x: -206, y: -122, w: 58, d: 120, r: 1.5 };
const L1_TOP = 22;
const LOAD = { x: -144, y: -118, w: 14, d: 40, r: 1 };
const LOAD_TOP = 19;
const STORE = { x: 130, y: -22, w: 22, d: 24, r: 1.2 };
const STORE_TOP = 19;
const DECODE = { x: -206, y: -166, w: 76, d: 38, r: 1.5 };
const DECODE_TOP = 15;
const ALU = { x: 130, y: -166, w: 78, d: 56, r: 1.5 };
const L2 = { x: 158, y: -102, w: 50, d: 142, r: 1.5 };
const GATE = { back: -126, front: 2, z: 31 };

// Memory: three strips of 1,000 cells, 0.4 units per element, a block mark every 16.
const TRAY = { x: -214, y: 76, w: 428, d: 72, r: 3 };
const TRAY_TOP = 4;
const STRIP_TOP = 6.4;
const CELL = 0.4;
const CELL_X0 = -196;
const STRIPS = { a: { y: 82, d: 12 }, b: { y: 100, d: 12 }, c: { y: 118, d: 12 } };
const RAILS = [78.2, 132.2];
const CARRIAGE_W = 16 * CELL;
const LOAD_BUS_X = -177;
const STORE_BUS_X = 141;

const DIALS = { use: { at: [188, -212], r: 14 }, width: { at: [130, -212], r: 7 } };
const DIAL_TOP = RACK_TOP + 7;
const SWEEP = [-0.75 * Math.PI, 1.5 * Math.PI];
const KNOB_TOP = RACK_TOP + 5;
const WIDTH_STOPS = [32, 128, 256, 512];
const knobAngle = (index) => -0.75 * Math.PI + (index / 3) * 1.5 * Math.PI;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -16, 0), ...k.boxCorners(RACK, 0, DIAL_TOP + 2), [laneMid(0), GATE.back, GATE.z + 3]],
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
const mid = (plan) => [plan.x + plan.w / 2, plan.y + plan.d / 2];
const planeOf = (y) => k.sideMatrix([0, y], 0, P, "left");
const flat = (x0, z0, x1, z1, r, steps = 6) => k.pathOf(k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, steps).map(([u, z]) => [u, -z]), true);
const rect = (plan, z) => k.onTop(k.ringOf({ ...plan, r: 0 }, 1), z, P, true);
const screwAt = (x, y, z, r = 1.6) => L(k.ring(x, y, r, z, P, 14), { tone: "lo" }) + D([at([x, y, z])], { size: 0.45 });
const span = (x0, x1, y, d, r = 1) => ({ x: x0, y, w: x1 - x0, d, r });
const topText = (x, y, z, text, size, attrs = "", cls = "sd-val") => `<text class="${cls}" ${attrs} transform="${k.topMatrix([x, y], z, P, "x")}" x="0" y="${(size * 0.36).toFixed(2)}" font-size="${size}" text-anchor="middle">${text}</text>`;

// ---------- windows on the rack's front face ----------
let clips = 0;
function recess({ x0, x1, z0, z1, r, depth: deep }, y, back = "") {
  const id = `sd-clip-${clips++}`;
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
    `<g transform="${planeOf(y - deep)}"><path class="sd-lcd" d="${shape}"/>${back}<path class="iso-line" data-tone="faint" d="${shape}"/></g>`,
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
  const screws = k.corners(PLATE, 11);
  out.push(screws.map(([x, y]) => screwAt(x, y, 0, 2.2)).join(""));
  const label = { x: -230, y: 154, w: 44, d: 8, r: 1 };
  out.push(S(k.slabOf(label, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
  out.push(L([30, 20].map((w, i) => k.lineOnTop([label.x + 4, label.y + 2.6 + i * 2.8], [label.x + 4 + w, label.y + 2.6 + i * 2.8], 0.8, P)).join(""), { tone: "lo", free: true }));
  return out.join("");
}

// ---------- the readout rack along the back ----------
const LCD = {
  instr: { x0: -222, x1: -92, z0: 33, z1: 47, r: 1, depth: 1.6 },
  width: { x0: -86, x1: -48, z0: 33, z1: 47, r: 1, depth: 1.6 },
  lanes: { x0: -42, x1: -6, z0: 33, z1: 47, r: 1, depth: 1.6 },
  step: { x0: 0, x1: 46, z0: 33, z1: 47, r: 1, depth: 1.6 },
  done: { x0: 52, x1: 98, z0: 33, z1: 47, r: 1, depth: 1.6 },
  vadd: { x0: 104, x1: 150, z0: 33, z1: 47, r: 1, depth: 1.6 },
  sadd: { x0: 156, x1: 206, z0: 33, z1: 47, r: 1, depth: 1.6 },
  w128: { x0: -222, x1: -152, z0: 14, z1: 28, r: 1, depth: 1.6 },
  w256: { x0: -146, x1: -76, z0: 14, z1: 28, r: 1, depth: 1.6 },
  w512: { x0: -70, x1: 0, z0: 14, z1: 28, r: 1, depth: 1.6 },
  use: { x0: 6, x1: 56, z0: 14, z1: 28, r: 1, depth: 1.6 },
  mask: { x0: 62, x1: 104, z0: 14, z1: 28, r: 1, depth: 1.6 },
};
const LCD_UNITS = { instr: "INSTRUCTION", width: "BITS", lanes: "LANES", step: "STEP", done: "C DONE", vadd: "VEC ADDS", sadd: "SCALAR", mask: "K1", w128: "128-BIT LOOP", w256: "256-BIT LOOP", w512: "512-BIT LOOP", use: "LANE USE" };

function lcdText(name) {
  const w = LCD[name];
  const size = name === "instr" ? 5 : 6;
  return [
    `<text class="sd-lcd-unit" x="${w.x0 + 2.2}" y="${-(w.z1 - 3.8)}" font-size="2.9">${LCD_UNITS[name]}</text>`,
    `<text class="sd-lcd-text" data-lcd="${name}" x="${w.x1 - 2.4}" y="${-(w.z0 + 2.2)}" font-size="${size}" text-anchor="end"></text>`,
  ].join("");
}

function rack() {
  const out = [`<path class="iso-halo" d="${k.haloOf(RACK, 0, 6, P)}"/>`];
  out.push(S(k.slabOf(k.insetPlan(RACK, 3), 0, 4, P, 6), { tone: "lo" }));
  out.push(S(k.slabOf(RACK, 4, RACK_TOP - 4, P, 6, 1.2), { tone: "mid", inner: L(k.sideSeam(RACK, 9, P, 6), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(RACK, 3.5), RACK_TOP, P, 6), { tone: "faint" }));
  for (const [x, y] of k.corners(RACK, 7)) out.push(screwAt(x, y, RACK_TOP, 1.4));
  // vents on the top, left of the dials
  out.push(L(Array.from({ length: 24 }, (_, i) => k.planOutline({ x: -214 + i * 7, y: RACK.y + 9, w: 2.6, d: 18, r: 1.3 }, RACK_TOP, P, 3)).join(""), { tone: "faint" }));
  // width selector knob: 32, 128, 256, 512
  const [kx, ky] = DIALS.width.at;
  out.push(S(k.cylinder(kx, ky, DIALS.width.r + 3, RACK_TOP, 1, P, 32), { tone: "lo" }));
  const marks = WIDTH_STOPS.map((_, i) => { const a = knobAngle(i); return k.lineOnTop([kx + Math.sin(a) * (DIALS.width.r + 1), ky - Math.cos(a) * (DIALS.width.r + 1)], [kx + Math.sin(a) * (DIALS.width.r + 2.8), ky - Math.cos(a) * (DIALS.width.r + 2.8)], RACK_TOP + 1, P); }).join("");
  out.push(L(marks, { tone: "mid" }));
  out.push(S(k.cylinder(kx, ky, DIALS.width.r, RACK_TOP + 1, KNOB_TOP - RACK_TOP - 1, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(kx, ky, DIALS.width.r, RACK_TOP + 1, KNOB_TOP, 32, P), { tone: "lo" }));
  out.push(`<path data-part="knob" class="iso-line" data-tone="hi" data-free="end" style="stroke-width:1" d="${knobLine(0)}"/>`);
  // lane-use gauge
  const [x, y] = DIALS.use.at;
  const R = DIALS.use.r;
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
  for (const name of Object.keys(LCD)) out.push(recess(LCD[name], RACK_FRONT, lcdText(name)));
  out.push(`<g transform="${planeOf(RACK_FRONT)}">${L(Array.from({ length: 11 }, (_, i) => flat(118 + i * 8, 16, 120.4 + i * 8, 26, 1.2, 3)).join(""), { tone: "lo" })}</g>`);
  out.push(`<g data-part="rack-led" class="sd-led" style="opacity:.2">${D([at([212, RACK_FRONT, 10])], { size: 1, tone: "hi" })}</g>`);
  return out.join("");
}
function needleAt(share) {
  const a = SWEEP[0] + share * SWEEP[1];
  const [x, y] = DIALS.use.at;
  const R = DIALS.use.r;
  return k.lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (R - 4), y - Math.cos(a) * (R - 4)], DIAL_TOP + 0.2, P);
}
function knobLine(index) {
  const a = knobAngle(index);
  const [kx, ky] = DIALS.width.at;
  const r = DIALS.width.r;
  return k.lineOnTop([kx + Math.sin(a) * 1.2, ky - Math.cos(a) * 1.2], [kx + Math.sin(a) * (r - 0.8), ky - Math.cos(a) * (r - 0.8)], KNOB_TOP, P);
}

// ---------- socket, package, die ----------
function socket() {
  const out = [`<path class="iso-halo" d="${k.haloOf(SOCKET, 0, 4, P)}" style="opacity:.7"/>`];
  out.push(S(k.slabOf(SOCKET, 0, 4, P, 4, 0.6), { tone: "lo", crease: "lo" }));
  // retention lever along the right edge, its hook and hinge
  out.push(S(k.slabOf({ x: SOCKET.x + SOCKET.w + 2, y: SOCKET.y + 10, w: 4, d: 220, r: 2 }, 1, 3, P, 3), { tone: "mid" }));
  out.push(S(k.slabOf({ x: SOCKET.x + SOCKET.w + 2, y: SOCKET.y + SOCKET.d - 22, w: 10, d: 6, r: 1.5 }, 1, 3, P, 3), { tone: "mid" }));
  out.push(S(k.slabOf({ x: SOCKET.x + SOCKET.w - 6, y: SOCKET.y + 4, w: 12, d: 10, r: 1 }, 4, 3, P, 2), { tone: "mid" }));
  for (const [x, y] of k.corners(SOCKET, 6)) out.push(screwAt(x, y, 4, 1.6));
  out.push(S(k.slabOf(PKG, 4, 3, P, 4, 0.5), { tone: "lo", crease: "lo" }));
  const caps = [];
  for (let x = PKG.x + 10; x < PKG.x + PKG.w - 6; x += 14) caps.push({ x, y: PKG.y + PKG.d - 5.5, w: 4, d: 2.4, r: 0.3 });
  for (let y = PKG.y + 10; y < PKG.y + PKG.d - 8; y += 14) caps.push({ x: PKG.x + 2.4, y, w: 2.4, d: 4, r: 0.3 });
  for (const plan of byDepth(caps, mid)) out.push(S(k.slabOf(plan, 7, 1, P, 1), { tone: "mid", crease: "none" }));
  out.push(S(k.slabOf(DIE, 7, DIE_TOP - 7, P, 2, 0.4), { tone: "mid", crease: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(DIE, 2.5), DIE_TOP, P, 2), { tone: "faint" }));
  // width-gate guide slots, back and front of the lanes, with the width ruler on the front one
  for (const y of [GATE.back - 2, GATE.front - 1]) out.push(L(k.planOutline({ x: BANK.x0 - 2, y, w: BANK.x1 - BANK.x0 + 4, d: 3, r: 1.5 }, DIE_TOP, P, 3), { tone: "lo" }));
  const ruler = { x: BANK.x0 - 2, y: GATE.front + 3, w: BANK.x1 - BANK.x0 + 4, d: 6, r: 0.6 };
  out.push(S(k.slabOf(ruler, DIE_TOP, 0.6, P, 2), { tone: "lo", crease: "none" }));
  const ticks = [];
  const majors = [];
  for (let lane = 0; lane <= 16; lane++) {
    const x = LANE.x0 + lane * LANE.pitch;
    const big = [1, 4, 8, 16].includes(lane);
    (big ? majors : ticks).push(k.lineOnTop([x, ruler.y], [x, ruler.y + (big ? 4.4 : 2)], DIE_TOP + 0.6, P));
  }
  out.push(L(ticks.join(""), { tone: "lo" }), L(majors.join(""), { tone: "mid" }));
  return out.join("");
}

function lidded(plan, top, { vents = 0, rules = true, tone = "mid" } = {}) {
  const out = [S(k.slabOf(plan, DIE_TOP, top - 1.4 - DIE_TOP, P, 3, 0.5), { tone })];
  const lid = k.insetPlan(plan, 1);
  out.push(S(k.slabOf(lid, top - 1.4, 1.4, P, 3, 0.4), { tone, crease: "lo" }));
  for (const [x, y] of k.corners(lid, 3.4)) out.push(screwAt(x, y, top, 1));
  if (vents) out.push(L(Array.from({ length: vents }, (_, i) => k.planOutline({ x: plan.x + 10 + i * 5.4, y: plan.y + 8, w: 2.2, d: plan.d * 0.42, r: 1.1 }, top, P, 3)).join(""), { tone: "faint" }));
  if (rules) out.push(L([0.5, 0.36, 0.42].map((w, i) => k.lineOnTop([plan.x + 8, plan.y + plan.d - 14 + i * 3.6], [plan.x + 8 + plan.w * w, plan.y + plan.d - 14 + i * 3.6], top, P)).join(""), { tone: "lo", free: true }));
  return out.join("");
}

function decoder() {
  const out = [lidded(DECODE, DECODE_TOP, { rules: false })];
  const window = { x: DECODE.x + 4, y: DECODE.y + 8, w: DECODE.w - 8, d: 16, r: 1 };
  out.push(`<path class="sd-lcd" d="${k.planOutline(window, DECODE_TOP, P, 2)}"/>`);
  out.push(L(k.planOutline(window, DECODE_TOP, P, 2), { tone: "lo" }));
  out.push(topText(window.x + window.w / 2, window.y + window.d / 2, DECODE_TOP + 0.05, "", 3.2, 'data-part="decode-text"', "sd-lcd-text"));
  out.push(`<path data-part="issue" class="iso-line" data-tone="lit" style="opacity:0;stroke-width:1.2" d="${k.pathOf([at([DECODE.x + DECODE.w, DECODE.y + DECODE.d - 6, DECODE_TOP]), at([BANK.x0 - 3, DECODE.y + DECODE.d - 6, DIE_TOP]), at([BANK.x0 - 3, VU.y + VU.d / 2, DIE_TOP])])}"/>`);
  return out.join("");
}

function stack() {
  const plan = span(BANK.x0, BANK.x1, STACK.y, STACK.d, 1.5);
  const out = [S(k.slabOf(plan, DIE_TOP, STACK.top - DIE_TOP, P, 3, 0.5), { tone: "mid" })];
  const grooves = [];
  for (let i = 1; i < 7; i++) grooves.push(k.lineOnTop([BANK.x0, STACK.y + (i * STACK.d) / 7], [BANK.x1, STACK.y + (i * STACK.d) / 7], STACK.top, P));
  out.push(L(grooves.join(""), { tone: "faint" }));
  const seams = [];
  for (let lane = 1; lane < 16; lane++) seams.push(k.lineOnTop([LANE.x0 + lane * LANE.pitch, STACK.y], [LANE.x0 + lane * LANE.pitch, STACK.y + STACK.d], STACK.top, P));
  out.push(L(seams.join(""), { tone: "faint" }));
  return out.join("");
}

function bar(name, index) {
  const row = ROWS[name];
  const plan = span(BANK.x0, BANK.x1, row.y, row.d, 1);
  const out = [S(k.slabOf(plan, DIE_TOP, BAR_TOP - 1 - DIE_TOP, P, 2, 0.4), { tone: "mid" })];
  for (let lane = 0; lane < 16; lane++) {
    const slot = { x: laneX(lane), y: row.y + 1.6, w: LANE.w, d: row.d - 3.2, r: 0.6 };
    out.push(`<g data-ln="${lane}" data-row="${name}">${S(k.slabOf(slot, BAR_TOP - 1, 1, P, 2, 0.2), { tone: "hi", crease: "lo", className: "sd-slot" })}${topText(laneMid(lane), row.y + row.d / 2, BAR_TOP + 0.02, "", 6.2, `data-reg="${index}" data-lane="${lane}"`)}</g>`);
  }
  return out.join("");
}

function mask() {
  const plan = span(BANK.x0, BANK.x1, K1.y, K1.d, 1);
  const out = [S(k.slabOf(plan, DIE_TOP, K1.top - DIE_TOP, P, 2, 0.4), { tone: "mid" })];
  for (let lane = 0; lane < 16; lane++) {
    const well = { x: laneMid(lane) - 2.6, y: K1.y + 1.6, w: 5.2, d: K1.d - 3.2, r: 0.6 };
    out.push(`<g data-ln="${lane}" data-row="k1">`);
    out.push(`<path class="sd-well" d="${k.planOutline(well, K1.top, P, 2)}"/>`);
    out.push(L(k.planOutline(well, K1.top, P, 2), { tone: "lo" }));
    out.push(`<g data-bit="${lane}">${S(k.slabOf({ x: well.x + 0.6, y: well.y + 0.6, w: well.w - 1.2, d: 3, r: 0.4 }, K1.top - 0.4, 2.2, P, 2, 0.2), { tone: "hi", crease: "lo", className: "sd-on" })}</g>`);
    out.push(`</g>`);
  }
  return out.join("");
}

function vectorUnit() {
  const out = [];
  out.push(S(k.slabOf(span(BANK.x0, BANK.x1, VU.y, VU.d, 1), DIE_TOP, VU_FLOOR - DIE_TOP, P, 2), { tone: "lo", crease: "lo" }));
  // far walls full height, near walls cut down to a sill: the window
  out.push(S(k.slabOf(span(BANK.x0, BANK.x1, VU.y, 2, 0.3), VU_FLOOR, 22 - VU_FLOOR, P, 2, 0.4), { tone: "mid" }));
  out.push(S(k.slabOf({ x: BANK.x0, y: VU.y + 2, w: 2, d: VU.d - 4, r: 0.3 }, VU_FLOOR, 22 - VU_FLOOR, P, 2, 0.4), { tone: "mid" }));
  const feeds = [];
  for (let lane = 0; lane < 16; lane++) feeds.push(k.lineOnTop([laneMid(lane), VU.y + 2], [laneMid(lane), ADDER.y], VU_FLOOR, P), k.lineOnTop([laneMid(lane), ADDER.y + ADDER.d], [laneMid(lane), VU.y + VU.d - 2], VU_FLOOR, P));
  out.push(L(feeds.join(""), { tone: "faint" }));
  for (let lane = 0; lane < 16; lane++) {
    const plan = { x: laneX(lane), y: ADDER.y, w: LANE.w, d: ADDER.d, r: 0.8 };
    const cx = laneMid(lane);
    const cy = ADDER.y + 8;
    void cy;
    const plus = k.lineOnTop([cx - 2, cy], [cx + 2, cy], ADDER.top, P) + k.lineOnTop([cx, cy - 2], [cx, cy + 2], ADDER.top, P);
    out.push(`<g data-ln="${lane}" data-row="adder">${S(k.slabOf(plan, ADDER.z, ADDER.top - ADDER.z, P, 2, 0.4), { tone: "mid", crease: "lo", className: "sd-on sd-adder" })}${L(plus, { tone: "mid", free: true, className: "sd-plus" })}${topText(cx, ADDER.y + 19, ADDER.top + 0.02, "", 5.8, `data-sum="${lane}"`)}</g>`);
  }
  out.push(S(k.slabOf(span(BANK.x0, BANK.x1, VU.y + VU.d - 2, 2, 0.3), VU_FLOOR, 2.6, P, 2, 0.4), { tone: "hi", crease: "lo", className: "sd-cut" }));
  out.push(S(k.slabOf({ x: BANK.x1 - 2, y: VU.y + 2, w: 2, d: VU.d - 4, r: 0.3 }, VU_FLOOR, 2.6, P, 2, 0.4), { tone: "hi", crease: "lo", className: "sd-cut" }));
  return out.join("");
}

function l1() {
  const out = [lidded(L1, L1_TOP, { rules: true })];
  const ways = [];
  for (let i = 1; i < 8; i++) ways.push(k.lineOnTop([L1.x + (i * L1.w) / 8, L1.y + 6], [L1.x + (i * L1.w) / 8, L1.y + L1.d - 22], L1_TOP, P));
  out.push(L(k.planOutline({ x: L1.x + 4, y: L1.y + 6, w: L1.w - 8, d: L1.d - 28, r: 1 }, L1_TOP, P, 2), { tone: "lo" }));
  out.push(L(ways.map((d) => d).join(""), { tone: "faint" }));
  return out.join("");
}
function loadUnit() {
  const out = [lidded(LOAD, LOAD_TOP, { rules: false })];
  out.push(D([0, 1].map((i) => at([LOAD.x + LOAD.w / 2, LOAD.y + 10 + i * 20, LOAD_TOP])), { size: 1, tone: "lo" }));
  out.push(L(k.lineOnTop([LOAD.x, LOAD.y + LOAD.d / 2], [LOAD.x + LOAD.w, LOAD.y + LOAD.d / 2], LOAD_TOP, P), { tone: "faint" }));
  return out.join("");
}
function storeUnit() {
  const out = [lidded(STORE, STORE_TOP, { rules: false })];
  out.push(D([at([STORE.x + STORE.w / 2, STORE.y + STORE.d / 2, STORE_TOP])], { size: 1, tone: "lo" }));
  return out.join("");
}

// The width gate: a bridge that rides two slots and marks how many lanes the register is wide.
const gateX = (lanes) => LANE.x0 + lanes * LANE.pitch;
function gateBack() {
  const x = gateX(0);
  return S(k.slabOf({ x: x - 1.6, y: GATE.back - 1.6, w: 3.2, d: 3.2, r: 0.6 }, DIE_TOP, GATE.z - DIE_TOP, P, 2, 0.3), { tone: "mid" });
}
function gateFront() {
  const x = gateX(0);
  const out = [S(k.slabOf({ x: x - 1.6, y: GATE.front - 1.6, w: 3.2, d: 3.2, r: 0.6 }, DIE_TOP, GATE.z - DIE_TOP, P, 2, 0.3), { tone: "mid" })];
  out.push(S(k.slabOf({ x: x - 2, y: GATE.back - 2, w: 4, d: GATE.front - GATE.back + 4, r: 0.8 }, GATE.z, 2.4, P, 2, 0.4), { tone: "hi", crease: "lo" }));
  out.push(S(k.slabOf({ x: x - 3.4, y: GATE.front + 1.6, w: 6.8, d: 4, r: 1 }, DIE_TOP + 0.6, 2.4, P, 2, 0.3), { tone: "mid" }));
  out.push(L(k.lineOnTop([x, GATE.back - 2], [x, GATE.front + 2], GATE.z + 2.4, P), { tone: "lit" }));
  return out.join("");
}

// ---------- memory ----------
const blockX = (start) => CELL_X0 + start * CELL;
function memory() {
  const out = [`<path class="iso-halo" d="${k.haloOf(TRAY, 0, 3, P)}" style="opacity:.6"/>`];
  out.push(S(k.slabOf(TRAY, 0, TRAY_TOP, P, 4, 0.6), { tone: "lo", crease: "lo" }));
  for (const y of RAILS) out.push(S(k.slabOf({ x: TRAY.x + 4, y, w: TRAY.w - 8, d: 1.8, r: 0.5 }, TRAY_TOP, 2, P, 2, 0.3), { tone: "mid" }));
  for (const [name, strip] of Object.entries(STRIPS)) {
    const plan = { x: CELL_X0 - 2, y: strip.y, w: ELEMENTS_W + 4, d: strip.d, r: 0.8 };
    out.push(S(k.slabOf(plan, TRAY_TOP, STRIP_TOP - TRAY_TOP, P, 2, 0.3), { tone: "mid", crease: "lo" }));
    out.push(`<path class="sd-done" data-done="${name}" d=""/>`);
    const minor = [];
    const major = [];
    for (let block = 0; block <= 63; block++) {
      const x = blockX(Math.min(M.ELEMENTS, block * 16));
      (block % 10 === 0 || block === 63 ? major : minor).push(k.lineOnTop([x, strip.y], [x, strip.y + strip.d], STRIP_TOP, P));
    }
    out.push(L(minor.join(""), { tone: "faint" }), L(major.join(""), { tone: "lo" }));
    out.push(`<path class="sd-hot" data-hot="${name}" d=""/>`);
    // end plate with the array's engraved letter
    out.push(S(k.slabOf({ x: TRAY.x + 4, y: strip.y, w: 10, d: strip.d, r: 0.8 }, TRAY_TOP, 3.2, P, 2, 0.3), { tone: "mid" }));
    out.push(topText(TRAY.x + 9, strip.y + strip.d / 2, TRAY_TOP + 3.22, name, 6, "", "sd-letter"));
  }
  return out.join("");
}
const ELEMENTS_W = M.ELEMENTS * CELL;

function carriage() {
  const x0 = blockX(0) - 2;
  const w = CARRIAGE_W + 4;
  const out = [];
  for (const y of RAILS) out.push(S(k.slabOf({ x: x0 - 1, y: y - 1.2, w: w + 2, d: 4.2, r: 0.8 }, TRAY_TOP + 2, 3, P, 2, 0.3), { tone: "mid" }));
  const z = STRIP_TOP + 6;
  const frame = { x: x0, y: RAILS[0] - 1.2, w, d: RAILS[1] - RAILS[0] + 4.2 };
  for (const y of [frame.y, frame.y + frame.d - 3]) out.push(S(k.slabOf({ x: x0, y, w, d: 3, r: 0.6 }, z, 2, P, 2, 0.3), { tone: "hi", crease: "lo" }));
  for (const x of [x0, x0 + w - 2]) out.push(S(k.slabOf({ x, y: frame.y + 3, w: 2, d: frame.d - 6, r: 0.4 }, z, 2, P, 2, 0.3), { tone: "hi", crease: "lo" }));
  for (const y of RAILS) for (const x of [x0, x0 + w - 2]) out.push(S(k.slabOf({ x, y: y - 1, w: 2, d: 2, r: 0.4 }, TRAY_TOP + 5, z - TRAY_TOP - 5, P, 2), { tone: "mid", crease: "none" }));
  return `<g data-part="carriage">${out.join("")}</g>`;
}

function buses() {
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const x = LOAD_BUS_X - 7.5 + i * 3;
    lines.push(k.pathOf([[x, TRAY.y, 0], [x, SOCKET.y + SOCKET.d, 0]].map(at)));
    const xs = STORE_BUS_X - 7.5 + i * 3;
    lines.push(k.pathOf([[xs, TRAY.y, 0], [xs, SOCKET.y + SOCKET.d, 0]].map(at)));
  }
  const die = [];
  for (let i = 0; i < 6; i++) {
    const x = LOAD_BUS_X - 7.5 + i * 3;
    die.push(k.pathOf([[x, PKG.y + PKG.d, 7], [x, DIE.y + DIE.d, 7], [x, DIE.y + DIE.d, DIE_TOP], [x, L1.y + L1.d, DIE_TOP]].map(at)));
    const xs = STORE_BUS_X - 7.5 + i * 3;
    die.push(k.pathOf([[xs, PKG.y + PKG.d, 7], [xs, DIE.y + DIE.d, 7], [xs, DIE.y + DIE.d, DIE_TOP], [xs, STORE.y + STORE.d, DIE_TOP]].map(at)));
  }
  return { plate: `<path class="sd-trace" d="${lines.join("")}"/>`, die: `<path class="sd-trace" d="${die.join("")}"/>` };
}

// ---------- labels ----------
const LABELS = [
  { name: "Readout rack", at: [-150, RACK_FRONT, 50], text: [332, 40], align: "end" },
  { name: "Lane-use gauge", at: [188, -212, 61], text: [800, 150] },
  { name: "Width selector", at: [130, -212, 59], text: [690, 118] },
  { name: "Instruction decoder", at: [-168, -147, 15], text: [250, 100], align: "end" },
  { name: "L1 data cache", at: [-177, -40, 22], text: [150, 162], align: "end" },
  { name: "Load unit", at: [-137, -98, 19], text: [250, 130], align: "end" },
  { name: "zmm3–zmm31 (29 more)", at: [70, -156, 22], text: null },
  { name: "Integer ALUs", at: [169, -138, 18], text: [760, 392] },
  { name: "L2 cache", at: [200, 28, 18], text: [648, 506] },
  { name: "zmm0 ← a", at: [118, -113, 18], text: [744, 410] },
  { name: "zmm1 ← b", at: [118, -91, 18], text: [728, 426] },
  { name: "Mask k1 · 16 bits", at: [118, -72.5, 14], text: [712, 442] },
  { name: "16 adders", at: [118, -44, 19], text: [696, 458] },
  { name: "zmm2 = sums", at: [118, -11, 18], text: [680, 474] },
  { name: "Store unit", at: [141, -10, 19], text: [664, 490] },
  { name: "Width gate", at: [-45, 9, 10.6], text: [250, 372], align: "end" },
  { name: "Copper bus", at: [-177, 66, 0], text: [100, 250], align: "end" },
  { name: "Loop pointer", at: [-193, 135, 14], text: [62, 342], align: "end" },
  { name: "Arrays a, b, c · 1,000 numbers each", at: [60, 148, 2], text: [300, 540], align: "middle" },
];
function labels() {
  const out = [];
  for (const label of LABELS) {
    const [ax, ay] = at(label.at);
    if (!label.text) {
      out.push(`<text class="sd-label sd-label-on" x="${ax.toFixed(1)}" y="${(ay + 2.6).toFixed(1)}" text-anchor="middle">${label.name}</text>`);
      continue;
    }
    const [tx, ty] = label.text;
    const align = label.align || "start";
    const ex = align === "start" ? tx - 3 : align === "end" ? tx + 3 : tx;
    const ey = align === "middle" ? (ty > ay ? ty - 9 : ty + 4) : ty - 2.6;
    out.push(L(k.pathOf([[ax, ay], [ex, ey]]), { tone: "mid", free: "end", className: "sd-leader" }));
    out.push(`<circle class="sd-pin" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="1.5"/>`);
    out.push(`<text class="sd-label" x="${tx}" y="${ty}" text-anchor="${align}">${label.name}</text>`);
  }
  return `<g class="sd-labels">${out.join("")}</g>`;
}

// ---------- data paths for the packets (world points, projected in the page) ----------
const loadPath = (strip, row) => [
  [LOAD_BUS_X, STRIPS[strip].y + STRIPS[strip].d / 2, STRIP_TOP + 0.4],
  [LOAD_BUS_X, TRAY.y, TRAY_TOP + 0.4],
  [LOAD_BUS_X, TRAY.y - 0.5, 0.4],
  [LOAD_BUS_X, SOCKET.y + SOCKET.d, 0.4],
  [LOAD_BUS_X, PKG.y + PKG.d, 7.4],
  [LOAD_BUS_X, DIE.y + DIE.d, DIE_TOP + 0.4],
  [LOAD_BUS_X, L1.y + L1.d, DIE_TOP + 0.4],
  [LOAD_BUS_X, L1.y + L1.d - 0.5, L1_TOP + 0.4],
  [LOAD_BUS_X, ROWS[row].y + ROWS[row].d / 2, L1_TOP + 0.4],
  [LOAD.x + LOAD.w / 2, ROWS[row].y + ROWS[row].d / 2, LOAD_TOP + 0.4],
  [laneMid(0), ROWS[row].y + ROWS[row].d / 2, BAR_TOP + 0.4],
];
const storePath = () => [
  [laneMid(15), ROWS.zmm2.y + ROWS.zmm2.d / 2, BAR_TOP + 0.4],
  [STORE.x + STORE.w / 2, ROWS.zmm2.y + ROWS.zmm2.d / 2, STORE_TOP + 0.4],
  [STORE_BUS_X, STORE.y + STORE.d, STORE_TOP + 0.4],
  [STORE_BUS_X, STORE.y + STORE.d + 0.5, DIE_TOP + 0.4],
  [STORE_BUS_X, DIE.y + DIE.d, DIE_TOP + 0.4],
  [STORE_BUS_X, PKG.y + PKG.d, 7.4],
  [STORE_BUS_X, SOCKET.y + SOCKET.d, 0.4],
  [STORE_BUS_X, TRAY.y - 0.5, 0.4],
  [STORE_BUS_X, TRAY.y, TRAY_TOP + 0.4],
  [STORE_BUS_X, STRIPS.c.y + STRIPS.c.d / 2, STRIP_TOP + 0.4],
];

const bus = buses();
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "A CPU core on its socket, lid off. An L1 data cache and a load unit on the left feed a register file whose three 512-bit registers, zmm0, zmm1 and zmm2, are long bars of 16 slots. Between them the vector unit is cut open: a row of 16 adders lined up lane by lane under a 16-bit mask register k1 made of tiny switches, and a width gate that shows how many lanes are in use. A store unit on the right writes back. In front, three strips of 1,000 cells hold arrays a, b and c, with a pointer carriage over the current 16. A readout rack at the back shows the instruction, counts and a lane-use gauge.",
  body: [
    plate(),
    rack(),
    bus.plate,
    socket(),
    bus.die,
    decoder(),
    l1(),
    lidded(ALU, 18, { vents: 14 }),
    stack(),
    `<g data-part="gate-back">${gateBack()}</g>`,
    loadUnit(),
    bar("zmm0", 0),
    bar("zmm1", 1),
    mask(),
    vectorUnit(),
    lidded(L2, 18, { vents: 12 }),
    bar("zmm2", 2),
    storeUnit(),
    `<g data-part="gate-front">${gateFront()}</g>`,
    memory(),
    carriage(),
    `<g data-layer="packets"></g>`,
    labels(),
  ],
});

// ---------- page ----------
const modelSource = readFileSync(join(HERE, "model.mjs"), "utf8").replace(/^export /gm, "");
const live = `
${modelSource}
const P = ${JSON.stringify(P)};
const LANE = ${JSON.stringify(LANE)};
const CELL = ${CELL}, CELL_X0 = ${CELL_X0}, STRIP_TOP = ${STRIP_TOP};
const STRIPS = ${JSON.stringify(STRIPS)};
const LOAD_PATHS = ${JSON.stringify({ a: loadPath("a", "zmm0"), b: loadPath("b", "zmm1") })};
const STORE_PATH = ${JSON.stringify(storePath())};
const LOAD_BUS_X = ${LOAD_BUS_X}, STORE_BUS_X = ${STORE_BUS_X};
const DIALS = ${JSON.stringify(DIALS)}, DIAL_TOP = ${DIAL_TOP}, KNOB_TOP = ${KNOB_TOP}, SWEEP = ${JSON.stringify(SWEEP)};
const WIDTH_STOPS = ${JSON.stringify(WIDTH_STOPS)};
const GATE_DX = ${JSON.stringify(k.axisVector(P, [LANE.pitch, 0, 0]))};
const CARRIAGE_DX = ${JSON.stringify(k.axisVector(P, [CELL, 0, 0]))};
const BIT_DY = ${JSON.stringify(k.axisVector(P, [0, 3.4, 0]))};
${readFileSync(join(HERE, "live.js"), "utf8")}
`;
const css = readFileSync(join(HERE, "simd.css"), "utf8");

const STEPS = ["Add one by one", "Widen to 512 bits", "Load 16 a's", "Load 16 b's", "Add all 16 lanes", "Store 16 c's", "Run the loop", "Mask the last 8", "New arrays"];
const steps = STEPS.map((label, i) => `<button class="sd-step" type="button" data-step="${i}"${i === 0 ? "" : " disabled"}><span class="sd-step-n">${String(i + 1).padStart(2, "0")}</span><span>${label}</span><span class="sd-step-fill" aria-hidden="true"></span></button>`).join("");

const chips = [
  ["elements", "elements", "1,000 × 32 bits"],
  ["width", "register", "32 bits · 1 lane"],
  ["scalar", "scalar adds", "1,000"],
  ["vector", "vector adds so far", "0"],
  ["plan", "plan at this width", "-"],
  ["use", "lane use", "-"],
  ["w128", "128-bit", "4 lanes · 250 adds"],
  ["w256", "256-bit", "8 lanes · 125 adds · no leftovers"],
  ["w512", "512-bit", "16 lanes · 62 + 1 masked = 63 adds"],
  ["fewer", "add instructions saved", "-"],
]
  .map(([key, name, value]) => `<span class="sd-chip"><span class="sd-chip-name">${name}</span><span class="sd-chip-value" data-chip="${key}">${value}</span></span>`)
  .join("");

const plateHtml = k.plateHtml({
  fig: "Fig 2",
  title: "One instruction, 16 adds",
  hint: "Press the lit step",
  readout: "idle",
  keys: [
    { mark: "lit", label: "Lit: the lanes working on this instruction, and the data in flight" },
    { mark: "raised", label: "Slots: one 32-bit number each; 16 make a 512-bit register" },
    { mark: "flat", label: "Strips: arrays a, b, c in memory, 1,000 cells each, a mark every 16" },
  ],
  caption: "",
  body: `<div class="iso-stage sd-stage">${svg}<span class="sd-sr" role="status" aria-live="polite" data-status></span></div>`,
});

const notes = `<details class="sd-notes"><summary>Where the numbers come from</summary><ul>
<li><b>512 / 32 = 16 lanes</b>, <b>32 zmm registers</b> and the <b>mask registers k0–k7</b> (k1–k7 usable as write masks) are AVX-512 as Intel documents it in the Intel 64 and IA-32 Architectures Software Developer's Manual. <code>vpaddd</code> adds 16 packed 32-bit integers, and <code>{k1}{z}</code> zeroes the lanes the mask turns off.</li>
<li>1,000 elements is just the example. The rest is arithmetic: 1,000 = 62 × 16 + 8, so 63 vector adds, and 1,000 / (63 × 16) = 99.2% lane use. At 128 bits it's 250 adds, and at 256 bits 125, with nothing left over.</li>
<li>The figure counts <b>add instructions only</b>. Each step also needs two loads and a store (the scalar loop does too), and the loop counter and branch are left out.</li>
<li><b>Speedup:</b> the add count drops 15.9×. Real loops gain less than the lane count, because a loop like this spends most of its time waiting on memory, not adding. Some CPUs also run 512-bit instructions at a lower clock or split them into two 256-bit halves.</li>
<li>Memory is drawn as three strips for clarity. A real load passes through L2 and L3 on its way to L1, and the figure skips them.</li>
</ul></details>`;

const body = `<style>${css}</style><div class="sd-layout"><nav class="sd-steps" aria-label="Steps">${steps}<button class="sd-toggle" type="button" aria-pressed="true" data-labels>Labels: on</button></nav><div class="sd-main">${plateHtml}<div class="sd-chips" aria-label="Live numbers">${chips}</div><p class="sd-idea"><b>The big idea:</b> one instruction works on every lane at once.</p>${notes}</div></div>`;

const name = theme === "light" ? "simd-add-light.html" : "simd-add.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "One instruction, 16 adds", theme, body, script: kitScript() + live, width: 1180 }));
console.log("wrote", name, (svg.length / 1024).toFixed(0) + " KB svg");

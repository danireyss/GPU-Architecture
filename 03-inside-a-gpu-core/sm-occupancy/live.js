const stage = document.querySelector(".so-stage");
const svg = stage.querySelector("svg");
const q = (selector) => svg.querySelector(selector);
const still = matchMedia("(prefers-reduced-motion: reduce)");
const readout = document.querySelector("[data-readout]");
const sayEl = document.querySelector("[data-say]");
const status = document.querySelector("[data-status]");
const buttons = [...document.querySelectorAll(".so-step")];
const chips = Object.fromEntries([...document.querySelectorAll("[data-chip]")].map((el) => [el.dataset.chip, el]));
const chipBox = Object.fromEntries([...document.querySelectorAll("[data-chip-box]")].map((el) => [el.dataset.chipBox, el]));
const lcd = Object.fromEntries([...svg.querySelectorAll("[data-lcd]")].map((el) => [el.dataset.lcd, el]));
const drawers = Array.from({ length: SM.drawers }, (_, i) => q(`[data-drawer="${i}"]`));
const slots = Array.from({ length: SM.warps }, (_, i) => q(`[data-slot="${i}"]`));
const slotN = Array.from({ length: SM.warps }, (_, i) => q(`[data-slot-n="${i}"]`));
const shelves = Array.from({ length: SM.sharedKB }, (_, i) => q(`[data-shelf="${i}"]`));
const gauges = Object.fromEntries(["regs", "slots", "shared"].map((name) => {
  const el = q(`[data-gauge="${name}"]`);
  return [name, { el, needle: el.querySelector('[data-part="needle"]'), arc: el.querySelector('[data-part="arc"]'), more: el.querySelector('[data-part="more"]'), lamp: el.querySelector(".so-lamp") }];
}));
const gateEl = q('[data-part="gate"]');
const doorLamp = q('[data-part="door-lamp"]');
const inside = q('[data-layer="inside"]');
const outside = q('[data-layer="outside"]');
const crateEls = Array.from({ length: GEO.CRATES }, (_, i) => {
  const el = q(`[data-crate="${i}"]`);
  return { el, spools: Array.from({ length: 8 }, (_, j) => el.querySelector(`[data-spool="${j}"]`)) };
});
const ledgerRows = [...document.querySelectorAll("[data-case]")];
const newCells = Object.fromEntries([...document.querySelectorAll("[data-new]")].map((el) => [el.dataset.new, el]));

// ---------- state ----------
const LINE = 6; // crates waiting on the conveyor, the first one at the door
const SPEED = 210; // units per second along the belt and the deck
const CLAIM = 0.5; // seconds for a parked crate to claim its drawers, slots and shelves
const fresh = () => ({
  kernel: null, caseIndex: null, resident: 0, blocked: false,
  drawer: new Array(SM.drawers).fill(-1), slot: new Array(SM.warps).fill(-1), shelf: new Array(SM.sharedKB).fill(-1),
  gate: 0, lamp: "off",
});
let s = fresh();
let draws = 0;
let next = 0;
let queue = [];
let current = null;
let pendingSay = -1;
let line = []; // crate ids, line[0] waits at the door
const crates = crateEls.map((c, id) => ({ id, ...c, state: "off", b: -1, pos: [GEO.SPAWN_X, GEO.CONV_Y], route: [], lift: 0, alpha: 0, spools: 8, layer: null }));
const shown = { regs: 0, slots: 0, shared: 0, gate: 0 };
let frame = 0, last = 0, visible = false;

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pct = (x) => (Math.round(x * 1000) / 10).toString() + "%";
const follow = (value, goal, dt, seconds) => (still.matches ? goal : value + (goal - value) * (1 - Math.exp(-dt / seconds)));
const ease = (x) => { const c = Math.min(1, Math.max(0, x)); return c * c * (3 - 2 * c); };
const text = (el, value) => { if (el && el.textContent !== value) el.textContent = value; };
const setFlag = (el, name, on) => { if (!el) return; if (on) { if (!el.hasAttribute(name)) el.setAttribute(name, ""); } else if (el.hasAttribute(name)) el.removeAttribute(name); };
const setAttr = (el, name, value) => { if (value === null) { if (el.hasAttribute(name)) el.removeAttribute(name); } else if (el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value)); };
const allowText = (v) => (v === Infinity ? "∞" : String(v));
const at = (crate) => crate.route.length === 0;

// ---------- crates ----------
function spawn() {
  const crate = crates.find((c) => c.state === "off");
  if (!crate) return null;
  Object.assign(crate, { state: "line", b: -1, pos: [GEO.SPAWN_X, GEO.CONV_Y], route: [], lift: 0, alpha: still.matches ? 1 : 0, spools: 8 });
  line.push(crate.id);
  return crate;
}
// Every crate in the line heads for its place on the belt; the first one turns up to the door.
function lineRoutes() {
  line.forEach((id, i) => {
    const crate = crates[id];
    const x = GEO.QUEUE[i];
    const route = [[x, GEO.CONV_Y]];
    if (i === 0) route.push([x, GEO.WAIT[1]]);
    if (crate.pos[1] < GEO.CONV_Y - 0.5) crate.route = [[x, crate.pos[1]]];
    else crate.route = route;
  });
}
function feed(all) {
  if (!s.kernel) return;
  while (line.length < LINE) {
    const tail = line.length ? crates[line[line.length - 1]] : null;
    if (!all && tail && tail.pos[0] < GEO.SPAWN_X + 26) return;
    if (!spawn()) return;
    lineRoutes();
    if (!all) return;
  }
}
function moveCrates(dt) {
  let moving = false;
  for (const crate of crates) {
    if (crate.state === "off") continue;
    let budget = still.matches ? Infinity : SPEED * dt;
    while (crate.route.length && budget > 0) {
      const [gx, gy] = crate.route[0];
      const dx = gx - crate.pos[0], dy = gy - crate.pos[1];
      const dist = Math.hypot(dx, dy);
      if (dist <= budget) { crate.pos = [gx, gy]; crate.route.shift(); budget -= dist; }
      else { crate.pos = [crate.pos[0] + (dx / dist) * budget, crate.pos[1] + (dy / dist) * budget]; budget = 0; }
    }
    if (crate.route.length) moving = true;
    else if (crate.state === "moving") { crate.state = "claiming"; crate.claimT = 0; }
    if (crate.state === "claiming") {
      crate.claimT = still.matches ? 1 : Math.min(1, crate.claimT + dt / CLAIM);
      crate.spools = 8 - Math.min(8, Math.floor(crate.claimT * 8.999));
      if (crate.claimT >= 1) { claimAll(crate.b, 1); crate.state = "resident"; crate.spools = 0; s.resident += 1; }
      moving = true;
    }
    if (crate.state === "line" && crate.alpha < 1) { crate.alpha = still.matches ? 1 : Math.min(1, crate.alpha + dt * 4); moving = true; }
  }
  return moving;
}
function settle() {
  feed(true);
  for (const crate of crates) { if (crate.route.length) crate.pos = crate.route[crate.route.length - 1].slice(); crate.route = []; if (crate.state === "line") crate.alpha = 1; }
  moveCrates(0);
}

// ---------- phases ----------
// A phase lasts `dur` seconds, or until `until()` holds when it has one.
const phase = (dur, begin, update, end, until) => ({ dur, begin, update, end, until });
const headReady = () => line.length > 0 && at(crates[line[0]]) && crates[line[0]].pos[1] < GEO.CONV_Y - 1;

function compile(kernel, caseIndex) {
  return [phase(0.7, () => {
    s.kernel = kernel; s.caseIndex = caseIndex; s.blocked = false; s.lamp = "off";
    feed(still.matches);
  })];
}
function admit(bay) {
  let crate = null;
  return [
    phase(0.05, null, null, null, headReady),
    phase(0.22, () => { s.lamp = "go"; s.gate = 1; }),
    phase(0.05, () => {
      crate = crates[line.shift()];
      crate.state = "moving"; crate.b = bay;
      crate.route = [[GEO.DOOR.cx, GEO.LANE_Y], [GEO.BAYS[bay], GEO.LANE_Y]];
      lineRoutes();
    }, null, () => { s.gate = 0; }, () => crate.pos[1] < GEO.FRONT - 18),
  ];
}
// Mark block `bay`'s share of each resource, the first `f` of it.
function claimAll(bay, f) {
  const k = s.kernel;
  const nd = drawersPerBlock(k), ns = BLOCK.warps, nk = k.sharedKB;
  for (let i = 0; i < Math.round(nd * f); i++) s.drawer[bay * nd + i] = bay;
  for (let i = 0; i < Math.round(ns * f); i++) s.slot[bay * ns + i] = bay;
  for (let i = 0; i < Math.round(nk * f); i++) s.shelf[bay * nk + i] = bay;
}
function dispatchAll() {
  const out = [];
  const f = fit(s.kernel);
  for (let bay = 0; bay < f.blocks; bay++) out.push(...admit(bay));
  const settled = () => !crates.some((c) => c.state === "moving" || c.state === "claiming") && headReady();
  out.push(phase(0.2, null, null, () => { s.lamp = "stop"; s.blocked = true; s.gate = 0; }, settled));
  return out;
}
function drain() {
  const leaving = [];
  return [phase(still.matches ? 0 : 1.1,
    () => {
      s.blocked = false; s.lamp = "off";
      crates.forEach((c) => { if (c.state === "resident") { c.state = "retire"; leaving.push(c); } });
    },
    (f) => {
      leaving.forEach((c) => {
        const own = ease((f - c.b * 0.06) / 0.55);
        c.lift = own * 16; c.alpha = 1 - own;
        if (own >= 1 && c.b >= 0) {
          for (const list of [s.drawer, s.slot, s.shelf]) list.forEach((owner, i) => { if (owner === c.b) list[i] = -1; });
        }
      });
    },
    () => {
      leaving.forEach((c) => { c.state = "off"; c.b = -1; c.lift = 0; c.alpha = 0; });
      s.drawer.fill(-1); s.slot.fill(-1); s.shelf.fill(-1); s.resident = 0;
    })];
}

function plan(index) {
  // the dispatch steps need the kernel already chosen when they are planned
  const run = (kernel, caseIndex) => [...drain(), ...compile(kernel, caseIndex), ...lazy(() => dispatchAll())];
  if (index === 0) return compile(KERNELS[0], 0);
  if (index === 1) return lazy(() => dispatchAll());
  if (index <= 5) return run(KERNELS[index - 1], index - 1);
  const kernel = NEW_KERNELS[draws++ % NEW_KERNELS.length];
  return run(kernel, "new");
}
// A phase that expands into more phases when it starts, once the state before it is known.
function lazy(make) {
  return [phase(0, () => { queue.unshift(...make()); })];
}

function press(index) {
  if (index !== next || queue.length || current) return;
  queue = plan(index);
  next = index === 6 ? 6 : index + 1;
  if (still.matches) {
    while (queue.length) {
      const p = queue.shift();
      p.begin && p.begin();
      settle();
      p.update && p.update(1);
      p.end && p.end();
      settle();
    }
    say(summary(index));
  } else pendingSay = index;
  kick();
}
function say(value) { status.textContent = value; }
function summary(index) {
  const k = s.kernel;
  const f = fit(k);
  if (index === 0) return "Compiled at " + k.regs + " registers per thread, no shared memory: " + fmt(f.perBlock) + " registers per block.";
  return k.regs + " registers, " + k.sharedKB + " KB shared: " + f.blocks + " blocks fit, " + f.warps + " warps, " + pct(f.occupancy) + " occupancy, limited by " + limitText(f.limits) + ". The next crate waits at the door.";
}

// ---------- drawing ----------
const shift = (x, y, z) => "translate(" + (AX.x[0] * x + AX.y[0] * y + AX.z[0] * z).toFixed(2) + " " + (AX.x[1] * x + AX.y[1] * y + AX.z[1] * z).toFixed(2) + ")";
function needleAt(name, value) {
  const { at: [x, y], r: R } = GAUGES[name];
  const a = SWEEP[0] + (Math.min(value, 18) / 18) * SWEEP[1];
  return lineOnTop([x - Math.sin(a) * 2.4, y + Math.cos(a) * 2.4], [x + Math.sin(a) * (R - 3.2), y - Math.cos(a) * (R - 3.2)], DIAL_Z + 0.2, P);
}
function arcTo(name, value) {
  const share = Math.min(value, 18) / 18;
  if (share < 0.004) return "";
  const n = Math.max(2, Math.ceil(share * 40));
  const { at: [x, y], r } = GAUGES[name];
  const R = r - 1.8;
  return onTop(Array.from({ length: n + 1 }, (_, i) => { const a = SWEEP[0] + (i / n) * share * SWEEP[1]; return [x + Math.sin(a) * R, y - Math.cos(a) * R]; }), DIAL_Z + 0.02, P);
}

function drawCrates() {
  const order = { inside: [], outside: [] };
  for (const crate of crates) {
    const on = crate.state !== "off";
    const display = on && crate.alpha > 0.01 ? "" : "none";
    if (crate.el.style.display !== display) crate.el.style.display = display;
    if (!on) continue;
    const t = shift(crate.pos[0], crate.pos[1], crate.lift);
    if (crate.el.getAttribute("transform") !== t) crate.el.setAttribute("transform", t);
    const alpha = crate.alpha >= 0.999 ? "" : crate.alpha.toFixed(2);
    if (crate.el.style.opacity !== alpha) crate.el.style.opacity = alpha;
    setAttr(crate.el, "data-b", crate.b >= 0 ? crate.b : null);
    crateEls[crate.id].spools.forEach((el, j) => { const d = j < crate.spools ? "" : "none"; if (el.style.display !== d) el.style.display = d; });
    (crate.pos[1] < GEO.FRONT + 2 ? order.inside : order.outside).push(crate);
  }
  for (const [name, layer] of [["inside", inside], ["outside", outside]]) {
    const list = order[name].sort((a, b) => depthOf([a.pos[0], a.pos[1], 0], P) - depthOf([b.pos[0], b.pos[1], 0], P));
    const kids = [...layer.children].filter((el) => el.style.display !== "none");
    if (list.some((c, i) => kids[i] !== c.el)) for (const c of list) layer.appendChild(c.el);
  }
}

function draw(dt) {
  let moving = moveCrates(dt);
  if (s.kernel) feed(false);
  drawCrates();

  const k = s.kernel;
  const f = k ? fit(k) : null;
  const roomNow = k ? room(k, s.resident) : null;

  // claims: committed ones plus the block being claimed right now
  const drawer = s.drawer.slice(), slot = s.slot.slice(), shelf = s.shelf.slice();
  const claiming = crates.filter((c) => c.state === "claiming");
  if (k) for (const { b: bay, claimT: g } of claiming) {
    const nd = drawersPerBlock(k), nk = k.sharedKB;
    for (let i = 0; i < Math.round(nd * g); i++) drawer[bay * nd + i] = bay;
    for (let i = 0; i < Math.min(8, Math.floor(g * 8.999)); i++) slot[bay * 8 + i] = bay;
    for (let i = 0; i < Math.round(nk * g); i++) shelf[bay * nk + i] = bay;
  }
  const leftOver = !!(s.blocked && f && f.limits.includes("regs") && f.regsLeft > 0);
  drawers.forEach((el, i) => { setAttr(el, "data-b", drawer[i] >= 0 ? drawer[i] : null); setFlag(el, "data-left", leftOver && drawer[i] < 0); });
  slots.forEach((el, i) => { setAttr(el, "data-b", slot[i] >= 0 ? slot[i] : null); text(slotN[i], slot[i] >= 0 ? String(i) : ""); });
  shelves.forEach((el, i) => setAttr(el, "data-b", shelf[i] >= 0 ? shelf[i] : null));

  // gauges: how many more blocks each resource would take now
  for (const name of ["regs", "slots", "shared"]) {
    const g = gauges[name];
    const goal = roomNow ? (roomNow[name] === Infinity ? 18 : Math.min(roomNow[name], 17)) : 0;
    const before = shown[name];
    shown[name] = follow(shown[name], goal, dt, 0.22);
    if (Math.abs(shown[name] - goal) < 0.005) shown[name] = goal; else moving = true;
    if (shown[name] !== before || !g.needle.dataset.set) { g.needle.setAttribute("d", needleAt(name, shown[name])); g.arc.setAttribute("d", arcTo(name, shown[name])); g.needle.dataset.set = "1"; }
    text(g.more, roomNow ? (roomNow[name] === Infinity ? "∞" : "+" + roomNow[name]) : "-");
    const limit = !!(s.blocked && f.limits.includes(name));
    setFlag(g.el, "data-limit", limit);
    setFlag(g.lamp, "data-on", limit);
  }

  // the door: gate slides up for a crate, shuts red when the SM is full
  const gateGoal = s.gate;
  const gateBefore = shown.gate;
  shown.gate = follow(shown.gate, gateGoal, dt, 0.06);
  if (Math.abs(shown.gate - gateGoal) < 0.005) shown.gate = gateGoal; else moving = true;
  if (shown.gate !== gateBefore || !gateEl.dataset.set) { gateEl.setAttribute("transform", shift(0, 0, shown.gate * 16)); gateEl.dataset.set = "1"; }
  setFlag(gateEl, "data-shut", s.blocked);
  setFlag(doorLamp, "data-on", s.lamp === "stop");
  setFlag(doorLamp, "data-go", s.lamp === "go");

  // displays built into the machine
  const usedRegs = drawer.filter((o) => o >= 0).length * SM.regsPerDrawer;
  const usedKB = shelf.filter((o) => o >= 0).length;
  const usedWarps = slot.filter((o) => o >= 0).length;
  const resident = s.resident + claiming.length;
  text(lcd["k-regs"], k ? String(k.regs) : "-");
  text(lcd["k-threads"], k ? String(BLOCK.threads) : "-");
  text(lcd["k-shared"], k ? k.sharedKB + " KB" : "-");
  text(lcd["k-perblock"], k ? fmt(f.perBlock) : "-");
  const exact = k ? f.allow.regsExact : 0;
  text(lcd["regs-calc"], k ? fmt(SM.regs) + " ÷ " + fmt(f.perBlock) + " = " + (exact % 1 ? exact.toFixed(1) : exact) : "-");
  text(lcd["regs-free"], k ? fmt(SM.regs - usedRegs) : fmt(SM.regs));
  text(lcd["slots-calc"], k ? "64 ÷ 8 = " + f.allow.slots : "-");
  text(lcd["shared-calc"], k ? (k.sharedKB ? "96 ÷ " + k.sharedKB + " = " + (96 / k.sharedKB % 1 ? (96 / k.sharedKB).toFixed(1) : 96 / k.sharedKB) : "0 KB · ∞") : "-");
  text(lcd.blocks, String(resident));
  text(lcd.warps, String(usedWarps));
  text(lcd.occ, pct(usedWarps / SM.warps));
  text(lcd.limit, s.blocked ? (f.limits.length > 1 ? f.limits.map((n) => ({ regs: "REG", slots: "CAP", shared: "SHARED" })[n]).join(" + ") : ({ regs: "REGISTERS", slots: "WARP CAP", shared: "SHARED" })[f.limits[0]]) : k && resident ? "…" : "-");

  // chips and the case table, from the same model
  const allowed = (name) => (f.allow[name] === Infinity ? "no limit" : String(f.allow[name]));
  text(chips.needs, k ? fmt(f.perBlock) + " registers · 8 warp slots · " + k.sharedKB + " KB" : "-");
  text(chips.regs, k ? fmt(SM.regs) + " ÷ " + fmt(f.perBlock) + " = " + (exact % 1 ? exact.toFixed(1) + " → " + f.allow.regs : String(exact)) : "-");
  text(chips.slots, k ? "64 ÷ 8 = " + f.allow.slots : "-");
  text(chips.shared, k ? (k.sharedKB ? "96 ÷ " + k.sharedKB + " = " + (96 / k.sharedKB % 1 ? (96 / k.sharedKB).toFixed(1) + " → " : "") + f.allow.shared : "no limit") : "-");
  text(chips.fits, k ? "smallest = " + f.blocks + " blocks = " + f.warps + " warps" : "-");
  text(chips.occ, k ? f.warps + " ÷ 64 = " + pct(f.occupancy) : "-");
  text(chips.left, k && s.blocked ? fmt(f.regsLeft) + " registers · " + (64 - f.warps) + " warp slots · " + f.sharedLeft + " KB" : "-");
  for (const name of ["regs", "slots", "shared"]) setFlag(chipBox[name], "data-limit", !!(s.blocked && f.limits.includes(name)));
  setFlag(chipBox.fits, "data-limit", s.blocked);
  // one plain sentence: what the machine is doing now
  const busy = queue.length || current;
  const ran = f && (f.limits.length > 1 ? limitText(f.limits) + " ran out together" : limitText(f.limits) + " ran out first");
  const sentence = !k ? "Press <b>Compile at 32 registers</b>. Each crate is one thread block: 256 threads in 8 warps."
    : s.blocked ? "Full after <b>" + f.blocks + " blocks</b>: <span class=\"so-red\">" + ran + "</span>, so the next block waits at the door. " + f.blocks + " × 8 = " + f.warps + " of 64 warps, <b>" + pct(f.occupancy) + " occupancy</b>." + (leftOver ? " The " + fmt(f.regsLeft) + " registers left over are too few for another block." : "")
    : busy && resident ? "Block " + resident + " rolls in and takes its " + drawersPerBlock(k) + " drawers of registers, 8 warp slots" + (k.sharedKB ? " and " + k.sharedKB + " shelves" : "") + "."
    : "Each block needs <b>" + k.regs + " × 256 = " + fmt(f.perBlock) + " registers</b>, <b>8 warp slots</b> and <b>" + k.sharedKB + " KB</b> of shared memory. Registers allow " + allowed("regs") + ", warp slots allow " + allowed("slots") + (k.sharedKB ? ", shared memory allows " + allowed("shared") : ", and shared memory sets no limit") + ". The smallest wins.";
  if (sayEl.innerHTML !== sentence) sayEl.innerHTML = sentence;
  ledgerRows.forEach((row) => setFlag(row, "data-on", s.caseIndex !== null && String(s.caseIndex) === row.dataset.case));
  if (s.caseIndex === "new") {
    text(newCells.kernel, k.regs + " reg · " + k.sharedKB + " KB");
    text(newCells.perblock, fmt(f.perBlock));
    text(newCells.regs, f.allow.regs + (exact % 1 ? " (" + exact.toFixed(1) + ")" : ""));
    text(newCells.slots, String(f.allow.slots));
    text(newCells.shared, allowText(f.allow.shared));
    newCells.blocks.innerHTML = "<b>" + f.blocks + "</b>";
    text(newCells.warps, String(f.warps));
    text(newCells.occ, pct(f.occupancy));
    text(newCells.limit, limitText(f.limits));
  }
  text(readout, !k ? "idle" : k.regs + " reg · " + k.sharedKB + " KB · " + resident + " blocks · " + usedWarps + " warps · " + pct(usedWarps / SM.warps));

  buttons.forEach((button, i) => {
    const st = i < next ? "done" : i === next ? "next" : "later";
    if (button.dataset.state !== st) button.dataset.state = st;
    const enabled = i === next && !queue.length && !current;
    if (button.disabled === enabled) button.disabled = !enabled;
  });
  return moving;
}

function advance(dt) {
  let budget = dt;
  while (budget > 0) {
    if (!current) {
      if (!queue.length) return false;
      current = queue.shift();
      current.t = 0;
      current.begin && current.begin();
    }
    const room = Math.max(0, current.dur - current.t);
    const use = Math.min(room, budget);
    current.t += use;
    budget -= use;
    current.update && current.update(current.dur ? Math.min(1, current.t / current.dur) : 1);
    const timeUp = current.t >= current.dur - 1e-9;
    if (timeUp && (!current.until || current.until())) {
      current.end && current.end();
      current = null;
      if (!queue.length) {
        if (pendingSay >= 0) { say(summary(pendingSay)); pendingSay = -1; }
        return false;
      }
    } else if (timeUp) return true;
    else return true;
  }
  return true;
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const busy = advance(dt);
  const moving = draw(dt);
  frame = visible && (busy || moving || current || queue.length) ? requestAnimationFrame(tick) : 0;
}
function kick() { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } else if (!visible) draw(1); }

buttons.forEach((button, i) => button.addEventListener("click", () => press(i)));
const labelToggle = document.querySelector("[data-labels]");
function showLabels(on) {
  labelToggle.setAttribute("aria-pressed", String(on));
  labelToggle.textContent = "Labels: " + (on ? "on" : "off");
  stage.dataset.labels = on ? "on" : "off";
}
labelToggle.addEventListener("click", () => showLabels(labelToggle.getAttribute("aria-pressed") !== "true"));
if (matchMedia("(max-width: 820px)").matches) showLabels(false);
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) kick(); }, { rootMargin: "120px 0px" }).observe(stage);
draw(1);

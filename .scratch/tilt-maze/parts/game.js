/* =====================================================================
   TILT MAZE — 思想重力場
   ---------------------------------------------------------------------
   The four directions no longer *are* the answer; they tilt the plane the
   answer rolls across. Everything the player does is still four buttons.

   Layers, in the order they appear below:
     1. state + the standing information panels (ported look, new numbers)
     2. levels (hand-authored for the story, generated for endless)
     3. the engine: tilt spring -> gravity -> ball -> tiles -> hole
     4. story flow: street -> field -> theater
     5. endless flow: escalating levels -> arcade GAME OVER report
   ===================================================================== */

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const whoPane = $('whoPane'), mePane = $('mePane'), whoFx = $('whoFx'), meFx = $('meFx');
const npcTok = $('npcTok'), playerTok = $('playerTok');
const whoName = $('whoName'), whoState = $('whoState'), meState = $('meState');
const bubbleTag = $('bubbleTag'), bubbleText = $('bubbleText');
const arenaBoard = $('arenaBoard'), arena = $('arena'), arenaCap = $('arenaCap');
const clockFill = $('clockFill'), clockLabel = $('clockLabel'), clockRight = $('clockRight');
const influenceNum = $('influenceNum'), scoreLabel = $('scoreLabel');
const factionsPanel = $('factionsPanel'), newsList = $('newsList'), tickerTrack = $('tickerTrack');
const factionCard = $('factionCard'), newsCard = $('newsCard'), footerHint = $('footerHint');
const overlay = $('overlay'), theater = $('theater'), theaterName = $('theaterName');
const theaterCaption = $('theaterCaption'), theaterQuote = $('theaterQuote'), theaterGain = $('theaterGain');
const mainSprite = $('mainSprite'), iconSprite = $('iconSprite'), viralTag = $('viralTag');
const continueBtn = $('continueBtn'), flash = $('flash');
const reportOverlay = $('reportOverlay'), reportCard = $('reportCard'), reportNote = $('reportNote');
const startScreen = $('startScreen');
const dUp = $('dUp'), dDown = $('dDown'), dLeft = $('dLeft'), dRight = $('dRight');
const DPAD = { up: dUp, down: dDown, left: dLeft, right: dRight };

const ICON_CELL = 7;
const FACTIONS = ['professor', 'religion', 'merchant', 'ai', 'netizen'];

/* ---------- STATE ---------- */
let chapter = 1, day = 1;                 // the record header wants these
let influence = 0;
let trust = {}; FACTIONS.forEach(f => trust[f] = 20);
let mode = 'story';                       // 'story' | 'endless'
let currentNPC = null, storyIndex = 0;
let endless = null;
let pendingAction = null;

const pick = a => a[Math.floor(Math.random() * a.length)];
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- STANDING INFORMATION ---------- */
function renderFactionPanel() {
  factionsPanel.style.setProperty('--fcols', FACTIONS.length);
  factionsPanel.innerHTML = FACTIONS.map(f => {
    const m = META[f], v = Math.round(trust[f]);
    return `<div class="faction">
      <div class="icon">${m.emoji}</div>
      <div class="name">${m.label}</div>
      <div class="track"><div class="fill" style="width:${v}%;background:var(${m.varc})"></div></div>
      <div class="pct">${v}%</div>
    </div>`;
  }).join('');
}

let newsSeq = 0;
function pushNews(text) {
  newsSeq++;
  const mins = 8 * 60 + newsSeq * 37;
  const clock = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const el = document.createElement('div');
  el.className = 'news-item';
  el.innerHTML = `<span class="nt">觀測第 ${day} 日 · ${clock}</span>${text}`;
  newsList.prepend(el);
  while (newsList.children.length > 12) newsList.lastChild.remove();
}
function pushTicker(text) {
  tickerTrack.textContent = text;
  tickerTrack.style.animation = 'none'; void tickerTrack.offsetWidth;
  tickerTrack.style.animation = 'scroll 18s linear infinite';
}
function updateHUD() {
  influenceNum.textContent = mode === 'endless'
    ? endless.score.toLocaleString()
    : influence.toLocaleString();
}

/* =====================================================================
   2. LEVELS
   ---------------------------------------------------------------------
   Legend
     #  wall        .  floor       I  ice (barely any friction)
     G  goo (heavy drag)
     o  white ball  O  white hole
     p  green ball  P  green hole
     S  latch switch (crossing it opens every door; crossing it again shuts them)
     D  door, shut until a switch is crossed

   Colour is the whole point of a two-ball room: a ball ignores — and rolls
   straight over — a hole that is not its own, so the two balls need different
   journeys out of the one gravity they share.
   ===================================================================== */
const BALL_CH = ['o', 'p'], HOLE_CH = ['O', 'P'];
const BALL_COLOR = { o: 'white', p: 'green' };
const HOLE_COLOR = { O: 'white', P: 'green' };
const BALL_SKIN = {
  white: { core: '#ffffff', mid: '#cfeaff', low: '#5f93b8', edge: '#16303f', glow: 'rgba(180,230,255,0.8)' },
  green: { core: '#ffffff', mid: '#b6ffd6', low: '#3aa972', edge: '#0d2c1e', glow: 'rgba(126,240,168,0.85)' }
};
const STORY_LEVELS = [
  { /* 1 — nothing but gravity */
    name: '第一課：讓它自己滾過去', time: 55, grid: [
      '###########',
      '#.........#',
      '#.o.......#',
      '#.........#',
      '#.......O.#',
      '#.........#',
      '###########']
  },
  { /* 2 — a wall means you must think in two moves */
    name: '第二課：直線走不到的地方', time: 55, grid: [
      '###########',
      '#.o.......#',
      '#....###..#',
      '#....#....#',
      '#....#.O..#',
      '#....#....#',
      '###########']
  },
  { /* 3 — ice: commitment */
    name: '第三課：停不下來的想法', time: 50, grid: [
      '#############',
      '#.o.........#',
      '#.IIIIIIII..#',
      '#.IIIIIIII..#',
      '#.IIIIIIII.O#',
      '#...........#',
      '#############']
  },
  { /* 4 — goo: the cost of a bad line */
    name: '第四課：陷進去的思路', time: 55, grid: [
      '#############',
      '#.o..GGG....#',
      '#....GGG....#',
      '#..###GG###.#',
      '#..#..GG..#.#',
      '#..#.O....#.#',
      '#############']
  },
  { /* 5 — the switch: order matters */
    name: '第五課：先開門，再進門', time: 60, grid: [
      '#############',
      '#.o...#.....#',
      '#.....#..O..#',
      '#..S..D.....#',
      '#.....#.....#',
      '#.....#.....#',
      '#############']
  },
  { /* 6 — two balls, one gravity, and each hole only accepts its own colour.
         The lanes hand you the answer: run both to the right wall, then use the
         right-hand column to drop the white one and lift the green one. */
    name: '第六課：兩個念頭同時成立', time: 70, grid: [
      '##############',
      '#.o.......P..#',
      '#....####....#',
      '#....#..#....#',
      '#....####....#',
      '#.p.......O..#',
      '##############']
  },
  { /* 7 — everything at once */
    name: '第七課：一次想清楚', time: 75, grid: [
      '###############',
      '#.o..#...GG...#',
      '#....#...GG...#',
      '#.S..D....IIII#',
      '#....#....IIII#',
      '#....#.O..IIII#',
      '###############']
  }
];

/* Endless levels are BUILT solvable rather than generated-and-hoped-for: every
   ball and its matching hole are drawn from the same open region, so a walled-off
   pocket can never hold the thing you need. The check at the end is a backstop,
   not the mechanism. */
function genLevel(n) {
  const cols = clamp(11 + Math.floor(n / 3), 11, 17);
  const rows = clamp(7 + Math.floor(n / 4), 7, 11);
  const balls = n >= 6 ? 2 : 1;

  for (let attempt = 0; attempt < 80; attempt++) {
    const g = [];
    for (let y = 0; y < rows; y++) {
      let row = '';
      for (let x = 0; x < cols; x++) row += (x === 0 || y === 0 || x === cols - 1 || y === rows - 1) ? '#' : '.';
      g.push(row.split(''));
    }
    const put = (x, y, ch) => { if (g[y] && g[y][x] && g[y][x] === '.') { g[y][x] = ch; return true; } return false; };

    // walls: short bars rather than noise, so the room stays readable
    const bars = 1 + Math.min(5, Math.floor(n / 2));
    for (let i = 0; i < bars; i++) {
      const len = randInt(2, Math.min(5, cols - 4));
      const horiz = Math.random() < 0.5;
      const x = randInt(2, cols - 3), y = randInt(2, rows - 3);
      for (let k = 0; k < len; k++) put(horiz ? x + k : x, horiz ? y : y + k, '#');
    }
    // terrain patches
    if (n >= 3) for (let i = 0; i < 1 + Math.floor(n / 5); i++) {
      const ch = Math.random() < 0.55 ? 'I' : 'G';
      const w = randInt(2, 4), h = randInt(2, 3);
      const x = randInt(1, cols - 1 - w), y = randInt(1, rows - 1 - h);
      for (let j = 0; j < h; j++) for (let i2 = 0; i2 < w; i2++) put(x + i2, y + j, ch);
    }

    // Everything lands in ONE open region — the largest one — so no piece of the
    // puzzle can end up behind a wall the ball has no way through.
    const region = regionMap(g);
    const buckets = {};
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      const id = region[y][x];
      if (id < 0 || g[y][x] !== '.') continue;   // only plain floor is a legal spot
      (buckets[id] = buckets[id] || []).push([x, y]);
    }
    const home = Object.values(buckets).sort((a, b) => b.length - a.length)[0] || [];
    if (home.length < balls * 2 + 4) continue;

    const spots = [];
    let ok = true;
    for (let i = 0; i < balls * 2; i++) {
      const cand = home.filter(p => spots.every(q => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 3));
      if (!cand.length) { ok = false; break; }
      spots.push(pick(cand));
    }
    if (!ok) continue;
    for (let i = 0; i < balls; i++) {
      g[spots[i][1]][spots[i][0]] = BALL_CH[i];
      g[spots[balls + i][1]][spots[balls + i][0]] = HOLE_CH[i];
    }

    const grid = g.map(r => r.join(''));
    if (!solvable(grid)) continue;
    return { name: '第 ' + n + ' 關', time: Math.max(14, Math.round(34 - n * 1.3)), grid };
  }
  // last resort: a known-good hand-authored room rather than a broken one
  return { name: '第 ' + n + ' 關', time: 30, grid: STORY_LEVELS[0].grid };
}

/** flood-fill id per open tile; -1 for walls */
function regionMap(g) {
  const rows = g.length, cols = g[0].length;
  const solid = (x, y) => x < 0 || y < 0 || x >= cols || y >= rows || g[y][x] === '#';
  const region = [];
  for (let y = 0; y < rows; y++) region.push(new Array(cols).fill(-1));
  let id = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (solid(x, y) || region[y][x] >= 0) continue;
    const q = [[x, y]]; region[y][x] = id;
    while (q.length) {
      const [cx, cy] = q.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nx = cx + dx, ny = cy + dy;
        if (!solid(nx, ny) && region[ny][nx] < 0) { region[ny][nx] = id; q.push([nx, ny]); }
      });
    }
    id++;
  }
  return region;
}

/** EVERY ball must be able to reach the hole of ITS OWN colour */
function solvable(grid) {
  const g = grid.map(r => r.split(''));
  const region = regionMap(g);
  const need = {};   // colour -> { ball: [regions], hole: Set(regions) }
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    const ch = g[y][x], id = region[y][x];
    const bc = BALL_COLOR[ch], hc = HOLE_COLOR[ch];
    if (bc) { (need[bc] = need[bc] || { ball: [], hole: new Set() }).ball.push(id); }
    if (hc) { (need[hc] = need[hc] || { ball: [], hole: new Set() }).hole.add(id); }
  }
  const colors = Object.keys(need);
  if (!colors.length) return false;
  return colors.every(c => {
    const e = need[c];
    return e.ball.length > 0 && e.hole.size > 0 && e.ball.every(r => e.hole.has(r));
  });
}

/* =====================================================================
   3. THE ENGINE
   ===================================================================== */
const TILE = 24, BALL_R = 8;
const GRAV = 940;          // px/s² at full tilt
const TILT_K = 78, TILT_D = 9.5;   // spring back to level, with a little overshoot
const REST = 0.42, REST_ICE = 0.62;
const MU = { '.': 1.15, 'I': 0.12, 'G': 6.4, 'S': 1.15, 'O': 1.15, 'D': 1.15 };
const SINK_SPEED = 400;    // faster than this and the ball rims out

let field = null;
const held = { up: false, down: false, left: false, right: false };

function loadLevel(def, onWin, onFail) {
  const grid = def.grid.map(r => r.split(''));
  const rows = grid.length, cols = grid[0].length;
  const balls = [], holes = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const ch = grid[y][x];
    if (BALL_COLOR[ch]) { balls.push(makeBall(x, y, BALL_COLOR[ch])); grid[y][x] = '.'; }
    if (HOLE_COLOR[ch]) {
      holes.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, gx: x, gy: y, color: HOLE_COLOR[ch] });
    }
  }
  field = {
    def, grid, rows, cols, balls, holes,
    tx: 0, ty: 0, vtx: 0, vty: 0,
    latched: false,
    time: def.time, timeLeft: def.time,
    running: false, over: false,
    tilts: 0, elapsed: 0,
    onWin, onFail
  };
  sizeBoard();
  arenaCap.classList.remove('warn');
  arenaCap.textContent = def.name;
  drawField();
}
function makeBall(gx, gy, color) {
  return {
    x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2, vx: 0, vy: 0,
    r: BALL_R, sunk: 0, color: color || 'white', tile: gx + ',' + gy
  };
}

/* The tray takes the whole middle band of the screen — at 1920x1080 that is
   roughly a 1000x600 stage. It is the largest object in the layout by a wide
   margin, which is the entire point of the 70/20/10 split. */
function sizeBoard() {
  if (!field) return;
  const host = arenaBoard.parentElement;
  const availW = Math.max(320, (host.clientWidth || 900) - 8);
  const availH = Math.max(240, (host.clientHeight || 520) - 34);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cam.w = availW; cam.h = availH; arena._dpr = dpr;
  arena.width = Math.round(availW * dpr); arena.height = Math.round(availH * dpr);
  arena.style.width = availW + 'px'; arena.style.height = availH + 'px';
  fitCamera();
}
window.addEventListener('resize', () => { sizeBoard(); sizeFx(); });

function tileAt(gx, gy) {
  if (!field || gy < 0 || gx < 0 || gy >= field.rows || gx >= field.cols) return '#';
  return field.grid[gy][gx];
}
function doorsOpen() { return field.latched; }
function isSolid(gx, gy) {
  const ch = tileAt(gx, gy);
  if (ch === '#') return true;
  if (ch === 'D') return !doorsOpen();
  return false;
}

function stepPhysics(dt) {
  const f = field;
  f.elapsed += dt;

  // --- the plane: a spring, not a switch. This is the whole feel of the game. ---
  const targetX = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  const targetY = (held.down ? 1 : 0) - (held.up ? 1 : 0);
  f.vtx += (targetX - f.tx) * TILT_K * dt; f.vtx *= Math.exp(-TILT_D * dt); f.tx += f.vtx * dt;
  f.vty += (targetY - f.ty) * TILT_K * dt; f.vty *= Math.exp(-TILT_D * dt); f.ty += f.vty * dt;
  f.tx = clamp(f.tx, -1.15, 1.15); f.ty = clamp(f.ty, -1.15, 1.15);
  // Released and settled means LEVEL — exactly zero, no residual slope. A board
  // that keeps a sliver of tilt would quietly forbid whole directions.
  if (!targetX && Math.abs(f.tx) < 0.005 && Math.abs(f.vtx) < 0.05) { f.tx = 0; f.vtx = 0; }
  if (!targetY && Math.abs(f.ty) < 0.005 && Math.abs(f.vty) < 0.05) { f.ty = 0; f.vty = 0; }

  f.balls.forEach(b => {
    if (b.sunk) { b.sunk += dt; return; }
    const gx = Math.floor(b.x / TILE), gy = Math.floor(b.y / TILE);
    const ch = tileAt(gx, gy);

    b.vx += GRAV * f.tx * dt;
    b.vy += GRAV * f.ty * dt;
    const mu = MU[ch] !== undefined ? MU[ch] : 1.15;
    const damp = Math.exp(-mu * dt);
    b.vx *= damp; b.vy *= damp;

    // hole attraction: the rim helps a slow ball and betrays a fast one.
    // A hole of the wrong colour is just floor — it neither pulls nor takes.
    f.holes.forEach(h => {
      if (h.color !== b.color) return;
      const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy);
      if (d < TILE * 0.55 && d > 0.001) {
        const pull = 520 * (1 - d / (TILE * 0.55));
        b.vx += (dx / d) * pull * dt; b.vy += (dy / d) * pull * dt;
      }
    });

    b.x += b.vx * dt; b.y += b.vy * dt;
    collideTiles(b, ch === 'I');

    // latch switches fire once per entry, not once per frame
    const key = Math.floor(b.x / TILE) + ',' + Math.floor(b.y / TILE);
    if (key !== b.tile) {
      b.tile = key;
      const [nx, ny] = key.split(',').map(Number);
      if (tileAt(nx, ny) === 'S') { f.latched = !f.latched; blip(); }
    }

    // sinking
    f.holes.forEach(h => {
      if (b.sunk || h.color !== b.color) return;
      const d = Math.hypot(h.x - b.x, h.y - b.y);
      const sp = Math.hypot(b.vx, b.vy);
      if (d < TILE * 0.30 && sp < SINK_SPEED) { b.sunk = 0.0001; b.vx = b.vy = 0; b.sx = h.x; b.sy = h.y; }
    });
  });

  collideBalls();

  if (!f.over && f.balls.every(b => b.sunk)) { f.over = 'win'; f.running = false; setTimeout(() => f.onWin(), 620); }
  else if (!f.over) {
    f.timeLeft -= dt;
    if (f.timeLeft <= 0) { f.timeLeft = 0; f.over = 'fail'; f.running = false; setTimeout(() => f.onFail(), 520); }
  }
}

function collideTiles(b, icy) {
  const rest = icy ? REST_ICE : REST;
  const c0 = Math.floor((b.x - b.r) / TILE), c1 = Math.floor((b.x + b.r) / TILE);
  const r0 = Math.floor((b.y - b.r) / TILE), r1 = Math.floor((b.y + b.r) / TILE);
  for (let gy = r0; gy <= r1; gy++) for (let gx = c0; gx <= c1; gx++) {
    if (!isSolid(gx, gy)) continue;
    const rx = gx * TILE, ry = gy * TILE;
    const nx = clamp(b.x, rx, rx + TILE), ny = clamp(b.y, ry, ry + TILE);
    let dx = b.x - nx, dy = b.y - ny, d = Math.hypot(dx, dy);
    if (d >= b.r) continue;
    if (d < 0.0001) {   // dead centre: eject along the shallowest axis
      const ox = b.x - (rx + TILE / 2), oy = b.y - (ry + TILE / 2);
      dx = Math.abs(ox) > Math.abs(oy) ? Math.sign(ox) : 0;
      dy = dx ? 0 : Math.sign(oy) || 1;
      d = 1;
    }
    const ux = dx / d, uy = dy / d, push = b.r - d;
    b.x += ux * push; b.y += uy * push;
    const vn = b.vx * ux + b.vy * uy;
    if (vn < 0) { b.vx -= (1 + rest) * vn * ux; b.vy -= (1 + rest) * vn * uy; }
  }
}

function collideBalls() {
  const bs = field.balls.filter(b => !b.sunk);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const a = bs[i], b = bs[j];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
    if (d >= min || d < 0.0001) continue;
    const ux = dx / d, uy = dy / d, push = (min - d) / 2;
    a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
    const va = a.vx * ux + a.vy * uy, vb = b.vx * ux + b.vy * uy;
    if (va - vb <= 0) continue;
    const e = 0.85, imp = (1 + e) * (va - vb) / 2;
    a.vx -= imp * ux; a.vy -= imp * uy; b.vx += imp * ux; b.vy += imp * uy;
  }
}

/* =====================================================================
   RENDER — the maze is drawn as light, in real 3D
   ---------------------------------------------------------------------
   The board is a physical tray held at a fixed camera angle. Tilting rotates
   the tray itself about its own two axes, so walls lean, the far rim rises,
   and the ball's shadow separates from the ball — the tilt is legible from
   the picture alone, with no gauge anywhere on screen.

   Nothing here is a texture: walls are extruded volumes drawn as luminous
   edges over near-black faces, the way the reference art reads.
   ===================================================================== */
const CAM = { yaw: -0.60, pitch: 1.02, dist: 2600, tiltMax: 0.30 };
const WALL_H = 15, TRAY_D = 14;

/* One material vocabulary, so nothing is drawn at "default brightness":
   glass rim > interior wall > floor > terrain, each with its own weight. */
const MAT = {
  rimEdge: 'rgba(226,244,255,', rimFace: 'rgba(150,205,240,',
  wallEdge: 'rgba(196,226,246,', wallFace: 'rgba(110,165,205,',
  floor0: '#0a1016', floor1: '#050809',
  ice: '63,230,224', goo: '126,240,168',
  plate: '185,139,255', door: '255,140,66'
};
const HOLE_RGB = { white: '214,240,255', green: '126,240,168' };

let cam = { S: 1, ox: 0, oy: 0, w: 0, h: 0 };
let now = 0;   // seconds, for everything that breathes

/** board space (x, y in physics px; z up) -> screen */
function project(x, y, z) {
  const f = field;
  let px = x - (f.cols * TILE) / 2, py = y - (f.rows * TILE) / 2, pz = z;

  // the tray's own tilt, about its own axes — the same numbers gravity uses
  const A = f.ty * CAM.tiltMax, B = f.tx * CAM.tiltMax;
  let ty2 = py * Math.cos(A) + pz * Math.sin(A);
  let tz2 = pz * Math.cos(A) - py * Math.sin(A);
  let tx2 = px * Math.cos(B) + tz2 * Math.sin(B);
  tz2 = tz2 * Math.cos(B) - px * Math.sin(B);

  // camera: yaw, then pitch, then a gentle perspective
  const cy = Math.cos(CAM.yaw), sy = Math.sin(CAM.yaw);
  const X = tx2 * cy - ty2 * sy, Y = tx2 * sy + ty2 * cy;
  const cp = Math.cos(CAM.pitch), sp = Math.sin(CAM.pitch);
  const sY = Y * cp - tz2 * sp;
  const depth = Y * sp + tz2 * cp;
  const k = CAM.dist / (CAM.dist + depth);
  return { x: X * k * cam.S + cam.ox, y: sY * k * cam.S + cam.oy, d: depth, k };
}

/** fit the untilted tray into the canvas once per level / resize */
function fitCamera() {
  const f = field, W = f.cols * TILE, H = f.rows * TILE;
  const keepTx = f.tx, keepTy = f.ty;
  f.tx = f.ty = 0;
  cam.S = 1; cam.ox = 0; cam.oy = 0;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  [0, W].forEach(x => [0, H].forEach(y => [-TRAY_D, WALL_H].forEach(z => {
    const p = project(x, y, z);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  })));
  const m = 18;
  cam.S = Math.min((cam.w - m * 2) / (x1 - x0), (cam.h - m * 2) / (y1 - y0)) * 0.90;
  cam.ox = cam.w / 2 - ((x0 + x1) / 2) * cam.S;
  cam.oy = cam.h / 2 - ((y0 + y1) / 2) * cam.S;
  f.tx = keepTx; f.ty = keepTy;
}

/** merge wall tiles into slabs, so the maze reads as bars of light, not cells */
function wallSlabs(pred) {
  const f = field, done = [];
  for (let y = 0; y < f.rows; y++) done.push(new Array(f.cols).fill(false));
  const out = [];
  for (let y = 0; y < f.rows; y++) for (let x = 0; x < f.cols; x++) {
    if (done[y][x] || !pred(f.grid[y][x])) continue;
    let w = 1;
    while (x + w < f.cols && !done[y][x + w] && pred(f.grid[y][x + w])) w++;
    let h = 1;
    grow: while (y + h < f.rows) {
      for (let i = 0; i < w; i++) if (done[y + h][x + i] || !pred(f.grid[y + h][x + i])) break grow;
      h++;
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) done[y + j][x + i] = true;
    out.push({ x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE, gx: x, gy: y, gw: w, gh: h });
  }
  return out;
}

function poly(ctx, pts, fill, stroke, width, glow) {
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) {
    ctx.strokeStyle = stroke; ctx.lineWidth = width || 1.2;
    if (glow) { ctx.shadowColor = stroke; ctx.shadowBlur = glow; }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}
function line(ctx, a, b, stroke, width, glow) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = stroke; ctx.lineWidth = width;
  if (glow) { ctx.shadowColor = stroke; ctx.shadowBlur = glow; }
  ctx.stroke(); ctx.shadowBlur = 0;
}

/* An extruded volume. `glass` gives it the rim treatment: a gradient body, a
   bright top lip and a specular streak — the thing that separates the tray
   from the walls inside it. */
function drawBox(ctx, r, z0, z1, o) {
  const c = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  const top = c.map(([x, y]) => project(x, y, z1));
  const bot = c.map(([x, y]) => project(x, y, z0));

  const sides = [0, 1, 2, 3].map(i => {
    const j = (i + 1) % 4;
    return { i, j, d: (top[i].d + top[j].d) / 2 };
  }).sort((a, b) => b.d - a.d);

  sides.forEach(({ i, j }, order) => {
    // faces nearer the camera catch more light; that gradient is the material
    const near = order / 3;
    const g = ctx.createLinearGradient(top[i].x, top[i].y, bot[i].x, bot[i].y);
    g.addColorStop(0, o.faceCol + (o.faceA * (0.5 + near * 0.9)).toFixed(3) + ')');
    g.addColorStop(1, o.faceCol + (o.faceA * 0.12).toFixed(3) + ')');
    poly(ctx, [top[i], top[j], bot[j], bot[i]], g,
      o.edgeCol + (o.edgeA * (0.16 + near * 0.26)).toFixed(3) + ')', 1, 0);
  });

  const tg = ctx.createLinearGradient(top[0].x, top[0].y, top[2].x, top[2].y);
  tg.addColorStop(0, o.faceCol + (o.topA * 1.25).toFixed(3) + ')');
  tg.addColorStop(1, o.faceCol + (o.topA * 0.35).toFixed(3) + ')');
  poly(ctx, top, tg, o.edgeCol + o.edgeA + ')', o.width, o.glow);

  if (o.glass) {
    // one specular streak along the lip nearest the camera
    const near = sides[3];
    line(ctx, top[near.i], top[near.j], 'rgba(255,255,255,0.85)', o.width * 0.7, 14);
  }
}

/* Painter order for a merged slab is its NEAREST corner, not its centre: a long
   bar running from the back of the tray to the front is in front of everything
   its near end passes, and sorting it by its middle makes it disappear behind
   walls it should occlude. */
function nearDepth(r) {
  return Math.min(
    project(r.x, r.y, WALL_H).d, project(r.x + r.w, r.y, WALL_H).d,
    project(r.x, r.y + r.h, WALL_H).d, project(r.x + r.w, r.y + r.h, WALL_H).d
  );
}

function drawField() {
  const f = field, ctx = arena.getContext('2d');
  const dpr = arena._dpr || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cam.w, cam.h);
  ctx.lineJoin = 'round';

  const W = f.cols * TILE, H = f.rows * TILE;
  const rectAt = (x, y, w, h, z) => [
    project(x, y, z), project(x + w, y, z), project(x + w, y + h, z), project(x, y + h, z)
  ];

  // ================= the tray: dark glass under the whole board =============
  // Only the slab BELOW the floor is drawn here. The lit rim is the border ring
  // of real wall tiles, drawn with the rest of the walls further down — if it
  // were drawn as one big box around the outside, its inner face would sit a
  // whole tile away from where the ball actually collides, which is exactly
  // what an "air wall" looks like.
  const floorQuad = rectAt(0, 0, W, H, 0);
  drawBox(ctx, { x: 0, y: 0, w: W, h: H }, -TRAY_D, 0, {
    faceCol: MAT.rimFace + '', faceA: 0.16, topA: 0.02,
    edgeCol: MAT.rimEdge + '', edgeA: 0.4, width: 1.4, glow: 12
  });

  // interior: translucent black, with a soft sheen so it reads as a surface
  const fg = ctx.createLinearGradient(floorQuad[0].x, floorQuad[0].y, floorQuad[2].x, floorQuad[2].y);
  fg.addColorStop(0, MAT.floor0);
  fg.addColorStop(1, MAT.floor1);
  poly(ctx, floorQuad, fg, null);
  ctx.save();
  ctx.beginPath();
  floorQuad.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath(); ctx.clip();
  // faint lattice — enough to read the scale of the room, not enough to notice
  for (let x = TILE; x < W; x += TILE) line(ctx, project(x, 0, 0), project(x, H, 0), 'rgba(150,205,240,0.035)', 1, 0);
  for (let y = TILE; y < H; y += TILE) line(ctx, project(0, y, 0), project(W, y, 0), 'rgba(150,205,240,0.035)', 1, 0);
  // the sheen slides as the tray tips, which is another read on the tilt
  const sh = ctx.createLinearGradient(0, 0, cam.w, cam.h);
  const sAmt = clamp(0.05 + (Math.abs(f.tx) + Math.abs(f.ty)) * 0.05, 0, 0.16);
  sh.addColorStop(clamp(0.35 + f.tx * 0.25, 0, 1), `rgba(150,205,240,${sAmt})`);
  sh.addColorStop(clamp(0.75 + f.tx * 0.25, 0.02, 1), 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, cam.w, cam.h);
  ctx.restore();

  // ================= terrain =================
  wallSlabs(ch => ch === 'I').forEach(r => {
    poly(ctx, rectAt(r.x, r.y, r.w, r.h, 0.4), `rgba(${MAT.ice},0.07)`, `rgba(${MAT.ice},0.5)`, 1, 6);
    for (let gx = r.x + TILE * 0.5; gx < r.x + r.w; gx += TILE)
      line(ctx, project(gx, r.y + 4, 0.4), project(gx, r.y + r.h - 4, 0.4), `rgba(${MAT.ice},0.16)`, 1, 0);
  });
  wallSlabs(ch => ch === 'G').forEach(r => {
    poly(ctx, rectAt(r.x, r.y, r.w, r.h, 0.4), `rgba(40,110,70,0.20)`, `rgba(${MAT.goo},0.36)`, 1, 4);
    for (let gy = r.y + TILE * 0.4; gy < r.y + r.h; gy += TILE * 0.45)
      line(ctx, project(r.x + 4, gy, 0.4), project(r.x + r.w - 4, gy, 0.4), `rgba(${MAT.goo},0.10)`, 1, 0);
  });

  // ================= switch plates =================
  for (let y = 0; y < f.rows; y++) for (let x = 0; x < f.cols; x++) {
    if (f.grid[y][x] !== 'S') continue;
    const on = f.latched, pulse = 0.5 + 0.5 * Math.sin(now * 3);
    const col = on ? `rgba(${MAT.ice},${(0.6 + pulse * 0.4).toFixed(2)})` : `rgba(${MAT.plate},0.6)`;
    poly(ctx, rectAt(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6, 0.5),
      on ? `rgba(${MAT.ice},0.14)` : `rgba(${MAT.plate},0.05)`, col, 1.2, on ? 14 : 5);
    poly(ctx, rectAt(x * TILE + 8, y * TILE + 8, TILE - 16, TILE - 16, 0.6), null, col, 1, on ? 10 : 0);
  }

  // ================= holes: they want the ball =================
  f.holes.forEach(h => {
    const rgb = HOLE_RGB[h.color] || HOLE_RGB.white;
    // how close is the ball that this hole can actually take?
    let near = 0, suitor = null;
    f.balls.forEach(b => {
      if (b.sunk || b.color !== h.color) return;
      const d = Math.hypot(h.x - b.x, h.y - b.y);
      const t = clamp(1 - d / (TILE * 4), 0, 1);
      if (t > near) { near = t; suitor = b; }
    });

    // the pull, drawn as space bending: rings that tighten as the ball closes
    if (near > 0.02) {
      for (let i = 0; i < 3; i++) {
        const phase = (now * 0.55 + i / 3) % 1;
        const rad = 34 * (1 - phase) + 11;
        const a = near * (1 - phase) * 0.5;
        const ring = [];
        for (let s = 0; s <= 20; s++) {
          const ang = (s / 20) * Math.PI * 2;
          ring.push(project(h.x + Math.cos(ang) * rad, h.y + Math.sin(ang) * rad, 0.5));
        }
        poly(ctx, ring, null, `rgba(${rgb},${a.toFixed(3)})`, 1, 6);
      }
      // filaments reaching for the ball
      if (suitor && near > 0.25) {
        for (let i = 0; i < 3; i++) {
          const t = ((now * 1.6 + i / 3) % 1);
          const px = h.x + (suitor.x - h.x) * t, py = h.y + (suitor.y - h.y) * t;
          const p = project(px, py, 1 + Math.sin(t * Math.PI) * 5);
          ctx.fillStyle = `rgba(${rgb},${(near * (1 - t) * 0.85).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 * cam.S * p.k, 0, 7); ctx.fill();
        }
      }
    }

    // the rim, breathing on its own even when nothing is near
    const breathe = 0.72 + 0.28 * Math.sin(now * 1.6 + h.x * 0.05);
    const glowA = clamp(0.35 + near * 0.65, 0, 1) * breathe;
    const ring = [], inner = [];
    for (let i = 0; i <= 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      ring.push(project(h.x + Math.cos(a) * 10.5, h.y + Math.sin(a) * 10.5, 0.6));
      inner.push(project(h.x + Math.cos(a) * 6, h.y + Math.sin(a) * 6, -5));
    }
    poly(ctx, ring, 'rgba(0,0,0,0.95)', `rgba(${rgb},${glowA.toFixed(3)})`, 1.6 + near * 1.4, 12 + near * 26);
    poly(ctx, inner, 'rgba(0,0,0,1)', `rgba(${rgb},${(0.18 * breathe).toFixed(3)})`, 1, 0);
  });

  // ================= everything that stands up, sorted back to front =======
  const items = [];
  // EVERY solid tile gets drawn — the border ring simply gets the glass
  // material, so what you see and what the ball hits are the same surface.
  wallSlabs(ch => ch === '#').forEach(r => {
    const rim = r.gx === 0 || r.gy === 0 || r.gx + r.gw === f.cols || r.gy + r.gh === f.rows;
    const c = nearDepth(r);
    const mat = rim
      ? { faceCol: MAT.rimFace, faceA: 0.17, topA: 0.05, edgeCol: MAT.rimEdge, edgeA: 0.6, width: 1.7, glow: 14, glass: true }
      : { faceCol: MAT.wallFace, faceA: 0.10, topA: 0.09, edgeCol: MAT.wallEdge, edgeA: 0.55, width: 1.2, glow: 7 };
    items.push({ d: c, draw: () => drawBox(ctx, r, 0, WALL_H, mat) });
  });

  for (let y = 0; y < f.rows; y++) for (let x = 0; x < f.cols; x++) {
    if (f.grid[y][x] !== 'D') continue;
    const shut = isSolid(x, y);
    const r = { x: x * TILE, y: y * TILE, w: TILE, h: TILE };
    items.push({
      d: nearDepth(r), draw: () => {
        if (shut) {
          drawBox(ctx, r, 0, WALL_H, {
            faceCol: `rgba(${MAT.door},`, faceA: 0.16, topA: 0.12,
            edgeCol: `rgba(${MAT.door},`, edgeA: 0.8, width: 1.3, glow: 14
          });
        } else {
          [[r.x + 1, 3], [r.x + TILE - 4, 3]].forEach(([px, w]) =>
            drawBox(ctx, { x: px, y: r.y, w, h: TILE }, 0, WALL_H * 0.5, {
              faceCol: `rgba(${MAT.door},`, faceA: 0.06, topA: 0.05,
              edgeCol: `rgba(${MAT.door},`, edgeA: 0.3, width: 1, glow: 4
            }));
        }
      }
    });
  }

  // ================= the balls: the heaviest objects on screen =============
  f.balls.forEach(b => {
    const skin = BALL_SKIN[b.color];

    if (b.sunk) {
      const k = Math.max(0, 1 - b.sunk * 3);
      if (k <= 0) return;
      const p = project(b.sx, b.sy, -2 - (1 - k) * 6);
      items.push({
        d: p.d, draw: () => {
          const rr = b.r * cam.S * p.k * (0.4 + k * 0.6);
          ctx.fillStyle = skin.glow.replace(/[\d.]+\)$/, (k * 0.9) + ')');
          ctx.shadowColor = skin.glow; ctx.shadowBlur = 24 * k;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.fill();
          ctx.shadowBlur = 0;
        }
      });
      return;
    }

    // trail: sampled in board space so it survives the tilt
    const sp = Math.hypot(b.vx, b.vy);
    b.trail = b.trail || [];
    if (!b.tLast || now - b.tLast > 0.016) {
      b.tLast = now;
      b.trail.push({ x: b.x, y: b.y, t: now });
      if (b.trail.length > 16) b.trail.shift();
    }

    const p = project(b.x, b.y, b.r);
    const shp = project(b.x, b.y, 0.5);
    items.push({
      d: p.d, draw: () => {
        const rr = b.r * cam.S * p.k;

        // motion trail — the ball has mass and it has been somewhere
        if (sp > 40) {
          b.trail.forEach((t, i) => {
            const age = (now - t.t) / 0.28;
            if (age > 1) return;
            const tp = project(t.x, t.y, b.r * 0.7);
            ctx.fillStyle = skin.glow.replace(/[\d.]+\)$/, (0.16 * (1 - age) * clamp(sp / 300, 0, 1)).toFixed(3) + ')');
            ctx.beginPath(); ctx.arc(tp.x, tp.y, rr * (0.35 + 0.5 * (1 - age)), 0, 7); ctx.fill();
          });
        }

        // contact shadow: tight and dark when slow, smeared when quick
        ctx.save();
        ctx.translate(shp.x, shp.y); ctx.scale(1, 0.46);
        ctx.fillStyle = `rgba(0,0,0,${(0.62 - clamp(sp / 900, 0, 0.3)).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(0, 0, rr * (1.02 + clamp(sp / 700, 0, 0.5)), 0, 7); ctx.fill();
        ctx.restore();

        // the sphere
        const g = ctx.createRadialGradient(p.x - rr * 0.38, p.y - rr * 0.46, rr * 0.08, p.x, p.y, rr);
        g.addColorStop(0, skin.core);
        g.addColorStop(0.32, skin.mid);
        g.addColorStop(0.74, skin.low);
        g.addColorStop(1, skin.edge);
        ctx.fillStyle = g;
        ctx.shadowColor = skin.glow; ctx.shadowBlur = 16;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
        // rim light along the lower-right, which is what makes it read as solid
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr * 0.94, Math.PI * 0.05, Math.PI * 0.85);
        ctx.strokeStyle = skin.glow.replace(/[\d.]+\)$/, '0.55)');
        ctx.lineWidth = Math.max(1, rr * 0.13); ctx.stroke();
        // specular
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath(); ctx.arc(p.x - rr * 0.32, p.y - rr * 0.42, rr * 0.2, 0, 7); ctx.fill();

        // what the floor is doing to it
        const ch = tileAt(Math.floor(b.x / TILE), Math.floor(b.y / TILE));
        if (ch === 'G' && sp > 10) {
          for (let i = 0; i < 4; i++) {
            const a = now * 4 + i * 1.57;
            const q = project(b.x + Math.cos(a) * 13, b.y + Math.sin(a) * 13, 1);
            line(ctx, q, project(b.x + Math.cos(a) * 9, b.y + Math.sin(a) * 9, 1),
              `rgba(${MAT.goo},0.35)`, 1.4, 4);
          }
        }
        if (ch === 'I' && sp > 120) {
          const back = project(b.x - b.vx * 0.05, b.y - b.vy * 0.05, 0.8);
          line(ctx, back, shp, `rgba(${MAT.ice},0.35)`, 1.6, 8);
        }
      }
    });
  });

  items.sort((a, b) => b.d - a.d).forEach(it => it.draw());
}

/* =====================================================================
   THE TWO FACES — ambient layer around the busts
   ---------------------------------------------------------------------
   The dead black space either side of the tray is where the encounter lives:
   a glow that belongs to the faction, motes of thought drifting up, and a
   line of light running toward the maze while the master is working.
   ===================================================================== */
const fx = { mood: 'meet', link: 0, motes: [] };

function sizeFx() {
  [whoFx, meFx].forEach(cv => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 260, h = cv.clientHeight || 400;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv._w = w; cv._h = h; cv._dpr = dpr;
  });
}

function drawFace(cv, side) {
  if (!cv._w) return;
  const ctx = cv.getContext('2d');
  ctx.setTransform(cv._dpr, 0, 0, cv._dpr, 0, 0);
  ctx.clearRect(0, 0, cv._w, cv._h);

  const npc = side === 'who';
  const tint = npc && currentNPC ? FACTION_RGB[currentNPC.faction] : '255,210,63';
  const heat = { meet: 0.25, think: 0.6, land: 1, lost: 0.18 }[fx.mood] || 0.3;
  const cx = cv._w / 2, cy = cv._h * 0.42;

  // the glow that says someone is here
  const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, cv._w * 0.62);
  const pulse = 0.85 + 0.15 * Math.sin(now * (fx.mood === 'land' ? 5 : 1.4));
  g.addColorStop(0, `rgba(${tint},${(0.16 * heat * pulse).toFixed(3)})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, cv._w, cv._h);

  // motes of thought — density and speed follow the beat we are in
  const count = Math.round(6 + heat * 16);
  for (let i = 0; i < count; i++) {
    const seed = i * 12.9898 + (npc ? 3.7 : 0);
    const rnd = (s) => (Math.sin(s) * 43758.5453) % 1;
    const sx = cx + (Math.abs(rnd(seed)) - 0.5) * cv._w * 0.8;
    const speed = 12 + Math.abs(rnd(seed + 1)) * 26 * (0.5 + heat);
    const y = cv._h * 0.9 - ((now * speed + Math.abs(rnd(seed + 2)) * 400) % (cv._h * 0.75));
    const a = clamp((1 - (cv._h * 0.9 - y) / (cv._h * 0.75)), 0, 1) * heat * 0.7;
    const r = 1 + Math.abs(rnd(seed + 3)) * 1.8;
    ctx.fillStyle = `rgba(${tint},${a.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(sx + Math.sin(now * 1.3 + i) * 6, y, r, 0, 7); ctx.fill();
  }

  // the line of thought running toward the maze
  if (fx.link > 0.01) {
    const edgeX = npc ? 0 : cv._w;
    const dir = npc ? -1 : 1;
    for (let i = 0; i < 7; i++) {
      const t = ((now * 0.8 + i / 7) % 1);
      const x = cx + (edgeX - cx) * t * dir * (npc ? 1 : 1);
      const px = npc ? cx - (cx - edgeX) * t : cx + (edgeX - cx) * t;
      const a = fx.link * (1 - Math.abs(t - 0.5) * 1.4) * 0.8;
      ctx.fillStyle = `rgba(${tint},${Math.max(0, a).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(px, cy + Math.sin(t * 6 + now * 2) * 8, 2.4, 0, 7); ctx.fill();
    }
  }
}
const FACTION_RGB = {
  professor: '63,230,224', religion: '255,207,86', merchant: '255,140,66',
  ai: '185,139,255', netizen: '255,46,136', military: '143,174,90', awakened: '95,124,255'
};

function updateClock() {
  const f = field;
  const pct = clamp(f.timeLeft / f.time, 0, 1) * 100;
  clockFill.style.width = pct + '%';
  clockFill.classList.toggle('calm', pct > 33);
  clockRight.textContent = f.timeLeft.toFixed(1) + ' 秒';
}

let lastT = 0, acc = 0;
function loop(ms) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ms - lastT) / 1000 || 0); lastT = ms;
  now = ms / 1000;

  // the thought-line brightens while the master is actually working
  const target = (field && field.running) ? 1 : 0;
  fx.link += (target - fx.link) * Math.min(1, dt * 3);

  if (mode === 'story') { drawFace(whoFx, 'who'); drawFace(meFx, 'me'); }

  if (!field) return;
  if (field.running) {
    acc += dt;
    while (acc >= 1 / 240) { stepPhysics(1 / 240); acc -= 1 / 240; }
    updateClock();
  }
  drawField();
}
requestAnimationFrame(loop);

function blip() { /* hook for sfx once the prototype gets audio */ }

/* ---------- input ---------- */
function setInputEnabled(on) {
  Object.values(DPAD).forEach(b => b.disabled = !on);
  if (!on) Object.keys(held).forEach(k => { held[k] = false; DPAD[k].classList.remove('held'); });
}
function press(dir, on) {
  // A RELEASE is always honoured. Gating it the way presses are gated is how a
  // direction gets stuck down across a level change: the board then has a
  // permanent slope, and tilting the other way can only cancel it, never
  // reverse it — the upper holes become unreachable.
  if (on && (!field || !field.running || DPAD[dir].disabled)) return;
  if (held[dir] === on) return;
  held[dir] = on;
  DPAD[dir].classList.toggle('held', on);
  if (on) field.tilts++;
}
const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
};
addEventListener('keydown', e => { const d = KEYMAP[e.key]; if (d) { e.preventDefault(); press(d, true); } });
addEventListener('keyup', e => { const d = KEYMAP[e.key]; if (d) { e.preventDefault(); press(d, false); } });
/* A held direction that never gets released would be indistinguishable from a
   permanent slope in that direction, so releases are caught at the window and
   on focus loss, not only on the button that started them. */
let padDir = null;
Object.entries(DPAD).forEach(([dir, btn]) => {
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (padDir) press(padDir, false);
    padDir = dir; press(dir, true);
  });
});
function releasePad() { if (padDir) { press(padDir, false); padDir = null; } }
addEventListener('pointerup', releasePad);
addEventListener('pointercancel', releasePad);
addEventListener('blur', () => { releasePad(); Object.keys(held).forEach(k => press(k, false)); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { releasePad(); Object.keys(held).forEach(k => press(k, false)); }
});

/* =====================================================================
   4. STORY FLOW
   ===================================================================== */
/* Both people stay on screen for the whole encounter, at bust size, breathing.
   The maze is something happening BETWEEN them — never a mini-game that
   replaced them. */
function bustCell() {
  const h = whoPane.clientHeight || 420;
  return clamp(Math.floor((h * 0.52) / PORT.H), 2, 5);
}

function beginEncounter() {
  mode = 'story';
  scoreLabel.textContent = '影響力指數';
  factionCard.style.display = ''; newsCard.style.display = '';
  showField(false);
  clockLabel.textContent = '頓悟窗口';
  clockFill.style.width = '0%';
  clockRight.textContent = '— —';
  footerHint.textContent = '按住方向鍵持續傾斜，放開後場地回正';

  currentNPC = { faction: pick(FACTIONS) };
  currentNPC.name = pick(NPC_NAMES[currentNPC.faction]);
  currentNPC.question = pick(NPC_QUESTIONS[currentNPC.faction]);

  $('heroRow').classList.remove('solo');
  mePane.classList.add('on');
  setPortrait(playerTok, 'player', 'neutral', bustCell());
  meState.textContent = '觀測中';
  fx.mood = 'meet'; fx.link = 0;

  whoPane.classList.remove('on');
  whoName.textContent = currentNPC.name;
  bubbleTag.textContent = META[currentNPC.faction].label;
  bubbleTag.style.color = `var(${META[currentNPC.faction].varc})`;
  bubbleText.textContent = '';
  whoState.textContent = '';
  setPortrait(npcTok, currentNPC.faction, 'neutral', bustCell());
  arenaCap.textContent = '街上。有人叫住了你。';
  setTimeout(showEncounter, 700);
}

function showEncounter() {
  whoPane.classList.add('on');
  bubbleText.textContent = '「' + currentNPC.question + '」';
  whoState.textContent = '等待中';
  setPortrait(npcTok, currentNPC.faction, 'up', bustCell());
  setTimeout(openField, 1800);
}

/* The field is not a menu the player opens — it is what the moment turns into
   once the master starts thinking about the question. */
function openField() {
  meState.textContent = '思考中';
  whoState.textContent = '注視著你';
  setPortrait(playerTok, 'player', 'think', bustCell());
  setPortrait(npcTok, currentNPC.faction, 'think', bustCell());
  fx.mood = 'think';

  const def = STORY_LEVELS[storyIndex % STORY_LEVELS.length];
  loadLevel(def, storyWin, storyFail);
  showField(true);
  setTimeout(() => {
    field.running = true;
    setInputEnabled(true);
    arenaCap.textContent = def.name;
  }, 700);
}

function storyWin() {
  setInputEnabled(false);
  const stats = { secs: field.elapsed, tilts: field.tilts, left: field.timeLeft };
  storyIndex++;
  arenaCap.textContent = '……落定了。';
  fx.mood = 'land';
  setPortrait(npcTok, currentNPC.faction, 'realize', bustCell());
  whoState.textContent = '有什麼接上了';
  setTimeout(() => { showField(false); runInsightTheater(stats); }, 900);
}

function storyFail() {
  setInputEnabled(false);
  const stats = { secs: field.elapsed, tilts: field.tilts, left: 0 };
  storyIndex++;   // no retry: the moment has passed, the master moves on
  arenaCap.classList.add('warn');
  arenaCap.textContent = '窗口關閉了。';
  fx.mood = 'lost';
  setPortrait(npcTok, currentNPC.faction, 'awe', bustCell());
  whoState.textContent = '沒有接上';
  setTimeout(() => { showField(false); runFlatteryTheater(stats); }, 1100);
}

/** the tray fades in and out of the space between the two of them */
function showField(on) {
  arena.style.transition = 'opacity .45s ease';
  arena.style.opacity = on ? 1 : 0;
  arenaCap.style.opacity = on ? 1 : 0.5;
  if (!on) arenaCap.classList.remove('warn');
}

/* ---------- the record ---------- */
const RAW_WIN = s => `對象在原地站立 ${s.secs.toFixed(1)} 秒，期間重心左右微調 ${s.tilts} 次，最後視線向右偏移約 0.9 秒。未發一語。`;
const RAW_FAIL = s => `對象在原地站立 ${s.secs.toFixed(1)} 秒，期間重心左右微調 ${s.tilts} 次，隨後恢復步行。未發一語。`;

const FLATTERY = {
  professor: ['教授鼓了鼓掌。', '「嗯……很有意思。」', '（其實完全沒看懂，但不能承認）', '（回家後決定再讀一次自己的論文）'],
  religion: ['信徒虔誠地點頭。', '「大師的沉默，也是一種啟示。」', '（回去照樣唱原本的聖歌）'],
  merchant: ['商人熱情地握手。', '「厲害厲害，果然是大師！」', '（默默把手機收起來，繼續看原本的線圖）'],
  ai: ['AI 的燈光平穩地閃了兩下。', '「輸入已接收。信心分數：0.11。」', '「正在歸檔至：待理解資料夾。」'],
  netizen: ['網友拍了一張，猶豫了一下。', '「雖然不太懂，但感覺很強欸。」', '（貼文按讚數：4）']
};
const FLATTER_TICKER = {
  professor: '學界低調表示：大師本次的展示「仍待進一步解讀」',
  religion: '教會公告：大師的沉默屬於「更高層次的訊息」，暫不解釋',
  merchant: '市場無明顯波動，分析師稱「大師今日並未發出訊號」',
  ai: '某 AI 將本次觀測標記為「資料不足」，工程師表示正常',
  netizen: '#大師今天有點安靜　登上熱搜第 47 名'
};

let recordSeq = 0;
function recordHtml(school, who, raw, lines, gain) {
  recordSeq++;
  const id = `TR-${chapter}-${String(recordSeq).padStart(4, '0')}`;
  const mins = 8 * 60 + recordSeq * 37 + day * 11;
  const clock = `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  return `<div class="rec">
    <div class="rec-top"><span>${id}</span><span class="rt">觀測第 ${day} 日 · ${clock}</span></div>
    <div class="rec-by">提交單位　${school} · ${who}</div>
    <div class="rec-sec">原始觀測</div>
    <div class="rec-raw">${raw}</div>
    <div class="rec-sec">該單位之推定</div>
    <div class="rec-body">${lines.join('<br>')}</div>
    <div class="rec-foot"><span>核定影響力增額</span><b>+${gain}</b></div>
  </div>`;
}

function portraitCell() {
  const byH = Math.floor((window.innerHeight * 0.34) / PORT.H);
  const byW = Math.floor(Math.min(400, window.innerWidth * 0.78) / PORT.W);
  return Math.max(2, Math.min(4, byH, byW));
}
function openTheaterShell() {
  theaterQuote.classList.add('hidden-el'); theaterQuote.innerHTML = '';
  theaterGain.classList.add('hidden-el');
  continueBtn.classList.add('hidden-el');
  viralTag.style.display = 'none';
  theater.style.animation = 'none'; void theater.offsetWidth;
  theater.style.animation = 'zoomin .3s ease-out forwards';
  theater.classList.remove('shake');
  overlay.classList.add('active');
}

/* The ported four-beat performance. The master's beat is always the same one
   now — 'right', the look of someone who has already seen it. */
function runInsightTheater(stats) {
  const fac = currentNPC.faction;
  const npcLabel = META[fac].label + ' · ' + currentNPC.name;
  openTheaterShell();

  setPortrait(mainSprite, 'player', 'neutral', portraitCell());
  mainSprite.classList.remove('hidden-el');
  iconSprite.classList.add('hidden-el');
  theaterName.textContent = '大師';
  theaterCaption.textContent = '你只是很自然地……';

  setTimeout(() => {
    setPortrait(mainSprite, 'player', 'right', portraitCell());
    theaterCaption.textContent = '展望未來。眼神亮了起來，那是已經看見的人才有的神情。';
  }, 620);

  setTimeout(() => {
    setPortrait(mainSprite, fac, 'think', portraitCell());
    drawIcon(iconSprite, 'think', ICON_CELL);
    iconSprite.classList.remove('hidden-el');
    theaterName.textContent = npcLabel;
    theaterCaption.textContent = '（' + currentNPC.name + ' 陷入沉思……）';
  }, 1900);

  setTimeout(() => {
    setPortrait(mainSprite, fac, 'realize', portraitCell());
    drawIcon(iconSprite, 'burst', ICON_CELL);
    theaterCaption.textContent = '恍然大悟！！';
    theater.classList.remove('shake'); void theater.offsetWidth; theater.classList.add('shake');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  }, 3100);

  setTimeout(() => {
    const gain = 20 + Math.round(stats.left) + Math.max(0, 12 - stats.tilts);
    influence += gain;
    trust[fac] = clamp(trust[fac] + 12, 0, 100);
    theaterCaption.textContent = '';
    theaterQuote.innerHTML = recordHtml(META[fac].label, currentNPC.name,
      RAW_WIN(stats), INTERP[fac].right, gain);
    theaterQuote.classList.remove('hidden-el');
    continueBtn.classList.remove('hidden-el');
    pushTicker(TICKER[fac].right);
    pushNews(TICKER[fac].right);
    renderFactionPanel();
    updateHUD();
  }, 3800);
}

/* Losing is not punished — it is simply not understood. */
function runFlatteryTheater(stats) {
  const fac = currentNPC.faction;
  openTheaterShell();
  setPortrait(mainSprite, 'player', 'neutral', portraitCell());
  mainSprite.classList.remove('hidden-el');
  iconSprite.classList.add('hidden-el');
  theaterName.textContent = '大師';
  theaterCaption.textContent = '你想了很久。然後就走了。';

  setTimeout(() => {
    setPortrait(mainSprite, fac, 'awe', portraitCell());
    theaterName.textContent = META[fac].label + ' · ' + currentNPC.name;
    theaterCaption.textContent = '（他決定先鼓掌再說。）';
  }, 1500);

  setTimeout(() => {
    trust[fac] = clamp(trust[fac] + 2, 0, 100);
    theaterCaption.textContent = '';
    theaterQuote.innerHTML = recordHtml(META[fac].label, currentNPC.name,
      RAW_FAIL(stats), FLATTERY[fac], 0);
    theaterQuote.classList.remove('hidden-el');
    continueBtn.classList.remove('hidden-el');
    pushTicker(FLATTER_TICKER[fac]);
    pushNews(FLATTER_TICKER[fac]);
    renderFactionPanel();
    updateHUD();
  }, 2600);
}

function afterEncounter() {
  whoPane.classList.remove('on');
  fx.mood = 'meet';
  setTimeout(() => { day++; beginEncounter(); }, 700);
}

continueBtn.addEventListener('click', () => {
  overlay.classList.remove('active');
  if (pendingAction) { const fn = pendingAction; pendingAction = null; fn(); return; }
  afterEncounter();
});

/* =====================================================================
   5. ENDLESS MODE
   ---------------------------------------------------------------------
   Same field, no story: an arcade cabinet the master apparently keeps in the
   back of the association. Failing here produces a printout, not a setback.
   ===================================================================== */
const BEST_KEY = 'tilt.best';
function loadBest() { try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; } }
function saveBest(b) { try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (e) { } }

function startEndless() {
  mode = 'endless';
  endless = { level: 0, score: 0, streak: 0, bestStreak: 0, totalTime: 0, cleared: 0 };
  scoreLabel.textContent = '分數';
  factionCard.style.display = 'none'; newsCard.style.display = 'none';
  whoPane.classList.remove('on'); mePane.classList.remove('on');
  $('heroRow').classList.add('solo');
  showField(true);
  clockLabel.textContent = '無限模式';
  footerHint.textContent = '通關即進下一關，時間到就結束';
  updateHUD();
  nextEndlessLevel();
}

function nextEndlessLevel() {
  endless.level++;
  clockLabel.textContent = '無限模式 · 第 ' + endless.level + ' 關';
  loadLevel(genLevel(endless.level), endlessWin, endlessFail);
  // the one level where a new rule shows up gets one line of explanation, in
  // the caption the field already has — no popup, no tutorial screen
  if (endless.level === 6) arenaCap.textContent = '兩顆球了。白球只進白洞，綠球只進綠洞。';
  setTimeout(() => { field.running = true; setInputEnabled(true); }, 450);
}

function endlessWin() {
  setInputEnabled(false);
  const left = field.timeLeft;
  endless.totalTime += field.elapsed;
  endless.cleared++;
  endless.streak++;
  endless.bestStreak = Math.max(endless.bestStreak, endless.streak);
  endless.score += 100 + Math.round(left * 10) + endless.streak * 25;
  updateHUD();
  arenaCap.textContent = `+${100 + Math.round(left * 10) + endless.streak * 25}　連勝 ${endless.streak}`;
  flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  setTimeout(nextEndlessLevel, 900);
}

function endlessFail() {
  setInputEnabled(false);
  endless.totalTime += field.elapsed;
  arenaCap.classList.add('warn');
  arenaCap.textContent = '時間到。';
  setTimeout(showReport, 700);
}

function showReport() {
  const best = loadBest();
  const isRecord = (endless.score > (best.score || 0));
  if (isRecord) { best.score = endless.score; best.level = endless.level; best.streak = endless.bestStreak; saveBest(best); }
  drawReportCard(reportCard, endless, best, isRecord);
  reportNote.textContent = isRecord ? '★ 新紀錄已寫入本機終端。' : '';
  reportOverlay.classList.add('active');
}

/* The report is drawn, not laid out in DOM, so "存成圖片" is one call and the
   thing the player shares looks like the machine printed it. */
function drawReportCard(cv, run, best, isRecord) {
  const W = 420, H = 300, s = 2;
  cv.width = W * s; cv.height = H * s;
  const ctx = cv.getContext('2d');
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = '#060a08'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1e3b2c'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, W - 12, H - 12);

  ctx.fillStyle = '#7ef0a8';
  ctx.font = 'bold 15px ui-monospace, Consolas, monospace';
  ctx.fillText('TILT MAZE — 傾斜實驗艙 戰績', 22, 34);
  ctx.fillStyle = '#5f9c78'; ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillText('全球超譯協會 · 訓練機台紀錄', 22, 50);

  ctx.fillStyle = '#1e3b2c'; ctx.fillRect(22, 60, W - 44, 1);

  ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 44px ui-monospace, Consolas, monospace';
  ctx.fillText(String(run.score).padStart(6, '0'), 22, 104);
  ctx.fillStyle = '#5f9c78'; ctx.font = '11px ui-monospace, Consolas, monospace';
  ctx.fillText('SCORE', 22, 120);

  const rows = [
    ['抵達關卡', '第 ' + run.level + ' 關'],
    ['通關數', run.cleared + ' 關'],
    ['最長連勝', run.bestStreak + ' 連'],
    ['總遊玩時間', run.totalTime.toFixed(1) + ' 秒'],
    ['平均每關', (run.cleared ? run.totalTime / run.cleared : 0).toFixed(1) + ' 秒'],
    ['本機最高分', String(best.score || run.score)]
  ];
  ctx.font = '13px ui-monospace, Consolas, monospace';
  rows.forEach(([k, v], i) => {
    const y = 148 + i * 22;
    ctx.fillStyle = '#5f9c78'; ctx.fillText(k, 26, y);
    ctx.fillStyle = '#d8ffe8'; ctx.textAlign = 'right'; ctx.fillText(v, W - 26, y); ctx.textAlign = 'left';
    ctx.fillStyle = '#0f1e16'; ctx.fillRect(26, y + 5, W - 52, 1);
  });

  if (isRecord) {
    ctx.fillStyle = '#ff2e88'; ctx.font = 'bold 13px ui-monospace, Consolas, monospace';
    ctx.fillText('★ NEW RECORD', W - 150, 104);
  }
  ctx.fillStyle = '#5f9c78'; ctx.font = '10px ui-monospace, Consolas, monospace';
  ctx.fillText('#天才模擬器 #思想重力場', 22, H - 20);

  // scanlines, so the printout belongs to the same device as everything else
  ctx.fillStyle = 'rgba(126,240,168,0.045)';
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
}

$('againBtn').addEventListener('click', () => { reportOverlay.classList.remove('active'); startEndless(); });
$('quitBtn').addEventListener('click', () => { reportOverlay.classList.remove('active'); beginEncounter(); });
$('shotBtn').addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `思想重力場_${endless.score}分.png`;
  a.href = reportCard.toDataURL('image/png');
  a.click();
  reportNote.textContent = '已輸出 PNG。';
});
$('copyBtn').addEventListener('click', async () => {
  const t = `【思想重力場】分數 ${endless.score}｜抵達第 ${endless.level} 關｜最長連勝 ${endless.bestStreak}｜總時間 ${endless.totalTime.toFixed(1)} 秒 #天才模擬器`;
  try { await navigator.clipboard.writeText(t); reportNote.textContent = '戰績已複製，可直接貼上分享。'; }
  catch (e) { reportNote.textContent = t; }
});

/* =====================================================================
   BOOT
   ===================================================================== */
$('storyBtn').addEventListener('click', () => {
  startScreen.classList.add('gone'); sizeFx(); beginEncounter();
});
$('endlessBtn').addEventListener('click', () => {
  startScreen.classList.add('gone'); sizeFx(); startEndless();
});

/* prototype-only handle: lets a headless/hidden page be stepped by hand, and
   lets you poke at the tuning constants from the console without a rebuild */
window.__tilt = {
  get field() { return field; }, held, stepPhysics, drawField, updateClock,
  loadLevel, genLevel, STORY_LEVELS, startEndless, beginEncounter, fx, cam, CAM
};

renderFactionPanel();
updateHUD();
sizeFx();
pushNews('協會宣布啟用「思想重力場」觀測程序，細節不予說明。');

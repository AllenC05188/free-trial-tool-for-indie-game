/* =====================================================================
   BASE SCENE — 基地
   ---------------------------------------------------------------------
   Grown from .scratch/interactive-base/base-scene.html. The scene is the base
   panel now: there is no separate menu of buildings anywhere else in the game.

   It owns the ground, the buildings and the people walking around on it. It
   does NOT own the economy — 物資／零件／神髓 live in the host game's `base`
   and are reached through HOST, so there is only ever one set of numbers.

   Wiring, from index.html:
     BaseScene.attach({ res, setLevels, enterLab, exit })
     BaseScene.open() / .close()
   ===================================================================== */
window.BaseScene = (function () {

/* Replaced by attach(). The defaults keep the scene runnable on its own. */
let HOST = {
  res: () => ({ supply: 0, part: 0, essence: 0 }),
  setLevels: () => { },
  enterLab: () => { },
  exit: () => { }
};


"use strict";

/* ══════════════════════════════════════════════════════════════════
   0 · 常數與工具
   ══════════════════════════════════════════════════════════════════ */
/* 版本戳記：file:// 的快取很黏，看不到這串更新就是拿到舊檔，按 Ctrl+F5 強制重載 */
const BUILD = 'N3-back-0804d';
const VW = 480, VH = 270;          // 虛擬解析度（1920×1080 = 整數 4 倍）
const TS = 16;                     // 圖塊邊長
const MOD = 20;                    // 一塊地基模組 = 20×20 圖塊
/* 建築佔地不再統一：寬度由美術自己決定（ceil(圖寬/圖塊)），深度固定 3 格。
   深度固定是因為佔地是「地基」不是「整棟」——高的建築要往上超出去，
   不該把頭頂那幾格也變成不能走。 */
const FOOT_DEPTH = 3;
const DEFAULT_FOOT = { w: 4, h: FOOT_DEPTH };
const FOOT = { farm: { w: 2, h: 2 } };     // 農地不跟建築同規格
function foot(k) { return FOOT[k] || DEFAULT_FOOT; }
const REACH = 5.0;                 // 放置距離（圖塊）；建築變大，手要伸得遠一點

const world = document.getElementById('bsWorld');
const overlay = document.getElementById('bsOverlay');
const wrap = document.getElementById('bsWrap');
const W = world.getContext('2d');
const O = overlay.getContext('2d');
W.imageSmoothingEnabled = false;

let scale = 3, dispW = VW * 3, dispH = VH * 3, dpr = 1;
/* 外殼的縮放：終端讀數要跟著視窗長大，否則 4 倍解析度下字會小得像註腳 */
let UU = 1, OW = VW * 3, OH = VH * 3;

function layout() {
  dpr = Math.min(2, devicePixelRatio || 1);
  /* 視窗大於 480×270 就用整數倍（像素才對齊）；小於就退成分數倍，
     總之絕不讓畫面大於視窗——否則使用者只會看到左上角一小塊。 */
  const raw = Math.min(innerWidth / VW, innerHeight / VH);
  scale = raw >= 1 ? Math.floor(raw) : Math.max(0.2, raw);
  dispW = VW * scale; dispH = VH * scale;
  wrap.style.width = dispW + 'px'; wrap.style.height = dispH + 'px';
  wrap.style.left = ((innerWidth - dispW) / 2 | 0) + 'px';
  wrap.style.top = ((innerHeight - dispH) / 2 | 0) + 'px';
  world.width = VW; world.height = VH;
  world.style.width = dispW + 'px'; world.style.height = dispH + 'px';
  overlay.width = dispW * dpr; overlay.height = dispH * dpr;
  overlay.style.width = dispW + 'px'; overlay.style.height = dispH + 'px';
  /* 外殼字級跟著解析度長大。1920×1080 全螢幕 = 4 倍縮放 → UU 1.54，
     終端讀數才不會小得像註腳。 */
  UU = clamp(scale / 1.3, 0.8, 1.9);
  OW = dispW / UU; OH = dispH / UU;
  W.imageSmoothingEnabled = false;
}
/* 480×270 是 16:9，全螢幕 1920×1080 剛好整數 4 倍、零黑邊。
   非全螢幕時瀏覽器工具列會吃掉高度，只能退到 3 倍並留邊——所以全螢幕是預設路徑。 */
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen && document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => { });
}
addEventListener('resize', layout);
addEventListener('fullscreenchange', () => setTimeout(layout, 60));
layout();

/* 確定性雜訊——同一格永遠長一樣，重開遊戲不會變 */
function rnd2(x, y, s) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 362437);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
/* 函式宣告而非 const：layout() 在它上面就被呼叫了 */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
/* 取動畫幀。負數與非有限值都要吃得下——陣列越界回傳 undefined，
   而 drawImage(undefined) 會直接殺掉整幀。 */
function anim(arr, t) {
  const n = arr.length;
  const i = Number.isFinite(t) ? Math.floor(t) : 0;
  return arr[((i % n) + n) % n];
}
function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2);
  return `rgb(${lerp(a[0], b[0], t) | 0},${lerp(a[1], b[1], t) | 0},${lerp(a[2], b[2], t) | 0})`;
}
function hex(h) {
  if (h[0] !== '#') { const m = h.match(/\d+/g); return [+m[0], +m[1], +m[2]]; }
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/* 烘焙：所有 sprite 在載入時畫進離屏畫布，執行時只 drawImage */
function bake(w, h, fn) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn(g, w, h);
  return cv;
}
const px = (g, x, y, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, 1, 1); };
const rc = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); };

/* 從字串網格烘出 sprite（沿用專案既有的作法） */
function fromGrid(rows, pal) {
  return bake(rows[0].length, rows.length, g => {
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) {
        const c = pal[r[x]];
        if (c) px(g, x, y, c);
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════════════
   1 · 色盤
   場景是「資料」：暖、飽和、有色階。外殼的磷光綠不進來。
   ══════════════════════════════════════════════════════════════════ */
/* 色彩紀律 —— 視覺階級靠這張表建立，不靠細節量：
     地形   明度 40–105、低彩度、跨度窄  → 永遠退到背景
     中景物 明度 30–130、中彩度          → 銜接層
     建築   明度 20–225、高彩度、含真高光 → 唯一能吸睛的東西
   草地拿不到接近白的值，所以它搶不走建築的焦點。 */
/* 地形色階之間刻意只差 5 左右的明度——低於人眼在小尺寸下的辨識門檻，
   所以整片讀起來是「一個面」而不是「一堆像素」。建築的階差則有 30 以上。 */
const P = {
  grass: ['#2f4a2c', '#344e30', '#385434', '#3d5939'],
  grassTip: '#436038',
  dry:   ['#454231', '#4f4b38'],
  dirt:  ['#3b2f24', '#41352a', '#473b30', '#4e4136'],
  path:  ['#3c3945', '#423f4c', '#484551', '#4f4b58'],
  water: ['#1a3049', '#20395a', '#27456c', '#31567f'],
  void:  '#07060e',
  out:   '#100a1a'
};

/* 建築色帶一律五階：[0]深陰影 [1]暗 [2]中間 [3]亮 [4]高光。
   高光刻意逼近白——這是地形拿不到的，階級由此拉開。
   mat 決定牆體用哪一套像素語言（木紋／石塊／金屬），不再全部同一種雜訊。 */
const WOOD_WARM  = ['#2e2318', '#463525', '#5f4a33', '#7d6444', '#a08663'];
const WOOD_GREY  = ['#2a241c', '#3f382c', '#57503f', '#726955', '#948a72'];
const WOOD_RED   = ['#2e1e10', '#452e18', '#5f4122', '#7d5730', '#a37845'];
const STONE_VIO  = ['#241f2e', '#372f45', '#4b425c', '#615873', '#857b95'];
const STONE_DARK = ['#231b1b', '#372b2b', '#4b3c3c', '#614f4f', '#857070'];
const METAL_COOL = ['#232b33', '#374149', '#4d5962', '#68757f', '#9dabb5'];
const METAL_WARM = ['#2b2519', '#403927', '#584f38', '#726852', '#9c9278'];
const METAL_VIO  = ['#232433', '#363849', '#4b4d61', '#65687d', '#9295aa'];

const BLD = {
  farm:       { n: '農地',   sect: '生產', cost: { s: 8, p: 4 },   mat: 'soil',
                roof: ['#382c21','#453729','#524332','#5f4f3c','#7a6852'], wall: P.dirt.concat('#7a6852'),
                trim: '#8fd96f', glow: '#c8f5a0', eff: '種下作物，數日後收成。' },
  teahouse:   { n: '茶水間', sect: '生產', cost: { s: 0, p: 16 },  mat: 'wood',
                roof: ['#0e332f','#17544c','#227a70','#39a396','#7ee0d0'], wall: WOOD_WARM,
                trim: '#6fd6c8', glow: '#b6f5e8', eff: '每日產出物資　│　【喝一口茶】護盾 +2 / 級' },
  workshop:   { n: '工坊',   sect: '生產', cost: { s: 18, p: 0 },  mat: 'wood',
                roof: ['#3b1608','#5c2510','#823a17','#a85423','#e08a45'], wall: WOOD_GREY,
                trim: '#ffa552', glow: '#ffd2a0', eff: '每日產出零件　│　【敲擊桌面】傷害 +2 / 級' },
  meditation: { n: '冥想廳', sect: '生產', cost: { s: 22, p: 12 }, mat: 'stone',
                roof: ['#231044','#37196b','#4f2896','#6b3fc0','#a37cf0'], wall: STONE_VIO,
                trim: '#c79bff', glow: '#ddc0ff', eff: '戰鬥最大 HP +8 / 級' },
  lab:        { n: '研究所', sect: '科技', cost: { s: 0, p: 0 },   mat: 'metal',
                roof: ['#0d2740','#144066','#1d5e91','#2a80bd','#5cb4e8'], wall: METAL_COOL,
                trim: '#7fc4ff', glow: '#bde2ff', eff: '安置人才　│　每人提供 1 次 🔍 試探' },
  tower:      { n: '能源塔', sect: '科技', cost: { s: 70, p: 62 }, mat: 'metal',
                roof: ['#3b2c06','#5c470c','#826516','#ab8722','#e5c04a'], wall: METAL_WARM,
                trim: '#ffd23f', glow: '#ffeaa0', eff: '每回合起始能量 +1 / 級' },
  retrans:    { n: '重譯爐', sect: '科技', cost: { s: 26, p: 30 }, mat: 'stone',
                roof: ['#3b0d18','#5c1728','#82233b','#ab3352','#e06a88'], wall: STONE_DARK,
                trim: '#ff8fa3', glow: '#ffc6d2', eff: '把譯本再翻譯一次。愈譯愈遠，愈譯愈華麗。' }
};
/* 奇觀：CONTEXT.md 定義為成就解鎖的裝飾性建築，MVP 不給數值。
   這裡先放進型錄，純粹是為了讓圖集裡的三張奇觀美術看得到。 */
BLD.colossus = { n: '真理巨像', sect: '奇觀', cost: { s: 30, p: 24 }, mat: 'stone',
  roof: STONE_VIO, wall: STONE_VIO, trim: '#e8d7ac', glow: '#fff4e2',
  eff: '純觀賞。協會認定之紀念性構造物。' };
BLD.starmap  = { n: '全息星圖', sect: '奇觀', cost: { s: 44, p: 36 }, mat: 'metal',
  roof: METAL_COOL, wall: METAL_COOL, trim: '#a8d9ff', glow: '#dff0ff',
  eff: '純觀賞。協會認定之紀念性構造物。' };
BLD.hall     = { n: '誤解紀念堂', sect: '奇觀', cost: { s: 70, p: 60 }, mat: 'stone',
  roof: STONE_DARK, wall: STONE_DARK, trim: '#c9b48a', glow: '#e8d7ac',
  eff: '純觀賞。協會認定之紀念性構造物。' };

const RACK = ['farm', 'teahouse', 'workshop', 'meditation', 'lab', 'tower', 'retrans',
              'colossus', 'starmap', 'hall'];

/* 型錄說明：協會的口吻。說明「它是什麼」，eff 說明「數值上會發生什麼」。 */
const BLD_DESC = {
  farm:       '翻好的一塊地。種下去，過幾天回來收。協會不保證收成內容與種下的東西相符。',
  teahouse:   '一間永遠有熱水的房間。專家們在這裡把你的沉默解讀成議程，並沖第二壺。',
  workshop:   '敲打聲從早到晚。沒有人知道他們在造什麼，包括他們自己。',
  meditation: '一間空房間。協會堅持它具有結構性用途，並已據此編列預算。',
  lab:        '招募來的人才住在這裡。他們會盯著你看，然後寫下一些東西。',
  tower:      '極為昂貴的奇蹟工程。它嗡嗡作響，而且確實有用。',
  retrans:    '把已經翻譯過的東西再翻譯一次。每譯一次就離原文更遠，也更華麗。',
  colossus:   '一座三十公尺高的你，眼睛望著沒有人看得懂的方向。',
  starmap:    '把你被瘋傳的每一個眼神，做成了一片會轉動的星空。',
  hall:       '裡面收藏著人類對你的所有誤讀。每一份都被裱起來了。'
};

const FIX = {
  labcar:  { n: '實驗室載具', mat: 'metal', roof: ['#1a1830','#2a2748','#3d3866','#544e8a','#8079c4'], wall: METAL_VIO,  trim: '#6ff0e8', glow: '#b6fff8' },
  truck:   { n: '協會工程車', mat: 'metal', roof: ['#3b2c06','#5c470c','#826516','#ab8722','#e5c04a'], wall: METAL_WARM, trim: '#ffd23f', glow: '#ffeaa0' },
  storage: { n: '倉庫',       mat: 'wood',  roof: ['#2e1e10','#452e18','#5f4122','#7d5730','#a88250'], wall: WOOD_RED,   trim: '#c9b48a', glow: '#e8d7ac' }
};

/* ══════════════════════════════════════════════════════════════════
   2 · 地形烘焙
   ══════════════════════════════════════════════════════════════════ */
/* ══ 材質語言 ══
   每種材質有專屬的像素語彙，刻意不共用同一種抖動圖樣——
   「所有東西看起來都一樣」正是雜訊型像素美術的死因。 */

// 木：縱向纖維（雜訊在 y 上拉成條）＋ 板縫 ＋ 節疤。紋理清楚可見。
function matWood(g, x0, y0, w, h, pal, seed) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const seam = x % 7;
    let c = pal[2];
    if (seam === 0) c = pal[0];
    else if (seam === 1) c = pal[3];
    else if (rnd2(x, (y / 5) | 0, seed) > 0.74) c = pal[1];
    else if (rnd2(x, (y / 3) | 0, seed + 9) > 0.90) c = pal[3];
    px(g, x0 + x, y0 + y, c);
  }
  const knots = Math.max(1, (w * h / 300) | 0);
  for (let k = 0; k < knots; k++) {
    const kx = x0 + 2 + ((rnd2(k, seed, 5) * (w - 4)) | 0);
    const ky = y0 + 2 + ((rnd2(k, seed, 11) * (h - 4)) | 0);
    px(g, kx, ky, pal[0]); px(g, kx + 1, ky, pal[1]); px(g, kx, ky + 1, pal[1]);
  }
}

// 石：不規則塊面，上緣受光、下緣落影，邊界俐落——完全不抖動。
function matStone(g, x0, y0, w, h, pal, seed) {
  rc(g, x0, y0, w, h, pal[1]);
  let y = 0, row = 0;
  while (y < h) {
    const bh = 4 + ((rnd2(row, seed, 3) * 2) | 0);
    let x = -((rnd2(row, seed, 7) * 5) | 0);
    while (x < w) {
      const bw = 5 + ((rnd2(x + 40, row + seed, 13) * 4) | 0);
      const t = rnd2(x + 40, row, seed + 21);
      const cx = Math.max(0, x), cw = Math.min(w, x + bw) - cx, ch = Math.min(h, y + bh) - y;
      if (cw > 0 && ch > 0) {
        rc(g, x0 + cx, y0 + y, cw, ch, t > 0.76 ? pal[3] : t > 0.32 ? pal[2] : pal[1]);
        rc(g, x0 + cx, y0 + y, cw, 1, pal[4]);
        rc(g, x0 + cx, y0 + y + ch - 1, cw, 1, pal[0]);
      }
      x += bw + 1;
    }
    y += bh + 1; row++;
  }
}

// 金屬：大面積平塗 ＋ 一道乾淨的鏡面高光 ＋ 面板接縫。幾乎沒有雜訊。
function matMetal(g, x0, y0, w, h, pal, seed) {
  rc(g, x0, y0, w, h, pal[2]);
  for (let x = 0; x < w; x += 9) {
    rc(g, x0 + x, y0, 1, h, pal[1]);
    rc(g, x0 + x + 1, y0, 1, h, pal[3]);
  }
  rc(g, x0, y0 + h - 2, w, 2, pal[1]);
  rc(g, x0, y0 + h - 1, w, 1, pal[0]);
  const sx = 3 + ((rnd2(seed, 1, 3) * 3) | 0);       // 高光最後畫，不被接縫蓋掉
  rc(g, x0 + sx, y0, 1, h - 2, pal[4]);
  rc(g, x0 + sx + 1, y0, 1, h - 2, pal[3]);
  for (let i = 0; i < 3; i++) {                       // 鉚釘
    const rx = x0 + 2 + ((rnd2(i, seed, 17) * (w - 4)) | 0);
    px(g, rx, y0 + 3 + i * (((h - 6) / 3) | 0), pal[4]);
    px(g, rx, y0 + 4 + i * (((h - 6) / 3) | 0), pal[0]);
  }
}

function wallMat(g, x0, y0, w, h, d, seed) {
  if (d.mat === 'stone') matStone(g, x0, y0, w, h, d.wall, seed);
  else if (d.mat === 'metal') matMetal(g, x0, y0, w, h, d.wall, seed);
  else matWood(g, x0, y0, w, h, d.wall, seed);
}

const TILE = { grass: [], dirt: [], path: [], water: [], tilled: [], waste: [], edge: null };
/* 中景層：鋪在地形之上的平面裝飾，負責把「空草地」與「建築」之間的空白補起來 */
const DECO = { gravel: [], crack: [], dry: [], pebble: [], patch: [] };
/* 荒原要讀得出是「地面」，不是「沒東西」——所以它有明確的灰燼色階，不是純黑 */
const WASTE = ['#272231', '#2c2737', '#312c3e', '#363044'];

/* 環繞邊界的寫入，讓圖塊四邊接得起來，不會出現格線 */
function wpx(g, x, y, c) { px(g, (((x | 0) % TS) + TS) % TS, (((y | 0) % TS) + TS) % TS, c); }

function bakeTerrain() {
  /* 草：柔和的低對比「簇塊」，不是整片逐像素噪點。
     高頻雜訊會跟建築的細節正面打架——地形必須安靜下來，
     它的工作是襯托，不是表演。 */
  for (let v = 0; v < 4; v++) {
    TILE.grass.push(bake(TS, TS, g => {
      rc(g, 0, 0, TS, TS, P.grass[1]);
      for (let i = 0; i < 3; i++) {                        // 簇塊少而大，邊緣才不會碎成雜訊
        const cx = rnd2(i, v, 3) * TS, cy = rnd2(i, v, 7) * TS;
        const r = 3.0 + rnd2(i, v, 11) * 2.2;
        const c = i % 2 ? P.grass[2] : P.grass[0];
        for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
          const dd = Math.hypot(x, y);
          if (dd > r) continue;
          if (dd > r - 1.0 && rnd2(cx + x, cy + y, 13 + v) < 0.4) continue;   // 邊緣打散，不要圓形
          wpx(g, cx + x, cy + y, c);
        }
      }
      // 草尖：整片草地上唯一稍亮的東西，四種變體裡只有一種有
      if (v === 0) for (let i = 0; i < 2; i++) {
        const bx = rnd2(i, v, 23) * TS, by = rnd2(i, v, 29) * TS;
        wpx(g, bx, by, P.grassTip); wpx(g, bx, by - 1, P.grass[3]);
      }
    }));
  }
  for (let v = 0; v < 3; v++) {
    // 土：稀疏的粗顆粒，對比壓低——它仍然是地形
    TILE.dirt.push(bake(TS, TS, g => {
      rc(g, 0, 0, TS, TS, P.dirt[1]);
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        const n = rnd2(x + v * 13, y + v * 53, 21);
        if (n > 0.90) px(g, x, y, P.dirt[3]);
        else if (n > 0.70) px(g, x, y, P.dirt[2]);
        else if (n < 0.12) px(g, x, y, P.dirt[0]);
      }
    }));
    // 翻好的田：乾淨的橫向壟溝，方向感優先於質感
    TILE.tilled.push(bake(TS, TS, g => {
      for (let y = 0; y < TS; y++) {
        const r = y % 4;
        rc(g, 0, y, TS, 1, r === 0 ? P.dirt[3] : r === 3 ? P.dirt[0] : P.dirt[1]);
      }
      for (let i = 0; i < 6; i++) px(g, (rnd2(i, v, 31) * TS) | 0, (rnd2(i, v, 37) * TS) | 0, P.dirt[2]);
    }));
  }
  // 石徑：石頭的語言＝俐落塊面、硬邊、不抖動。是導航線，所以要讀得清楚。
  for (let v = 0; v < 3; v++) {
    TILE.path.push(bake(TS, TS, g => {
      rc(g, 0, 0, TS, TS, P.path[0]);
      let y = 0, row = 0;
      while (y < TS) {
        const bh = 4 + ((rnd2(row, v, 3) * 2) | 0);
        let x = -((rnd2(row, v, 7) * 4) | 0);
        while (x < TS) {
          const bw = 4 + ((rnd2(x + 9, row + v, 5) * 3) | 0);
          const cx = Math.max(0, x), cw = Math.min(TS, x + bw) - cx, ch = Math.min(TS, y + bh) - y;
          if (cw > 0 && ch > 0) {
            rc(g, cx, y, cw, ch, rnd2(x + 9, row, v + 2) > 0.6 ? P.path[2] : P.path[1]);
            rc(g, cx, y, cw, 1, P.path[3]);
            rc(g, cx, y + ch - 1, cw, 1, P.path[0]);
          }
          x += bw + 1;
        }
        y += bh + 1; row++;
      }
    }));
  }
  /* 水：四幀。用雜訊擾動波形，否則會變成規則斜條紋——看起來像條碼，不像水。
     亮階刻意稀少：大面積深色 + 少量閃光才讀得出是水面。 */
  for (let f = 0; f < 4; f++) {
    TILE.water.push(bake(TS, TS, g => {
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        const jitter = (rnd2(x, y, 91) - .5) * 1.1;
        const w = Math.sin((x * .55 + y * .22) + f * 1.57 + jitter)
                + Math.sin((y * .41 - x * .17) * 1.3 - f * 1.1) * .6;
        px(g, x, y, w > 1.35 ? P.water[3] : w > .55 ? P.water[2] : w > -.7 ? P.water[1] : P.water[0]);
      }
    }));
  }
  /* 荒原：基地之外的世界。灰燼地、龜裂紋、碎石。
     基地不能漂在純黑裡——那是網頁小遊戲的長相；它要坐落在一片地景上，
     而「拓展地塊」也才有了意義：你是在把荒原開墾回來。 */
  for (let v = 0; v < 4; v++) {
    TILE.waste.push(bake(TS, TS, g => {
      // 荒原也是地形，同樣要安靜：簇塊而非逐像素雜訊
      rc(g, 0, 0, TS, TS, WASTE[1]);
      for (let i = 0; i < 3; i++) {
        const cx = rnd2(i, v, 61) * TS, cy = rnd2(i, v, 29) * TS;
        const r = 2.6 + rnd2(i, v, 31) * 2.4;
        const c = i % 2 ? WASTE[2] : WASTE[0];
        for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
          const dd = Math.hypot(x, y);
          if (dd > r) continue;
          if (dd > r - 1.0 && rnd2(cx + x, cy + y, 33 + v) < 0.4) continue;
          wpx(g, cx + x, cy + y, c);
        }
      }
      if (v < 2) {                                           // 龜裂：只有一半的變體有
        let cxp = (rnd2(v, 3, 5) * TS) | 0, cyp = 0;
        while (cyp < TS) {
          px(g, cxp, cyp, '#1e1a29');
          cxp += (rnd2(cxp, cyp, v + 2) > .5 ? 1 : -1); cyp++;
        }
      }
      if (v === 3) {                                         // 碎石：俐落小塊面，數量極少
        const rx = (rnd2(0, v, 17) * (TS - 4)) | 0, ry = (rnd2(0, v, 23) * (TS - 4)) | 0;
        rc(g, rx, ry, 3, 2, WASTE[2]); rc(g, rx, ry, 3, 1, WASTE[3]);
      }
    }));
  }
  // 地塊邊緣：土層斷面 + 落影，讓基地看起來是一塊浮起的高地
  TILE.edge = bake(TS, 10, g => {
    for (let y = 0; y < 10; y++) for (let x = 0; x < TS; x++) {
      const n = rnd2(x, y, 41);
      let c = y < 2 ? P.dirt[2] : y < 5 ? P.dirt[1] : P.dirt[0];
      if (n > 0.85 && y > 1) c = P.dirt[2];
      px(g, x, y, c);
    }
    for (let x = 0; x < TS; x++) px(g, x, 0, P.dirt[3]);
  });
}

/* ══ 中景層 ══
   空草地與建築之間的斷層，是「業餘」與「成熟」最明顯的分界。
   這些是鋪在地形上的平面裝飾（不參與 y 排序），全部低對比，
   工作是補白與引導視線，不是搶戲。 */
function bakeDeco() {
  for (let v = 0; v < 3; v++) {
    // 碎石：鋪在道路兩側，把導航路線的邊界標出來
    DECO.gravel.push(bake(TS, TS, g => {
      for (let i = 0; i < 9; i++) {
        const x = (rnd2(i, v, 51) * TS) | 0, y = (rnd2(i, v, 57) * TS) | 0;
        const w = 1 + ((rnd2(i, v, 61) * 2) | 0);
        rc(g, x, y, w, 1, P.path[2]); px(g, x, y, P.path[3]);
      }
    }));
    // 地表龜裂：只長在土與石徑上
    DECO.crack.push(bake(TS, TS, g => {
      let x = 2 + ((rnd2(v, 1, 63) * (TS - 4)) | 0), y = 1;
      const len = 7 + ((rnd2(v, 2, 67) * 7) | 0);
      for (let i = 0; i < len; i++) {
        px(g, x, y, 'rgba(16,10,26,.55)');
        if (rnd2(x, y, 71) > 0.72) px(g, x + 1, y, 'rgba(16,10,26,.28)');
        x += rnd2(x, y, v + 5) > .5 ? 1 : -1; y++;
        if (x < 1 || x > TS - 2) break;
      }
    }));
    // 枯草：乾季的色相，替純綠的草地增加色彩層次
    DECO.dry.push(bake(TS, TS, g => {
      for (let i = 0; i < 4; i++) {
        const x = 2 + ((rnd2(i, v, 73) * (TS - 4)) | 0), y = 3 + ((rnd2(i, v, 79) * (TS - 6)) | 0);
        px(g, x, y, P.dry[1]); px(g, x, y + 1, P.dry[0]);
        px(g, x - 1, y + 1, P.dry[0]); px(g, x + 1, y, P.dry[1]);
      }
    }));
    // 小石：石頭語言的縮小版，硬邊 + 上緣受光
    DECO.pebble.push(bake(TS, TS, g => {
      for (let i = 0; i < 3; i++) {
        const x = 2 + ((rnd2(i, v, 83) * (TS - 6)) | 0), y = 4 + ((rnd2(i, v, 89) * (TS - 8)) | 0);
        const w = 2 + ((rnd2(i, v, 97) * 2) | 0);
        rc(g, x, y, w, 2, '#4e4a58');
        rc(g, x, y, w, 1, '#6b6678');
        rc(g, x, y + 2, w, 1, 'rgba(16,10,26,.45)');       // 接觸陰影
      }
    }));
    // 地表質感變化：一塊比周圍略深的土色斑，打破草地的均勻
    DECO.patch.push(bake(TS, TS, g => {
      const cx = 4 + rnd2(v, 3, 101) * 8, cy = 4 + rnd2(v, 4, 103) * 8;
      const r = 3 + rnd2(v, 5, 107) * 3;
      for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
        const dd = Math.hypot(x, y);
        if (dd > r) continue;
        if (dd > r - 1.4 && rnd2(cx + x, cy + y, 109) < 0.55) continue;
        wpx(g, cx + x, cy + y, dd > r - 2 ? 'rgba(56,44,33,.30)' : 'rgba(56,44,33,.52)');
      }
    }));
  }
}

/* ══════════════════════════════════════════════════════════════════
   3 · 建築烘焙
   一個參數化的像素建築產生器：外框線、牆面木紋、屋頂色階與屋脊、
   屋簷陰影、門窗、隨等級增加的樓層、每種建築各自的頂飾。
   ══════════════════════════════════════════════════════════════════ */
/* ══ 建築 ══
   細節密度刻意設在地形的三倍以上：基座、牆體材質、轉角飾板、樓層腰線、
   帶框與窗櫺的窗、門框門階把手、屋簷出挑、屋脊蓋瓦、封簷板、屋簷 AO、
   地面反光、接地陰影，最後才是各自的頂飾。
   同時烘出兩張遮罩供光照階段使用：邊緣光（上左側輪廓）與窗戶自發光。 */
const STONE_PLINTH = ['#22202a', '#332f3d', '#443f50', '#565062', '#6e6779'];
const bldCache = {}, rimCache = {}, emisCache = {};

/* ══ 圖集 ══
   assets/buildings-sheet.png —— 去背與去文字由作者處理完畢，這裡**不做任何影像處理**，
   只負責「找到每一格在哪裡」然後切下來縮到遊戲尺寸。

   圖集的排列（4 欄 × 3 列，由左至右、由上至下）： */
const SHEET_ORDER = [
  'colossus', 'lab', 'workshop', 'storage',
  'tower', 'meditation', 'hall', 'teahouse',
  'starmap', 'retrans', 'labcar', 'truck'
];
/* 每棟在遊戲裡的上限尺寸。★這是「模糊」的總開關★
   原圖約 250px 寬，縮得越小、細線與描邊被平均掉得越多，對比垮掉就會顯得半透明。
   數字調大＝更接近原圖，但建築在基地裡也會更佔位置。 */
/* ★縮放的唯一開關★
   不再「把每張塞進同一個框」——那會讓每棟的倍率都不同（1.58×～2.90×）且全是非整數，
   原圖的 1px 線條落在 1.58 個目的像素上只能塗抹開，這就是模糊的來源。
   改成整張圖集共用一個整數除數：來源 N×N 恰好對應 1 個目的像素，格線不被切開，
   而且所有建築的像素密度一致。代價（也是正解）是建築不再一樣大。 */
let SHEET_DIV = 3;
const sheetRaw = {};          // 原尺寸切片，縮放一律從這裡出發，避免二次重取樣
const sheetSprites = {};
let sheetReady = false;

/* 整數除數的盒式平均：每個 N×N 區塊算一個像素。
   這是數學上正確的降採樣，比瀏覽器的雙線性插值銳利得多，也不會生出莫名的中間色。
   顏色用 alpha 加權，否則透明像素會把邊緣拉暗、產生黑邊。 */
function boxDownscale(src, n) {
  const w = src.width, h = src.height;
  if (n <= 1) return src;
  const tw = Math.max(1, Math.round(w / n)), th = Math.max(1, Math.round(h / n));
  const sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  return bake(tw, th, g => {
    const id = g.createImageData(tw, th), o = id.data;
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      let r = 0, gg = 0, b = 0, a = 0, cnt = 0;
      const y1 = Math.min(h, (y + 1) * n), x1 = Math.min(w, (x + 1) * n);
      for (let sy = y * n; sy < y1; sy++) for (let sx = x * n; sx < x1; sx++) {
        const i = (sy * w + sx) * 4, al = sd[i + 3];
        r += sd[i] * al; gg += sd[i + 1] * al; b += sd[i + 2] * al; a += al; cnt++;
      }
      const di = (y * tw + x) * 4;
      if (a > 0) { o[di] = r / a; o[di + 1] = gg / a; o[di + 2] = b / a; }
      let av = cnt ? a / cnt : 0;
      o[di + 3] = av < 46 ? 0 : av;          // 只清掉真正的殘影，保留正常的抗鋸齒
    }
    g.putImageData(id, 0, 0);
  });
}

/* 偵測原圖有沒有 N×N 的像素塊結構。有的話用那個 N 就是無損還原。 */
function detectBlock(src) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  for (let n = 6; n >= 2; n--) {
    let bad = 0, total = 0;
    for (let by = 0; by + n <= h; by += n) for (let bx = 0; bx + n <= w; bx += n) {
      const i0 = (by * w + bx) * 4;
      if (d[i0 + 3] < 200) continue;
      total++;
      let broke = false;
      for (let y = by; y < by + n && !broke; y++) for (let x = bx; x < bx + n; x++) {
        const i = (y * w + x) * 4;
        if (Math.abs(d[i] - d[i0]) + Math.abs(d[i + 1] - d[i0 + 1]) + Math.abs(d[i + 2] - d[i0 + 2]) > 24) { broke = true; break; }
      }
      if (broke) bad++;
    }
    if (total > 200 && bad / total < 0.06) return n;
  }
  return 0;                                  // 沒有塊結構
}

function loadSheet() {
  if (!window.SHEET_URI) return;
  const im = new Image();
  im.onload = () => {
    const SW = im.width, SH = im.height;
    const src = bake(SW, SH, g => g.drawImage(im, 0, 0));
    let d;
    try { d = src.getContext('2d').getImageData(0, 0, SW, SH).data; }
    catch (e) { return; }                       // 被污染就沉默退回程序化建築

    /* 「這個像素算不算內容」——優先看透明度；
       若整張都不透明（背景是一片實色），就以角落的顏色當作背景色。 */
    let clear = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 24) clear++;
    const useAlpha = clear > (SW * SH) * 0.05;
    const bg = [d[0], d[1], d[2]];
    const solid = i => useAlpha
      ? d[i + 3] > 24
      : (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2])) > 40;

    // 找內容的連續段（欄與列），中間允許一點空隙
    const runs = (arr, minLen) => {
      const o = []; let s = -1, gap = 0;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] > 0) { if (s < 0) s = i; gap = 0; }
        else if (s >= 0) { if (++gap > 6) { o.push([s, i - gap]); s = -1; gap = 0; } }
      }
      if (s >= 0) o.push([s, arr.length - 1]);
      return o.filter(r => r[1] - r[0] >= minLen);
    };
    const colC = new Int32Array(SW);
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (solid((y * SW + x) * 4)) colC[x]++;
    const cols = runs(colC, 30);

    /* 逐欄找出該欄的三格，同時記下「第幾欄、第幾列」。
       SHEET_ORDER 是照著圖集逐列寫的，所以索引必須是 列×欄數＋欄，
       不能直接用「掃描出來的先後」——那是逐欄由上往下，順序會整個錯開。 */
    const cells = [];
    cols.forEach((col, ci) => {
      const rowC = new Int32Array(SH);
      for (let y = 0; y < SH; y++) for (let x = col[0]; x <= col[1]; x++) if (solid((y * SW + x) * 4)) rowC[y]++;
      runs(rowC, 30).forEach((row, ri) => {
        let x0 = col[1], x1 = col[0];
        for (let y = row[0]; y <= row[1]; y++) for (let x = col[0]; x <= col[1]; x++)
          if (solid((y * SW + x) * 4)) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
        cells.push({ ci, ri, x: x0, y: row[0], w: x1 - x0 + 1, h: row[1] - row[0] + 1 });
      });
    });

    /* 原圖若本身有 N×N 的像素塊結構，除以那個 N 就是無損還原，優先採用。
       圖集是從生成器輸出縮放過來的，多半偵測不到，那就用指定的 SHEET_DIV。 */
    const blk = detectBlock(src);
    if (blk >= 2) SHEET_DIV = blk;

    cells.forEach(c => {
      const k = SHEET_ORDER[c.ri * cols.length + c.ci];
      if (!k) return;
      sheetRaw[k] = bake(c.w, c.h, g => g.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h));
      const sp = boxDownscale(sheetRaw[k], SHEET_DIV);
      sheetSprites[k] = sp;
      /* 佔地寬度跟著美術走，深度固定——建築從此不再一樣大 */
      FOOT[k] = { w: Math.max(2, Math.ceil(sp.width / TS)), h: FOOT_DEPTH };
    });

    // 換圖後，之前用程序化建築烘的遮罩全部作廢
    Object.keys(bldCache).forEach(k => delete bldCache[k]);
    Object.keys(rimCache).forEach(k => delete rimCache[k]);
    Object.keys(emisCache).forEach(k => delete emisCache[k]);
    sheetReady = Object.keys(sheetSprites).length > 0;
  };
  im.src = window.SHEET_URI;
}

function bKey(key, lv, fixed) { return key + '_' + lv + (fixed ? 'F' : ''); }
function buildingSprite(key, lv, fixed) {
  const ck = bKey(key, lv, fixed);
  if (!bldCache[ck]) buildBuilding(key, lv, fixed, ck);
  return bldCache[ck];
}
function rimSprite(key, lv, fixed, warm) {
  const ck = bKey(key, lv, fixed);
  if (!bldCache[ck]) buildBuilding(key, lv, fixed, ck);
  const r = rimCache[ck];                    // 成品美術不加邊緣光，這裡會是 null
  return r ? r[warm ? 0 : 1] : null;
}
function emisSprite(key, lv, fixed) {
  const ck = bKey(key, lv, fixed);
  if (!bldCache[ck]) buildBuilding(key, lv, fixed, ck);
  return emisCache[ck];
}

function buildBuilding(key, lv, fixed, ck) {
  /* 有成品美術就直接用。
     等級**不再改變尺寸**——任何非整數倍的縮放都會把剛剛守住的像素格重新打碎。
     級數已經寫在終端讀數上，不需要靠圖的大小表達。 */
  const art = sheetSprites[key];
  if (art) {
    const cv = art;
    bldCache[ck] = cv;
    /* 成品美術自己已經畫好受光、陰影與描邊，不再外加邊緣光。
       那套是給程序化建築（平塗色塊）用的，疊在成品圖上會與美術打架：
       正午時 rimWarmA 是 0.50，等於用加色模式在輪廓上抹一層暖光，直接改掉顏色。 */
    rimCache[ck] = null;
    emisCache[ck] = extractEmissive(cv);
    return;
  }
  const d = (fixed ? FIX : BLD)[key];
  const floors = clamp(lv, 1, 3);
  const BW = 32, WX = 3, WW = 26;
  const wallH = 21 + (floors - 1) * 12;      // 牆要夠高，否則整棟頭重腳輕、只剩屋頂
  const roofH = 12, orn = 9, plH = 3;
  const yRoof = orn, yWall = orn + roofH, yPl = yWall + wallH;
  const h = yPl + plH + 1;
  const emis = [];                       // 自發光矩形：[x,y,w,h,color]

  const cv = bake(BW, h, g => {
    /* ── 牆體：依材質走各自的像素語言 ── */
    wallMat(g, WX, yWall, WW, wallH, d, key.length * 7 + lv);

    /* ── 屋簷 AO：牆頂三列的漸層落影，讓屋頂壓得住牆 ── */
    for (let i = 0; i < 3; i++) {
      const a = [.55, .34, .16][i];
      rc(g, WX, yWall + i, WW, 1, `rgba(10,6,18,${a})`);
    }
    /* ── 側面 AO：兩側各一列，把牆體轉出圓柱感 ── */
    rc(g, WX, yWall, 1, wallH, 'rgba(10,6,18,.34)');
    rc(g, WX + WW - 1, yWall, 1, wallH, 'rgba(10,6,18,.40)');
    /* ── 地面反光：牆腳受地表回彈的暖光，是立體感最便宜的一招 ── */
    for (let i = 0; i < 4; i++) {
      rc(g, WX + 1, yPl - 1 - i, WW - 2, 1, `rgba(255,214,150,${0.10 - i * 0.022})`);
    }

    /* ── 轉角飾板 ── */
    rc(g, WX, yWall, 2, wallH, d.wall[1]);
    rc(g, WX, yWall, 1, wallH, d.wall[3]);
    rc(g, WX + WW - 2, yWall, 2, wallH, d.wall[1]);
    rc(g, WX + WW - 1, yWall, 1, wallH, d.wall[0]);

    /* ── 樓層腰線 ── */
    for (let f = 1; f < floors; f++) {
      const Y = yPl - f * 12;
      rc(g, WX, Y - 1, WW, 1, d.wall[3]);
      rc(g, WX, Y, WW, 1, d.wall[0]);
      rc(g, WX, Y + 1, WW, 1, 'rgba(10,6,18,.30)');
    }

    /* ── 窗：框 + 窗櫺 + 窗台 + 兩段式玻璃反光 ── */
    /* 玻璃要讀得出是玻璃：底色不能是黑洞，靠「上亮下暗的斜切反光」交代材質 */
    const win = (wx, wy) => {
      rc(g, wx, wy, 8, 8, d.wall[0]);                       // 外框
      rc(g, wx + 1, wy + 1, 6, 6, '#262238');               // 玻璃底
      rc(g, wx + 1, wy + 1, 6, 3, '#332e4d');               // 上半較亮
      rc(g, wx + 1, wy + 1, 3, 2, '#484267');               // 左上反光
      px(g, wx + 1, wy + 1, '#6b6490');                     // 鏡面點
      rc(g, wx + 4, wy, 1, 8, d.wall[2]);                   // 直櫺
      rc(g, wx, wy + 4, 8, 1, d.wall[2]);                   // 橫櫺
      rc(g, wx - 1, wy + 8, 10, 1, d.wall[4]);              // 窗台：受光
      rc(g, wx - 1, wy + 9, 10, 1, 'rgba(10,6,18,.45)');    // 窗台落影
      emis.push([wx + 1, wy + 1, 6, 6, d.glow]);
    };
    for (let f = 0; f < floors; f++) {
      const wy = yPl - 14 - f * 12;
      if (wy < yWall + 3) continue;
      if (f === 0) { win(WX + 2, wy); win(WX + WW - 10, wy); }
      else win(13, wy);
    }

    /* ── 門：門框 + 門板分格 + 門把 + 石階 ── */
    const dxp = 12, dy0 = yPl - 13;
    rc(g, dxp - 1, dy0 - 1, 10, 14, d.wall[4]);             // 門框：亮，深色牆上也讀得到
    rc(g, dxp - 1, dy0 - 1, 10, 1, '#ffffff22');
    rc(g, dxp, dy0, 8, 13, d.roof[1]);
    rc(g, dxp + 1, dy0 + 1, 6, 5, d.roof[0]);
    rc(g, dxp + 1, dy0 + 7, 6, 5, d.roof[0]);
    rc(g, dxp, dy0, 8, 1, d.roof[3]);
    px(g, dxp + 6, dy0 + 7, d.trim);                        // 門把
    emis.push([dxp + 1, dy0 + 7, 6, 5, d.glow]);
    matStone(g, dxp - 2, yPl, 12, 2, STONE_PLINTH, 4);      // 門階

    /* ── 基座：一律石材，與牆體材質形成對比 ── */
    matStone(g, WX - 1, yPl, WW + 2, plH, STONE_PLINTH, key.length + 3);
    rc(g, WX - 1, yPl, WW + 2, 1, 'rgba(10,6,18,.50)');

    /* ── 屋頂：大面積、易讀的平面。只有三段色帶，瓦線稀疏且低對比 ── */
    for (let y = 0; y < roofH; y++) {
      const t = y / (roofH - 1);
      const half = Math.round(4 + t * 12);
      const x0 = 16 - half, x1 = 16 + half;
      const band = t < 0.30 ? d.roof[3] : t < 0.70 ? d.roof[2] : d.roof[1];
      rc(g, x0, yRoof + y, x1 - x0 + 1, 1, band);
      rc(g, x0, yRoof + y, 1, 1, d.roof[0]);                // 兩側收邊：俐落硬邊
      rc(g, x1, yRoof + y, 1, 1, d.roof[0]);
      if (y % 5 === 4) rc(g, x0 + 1, yRoof + y, x1 - x0 - 1, 1, mix(d.roof[1], '#000', .28));
    }
    rc(g, 11, yRoof, 11, 1, d.roof[4]);                     // 屋脊蓋瓦：高光
    rc(g, 11, yRoof + 1, 11, 1, d.roof[3]);
    rc(g, 0, yRoof + roofH, BW, 1, d.roof[0]);              // 封簷板
    rc(g, 0, yRoof + roofH - 1, BW, 1, d.roof[1]);

    /* ── 頂飾 ── */
    ornament(g, key, orn, d, emis);
    outline(g, BW, h, P.out);
  });

  bldCache[ck] = cv;
  rimCache[ck] = [extractRim(cv, 'rgba(255,226,170,0.85)'), extractRim(cv, 'rgba(150,196,255,0.80)')];
  emisCache[ck] = bake(BW, h, g => {
    emis.forEach(([x, y, w, hh, c]) => {
      rc(g, x, y, w, hh, c);
      rc(g, x, y, w, 1, '#ffffff');
    });
  });
}

/* 成品美術沒有「哪裡是窗」的資料，改用亮度取最亮的一小撮當光源：
   爐火、電漿、亮著的窗與螢幕自然會被選中，夜裡就是它們在發光。 */
function extractEmissive(cv) {
  const w = cv.width, h = cv.height;
  const d = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const lum = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) lum.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  if (!lum.length) return bake(w, h, () => { });
  lum.sort((a, b) => a - b);
  const thr = Math.max(150, lum[Math.floor(lum.length * 0.955)] || 999);
  return bake(w, h, g => {
    const id = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 8) continue;
      const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (L < thr) continue;
      id.data[i] = d[i]; id.data[i + 1] = d[i + 1]; id.data[i + 2] = d[i + 2];
      id.data[i + 3] = Math.min(255, (L - thr) * 4 + 90);
    }
    g.putImageData(id, 0, 0);
  });
}

/* 上／左側的輪廓像素＝受光邊。加色疊上去就是邊緣光，把形體從背景裡剝出來。 */
function extractRim(src, col) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 8;
  return bake(w, h, g => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      if (!solid(x, y - 1) || !solid(x - 1, y)) px(g, x, y, col);
    }
  });
}

function ornament(g, key, orn, d, emis) {
  const T = d.trim, GL = d.glow;
  const stack = (x, y, w, hh) => {                 // 磚砌煙囪
    matStone(g, x, y, w, hh, STONE_PLINTH, x + hh);
    rc(g, x, y, w, 1, d.wall[3]);
    rc(g, x - 1, y, w + 2, 2, d.wall[1]);
    rc(g, x - 1, y, w + 2, 1, d.wall[3]);
  };
  if (key === 'teahouse') {
    stack(21, orn - 7, 5, 9);
  } else if (key === 'workshop') {
    stack(7, orn - 8, 5, 10);
    rc(g, 23, orn - 6, 1, 6, d.wall[2]);                        // 風向雞
    px(g, 22, orn - 6, T); px(g, 24, orn - 6, T); px(g, 23, orn - 7, GL);
  } else if (key === 'meditation') {
    for (let i = 0; i < 8; i++) {                                // 尖塔
      const w = 1 + (i >> 1);
      rc(g, 16 - (w >> 1), orn - 8 + i, Math.max(1, w), 1, i < 3 ? GL : i < 6 ? T : d.roof[3]);
    }
    px(g, 16, orn - 9, GL); emis.push([15, orn - 9, 2, 3, GL]);
  } else if (key === 'lab') {
    rc(g, 16, orn - 9, 1, 10, d.wall[3]);                        // 天線
    px(g, 15, orn - 9, T); px(g, 17, orn - 9, T);
    px(g, 16, orn - 10, GL); emis.push([16, orn - 10, 1, 1, GL]);
    rc(g, 7, orn - 4, 7, 1, d.wall[1]);                          // 碟盤
    rc(g, 8, orn - 5, 5, 1, d.wall[3]); rc(g, 10, orn - 3, 1, 3, d.wall[2]);
  } else if (key === 'tower') {
    for (let i = 0; i < 7; i++) {                                // 能量結晶
      const w = i < 3 ? 4 : i < 5 ? 3 : 1;
      rc(g, 16 - (w >> 1), orn - 9 + i, w, 1, i % 2 ? GL : T);
    }
    emis.push([14, orn - 9, 4, 7, GL]);
    matStone(g, 12, orn - 2, 8, 3, STONE_PLINTH, 9);
  } else if (key === 'retrans') {
    stack(6, orn - 9, 5, 11);
    rc(g, 19, orn - 5, 8, 6, d.roof[0]);                         // 爐口
    rc(g, 20, orn - 4, 6, 4, T); rc(g, 21, orn - 3, 4, 2, GL);
    emis.push([20, orn - 4, 6, 4, GL]);
  } else if (key === 'truck') {
    rc(g, 3, orn - 5, 26, 6, d.roof[1]);                         // 頂棚
    rc(g, 3, orn - 5, 26, 1, d.roof[3]);
    for (let x = 5; x < 28; x += 4) rc(g, x, orn - 4, 1, 4, d.roof[0]);
  } else if (key === 'labcar') {
    rc(g, 6, orn - 8, 1, 9, d.wall[3]); rc(g, 25, orn - 6, 1, 7, d.wall[3]);
    px(g, 6, orn - 9, GL); px(g, 25, orn - 7, T);
    emis.push([6, orn - 9, 1, 1, GL]);
  } else if (key === 'storage') {
    rc(g, 11, orn - 4, 10, 5, d.roof[1]);                        // 通風百葉
    rc(g, 11, orn - 4, 10, 1, d.roof[3]);
    for (let y = 0; y < 3; y++) rc(g, 12, orn - 3 + y, 8, 1, y % 2 ? d.roof[0] : d.roof[2]);
  }
}

/* 沿著不透明像素外圍描一圈深色線——像素風的關鍵一步 */
function outline(g, w, h, col) {
  const src = g.getImageData(0, 0, w, h), d = src.data;
  const solid = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? false : d[(y * w + x) * 4 + 3] > 8;
  const add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) add.push([x, y]);
  }
  g.fillStyle = col;
  add.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
}

/* 農地的作物階段畫在圖塊上，不做成建築 */
const CROP = [];
function bakeCrops() {
  for (let st = 0; st < 4; st++) {
    CROP.push(bake(TS, TS, g => {
      if (st === 0) return;
      const hgt = [0, 3, 6, 9][st];
      for (let i = 0; i < 3; i++) {
        const cx = 3 + i * 5;
        px(g, cx, TS - 2, 'rgba(10,6,18,.35)');                     // 接地陰影
        for (let y = 0; y < hgt; y++) px(g, cx, TS - 3 - y, y > hgt - 3 ? LEAF_TIP : LEAF[2]);
        if (st >= 2) { px(g, cx - 1, TS - 3 - hgt + 1, LEAF[1]); px(g, cx + 1, TS - 3 - hgt + 2, LEAF[1]); }
        if (st === 3) { px(g, cx, TS - 4 - hgt, '#ffd23f'); px(g, cx - 1, TS - 3 - hgt, '#d9931f'); px(g, cx + 1, TS - 3 - hgt, '#d9931f'); }
      }
    }));
  }
}

/* ══════════════════════════════════════════════════════════════════
   4 · 角色
   手工像素資料 + 程序化步態：一組身體 × 三組腿 = 四幀走路循環。
   ══════════════════════════════════════════════════════════════════ */
const PAL_P = { o: '#12091f', R: '#3a2266', r: '#241546', H: '#4d2f85', S: '#e8b98a', s: '#c99a6b', G: '#ffd23f', g: '#b8912a', C: '#6ff0e8', W: '#eafcff', K: '#150c22' };
const PAL_W1 = { o: '#12091f', R: '#8a4a1c', r: '#5e3110', H: '#a85f26', S: '#e8b98a', s: '#c99a6b', G: '#ffb02e', g: '#b8761a', C: '#ffd9a8', W: '#fff4e2', K: '#2a1508' };
const PAL_W2 = { o: '#12091f', R: '#2f6b5c', r: '#1d453c', H: '#3d8a76', S: '#d9a97c', s: '#b88a60', G: '#8fd96f', g: '#5f9c4a', C: '#c8f5a0', W: '#eafff0', K: '#12261f' };

const BODY_DOWN = [
  '.....oooooo.....', '...oorRRRRroo...', '..orRRRRRRRRro..', '.orRRRRRRRRRRro.',
  '.oRRRRRRRRRRRRo.', '.oRRoSSSSSSoRRo.', '.oRRoSssssSoRRo.', '.oRRoCCWWCCoRRo.',
  '.oRRoCCWWCCoRRo.', '.oRRoSSSSSSoRRo.', '.oRRRoSSSSoRRRo.', '..oRRRRRRRRRRo..',
  '..oGGGGGGGGGGo..', '..oRRRRRRRRRRo..', '.oRRRRRRRRRRRRo.', '.oRRRRRRRRRRRRo.',
  '.oRRRRRRRRRRRRo.', '.oRRRRRRRRRRRRo.', '..oRRRRRRRRRRo..', '..oRRRRRRRRRRo..',
  '..orRRRRRRRRro..'
];
const BODY_UP = [
  '.....oooooo.....', '...oorRRRRroo...', '..orRRRRRRRRro..', '.orRRRRRRRRRRro.',
  '.oRRRRRRRRRRRRo.', '.oRRRRRRRRRRRRo.', '.oRRRRrrrrRRRRo.', '.oRRRrrKKrrRRRo.',
  '.oRRRRrrrrRRRRo.', '.oRRRRRRRRRRRRo.', '.oRRRRRRRRRRRRo.', '..oRRRRRRRRRRo..',
  '..oGGGGGGGGGGo..', '..oRRRRRRRRRRo..', '.oRRRRRRRRRRRRo.', '.oRRRRRRRRRRRRo.',
  '.oRRRRRRRRRRRRo.', '.oRRRRRRRRRRRRo.', '..oRRRRRRRRRRo..', '..oRRRRRRRRRRo..',
  '..orRRRRRRRRro..'
];
const BODY_SIDE = [
  '.....oooooo.....', '...oorRRRRRoo...', '..orRRRRRRRRro..', '..orRRRRRRRRRro.',
  '..oRRRRRRRRRRRo.', '..oRRRoSSSSSSo..', '..oRRRoSssssSo..', '..oRRRoCCWWWo...',
  '..oRRRoCCWWWo...', '..oRRRoSSSSSo...', '..oRRRRoSSSoo...', '..oRRRRRRRRRo...',
  '..oGGGGGGGGGo...', '..oRRRRRRRRRo...', '..oRRRRRRRRRRo..', '..oRRRRRRRRRRo..',
  '..oRRRRRRRRRRo..', '..oRRRRRRRRRo...', '..oRRRRRRRRRo...', '..oRRRRRRRRo....',
  '..orRRRRRRRo....'
];
const LEGS = {
  idle: ['...oKKo..oKKo...', '...oKKo..oKKo...', '....oo....oo....'],
  a:    ['..oKKo...oKKo...', '..oKKo...oKKo...', '..oKKo....oo....'],
  b:    ['...oKKo...oKKo..', '...oKKo...oKKo..', '....oo....oKKo..']
};
const LEGS_SIDE = {
  idle: ['...oKKKo.oKKo...', '...oKKKo.oKKo...', '...oKKo...oKo...'],
  a:    ['..oKKKo..oKKKo..', '..oKKKo..oKKKo..', '.oKKo......oKKo.'],
  b:    ['....oKKKoKKo....', '....oKKKoKKo....', '....oKKo.oKo....']
};

const actorCache = {};
function actorSprite(palKey, pal, dir, frame) {
  const ck = palKey + dir + frame;
  if (actorCache[ck]) return actorCache[ck];
  const side = dir === 'left' || dir === 'right';
  const body = dir === 'up' ? BODY_UP : side ? BODY_SIDE : BODY_DOWN;
  const set = side ? LEGS_SIDE : LEGS;
  const legs = frame === 1 ? set.a : frame === 3 ? set.b : set.idle;
  const bob = (frame === 1 || frame === 3) ? -1 : 0;
  const rows = [];
  for (let i = 0; i < 24; i++) rows.push('................');
  body.forEach((r, i) => { rows[i + 1 + bob] = r; });
  legs.forEach((r, i) => { rows[21 + i] = r; });
  let cv = fromGrid(rows, pal);
  if (dir === 'left') {                                   // 右向鏡射成左向
    const o = cv, w = o.width, h = o.height;               // 尺寸跟著來源走，不寫死
    cv = bake(w, h, g => { g.translate(w, 0); g.scale(-1, 1); g.drawImage(o, 0, 0); });
  }
  actorCache[ck] = cv;
  return cv;
}

/* 影子：核心深、外緣柔。硬邊橢圓會讓所有東西看起來像貼紙。 */
function softShadow(w, h, peak) {
  return bake(w, h, g => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - (w - 1) / 2) / (w / 2), dy = (y - (h - 1) / 2) / (h / 2);
      const dd = dx * dx + dy * dy;
      if (dd > 1) continue;
      const a = (1 - dd) * (1 - dd);
      px(g, x, y, `rgba(8,4,16,${(peak * a).toFixed(3)})`);
    }
  });
}
const SHADOW = softShadow(16, 7, 0.50);        // 角色
const CONTACT = softShadow(30, 10, 0.58);      // 建築接地

/* 鷹架：施工時依建築的實際尺寸現畫。
   立柱固定 2px 寬、橫桿依高度均分，所以不管建築是 31px 還是 108px 寬，
   桿件的粗細都一樣——拉伸一張固定圖做不到這件事。 */
function drawScaffold(x, y, w, h) {
  const DARK = '#5e4423', MID = '#8a6a3c', LIT = '#a8834c';
  const pw = 2;
  for (const px_ of [x, x + w - pw]) {          // 兩側立柱
    rc(W, px_, y, pw, h, MID);
    rc(W, px_, y, 1, h, LIT);
  }
  const rows = Math.max(2, Math.round(h / 15));  // 橫桿：依高度均分，間距不會失控
  const gap = h / rows;
  for (let i = 1; i < rows; i++) {
    const yy = Math.round(y + gap * i);
    rc(W, x, yy, w, 2, MID);
    rc(W, x, yy, w, 1, LIT);
  }
  rc(W, x - 1, y, w + 2, 2, LIT);                // 頂欄
  rc(W, x - 1, y + 2, w + 2, 1, DARK);
}

/* ══════════════════════════════════════════════════════════════════
   5 · 佈景道具
   ══════════════════════════════════════════════════════════════════ */
/* 中景物件的明度帶介於地形與建築之間：比草地有形體，但拿不到建築的高光。 */
const LEAF = ['#1e3a1c', '#284d24', '#33602d', '#3f7338'];
const LEAF_TIP = '#4d8a44';
const BARK = ['#2b1f14', '#3d2d1c', '#513c26', '#66502f', '#7d6540'];
const ROCK = ['#2a2833', '#3b3846', '#4c4959', '#5e5a6c', '#787389'];

const PROP = {};
function bakeProps() {
  /* 樹冠用「簇塊」語言（跟草同族但更立體），樹幹用木紋語言——
     同一個物件上出現兩種材質語彙，正是成熟像素美術的辨識點。 */
  const canopy = (g, cx, cy, rx, ry, seed) => {
    for (let i = 0; i < 7; i++) {
      const a = rnd2(i, seed, 3) * 6.283, rr = rnd2(i, seed, 5);
      const bx = cx + Math.cos(a) * rx * rr * .62, by = cy + Math.sin(a) * ry * rr * .62;
      const br = 3 + rnd2(i, seed, 7) * 2.6;
      for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
        const dd = Math.hypot(x, y * 1.15);
        if (dd > br) continue;
        if (dd > br - 1.2 && rnd2(bx + x, by + y, 11) < .45) continue;
        const shade = (y < -br * .25) ? 3 : (y > br * .35) ? 0 : 2;
        px(g, bx + x, by + y, LEAF[shade]);
      }
    }
    for (let i = 0; i < 9; i++) {                         // 受光的葉尖，集中在上緣
      const a = -0.5 - rnd2(i, seed, 13) * 2.1, rr = .6 + rnd2(i, seed, 17) * .4;
      px(g, cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr, LEAF_TIP);
    }
  };
  PROP.tree = bake(26, 38, g => {
    matWood(g, 10, 22, 5, 14, BARK, 3);
    rc(g, 9, 34, 7, 2, BARK[0]);                          // 板根
    canopy(g, 13, 14, 11, 9, 1);
    rc(g, 13, 22, 1, 12, 'rgba(10,6,18,.35)');            // 樹幹右側 AO
    outline(g, 26, 38, P.out);
  });
  PROP.shrub = bake(18, 16, g => {                        // 中尺度：填補草地與建築之間
    canopy(g, 9, 9, 7, 5, 21);
    rc(g, 4, 14, 10, 1, 'rgba(10,6,18,.30)');             // 接觸陰影
    outline(g, 18, 16, P.out);
  });
  PROP.shrub2 = bake(14, 13, g => {
    canopy(g, 7, 7, 5, 4, 33);
    rc(g, 3, 11, 8, 1, 'rgba(10,6,18,.30)');
    outline(g, 14, 13, P.out);
  });
  PROP.rock = bake(15, 13, g => {                         // 石頭：俐落硬邊，不抖動
    const face = [[2, 4, 11, 6], [4, 2, 7, 3]];
    face.forEach(([x, y, w, hh], i) => {
      rc(g, x, y, w, hh, ROCK[2 - i]);
      rc(g, x, y, w, 1, ROCK[4]);
      rc(g, x, y + hh - 1, w, 1, ROCK[0]);
      rc(g, x, y, 1, hh, ROCK[3]);
    });
    rc(g, 1, 10, 13, 1, 'rgba(10,6,18,.42)');
    outline(g, 15, 13, P.out);
  });
  PROP.flower = bake(9, 9, g => {
    rc(g, 4, 5, 1, 3, LEAF[2]); px(g, 3, 6, LEAF[1]); px(g, 5, 5, LEAF[1]);
    const c = ['#e86a8a', '#ffd23f', '#c79bff'];
    for (let i = 0; i < 3; i++) {
      const k = c[i], bx = 2 + i * 2, by = 3 + (i % 2);
      px(g, bx, by, k); px(g, bx + 1, by, k); px(g, bx, by + 1, k);
      px(g, bx + 1, by - 1, mix(k, '#ffffff', .5));
    }
  });
  PROP.fence = bake(16, 15, g => {
    matWood(g, 2, 4, 3, 10, BARK, 5); matWood(g, 11, 4, 3, 10, BARK, 7);
    rc(g, 0, 6, 16, 2, BARK[3]); rc(g, 0, 6, 16, 1, BARK[4]);
    rc(g, 0, 10, 16, 2, BARK[3]); rc(g, 0, 10, 16, 1, BARK[4]);
    rc(g, 0, 13, 16, 1, 'rgba(10,6,18,.30)');
    outline(g, 16, 15, P.out);
  });
  PROP.crate = bake(13, 13, g => {
    matWood(g, 1, 2, 11, 9, WOOD_RED, 11);
    rc(g, 1, 2, 11, 1, WOOD_RED[4]);                      // 上緣受光
    rc(g, 1, 10, 11, 1, WOOD_RED[0]);
    rc(g, 1, 6, 11, 1, WOOD_RED[1]); rc(g, 5, 2, 1, 9, WOOD_RED[1]);
    rc(g, 0, 11, 13, 1, 'rgba(10,6,18,.38)');             // 接觸陰影
    outline(g, 13, 13, P.out);
  });
  PROP.deadtree = bake(20, 30, g => {
    rc(g, 9, 14, 3, 15, '#241d2e'); rc(g, 9, 14, 1, 15, '#332a42');
    const limb = (x, y, dx, dy, n) => {
      for (let i = 0; i < n; i++) { px(g, x + dx * i, y - dy * i, i > n - 3 ? '#332a42' : '#241d2e'); }
    };
    limb(10, 14, -1, 1, 7); limb(11, 12, 1, 1, 6); limb(10, 8, -1, 1, 4); limb(11, 6, 1, 1, 4);
    outline(g, 20, 30, '#0b0910');
  });
  PROP.rubble = bake(16, 10, g => {
    for (let i = 0; i < 7; i++) {
      const rx = (rnd2(i, 1, 3) * 12) | 0, ry = (rnd2(i, 2, 9) * 6) | 0;
      rc(g, rx, ry + 2, 2 + (rnd2(i, 3, 4) * 2 | 0), 2, i % 2 ? '#2f293d' : '#252031');
    }
    outline(g, 16, 10, '#0b0910');
  });
  /* 鷹架不烘成固定圖：建築尺寸從 31px 到 108px 都有，
     拉伸一張 34×40 的圖會把立柱拉肥、高度也算錯。改成施工時依實際尺寸現畫。 */
}

/* ══════════════════════════════════════════════════════════════════
   6 · 世界狀態
   ══════════════════════════════════════════════════════════════════ */
const owned = new Set(['0,0']);
const MODULE_COST = { s: 90, p: 76 };      // 模組從 10×10 變 20×20，面積四倍
/* The scene does not own the economy. These three are a live view over the
   host game's base.res, so building here spends the same 物資／零件／神髓 the
   battles and the daily production use — there is only ever one number. */
const res = {
  get s() { return HOST.res().supply; }, set s(v) { HOST.res().supply = Math.max(0, Math.round(v)); },
  get p() { return HOST.res().part; }, set p(v) { HOST.res().part = Math.max(0, Math.round(v)); },
  get e() { return HOST.res().essence; }, set e(v) { HOST.res().essence = Math.max(0, Math.round(v)); }
};

/* 地形：模組內預先鋪好草，中央一條石徑，右下一池水 */
const terrain = new Map();                 // "x,y" -> 'grass'|'path'|'water'
function paintModule(mx, my) {
  for (let x = mx * MOD; x < mx * MOD + MOD; x++)
    for (let y = my * MOD; y < my * MOD + MOD; y++) {
      let t = 'grass';
      if (mx === 0 && my === 0) {
        // 主幹道：直的一條 + 橫的一條，把 20×20 切成四個好蓋東西的區塊
        if ((x === 9 || x === 10) && y >= 4) t = 'path';
        if ((y === 12 || y === 13) && x >= 3 && x <= 17) t = 'path';
        if (x >= 15 && x <= 18 && y >= 2 && y <= 6) t = 'water';
      }
      terrain.set(x + ',' + y, t);
    }
}
paintModule(0, 0);

/* 佔地是 6×4，三棟常駐設施要在 20×20 裡各據一角，並且避開道路與水池 */
const buildings = [
  { key: 'storage', x: 2,  y: 2,  fixed: true, prog: 1, lv: 1 },   // 西北
  { key: 'labcar',  x: 2,  y: 15, fixed: true, prog: 1, lv: 1 },   // 西南
  { key: 'truck',   x: 12, y: 15, fixed: true, prog: 1, lv: 1 }    // 東南
];
const props = [
  { k: 'tree', x: 1.0, y: 10.5 }, { k: 'tree', x: 6.4, y: 19.2 }, { k: 'tree', x: 18.6, y: 11.4 },
  { k: 'tree', x: 12.3, y: 1.6 }, { k: 'tree', x: 19.1, y: 17.8 },
  { k: 'rock', x: 8.2, y: 2.4 }, { k: 'rock', x: 13.7, y: 9.6 }, { k: 'rock', x: 3.1, y: 13.4 },
  { k: 'flower', x: 11.6, y: 8.3 }, { k: 'flower', x: 17.4, y: 14.7 }, { k: 'flower', x: 7.2, y: 15.5 },
  { k: 'crate', x: 8.6, y: 6.8 }, { k: 'crate', x: 11.4, y: 19.4 }
];

const player = { x: 9.5, y: 10.5, vx: 0, vy: 0, dir: 'down', anim: 0, moving: false, carry: null, carryFix: false, pal: PAL_P, palKey: 'P' };
const npcs = [
  { x: 13.5, y: 7.5, dir: 'down', anim: 0, pal: PAL_W1, palKey: 'W1', role: 'worker', job: null, path: [], wait: 0, say: null, name: '協會派工' },
  { x: 5.5, y: 9.5, dir: 'down', anim: 0, pal: PAL_W2, palKey: 'W2', role: 'worker', job: null, path: [], wait: 0, say: null, name: '協會派工' }
];

let hoverT = null, hoverMod = null, selected = null, rackOpen = false, toast = null;
let clock = 8.5;                     // 24 小時制的場景時鐘
let timeScale = 1 / 9;               // 一個晝夜約 3.6 分鐘（便於檢視）
let tSec = 0;

const key = (x, y) => x + ',' + y;
const isGround = (x, y) => owned.has(Math.floor(x / MOD) + ',' + Math.floor(y / MOD));
/* 佔地（放置與點選用）＝完整的 w × h */
function bAt(x, y) { return buildings.find(b => { const f = foot(b.key);
  return x >= b.x && x < b.x + f.w && y >= b.y && y < b.y + f.h; }) || null; }

/* 碰撞（行走用）比佔地淺一排：最後面那一排留給玩家走。
   不這樣做的話，樓與樓之間、車子後面明明看得到空隙卻走不過去，變成空氣牆。
   站在後排會被建築的圖蓋住——那正是「走到建築後面」該有的樣子。 */
const FOOT_BACK_WALK = 1;
function blockerAt(x, y) {
  return buildings.find(b => {
    if (b.key === 'farm') return false;          // 農地本來就可以踩
    const f = foot(b.key);
    return x >= b.x && x < b.x + f.w
        && y >= b.y + FOOT_BACK_WALK && y < b.y + f.h;
  }) || null;
}
function blocked(x, y) {
  if (!isGround(x, y)) return true;
  if (terrain.get(key(x, y)) === 'water') return true;
  return !!blockerAt(x, y);          // 用碰撞範圍，不是佔地範圍
}
function expandable() {
  const out = new Map();
  owned.forEach(k => {
    const [mx, my] = k.split(',').map(Number);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const nk = (mx + dx) + ',' + (my + dy);
      if (!owned.has(nk)) out.set(nk, { mx: mx + dx, my: my + dy, k: nk });
    });
  });
  return [...out.values()];
}

/* ══════════════════════════════════════════════════════════════════
   6.5 · 中景裝飾的擺放規則
   規則驅動而非亂灑：道路本身永遠淨空、路肩鋪碎石把動線標出來、
   建築門前留出兩格通道、地塊邊緣加高矮樹叢與石頭來框住構圖。
   ══════════════════════════════════════════════════════════════════ */
function nearPath(x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if (terrain.get(key(x + dx, y + dy)) === 'path') return true;
  return false;
}
function doorApproach(x, y) {
  return buildings.some(b => { const f = foot(b.key);
    return x >= b.x && x < b.x + f.w && y >= b.y + f.h && y < b.y + f.h + 2; });
}
const D3 = (x, y, s) => (rnd2(x, y, s) * 3) | 0;

function decorAt(x, y) {
  const t = terrain.get(key(x, y));
  if (t === 'water' || t === 'path' || t === 'tilled' || t === 'dirt' && bAt(x, y)) return null;
  if (bAt(x, y)) return null;

  // 道路兩側鋪碎石：把玩家該走的路線標示出來，其餘一律淨空
  if (nearPath(x, y)) return { flat: DECO.gravel[D3(x, y, 137)], tall: null };
  // 門前通道保持乾淨，不然導航會被裝飾擋住
  if (doorApproach(x, y)) return rnd2(x, y, 131) > 0.75 ? { flat: DECO.patch[D3(x, y, 139)], tall: null } : null;

  const n = rnd2(x, y, 131);
  const edge = !isGround(x - 1, y) || !isGround(x + 1, y) || !isGround(x, y - 1) || !isGround(x, y + 1);
  const out = { flat: null, tall: null };

  if (t === 'dirt') { if (n > 0.55) out.flat = DECO.crack[D3(x, y, 141)]; return out; }

  if (n > 0.965) out.tall = 'flower';
  else if (n > 0.925) out.tall = edge ? 'rock' : 'shrub';      // 邊緣放石頭框住構圖
  else if (n > 0.855) out.tall = 'shrub2';
  else if (n > 0.775) out.flat = DECO.dry[D3(x, y, 143)];
  else if (n > 0.700) out.flat = DECO.pebble[D3(x, y, 147)];
  else if (n > 0.570) out.flat = DECO.patch[D3(x, y, 149)];
  return out;
}

/* ══════════════════════════════════════════════════════════════════
   7 · 尋路（給 NPC 用；玩家是直接操作）
   ══════════════════════════════════════════════════════════════════ */
function findPath(sx, sy, tx, ty) {
  sx |= 0; sy |= 0; tx |= 0; ty |= 0;
  const start = key(sx, sy), goal = key(tx, ty);
  if (start === goal) return [];
  const prev = new Map([[start, null]]);
  const q = [[sx, sy]];
  let guard = 0;
  while (q.length && guard++ < 4000) {
    const [x, y] = q.shift();
    if (key(x, y) === goal) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, nk = key(nx, ny);
      if (prev.has(nk) || blocked(nx, ny)) continue;
      prev.set(nk, key(x, y)); q.push([nx, ny]);
    }
  }
  if (!prev.has(goal)) return null;
  const out = [];
  for (let k = goal; k && k !== start; k = prev.get(k)) {
    const [x, y] = k.split(',').map(Number);
    out.unshift({ x: x + .5, y: y + .5 });
  }
  return out;
}
/* 走到建築旁邊。候選點沿著整個佔地的四周繞一圈，不再是寫死的六個偏移。 */
function buildingRing(f) {
  const r = [];
  for (let dx = 0; dx < f.w; dx++) { r.push([dx, f.h]); r.push([dx, -1]); }
  for (let dy = 0; dy < f.h; dy++) { r.push([-1, dy]); r.push([f.w, dy]); }
  return r;
}
function pathNear(sx, sy, tx, ty, f) {
  let best = null;
  for (const [dx, dy] of buildingRing(f || DEFAULT_FOOT)) {
    const nx = tx + dx, ny = ty + dy;
    if (blocked(nx, ny)) continue;
    const p = findPath(sx, sy, nx, ny);
    if (p && (!best || p.length < best.length)) best = p;
  }
  return best;
}

/* ══════════════════════════════════════════════════════════════════
   8 · 音效（WebAudio 合成，不用任何音檔）
   ══════════════════════════════════════════════════════════════════ */
let AC = null, master = null, ambGain = null;
function initAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
  // 環境層：濾波雜訊 + 緩慢起伏 = 風
  const n = AC.createBufferSource();
  const buf = AC.createBuffer(1, AC.sampleRate * 4, AC.sampleRate);
  const dd = buf.getChannelData(0);
  for (let i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1) * 0.35;
  n.buffer = buf; n.loop = true;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.6;
  ambGain = AC.createGain(); ambGain.gain.value = 0.05;
  const lfo = AC.createOscillator(); lfo.frequency.value = 0.07;
  const lg = AC.createGain(); lg.gain.value = 0.025;
  lfo.connect(lg); lg.connect(ambGain.gain); lfo.start();
  n.connect(f); f.connect(ambGain); ambGain.connect(master); n.start();
}
function blip(freq, dur, type, vol, slide) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square'; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, AC.currentTime + dur);
  g.gain.setValueAtTime(vol == null ? 0.09 : vol, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0008, AC.currentTime + dur);
  o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + dur + 0.02);
}
function noiseHit(dur, freq, vol) {
  if (!AC) return;
  const n = AC.createBufferSource();
  const b = AC.createBuffer(1, AC.sampleRate * dur, AC.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  n.buffer = b;
  const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.1;
  const g = AC.createGain(); g.gain.value = vol == null ? 0.16 : vol;
  n.connect(f); f.connect(g); g.connect(master); n.start();
}
const SFX = {
  step: () => noiseHit(0.06, 260 + Math.random() * 120, 0.055),
  pick: () => blip(520, 0.09, 'square', .07, 880),
  place: () => { noiseHit(0.14, 150, .2); blip(180, 0.16, 'triangle', .08, 90); },
  build: () => { noiseHit(0.09, 900, .12); blip(1200, 0.05, 'square', .04); },
  ui: () => blip(760, 0.05, 'square', .05),
  ok: () => { blip(660, .08, 'triangle', .07); setTimeout(() => blip(990, .12, 'triangle', .07), 70); },
  no: () => blip(160, 0.14, 'sawtooth', .06, 110),
  coin: () => { blip(880, .06, 'square', .05); setTimeout(() => blip(1320, .09, 'square', .05), 55); }
};

/* ══════════════════════════════════════════════════════════════════
   9 · 粒子
   ══════════════════════════════════════════════════════════════════ */
const parts = [];
function emit(x, y, type, n) {
  for (let i = 0; i < (n || 1); i++) {
    parts.push({
      x, y, type,
      vx: (Math.random() - .5) * (type === 'spark' ? 26 : 6),
      vy: type === 'smoke' ? -9 - Math.random() * 6 : -(Math.random() * 18 + 6),
      life: type === 'smoke' ? 2.6 : type === 'fly' ? 6 : 0.7,
      t: 0, r: Math.random()
    });
  }
}
function stepParts(dt) {
  const nn = night();
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.type === 'fly') {
      p.x += Math.sin(p.t * 1.7 + p.r * 9) * dt * 0.5;
      p.y += Math.cos(p.t * 1.3 + p.r * 5) * dt * 0.35;
      /* 天亮時要縮短的是「壽命」，不是快轉 p.t。
         p.t 同時驅動繪製時的閃爍相位 sin(p.t*6+…)，快轉它會讓全場螢火
         在同一瞬間一起變成高速頻閃——看起來就像憑空冒出一大群然後閃掉。 */
      if (nn < 0.55) p.life -= dt * (0.55 - nn) * 14;
    } else {
      p.x += p.vx * dt / TS; p.y += p.vy * dt / TS;
      if (p.type !== 'smoke') p.vy += 42 * dt;
      else p.vx *= 0.99;
    }
    if (p.t > p.life) parts.splice(i, 1);   // 壽命調整後才判定，k 不會變成負值
  }
}

/* ══════════════════════════════════════════════════════════════════
   10 · 住民的嘴
   資訊由住民開口，不由橫幅或彈窗（visual-identity：介面本身就是虛構物）
   ══════════════════════════════════════════════════════════════════ */
const LINES = {
  praise: ['他剛剛看了一眼西邊。西邊。', '大師連地基都放得這麼有道理。', '這角度……他是在對齊什麼嗎。', '我把他打的哈欠寫進報告了。', '他昨天站在那裡三分鐘。三分鐘。'],
  doom: ['天邊那個顏色，昨天還不是那樣。', '再幾天而已。你說我們來得及嗎。', '我不怕。我只是在算距離。', '協會又發了一封不解釋任何事的信。'],
  guide: ['研究所還空著一個位子。', '重譯爐冷了，沒人在用。', '要拆要搬都不用錢，放心亂放。', '工程車那邊還有模型沒拿。', '地塊可以往外接，錢夠就接。'],
  work: ['釘子。給我釘子。', '這面牆昨天還是平的。', '照圖施工，沒問題。', '再兩下就好。']
};
function speak(a, pool) {
  const p = LINES[pool] || (Math.random() < .42 ? LINES.guide : Math.random() < .6 ? LINES.praise : LINES.doom);
  a.say = { t: p[(Math.random() * p.length) | 0], left: 3.6 };
}
function say(t) { toast = { t, left: 2.6 }; }

/* ══════════════════════════════════════════════════════════════════
   11 · 遊戲動作
   ══════════════════════════════════════════════════════════════════ */
const afford = c => res.s >= (c.s || 0) && res.p >= (c.p || 0) && res.e >= (c.e || 0);
const pay = c => { res.s -= c.s || 0; res.p -= c.p || 0; res.e -= c.e || 0; };
const give = c => { res.s += c.s || 0; res.p += c.p || 0; res.e += c.e || 0; };
const upCost = (k, lv) => ({ s: Math.round(BLD[k].cost.s * (lv + 1) * .85) + 4, p: Math.round(BLD[k].cost.p * (lv + 1) * .85) + 4 });

function takeModel(k) {
  if (!afford(BLD[k].cost)) { SFX.no(); say('資源不足，這個模型拿不動'); return; }
  player.carry = k; player.carryFix = false; rackOpen = false; selected = null;
  SFX.pick(); say(`拿起了${BLD[k].n}的模型。走到想蓋的地方放下。`);
}
function canPlace(x, y) {
  if (player.carry === null) return false;
  const f = foot(player.carry);
  for (let dx = 0; dx < f.w; dx++) for (let dy = 0; dy < f.h; dy++) {
    if (!isGround(x + dx, y + dy)) return false;
    if (terrain.get(key(x + dx, y + dy)) === 'water') return false;
    if (bAt(x + dx, y + dy)) return false;
  }
  return Math.hypot(x + f.w / 2 - player.x, y + f.h / 2 - player.y) <= REACH + f.w / 2;
}
function place(x, y) {
  const k = player.carry, fx = player.carryFix;
  const pf = foot(k);
  if (!canPlace(x, y)) { SFX.no(); say(Math.hypot(x + pf.w / 2 - player.x, y + pf.h / 2 - player.y) > REACH + pf.w / 2 ? '太遠了，走近一點' : '那裡放不下'); return; }
  const d = fx ? FIX[k] : BLD[k];
  if (!fx) pay(BLD[k].cost);
  // 既有設施是整棟搬過來的，不需要重蓋，所以直接完工
  buildings.push({ key: k, x, y, lv: 1, prog: fx ? 1 : 0, fixed: fx, crop: (!fx && k === 'farm') ? 0 : null, grow: 0 });
  /* 只有農地會翻土。一般建築不改地表——原本會把佔地整片鋪成 dirt，
     結果每棟腳下都拖著一塊突兀的土色方塊。建築本身就有接地陰影，不需要那個。 */
  if (!fx && k === 'farm')
    for (let dx = 0; dx < pf.w; dx++) for (let dy = 0; dy < pf.h; dy++)
      terrain.set(key(x + dx, y + dy), 'tilled');
  player.carry = null; player.carryFix = false;
  SFX.place(); emit(x + pf.w / 2, y + pf.h / 2, 'dust', 10);
  say(fx ? `${d.n} 已就位。` : `${d.n} 已下樁。工程隊過來了。`);
}
/* The scene IS the base panel now: whatever stands here, at whatever level, is
   what the rest of the game reads for HP, energy, card values and daily yield. */
function syncLevels() {
  const lv = { teahouse: 0, workshop: 0, meditation: 0, lab: 0, tower: 0, retrans: 0, farm: 0 };
  buildings.forEach(b => {
    if (b.fixed || b.prog < 1) return;          // still scaffolded = not working yet
    lv[b.key] = Math.max(lv[b.key] || 0, b.lv);
  });
  HOST.setLevels(lv);
}

function upgrade(b) {
  const c = upCost(b.key, b.lv);
  if (b.lv >= 3) { SFX.no(); return; }
  if (!afford(c)) { SFX.no(); return; }
  pay(c); b.lv++; b.prog = 0;
  SFX.ok(); say(`${BLD[b.key].n} 擴建至 Lv${b.lv}`);
}
/* 搬移一律免費、全額退——規劃層要慷慨可反悔。
   協會設施（工程車／實驗室載具／倉庫）拆不得，但沒有理由不准你換位置：
   那是你的基地，該由你決定東西擺哪裡。 */
function relocate(b) {
  if (!b.fixed) give(BLD[b.key].cost);
  const d = (b.fixed ? FIX : BLD)[b.key];
  clearTiles(b); buildings.splice(buildings.indexOf(b), 1);
  player.carry = b.key; player.carryFix = !!b.fixed; selected = null;
  SFX.pick(); say(`把${d.n}抱起來了。放哪都行。`);
}
function demolish(b) {
  give({ s: BLD[b.key].cost.s * b.lv, p: BLD[b.key].cost.p * b.lv });
  clearTiles(b); buildings.splice(buildings.indexOf(b), 1);
  selected = null; SFX.coin(); emit(b.x + foot(b.key).w / 2, b.y + foot(b.key).h / 2, 'dust', 14);
  say(`${BLD[b.key].n}拆了，資源全數退回。`);
}
function clearTiles(b) {
  if (b.key !== 'farm') return;      // 只有農地翻過土，其他建築沒動過地表就別亂刷
  const cf = foot(b.key);
  for (let dx = 0; dx < cf.w; dx++) for (let dy = 0; dy < cf.h; dy++) terrain.set(key(b.x + dx, b.y + dy), 'grass');
}
function buyModule(m) {
  if (!afford(MODULE_COST)) { SFX.no(); say('拓展地塊的資源不足'); return; }
  pay(MODULE_COST); owned.add(m.k); paintModule(m.mx, m.my);
  SFX.ok(); say('地塊拓展完成。基地變大了。');
}
function harvest(b) {
  give({ s: 14, p: 4 }); b.crop = 0; b.grow = 0;
  SFX.coin(); emit(b.x + foot(b.key).w / 2, b.y + foot(b.key).h / 2, 'spark', 12);
  say('收成了。');
}

/* ══════════════════════════════════════════════════════════════════
   12 · 輸入
   ══════════════════════════════════════════════════════════════════ */
const keys = {};
addEventListener('keydown', e => {
  if (!sceneOpen) return;
  keys[e.key.toLowerCase()] = true;
  if (e.key === 'Escape') {
    // ESC cancels whatever is in your hands first; with empty hands it is the
    // way out of the base, so the player never has to hunt for a close button
    if (player.carry || selected || rackOpen) {
      player.carry = null; player.carryFix = false; selected = null; rackOpen = false; SFX.ui();
    } else { SFX.ui(); HOST.exit(); return; }
  }
  if (e.key.toLowerCase() === 'f') toggleFullscreen();
  if (e.key.toLowerCase() === 't') timeScale = timeScale > 1 ? 1 / 9 : 4;
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

function screenToWorld(cx, cy) {
  const r = wrap.getBoundingClientRect();
  const vx = (cx - r.left) / scale, vy = (cy - r.top) / scale;
  return { x: (vx + cam.x) / TS, y: (vy + cam.y) / TS };
}
overlay.addEventListener('mousemove', e => {
  if (!sceneOpen) return;
  const w = screenToWorld(e.clientX, e.clientY);
  hoverT = { x: Math.floor(w.x), y: Math.floor(w.y) };
  rackHoverKey = rackOpen ? rackHit(e.clientX, e.clientY) : null;
});
overlay.addEventListener('mousedown', e => {
  if (!sceneOpen) return;
  initAudio();
  const w = screenToWorld(e.clientX, e.clientY);
  const tx = Math.floor(w.x), ty = Math.floor(w.y);

  // 指令永遠最優先：型錄上的「搬移工程車」也是靠這條路走的
  const cmd = panelHit(e.clientX, e.clientY);
  if (cmd) { runCmd(cmd); return; }
  if (rackOpen) {
    const hit = rackHit(e.clientX, e.clientY);
    if (hit) { takeModel(hit); return; }
    if (rackBox && inBox(e.clientX, e.clientY, rackBox)) return;   // 面板空白處吃掉點擊
  }

  if (player.carry) { place(tx, ty); return; }        // 手上有模型 → 放下
  const b = bAt(tx, ty);
  if (b && b.key === 'labcar') {
    const lf = foot(b.key);
    if (Math.hypot(b.x + lf.w / 2 - player.x, b.y + lf.h / 2 - player.y) > REACH + lf.w / 2) {
      say('走到載具旁才進得去'); SFX.no(); return;
    }
    selected = null; rackOpen = false; SFX.ui();
    say('回到載具裡。');
    HOST.enterLab();
    return;
  }
  if (b && b.key === 'truck') {
    const tf = foot(b.key);
    if (Math.hypot(b.x + tf.w / 2 - player.x, b.y + tf.h / 2 - player.y) > REACH + tf.w / 2) { say('走到工程車旁才拿得到模型'); SFX.no(); return; }
    rackOpen = !rackOpen; selected = null; SFX.ui(); return;
  }
  if (b) {
    if (!b.fixed && b.key === 'farm' && b.crop === 3) { harvest(b); return; }
    selected = b; rackOpen = false; SFX.ui(); return;   // 協會設施也開讀數，只是指令較少
  }
  // 拓展地塊
  const m = expandable().find(mm => mm.mx === Math.floor(tx / MOD) && mm.my === Math.floor(ty / MOD));
  if (m && !isGround(tx, ty)) { buyModule(m); return; }
  selected = null; rackOpen = false;
});
function inBox(cx, cy, b) {
  const { x, y } = toUI(cx, cy);
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}
function runCmd(c) {
  if (c === 'movetruck') {                       // 型錄上的指令，不依賴 selected
    const tr = buildings.find(b => b.key === 'truck');
    if (tr) { rackOpen = false; relocate(tr); }
    return;
  }
  if (!selected) return;
  if (c === 'up') { if (!selected.fixed) upgrade(selected); }
  else if (c === 'move') relocate(selected);
  else if (c === 'del') { if (!selected.fixed) demolish(selected); }   // 協會設施拆不得
}

/* ══════════════════════════════════════════════════════════════════
   13 · 更新
   ══════════════════════════════════════════════════════════════════ */
const cam = { x: 0, y: 0 };
let stepT = 0;

function update(dt) {
  tSec += dt;
  clock = (clock + dt * timeScale) % 24;

  /* — 玩家 — */
  let ax = 0, ay = 0;
  if (keys['a'] || keys['arrowleft']) ax -= 1;
  if (keys['d'] || keys['arrowright']) ax += 1;
  if (keys['w'] || keys['arrowup']) ay -= 1;
  if (keys['s'] || keys['arrowdown']) ay += 1;
  const len = Math.hypot(ax, ay) || 1;
  const SPD = 4.1;
  const nx = player.x + ax / len * SPD * dt, ny = player.y + ay / len * SPD * dt;
  if (ax || ay) {
    if (!blocked(Math.floor(nx), Math.floor(player.y))) player.x = nx;
    if (!blocked(Math.floor(player.x), Math.floor(ny))) player.y = ny;
    player.dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
    player.moving = true;
    player.anim += dt * 8.4;
    stepT -= dt;
    if (stepT <= 0) { SFX.step(); stepT = 0.30; }
  } else { player.moving = false; player.anim = 0; }

  /* — NPC — */
  npcs.forEach(a => {
    if (a.say) { a.say.left -= dt; if (a.say.left <= 0) a.say = null; }
    // 一次只有一個人開口——兩顆對話框同時飄在畫面上會變成雜訊
    else if (!npcs.some(o => o.say) && Math.random() < dt * 0.07) speak(a, a.job ? 'work' : null);

    if (!a.job) {
      const j = buildings.find(b => !b.fixed && b.prog < 1 && !npcs.some(o => o.job === b));
      if (j) { const p = pathNear(a.x, a.y, j.x, j.y, foot(j.key)); if (p) { a.job = j; a.path = p; } }
    }
    if (a.job && !buildings.includes(a.job)) { a.job = null; a.path = []; }

    if (a.path.length) {
      const t = a.path[0], dx = t.x - a.x, dy = t.y - a.y, d = Math.hypot(dx, dy);
      a.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      const sp = 3.0 * dt;
      if (d <= sp) { a.x = t.x; a.y = t.y; a.path.shift(); }
      else { a.x += dx / d * sp; a.y += dy / d * sp; }
      a.anim += dt * 7;
    } else if (a.job) {
      a.dir = a.job.y + 1 < a.y ? 'up' : 'down';
      a.anim = 0;
      a.job.prog = Math.min(1, a.job.prog + dt / 3.2);
      const jf = foot(a.job.key);
      if (Math.random() < dt * 5) { SFX.build(); emit(a.job.x + jf.w / 2, a.job.y + jf.h - 0.5, 'spark', 2); }
      if (a.job.prog >= 1) { SFX.ok(); emit(a.job.x + jf.w / 2, a.job.y + jf.h / 2, 'dust', 16); a.job = null; }
    } else {
      a.anim = 0;
      a.wait -= dt;
      if (a.wait <= 0) {
        a.wait = 2 + Math.random() * 4;
        const tx = (a.x + (Math.random() * 8 - 4)) | 0, ty = (a.y + (Math.random() * 8 - 4)) | 0;
        if (!blocked(tx, ty)) { const p = findPath(a.x, a.y, tx, ty); if (p) a.path = p; }
      }
    }
  });

  /* — 建築生活感 — */
  buildings.forEach(b => {
    if (b.prog < 1) return;
    if (b.key === 'teahouse' || b.key === 'workshop' || b.key === 'retrans') {
      if (Math.random() < dt * (b.key === 'retrans' ? 5 : 2.4)) {
        const cx = b.x + foot(b.key).w * (b.key === 'workshop' ? 0.22 : b.key === 'retrans' ? 0.18 : 0.72);
        emit(cx, b.y - 0.35 - b.lv * 0.25, 'smoke', 1);
      }
    }
    if (b.key === 'farm') {
      b.grow += dt * 0.06;
      b.crop = clamp(Math.floor(b.grow), 0, 3);
    }
  });

  /* — 夜間螢火 — */
  // 只在夠暗的時候才生：天快亮了就該停產，讓族群自然稀疏，而不是等天亮再一次清掉
  if (night() > 0.62 && parts.length < 180) {
    if (Math.random() < dt * 1.6)
      emit(player.x + (Math.random() * 14 - 7), player.y + (Math.random() * 10 - 5), 'fly', 1);
    // 農地上方聚集得更密：田裡該有的光是螢火，不是窗燈
    buildings.forEach(b => {
      if (b.key !== 'farm' || b.prog < 1) return;
      if (Math.random() < dt * 3.2)
        emit(b.x + Math.random() * foot(b.key).w, b.y + Math.random() * foot(b.key).h, 'fly', 1);
    });
  }
  stepParts(dt);
  if (toast) { toast.left -= dt; if (toast.left <= 0) toast = null; }

  /* — 相機：跟隨 + 死區 + 整數對齊（避免像素抖動） — */
  const tcx = player.x * TS - VW / 2, tcy = player.y * TS - VH / 2 - 8;
  cam.x = lerp(cam.x, tcx, Math.min(1, dt * 4.5));
  cam.y = lerp(cam.y, tcy, Math.min(1, dt * 4.5));
  if (ambGain) ambGain.gain.value = 0.035 + night() * 0.03;
}

/* 0 = 白天，1 = 深夜 */
function night() {
  const h = clock;
  if (h >= 7 && h < 17) return 0;
  if (h >= 17 && h < 20) return (h - 17) / 3;
  if (h >= 20 || h < 4.5) return 1;
  return 1 - (h - 4.5) / 2.5;
}
/* 回傳「要乘上去的顏色」與強度。乘法才會真的變暗——加法只會把畫面洗白。 */
function skyTint() {
  const h = clock, n = night();
  if (h >= 16.5 && h < 19.5) { const t = (h - 16.5) / 3; return { c: mix('#ff6a2c', '#0e1740', t), a: lerp(.34, .72, t) }; }
  if (h >= 4.5 && h < 7.5) { const t = (h - 4.5) / 3; return { c: mix('#20255c', '#ffb9d0', t), a: lerp(.70, .14, t) }; }
  if (n > 0.5) return { c: '#0e1740', a: .78 };                            // 深夜
  return { c: '#fff4d8', a: .10 };                                          // 白天：僅暖色調校
}

/* ══════════════════════════════════════════════════════════════════
   14 · 繪製
   ══════════════════════════════════════════════════════════════════ */
const light = bake(VW, VH, () => { });
const LG = light.getContext('2d');
const glowBuf = bake(VW, VH, () => { });  // 加色光層，合成前會把角色剪影挖掉
const GG = glowBuf.getContext('2d');

/* 每幀的光照強度。邊緣光白天偏暖、夜裡轉冷月光；自發光只在天暗後出現。 */
let rimWarmA = 0, rimCoolA = 0, emisA = 0;
const propRimCache = {};
function propRim(k) {
  if (!propRimCache[k]) propRimCache[k] = extractRim(PROP[k], 'rgba(255,226,170,0.8)');
  return propRimCache[k];
}

function draw() {
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const nn = night();
  rimWarmA = nn < .55 ? 0.50 - nn * 0.62 : 0.03;
  rimCoolA = clamp((nn - .25) / .75, 0, 1) * 0.42;
  emisA = clamp((nn - .10) / .45, 0, 1);
  W.fillStyle = P.void; W.fillRect(0, 0, VW, VH);

  const t0x = Math.floor(cx / TS) - 1, t1x = Math.ceil((cx + VW) / TS) + 1;
  const t0y = Math.floor(cy / TS) - 1, t1y = Math.ceil((cy + VH) / TS) + 2;

  /* — 地塊落影 — */
  W.fillStyle = 'rgba(0,0,0,0.55)';
  owned.forEach(k => {
    const [mx, my] = k.split(',').map(Number);
    W.fillRect(mx * MOD * TS - cx + 3, my * MOD * TS - cy + 5, MOD * TS, MOD * TS + 6);
  });

  /* — 地形 — */
  const wf = anim(TILE.water, tSec * 3.5);
  const wasteProps = [], decorTall = [], actorDraws = [];
  for (let y = t0y; y <= t1y; y++) for (let x = t0x; x <= t1x; x++) {
    if (!isGround(x, y)) {                       // 基地之外的荒原
      W.drawImage(TILE.waste[(rnd2(x, y, 71) * 4) | 0], x * TS - cx, y * TS - cy);
      // 荒原的點綴要稀疏：太密會變成壁紙，反過來跟基地搶注意力
      const r = rnd2(x, y, 83);
      if (r > 0.982) wasteProps.push({ k: 'deadtree', x: x + .5, y: y + .9 });
      else if (r > 0.957) wasteProps.push({ k: 'rubble', x: x + .5, y: y + .8 });
      continue;
    }
    const t = terrain.get(key(x, y)) || 'grass';
    const sx = x * TS - cx, sy = y * TS - cy;
    let img;
    if (t === 'water') img = wf;
    else if (t === 'path') img = TILE.path[(rnd2(x, y, 2) * 3) | 0];
    else if (t === 'dirt') img = TILE.dirt[(rnd2(x, y, 4) * 3) | 0];
    else if (t === 'tilled') img = TILE.tilled[(rnd2(x, y, 6) * 3) | 0];
    else img = TILE.grass[(rnd2(x, y, 1) * 4) | 0];
    W.drawImage(img, sx, sy);
    // 水岸暗邊
    if (t === 'water') {
      if (terrain.get(key(x, y - 1)) !== 'water') { W.fillStyle = 'rgba(0,0,0,.30)'; W.fillRect(sx, sy, TS, 3); }
    }
    /* 收邊：基地是一塊比荒原高的台地。上緣受光、側緣落影、下緣露出土層斷面。
       少了這一圈，草皮會像被裁刀切出來的貼圖。 */
    if (!isGround(x, y + 1)) W.drawImage(TILE.edge, sx, sy + TS);
    if (!isGround(x, y - 1)) { rc(W, sx, sy, TS, 1, 'rgba(255,244,216,.22)'); rc(W, sx, sy + 1, TS, 1, 'rgba(0,0,0,.18)'); }
    if (!isGround(x - 1, y)) rc(W, sx, sy, 1, TS, 'rgba(0,0,0,.42)');
    if (!isGround(x + 1, y)) rc(W, sx + TS - 1, sy, 1, TS, 'rgba(0,0,0,.42)');

    // 中景層：平面的鋪在地上，有高度的丟進 y 排序
    const dec = decorAt(x, y);
    if (dec) {
      if (dec.flat) W.drawImage(dec.flat, sx, sy);
      if (dec.tall) decorTall.push({ k: dec.tall, x: x + .5, y: y + .85 });
    }
  }

  /* — 可拓展的地塊 —
     只插協會的測量樁，不畫整圈虛線框：滿畫面的虛線讀起來像除錯輔助線，
     會瞬間毀掉「這是一款遊戲」的錯覺。虛線與價目只在滑鼠指著那一塊時才出現。 */
  hoverMod = null;
  expandable().forEach(m => {
    const x0 = m.mx * MOD * TS - cx, y0 = m.my * MOD * TS - cy, S = MOD * TS;
    if (x0 > VW || y0 > VH || x0 + S < 0 || y0 + S < 0) return;
    const hot = hoverT && Math.floor(hoverT.x / MOD) === m.mx && Math.floor(hoverT.y / MOD) === m.my;
    if (hot) hoverMod = m;
    // 樁只插在與基地相接的那一側，指向「可以從這裡接出去」
    for (let i = 0; i < 4; i++) {
      const sx = x0 + 4 + (i % 2) * (S - 9), sy = y0 + 6 + ((i > 1) ? 1 : 0) * (S - 13);
      W.globalAlpha = hot ? 1 : .5;
      rc(W, sx, sy, 2, 7, '#5c4530'); rc(W, sx, sy, 1, 7, '#87643c');
      rc(W, sx - 2, sy - 3, 6, 3, hot ? '#ffd23f' : '#a8801a');
      W.globalAlpha = 1;
    }
    if (hot) {
      W.save();
      W.strokeStyle = afford(MODULE_COST) ? 'rgba(255,210,63,.75)' : 'rgba(255,95,86,.6)';
      W.lineWidth = 1; W.setLineDash([5, 4]); W.lineDashOffset = -tSec * 8;
      W.strokeRect(x0 + .5, y0 + .5, S - 1, S - 1);
      W.restore();
      W.fillStyle = 'rgba(255,210,63,.07)'; W.fillRect(x0, y0, S, S);
    }
  });

  /* — 放置預覽 — */
  if (player.carry && hoverT) {
    const ok = canPlace(hoverT.x, hoverT.y);
    const sx = hoverT.x * TS - cx, sy = hoverT.y * TS - cy;
    W.save();
    W.globalAlpha = 0.5;
    const img = buildingSprite(player.carry, 1, player.carryFix);
    const pvf = foot(player.carry);
    W.drawImage(img, sx + (TS * pvf.w - img.width) / 2, sy + TS * pvf.h - img.height + 2);
    W.restore();
    W.strokeStyle = ok ? 'rgba(111,240,232,.9)' : 'rgba(255,95,86,.9)';
    W.lineWidth = 1; W.strokeRect(sx + .5, sy + .5, TS * pvf.w - 1, TS * pvf.h - 1);
    W.fillStyle = ok ? 'rgba(111,240,232,.14)' : 'rgba(255,95,86,.14)';
    W.fillRect(sx, sy, TS * pvf.w, TS * pvf.h);
  }

  /* — 作物（畫在地上，不參與 y 排序） — */
  buildings.forEach(b => {
    if (b.key !== 'farm' || b.prog < 1) return;
    const ff = foot(b.key);
    for (let dx = 0; dx < ff.w; dx++) for (let dy = 0; dy < ff.h; dy++)
      W.drawImage(CROP[b.crop], b.x * TS + dx * TS - cx, b.y * TS + dy * TS - cy);
    if (b.crop === 3) {
      // 可收成的脈動標記。原本漏減相機的 X 位移，導致它畫在世界座標上，
      // 會隨鏡頭移動而憑空出現在畫面各處，看起來像一群亂閃的光點。
      W.globalAlpha = .55 + Math.sin(tSec * 3) * .25;
      W.fillStyle = '#ffd23f';
      W.fillRect(b.x * TS + TS * ff.w / 2 - 1 - cx, b.y * TS - 6 - cy, 2, 2);
      W.globalAlpha = 1;
    }
  });

  /* — y 排序的實體 — */
  const ents = [];
  buildings.forEach(b => { if (b.key !== 'farm') ents.push({ y: (b.y + foot(b.key).h) * TS, kind: 'b', b }); });
  props.forEach(p => ents.push({ y: p.y * TS, kind: 'p', p }));
  wasteProps.forEach(p => ents.push({ y: p.y * TS, kind: 'p', p }));
  decorTall.forEach(p => ents.push({ y: p.y * TS, kind: 'p', p }));
  ents.push({ y: player.y * TS, kind: 'a', a: player });
  npcs.forEach(a => ents.push({ y: a.y * TS, kind: 'a', a }));
  ents.sort((u, v) => u.y - v.y);

  ents.forEach(e => {
    if (e.kind === 'b') {
      const b = e.b, sx = b.x * TS - cx, sy = b.y * TS - cy;
      const img = buildingSprite(b.key, b.lv, b.fixed);
      const bf = foot(b.key);
      const ix = sx + (TS * bf.w - img.width) / 2;
      // 接地陰影：核心壓在牆腳，把建築「種」進地面
      W.drawImage(CONTACT, sx + 2, sy + TS * bf.h - 8, TS * bf.w - 4, 11);
      if (b.prog < 1) {                                  // 施工中：鷹架 + 逐步升起
        const hh = Math.max(3, Math.round(img.height * Math.max(.12, b.prog)));
        W.drawImage(img, 0, img.height - hh, img.width, hh, ix, sy + TS * bf.h - hh + 2, img.width, hh);
        W.globalAlpha = .85;
        const scW = img.width + 6, scH = img.height + 4;
        drawScaffold(Math.round(ix - 3), Math.round(sy + TS * bf.h - scH + 2), scW, scH);
        W.globalAlpha = 1;
      } else {
        const iy = sy + TS * bf.h - img.height + 2;
        W.drawImage(img, ix, iy);
        /* 邊緣光：把形體從背景剝出來。白天偏暖，夜裡轉成冷月光。
           成品美術回傳 null（它自己就有光照），這裡整段跳過。 */
        const rw = rimWarmA > .02 ? rimSprite(b.key, b.lv, b.fixed, true) : null;
        const rc_ = rimCoolA > .02 ? rimSprite(b.key, b.lv, b.fixed, false) : null;
        if (rw || rc_) {
          W.globalCompositeOperation = 'lighter';
          if (rw) { W.globalAlpha = rimWarmA; W.drawImage(rw, ix, iy); }
          if (rc_) { W.globalAlpha = rimCoolA; W.drawImage(rc_, ix, iy); }
          W.globalAlpha = 1; W.globalCompositeOperation = 'source-over';
        }
      }
      if (selected === b) {
        W.strokeStyle = 'rgba(255,210,63,.85)'; W.lineWidth = 1;
        W.strokeRect(sx + .5, sy + .5, TS * bf.w - 1, TS * bf.h - 1);
      }
    } else if (e.kind === 'p') {
      const img = PROP[e.p.k], sx = e.p.x * TS - cx, sy = e.p.y * TS - cy;
      if (!img) return;
      if (e.p.k === 'tree' || e.p.k === 'deadtree') W.drawImage(CONTACT, sx - 11, sy - 5, 22, 7);
      const px0 = Math.round(sx - img.width / 2), py0 = Math.round(sy - img.height + 3);
      W.drawImage(img, px0, py0);
      if (rimWarmA > .02 && (e.p.k === 'tree' || e.p.k === 'rock' || e.p.k === 'shrub')) {
        W.globalCompositeOperation = 'lighter'; W.globalAlpha = rimWarmA * .5;
        W.drawImage(propRim(e.p.k), px0, py0);
        W.globalAlpha = 1; W.globalCompositeOperation = 'source-over';
      }
    } else {
      const a = e.a, sx = Math.round(a.x * TS - cx), sy = Math.round(a.y * TS - cy);
      W.drawImage(SHADOW, sx - 8, sy - 3, 16, 7);
      const fr = (a === player ? player.moving : a.path && a.path.length) ? (Math.floor(a.anim) % 4) : 0;
      const bob = (a === player && !player.moving) ? (Math.sin(tSec * 2.2) > .6 ? 1 : 0) : 0;
      const spr = actorSprite(a.palKey, a.pal, a.dir, fr);
      W.drawImage(spr, sx - 8, sy - 21 + bob);
      actorDraws.push({ img: spr, x: sx - 8, y: sy - 21 + bob });   // 光層要照這個剪影挖洞
      if (a === player && player.carry) {                // 抱在手上的模型
        const m = buildingSprite(player.carry, 1, player.carryFix);
        W.save(); W.globalAlpha = .95;
        const ms = 18 / m.height;                        // 抱在手上的模型固定約 18px 高
        W.drawImage(m, 0, 0, m.width, m.height, sx - m.width * ms / 2, sy - 26, m.width * ms, m.height * ms);
        W.restore();
      }
    }
  });

  /* — 粒子 — */
  parts.forEach(p => {
    const sx = Math.round(p.x * TS - cx), sy = Math.round(p.y * TS - cy);
    const k = 1 - p.t / p.life;
    if (p.type === 'smoke') {
      W.globalAlpha = k * .38;
      W.fillStyle = '#cfc6e0';
      const r = 1 + (1 - k) * 3;
      W.fillRect(sx - r, sy - r, r * 2, r * 2);
    } else if (p.type === 'fly') {
      // 亮度直接綁在夜色上：白天的螢火本來就看不見，不該是全亮的閃爍點
      W.globalAlpha = (.4 + Math.sin(p.t * 6 + p.r * 9) * .5) * k * nn * nn;
      W.fillStyle = '#d9ff8f'; W.fillRect(sx, sy, 1, 1);
    } else if (p.type === 'spark') {
      W.globalAlpha = k; W.fillStyle = '#ffd23f'; W.fillRect(sx, sy, 1, 1);
    } else {
      W.globalAlpha = k * .6; W.fillStyle = '#a99b86'; W.fillRect(sx, sy, 2, 2);
    }
    W.globalAlpha = 1;
  });

  /* — 光照：夜幕 + 挖洞 + 加色光暈 — */
  const n = night(), tint = skyTint();
  {
    /* 調色層整片不透明，光源用 destination-out 打洞；再以 multiply 疊上去。
       打過洞的地方變透明 → multiply 不動底色 → 那就是「被照亮」。 */
    LG.globalCompositeOperation = 'source-over';
    LG.clearRect(0, 0, VW, VH);
    LG.fillStyle = mix('#ffffff', tint.c, tint.a);
    LG.fillRect(0, 0, VW, VH);
    if (n > 0.08) {
      LG.globalCompositeOperation = 'destination-out';
      const lights = [];
      buildings.forEach(b => {
        if (b.prog < 1) return;
        // 農地只留一點微光讓作物看得見，不像有人住的屋子那樣把夜色挖開
        const lf = foot(b.key);
        lights.push([b.x * TS + TS * lf.w / 2 - cx, b.y * TS + TS * lf.h / 2 - cy,
                     b.key === 'farm' ? 26 : 34 + lf.w * 6]);
      });
      lights.push([player.x * TS - cx, player.y * TS - 10 - cy, 34]);
      lights.forEach(([lx, ly, lr]) => {
        const g = LG.createRadialGradient(lx, ly, 0, lx, ly, lr);
        g.addColorStop(0, `rgba(0,0,0,${0.88 * n})`);
        g.addColorStop(0.55, `rgba(0,0,0,${0.42 * n})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        LG.fillStyle = g; LG.beginPath(); LG.arc(lx, ly, lr, 0, 6.284); LG.fill();
      });
      LG.globalCompositeOperation = 'source-over';
    }
    W.globalCompositeOperation = 'multiply';
    W.drawImage(light, 0, 0);
    W.globalCompositeOperation = 'source-over';
    /* 暖色人工光：窗與爐自己發亮，再往地面潑一攤光池。
       光源在畫面裡有實體位置，氛圍才立得住——單純把整體調亮不會有這個效果。 */
    if (emisA > 0.02) {
      /* 加色光先畫進獨立的光層，最後才合成——中間要把角色剪影挖掉。
         直接畫在畫面上會蓋過站在屋前的角色，把人洗成一團亮斑。
         正確的觀感是：人擋在光源前面時應該被光「勾邊」，而不是被光穿透。 */
      GG.globalCompositeOperation = 'source-over';
      GG.clearRect(0, 0, VW, VH);
      GG.globalCompositeOperation = 'lighter';
      buildings.forEach(b => {
        // 農地沒有窗也沒有門，不該在夜裡透出屋內的燈——它的光來自螢火
        if (b.prog < 1 || b.key === 'farm') return;
        const d = (b.fixed ? FIX : BLD)[b.key];
        const img = buildingSprite(b.key, b.lv, b.fixed);
        const ef = foot(b.key);
        const ix = b.x * TS - cx + (TS * ef.w - img.width) / 2;
        const iy = b.y * TS - cy + TS * ef.h - img.height + 2;
        const lx = b.x * TS + TS * ef.w / 2 - cx, ly = b.y * TS + TS * ef.h - cy - 3;
        if (lx < -80 || lx > VW + 80) return;
        const rgb = hex(d.glow).join(',');

        // 地面光池：壓扁的橢圓，貼著地面鋪開
        GG.save();
        GG.translate(lx, ly); GG.scale(1, 0.40); GG.translate(-lx, -ly);
        const gp = GG.createRadialGradient(lx, ly, 0, lx, ly, 34 + b.lv * 7);
        gp.addColorStop(0, `rgba(${rgb},${0.30 * emisA})`);
        gp.addColorStop(1, 'rgba(0,0,0,0)');
        GG.fillStyle = gp; GG.fillRect(lx - 48, ly - 48, 96, 96);
        GG.restore();

        // 空氣中的光暈
        const gh = GG.createRadialGradient(lx, iy + img.height * .55, 0, lx, iy + img.height * .55, 26 + b.lv * 6);
        gh.addColorStop(0, `rgba(${rgb},${0.16 * emisA})`);
        gh.addColorStop(1, 'rgba(0,0,0,0)');
        GG.fillStyle = gh; GG.fillRect(lx - 40, iy - 10, 80, img.height + 40);

        // 窗格與爐口本身：亮到過曝
        GG.globalAlpha = emisA;
        GG.drawImage(emisSprite(b.key, b.lv, b.fixed), ix, iy);
        GG.globalAlpha = 1;
      });
      // 角色剪影：從光層挖掉，光就不會蓋在人身上
      GG.globalCompositeOperation = 'destination-out';
      actorDraws.forEach(a => GG.drawImage(a.img, a.x, a.y));
      GG.globalCompositeOperation = 'source-over';

      W.globalCompositeOperation = 'lighter';
      W.drawImage(glowBuf, 0, 0);
      W.globalCompositeOperation = 'source-over';
    }
  }

  /* — 住民說話（低解析層只畫定位點，字在 overlay 畫） — */
}

/* ══════════════════════════════════════════════════════════════════
   15 · 外殼：觀測終端（原生解析度，磷光單色）
   ══════════════════════════════════════════════════════════════════ */
const FG = '#7ef0a8', DIM = '#5f9c78', BRIGHT = '#d8ffe8', GOLD = '#ffd23f', CYAN = '#3fe6e0', DANGER = '#ff5f56';
const MONO = 'ui-monospace, "Cascadia Mono", "Noto Sans TC", monospace';
const SANS = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
let rackBox = null, panelBtns = [], rackHoverKey = null;

function glow(col, blur) { O.shadowColor = col; O.shadowBlur = blur == null ? 6 : blur; }
function noGlow() { O.shadowBlur = 0; }

/* 角落方括號，不畫完整外框 */
function brackets(x, y, w, h, col) {
  O.strokeStyle = col; O.lineWidth = 1; const L = 6;
  [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([bx, by, sx, sy]) => {
    O.beginPath();
    O.moveTo(bx + sx * L, by + .5 * sy); O.lineTo(bx + .5 * sx, by + .5 * sy); O.lineTo(bx + .5 * sx, by + sy * L);
    O.stroke();
  });
}
function plate(x, y, w, h) {
  O.fillStyle = 'rgba(6,10,8,0.88)'; O.fillRect(x, y, w, h);
  O.strokeStyle = 'rgba(30,59,44,0.9)'; O.lineWidth = 1; O.strokeRect(x + .5, y + .5, w - 1, h - 1);
  brackets(x, y, w, h, FG);
}
/* 讀數列：標籤 ······ 數值 */
function field(x, y, w, label, val, col) {
  O.font = `11px ${MONO}`; O.textBaseline = 'middle'; O.textAlign = 'left';
  O.fillStyle = DIM; O.fillText(label, x, y);
  O.textAlign = 'right'; glow(col || GOLD, 5); O.fillStyle = col || GOLD;
  O.fillText(String(val), x + w, y); noGlow();
  const lw = O.measureText(String(val)).width;
  O.textAlign = 'left'; O.fillStyle = 'rgba(95,156,120,.45)';
  const a = x + O.measureText(label).width + 4, b = x + w - lw - 4;
  for (let i = a; i < b; i += 3) O.fillRect(i, y, 1, 1);
}

function drawOverlay() {
  O.setTransform(dpr, 0, 0, dpr, 0, 0);
  O.clearRect(0, 0, dispW, dispH);
  O.setTransform(dpr * UU, 0, 0, dpr * UU, 0, 0);   // 之後全部以 UI 單位作業
  const S = scale / UU;                              // 世界像素 → UI 單位
  panelBtns = []; rackBox = null;

  /* ── 左上：協會讀數 ── */
  const pw = 150, ph = 74;
  plate(10, 10, pw, ph);
  O.textAlign = 'left'; O.font = `10px ${MONO}`;
  glow(FG, 6); O.fillStyle = FG; O.fillText('▚ 基地 · 物資結存', 18, 24); noGlow();
  field(18, 40, pw - 16, '物資', res.s);
  field(18, 53, pw - 16, '零件', res.p);
  field(18, 66, pw - 16, '神髓', res.e, CYAN);
  field(18, 79, pw - 16, '基地時刻', `${String(Math.floor(clock)).padStart(2, '0')}:${String(Math.floor(clock % 1 * 60)).padStart(2, '0')}`, night() > .5 ? CYAN : GOLD);

  /* ── 住民對白：一般字體、無圓角泡泡、只有描邊發光 ── */
  [player, ...npcs].forEach(a => {
    if (!a.say) return;
    const sx = (a.x * TS - Math.round(cam.x)) * S, sy = (a.y * TS - Math.round(cam.y)) * S;
    if (sx < 0 || sx > OW) return;
    O.font = `13px ${SANS}`; O.textAlign = 'center'; O.textBaseline = 'bottom';
    const y = sy - 21 * S - 5;
    O.lineWidth = 3; O.strokeStyle = 'rgba(6,10,8,.92)';
    O.strokeText(a.say.t, sx, y);
    O.fillStyle = BRIGHT; glow('rgba(216,255,232,.35)', 5);
    O.fillText(a.say.t, sx, y); noGlow();
    O.fillStyle = 'rgba(216,255,232,.5)';
    O.fillRect(sx - 1, y + 3, 2, 4);
  });

  /* ── 工程車型錄 ──
     不再貼在車子上方（會被推到螢幕邊緣、還會擋住基地）。改成畫面正中央的
     一份型錄：上排是待運模型，下方是指著的那一項的完整說明。 */
  if (rackOpen) {
    const cw = 74, gap = 6, cardH = 60;
    const w = RACK.length * (cw + gap) - gap + 24, h = 172;
    const x = Math.round((OW - w) / 2), y = Math.round((OH - h) / 2 + 8);
    rackBox = { x, y, w, h };
    plate(x, y, w, h);

    O.textBaseline = 'alphabetic'; O.textAlign = 'left';
    O.font = `13px ${MONO}`; glow(GOLD, 7);
    O.fillStyle = GOLD; O.fillText('▚ 協會工程車 · 待運模型型錄', x + 12, y + 22); noGlow();
    O.textAlign = 'right'; O.font = `11px ${MONO}`; O.fillStyle = DIM;
    O.fillText(`結存　物資 ${res.s}　零件 ${res.p}`, x + w - 12, y + 22);

    RACK.forEach((k, i) => {
      const d = BLD[k], ok = afford(d.cost), hot = rackHoverKey === k;
      const cxp = x + 12 + i * (cw + gap), cyp = y + 32;
      O.fillStyle = hot ? 'rgba(30,59,44,.98)' : ok ? 'rgba(18,32,26,.95)' : 'rgba(12,20,16,.7)';
      O.fillRect(cxp, cyp, cw, cardH);
      O.strokeStyle = hot ? FG : ok ? 'rgba(126,240,168,.5)' : 'rgba(30,59,44,.8)';
      O.lineWidth = hot ? 1.5 : 1;
      O.strokeRect(cxp + .5, cyp + .5, cw - 1, cardH - 1);
      const img = buildingSprite(k, 1, false);
      const s2 = Math.min(1.0, 34 / img.height);
      O.globalAlpha = ok ? 1 : .3; O.imageSmoothingEnabled = false;
      O.drawImage(img, Math.round(cxp + cw / 2 - img.width * s2 / 2), cyp + 4, img.width * s2, img.height * s2);
      O.globalAlpha = 1;
      O.textAlign = 'center'; O.font = `12px ${MONO}`;
      O.fillStyle = ok ? (hot ? FG : BRIGHT) : DIM;
      O.fillText(d.n, cxp + cw / 2, cyp + cardH - 16);
      O.font = `11px ${MONO}`; O.fillStyle = ok ? GOLD : DANGER;
      O.fillText(`${d.cost.s} · ${d.cost.p}`, cxp + cw / 2, cyp + cardH - 4);
      rackCells.push({ k, x: cxp, y: cyp, w: cw, h: cardH });
    });

    /* 說明欄：指著哪一項就展開哪一項 */
    const sel = rackHoverKey || player.carry;
    const dy0 = y + 32 + cardH + 8;
    O.strokeStyle = 'rgba(30,59,44,.9)'; O.lineWidth = 1;
    O.beginPath(); O.moveTo(x + 12, dy0 - 4); O.lineTo(x + w - 12, dy0 - 4); O.stroke();
    O.textAlign = 'left';
    if (sel && BLD[sel]) {
      const d = BLD[sel], c = d.cost, ok = afford(c);
      O.font = `13px ${MONO}`; glow(CYAN, 6); O.fillStyle = CYAN;
      O.fillText(d.n, x + 12, dy0 + 14); noGlow();
      O.font = `10px ${MONO}`; O.fillStyle = DIM;
      O.fillText(`分類 ${d.sect}`, x + 12 + O.measureText(d.n).width + 46, dy0 + 14);
      O.textAlign = 'right'; O.font = `11px ${MONO}`; O.fillStyle = ok ? GOLD : DANGER;
      O.fillText(`造價　物資 ${c.s}　零件 ${c.p}${ok ? '' : '　（結存不足）'}`, x + w - 12, dy0 + 14);
      O.textAlign = 'left'; O.font = `12px ${SANS}`; O.fillStyle = BRIGHT;
      wrapText(BLD_DESC[sel] || '', x + 12, dy0 + 32, w - 24, 15);
      O.font = `11px ${MONO}`; O.fillStyle = FG;
      wrapText('效用推定　' + d.eff.replace(/\s*│\s*/g, '　·　'), x + 12, dy0 + 56, w - 24, 14);
    } else {
      O.font = `12px ${SANS}`; O.fillStyle = DIM;
      O.fillText('將游標移到任一模型上，可調閱該項工程的完整說明。', x + 12, dy0 + 18);
      O.font = `10px ${MONO}`; O.fillStyle = 'rgba(95,156,120,.6)';
      O.fillText('本車所載之工程樣品，其效用由各學派自行推定，協會不負任何責任。', x + 12, dy0 + 38);
    }
    // 工程車本身也可以搬走
    cmdBtn(x + w - 108, y + h - 20, 96, 15, '搬移工程車', 'movetruck', true);
  }

  /* ── 建築終端讀數 ── */
  if (selected) {
    const b = selected;
    const bx = (b.x * TS - Math.round(cam.x) + TS * foot(b.key).w / 2) * S, by = (b.y * TS - Math.round(cam.y)) * S;
    const fixed = !!b.fixed;
    const d = fixed ? FIX[b.key] : BLD[b.key];
    const w = 224, h = fixed ? 84 : 116;
    let x = clamp(bx - w / 2, 8, OW - w - 8), y = clamp(by - h - 14, 8, OH - h - 8);
    plate(x, y, w, h);
    O.textBaseline = 'alphabetic'; O.textAlign = 'left'; O.font = `12px ${MONO}`;
    glow(CYAN, 6); O.fillStyle = CYAN; O.fillText('▚ ' + d.n, x + 10, y + 19); noGlow();
    O.textAlign = 'right'; O.fillStyle = GOLD; O.font = `11px ${MONO}`;
    O.fillText(fixed ? '協會設施' : `級數 ${b.lv} / 3`, x + w - 10, y + 19);
    O.textAlign = 'left'; O.font = `12px ${SANS}`; O.fillStyle = BRIGHT;
    if (fixed) {
      /* 協會設施拆不得，但沒有理由不准換位置——那是玩家的基地。 */
      wrapText('協會列管設施，不得拆除。位置可自由調整。', x + 10, y + 38, w - 20, 15);
      cmdBtn(x + 10, y + h - 22, w - 20, 15, '搬移', 'move', true);
    } else {
      wrapText(BLD_DESC[b.key] || '', x + 10, y + 38, w - 20, 15);
      O.font = `11px ${MONO}`; O.fillStyle = FG;
      wrapText(d.eff.replace(/\s*│\s*/g, '　·　'), x + 10, y + 70, w - 20, 14);
      const c = upCost(b.key, b.lv), maxed = b.lv >= 3;
      cmdBtn(x + 10, y + h - 40, w - 20, 15, maxed ? '已達目前科技上限' : `擴建　物資 ${c.s} · 零件 ${c.p}`, 'up', !maxed && afford(c));
      cmdBtn(x + 10, y + h - 22, (w - 24) / 2, 15, '搬移', 'move', true);
      cmdBtn(x + 12 + (w - 24) / 2, y + h - 22, (w - 24) / 2, 15, '拆除', 'del', true);
    }
  }

  /* ── 測量樁的價目：只在指著荒地時出現 ── */
  if (hoverMod && !player.carry) {
    const mx = (hoverMod.mx * MOD * TS + MOD * TS / 2 - Math.round(cam.x)) * S;
    const my = (hoverMod.my * MOD * TS + MOD * TS / 2 - Math.round(cam.y)) * S;
    const w = 128, h = 40, ok = afford(MODULE_COST);
    const x = clamp(mx - w / 2, 8, OW - w - 8), y = clamp(my - h / 2, 8, OH - h - 8);
    plate(x, y, w, h);
    O.textAlign = 'left'; O.textBaseline = 'alphabetic';
    O.font = `10px ${MONO}`; glow(GOLD, 5); O.fillStyle = GOLD;
    O.fillText('▚ 未開墾地塊', x + 8, y + 15); noGlow();
    O.font = `9px ${MONO}`; O.fillStyle = ok ? FG : DANGER;
    O.fillText(ok ? `[[ 開墾 ]]　物資 ${MODULE_COST.s} · 零件 ${MODULE_COST.p}` : `物資 ${MODULE_COST.s} · 零件 ${MODULE_COST.p}（不足）`, x + 8, y + 30);
  }

  /* ── 世界訊息 ── */
  if (toast) {
    O.font = `11px ${MONO}`; O.textAlign = 'center';
    const tw = O.measureText(toast.t).width + 24;
    const x = OW / 2 - tw / 2, y = 16;
    O.fillStyle = 'rgba(6,10,8,.9)'; O.fillRect(x, y, tw, 22);
    brackets(x, y, tw, 22, GOLD);
    glow(GOLD, 6); O.fillStyle = GOLD; O.textBaseline = 'middle';
    O.fillText(toast.t, OW / 2, y + 11); noGlow();
  }

  /* ── 底部：操作提示在上，出處聲明在下（.src 永遠是最後一行） ── */
  O.textBaseline = 'alphabetic';
  O.font = `9px ${MONO}`; O.textAlign = 'left'; O.fillStyle = 'rgba(95,156,120,.42)';
  O.fillText(`WASD 移動　·　走近工程車取模型　·　點地放下　·　走近實驗室載具回到車內　·　ESC 離開基地`, 12, OH - 24);
  O.textAlign = 'center'; O.fillStyle = 'rgba(95,156,120,.55)';
  O.fillText('來源：協會基地觀測頻道 · 本畫面所呈現之一切結論均為各學派推定，協會不負任何責任', OW / 2, OH - 10);

  /* ── CRT：掃描線與暈影屬於「這台機器」，用實體像素畫，不隨 UI 縮放 ── */
  O.setTransform(dpr, 0, 0, dpr, 0, 0);
  O.save();
  O.globalAlpha = 0.05; O.fillStyle = FG;
  const gap = Math.max(3, scale);
  for (let y = 0; y < dispH; y += gap) O.fillRect(0, y, dispW, 1);
  O.restore();
  const vg = O.createRadialGradient(dispW / 2, dispH / 2, Math.min(dispW, dispH) * .34, dispW / 2, dispH / 2, Math.max(dispW, dispH) * .72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
  O.fillStyle = vg; O.fillRect(0, 0, dispW, dispH);
}
let rackCells = [];
/* 外殼以 UI 單位繪製，命中測試必須換算回同一套單位 */
function toUI(cx, cy) {
  const r = wrap.getBoundingClientRect();
  return { x: (cx - r.left) / UU, y: (cy - r.top) / UU };
}
function rackHit(cx, cy) {
  const { x, y } = toUI(cx, cy);
  const hit = rackCells.find(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
  return hit ? hit.k : null;
}
function cmdBtn(x, y, w, h, label, cmd, live) {
  O.fillStyle = live ? 'rgba(18,32,26,.95)' : 'rgba(12,20,16,.6)';
  O.fillRect(x, y, w, h);
  O.strokeStyle = live ? 'rgba(126,240,168,.5)' : 'rgba(30,59,44,.7)';
  O.strokeRect(x + .5, y + .5, w - 1, h - 1);
  O.font = `9px ${MONO}`; O.textAlign = 'center'; O.textBaseline = 'middle';
  O.fillStyle = live ? FG : 'rgba(95,156,120,.5)';
  if (live) glow(FG, 4);
  O.fillText(`[[ ${label} ]]`, x + w / 2, y + h / 2 + .5); noGlow();
  O.textAlign = 'left'; O.textBaseline = 'alphabetic';
  if (live) panelBtns.push({ cmd, x, y, w, h });
}
function panelHit(cx, cy) {
  const { x, y } = toUI(cx, cy);
  const b = panelBtns.find(p => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
  return b ? b.cmd : null;
}
function wrapText(t, x, y, w, lh) {
  let line = '', yy = y;
  for (const ch of t) {
    if (O.measureText(line + ch).width > w) { O.fillText(line, x, yy); line = ch; yy += lh; }
    else line += ch;
  }
  O.fillText(line, x, yy);
}

/* ══════════════════════════════════════════════════════════════════
   16 · 啟動
   ══════════════════════════════════════════════════════════════════ */
bakeTerrain(); bakeDeco(); bakeCrops(); bakeProps();
loadSheet();          // 成品美術非同步載入；載好前先用程序化建築頂著
RACK.forEach(k => buildingSprite(k, 1, false));
Object.keys(FIX).forEach(k => buildingSprite(k, 1, true));
cam.x = player.x * TS - VW / 2; cam.y = player.y * TS - VH / 2;

let last = 0;
let sceneOpen = false;
let started = false;

function frame(now) {
  requestAnimationFrame(frame);
  if (!sceneOpen) { last = 0; return; }
  /* last 必須跟 now 取自同一個時鐘。用模組層的 performance.now() 當起點會出事：
     rAF 傳進來的 now 是「該幀開始渲染的時刻」，可能早於模組層那次取樣，
     於是第一幀的 dt 是負的 → tSec 變負 → 動畫幀索引算出 -1 → drawImage(undefined)
     → 第一幀就拋錯 → 使用者只看到一片黑。 */
  if (!last) last = now;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  rackCells = [];
  try {
    update(dt);
    syncLevels();
    draw();
    drawOverlay();
  } catch (e) {                      // 一幀出錯就整個黑掉是最糟的失敗方式
    const f = document.getElementById('bsFatal');
    if (f) { f.style.display = 'block'; f.textContent = '觀測終端故障：' + e.message + '\n' + (e.stack || '').split('\n')[1]; }
    sceneOpen = false;               // 停住，訊息留在畫面上
  }
}
requestAnimationFrame(frame);

/* ══════════════════════════════════════════════════════════════════
   15 · 對外介面
   ══════════════════════════════════════════════════════════════════ */
function open() {
  sceneOpen = true;
  layout();
  try { initAudio(); } catch (e) { /* 沒有聲音也要能玩 */ }
  if (!started) { started = true; say('基地觀測頻道已連線。'); }
  else say('回到基地。');
  syncLevels();
}
function close() {
  sceneOpen = false;
  Object.keys(keys).forEach(k => keys[k] = false);
  player.carry = null; player.carryFix = false; selected = null; rackOpen = false;
}

return {
  open, close,
  attach(h) { HOST = Object.assign(HOST, h); },
  isOpen: () => sceneOpen,
  /* the host restores a saved base by replaying it as buildings */
  get buildings() { return buildings; },
  _dev: { get player() { return player; }, get res() { return res; }, say }
};

})();

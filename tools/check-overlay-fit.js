/* Does the base scene's overlay furniture actually fit on screen?
 * ---------------------------------------------------------------------------
 * The scene renders at a fixed virtual resolution and then scales, while the
 * terminal shell on top is drawn in its own "UI units" (OW x OH). Those two
 * are related by a fudge factor, so a panel whose width is written as a plain
 * number can fit at one window size and hang off the edges at another — which
 * is invisible until someone opens that panel at that size.
 *
 * This runs the REAL layout() out of src/base-scene.js (extracted, not
 * re-implemented, so it cannot drift) across a matrix of window sizes and
 * checks every fixed-size panel against the space it is given.
 *
 *   node tools/check-overlay-fit.js
 *
 * Exit code 1 = something is clipped.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'base-scene.js'), 'utf8');

/** pull a top-level function out of the module by name, brace-matched */
function grabFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('cannot find function ' + name);
  let depth = 0, i = src.indexOf('{', start);
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

/** read a numeric constant as written in the source */
function num(re, label) {
  const m = src.match(re);
  if (!m) throw new Error('cannot find ' + label);
  return Number(m[1]);
}

const BASE_VW = num(/const BASE_VW = (\d+)/, 'BASE_VW');
const BASE_VH = num(/BASE_VH = (\d+)/, 'BASE_VH');
const MAX_VW = num(/const MAX_VW = (\d+)/, 'MAX_VW');
const MAX_VH = num(/MAX_VH = (\d+)/, 'MAX_VH');
const UI_DESIGN_W = num(/const UI_DESIGN_W = (\d+)/, 'UI_DESIGN_W');
const UI_DESIGN_H = num(/UI_DESIGN_H = (\d+)/, 'UI_DESIGN_H');
const RACK_LEN = (src.match(/const RACK = \[([\s\S]*?)\]/)[1].match(/'/g).length) / 2;

// the rack panel's own geometry, as written in drawOverlay()
const rackLine = src.match(/const cw = (\d+), gap = (\d+), cardH = (\d+);/);
const rackW = src.match(/const w = RACK\.length \* \(cw \+ gap\) - gap \+ (\d+), h = (\d+);/);
const CW = +rackLine[1], GAP = +rackLine[2];
const RACK_W = RACK_LEN * (CW + GAP) - GAP + (+rackW[1]);
const RACK_H = +rackW[2];

// run the real layout()
const sandbox = {
  BASE_VW, BASE_VH, MAX_VW, MAX_VH, UI_DESIGN_W, UI_DESIGN_H,
  clamp: (v, a, b) => v < a ? a : v > b ? b : v,
  syncBuffers: () => { },
  wrap: { style: {} }, world: { style: {} }, overlay: { style: {} },
  W: { imageSmoothingEnabled: true },
  devicePixelRatio: 1, innerWidth: 0, innerHeight: 0,
  dpr: 1, scale: 1, VW: BASE_VW, VH: BASE_VH,
  dispW: 0, dispH: 0, UU: 1, OW: 0, OH: 0
};
const run = new Function('env', `
  with (env) {
    ${grabFn('layout')}
    layout();
    return { scale, dispW, dispH, UU, OW, OH };
  }
`);

/* Real windows people play in. The fullscreen 1920x1080 case is the one the
   scene was tuned for; everything else is what actually happens when there is
   a title bar, a taskbar, or a smaller monitor. */
const CASES = [
  ['1920x1080 全螢幕', 1920, 1080],
  ['1920x1040 視窗（含標題列）', 1920, 1040],
  ['1920x1017 視窗（含工作列）', 1920, 1017],
  ['1600x900 全螢幕', 1600, 900],
  ['1600x860 視窗', 1600, 860],
  ['1440x900 視窗', 1440, 860],
  ['1366x768 全螢幕', 1366, 768],
  ['1280x800 視窗（預設 Electron 視窗）', 1280, 760],
  ['1280x720 全螢幕', 1280, 720],
  ['1024x640 小視窗', 1024, 640]
];

let bad = 0;
console.log('rack panel: ' + RACK_W + ' x ' + RACK_H + ' UI units\n');
console.log('視窗                          scale 畫面        OW x OH     型錄餘裕(左右/上下)   黑邊');
console.log('─'.repeat(96));
let boxed = 0;
for (const [label, w, h] of CASES) {
  sandbox.innerWidth = w; sandbox.innerHeight = h;
  const r = run(sandbox);
  const slackX = Math.round(r.OW - RACK_W);
  const slackY = Math.round(r.OH - RACK_H);
  const barX = Math.max(0, Math.round((w - r.dispW) / 2));
  const barY = Math.max(0, Math.round((h - r.dispH) / 2));
  const fits = slackX >= 0 && slackY >= 0;
  const fills = barX <= 0 && barY <= 0;
  if (!fits) bad++;
  if (!fills) boxed++;
  console.log(
    label.padEnd(30, ' ') +
    String(r.scale).padEnd(6) +
    (r.dispW + 'x' + r.dispH).padEnd(12) +
    (Math.round(r.OW) + 'x' + Math.round(r.OH)).padEnd(12) +
    ((fits ? '  ' : '✗ ') + ('餘裕 ' + slackX + ' / ' + slackY).padEnd(20)) +
    (fills ? '無黑邊' : '✗ 黑邊 ' + barX + ' / ' + barY)
  );
}
console.log('─'.repeat(96));
if (bad) console.log('✗ ' + bad + ' / ' + CASES.length + ' 個尺寸下型錄被切掉');
if (boxed) console.log('✗ ' + boxed + ' / ' + CASES.length + ' 個尺寸下畫面沒有填滿視窗');
if (bad || boxed) process.exit(1);
console.log('✓ 所有尺寸：型錄放得下，且畫面填滿視窗');

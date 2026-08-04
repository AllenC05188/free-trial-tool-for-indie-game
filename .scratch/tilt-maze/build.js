/* Builds tilt-maze.html by splicing the presentation layers we must keep byte-
   identical with the shipping game (pixel portraits, stage, theater, record,
   faction panel, news line) out of ../../index.html, and wrapping them around
   the new Tilt Maze gameplay in parts/.

   Re-run after index.html changes:  node .scratch/tilt-maze/build.js */
const fs = require('fs');
const path = require('path');

const here = __dirname;
const root = path.resolve(here, '..', '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8').split(/\r?\n/);

/** 1-indexed inclusive slice, the way the line numbers read in an editor.
    A slice that ends one line short leaves a rule (or a function) hanging open,
    which silently swallows everything spliced in after it — so refuse to build
    rather than ship a file whose stylesheet quietly stops applying. */
function cut(a, b) {
  const t = src.slice(a - 1, b).join('\n');
  const open = (t.match(/{/g) || []).length, close = (t.match(/}/g) || []).length;
  if (open !== close) {
    throw new Error(`index.html slice ${a}-${b} is unbalanced (${open} { vs ${close} }) — ` +
      `adjust the range so it ends on the closing brace.`);
  }
  return t;
}

const CSS_FROM_GAME = [
  cut(9, 80),      // :root, reset, body, CRT layer, #app
  cut(94, 147),    // .panel-card family
  cut(183, 209),   // .news-list / .news-item
  cut(256, 663),   // header, doom bar, factions, stage, tokens, bubble, dpad, ticker
  cut(664, 848),   // overlay, flash, theater, hidden-el
  cut(1029, 1054), // .ticker-live
  cut(1717, 1728), // .term-title
  cut(1793, 1879)  // .rec (the filed-record document)
].join('\n\n');

const JS_FROM_GAME = [
  cut(4092, 4730), // pixel sprite grids + portrait pipeline + drawWorldScene
  cut(4738, 4746), // META
  cut(4757, 4774), // NPC_NAMES / NPC_QUESTIONS
  cut(4776, 4819), // INTERP
  cut(4821, 4829)  // TICKER
].join('\n\n');

const part = f => fs.readFileSync(path.join(here, 'parts', f), 'utf8');

const html = `<!DOCTYPE html>
<html lang="zh-Hant">

<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Tilt Maze · 思想重力場 原型</title>
  <style>
/* ===================================================================
   PORTED FROM index.html — do not hand-edit here, edit the game and
   re-run build.js. This is the shared visual identity.
   =================================================================== */
${CSS_FROM_GAME}

/* ===================================================================
   NEW — Tilt Maze
   =================================================================== */
${part('style.css')}
  </style>
</head>

<body>
${part('body.html')}

  <script>
    (function () {
      'use strict';
/* ===================================================================
   PORTED FROM index.html
   =================================================================== */
${JS_FROM_GAME}

/* ===================================================================
   NEW — Tilt Maze
   =================================================================== */
${part('game.js')}
    })();
  <\/script>
</body>

</html>
`;

fs.writeFileSync(path.join(here, 'tilt-maze.html'), html);
console.log('tilt-maze.html written (' + html.length + ' bytes)');

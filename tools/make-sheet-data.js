/* 把建築圖集轉成 data URI，供 .scratch/interactive-base/base-scene.html 載入。
 *
 * 為什麼不直接 <img src="buildings-sheet.png">：
 * base-scene.html 是用 file:// 開的，本機圖檔會污染 canvas，
 * 之後 getImageData 會拋 SecurityError——而切圖、佔地計算、自發光遮罩全都要讀像素。
 * data URI 屬於同源，不受影響。
 *
 * 用法：npm run sheet
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'assets', 'buildings-sheet.png');
const out = path.join(root, '.scratch', 'interactive-base', 'sheet-data.js');

if (!fs.existsSync(src)) {
  console.error('找不到來源圖：' + src);
  process.exit(1);
}

const b64 = fs.readFileSync(src).toString('base64');
fs.writeFileSync(out,
  '/* 自動產生，請勿手改。來源：assets/buildings-sheet.png\n' +
  '   重新產生：npm run sheet */\n' +
  'window.SHEET_URI = "data:image/png;base64,' + b64 + '";\n');

const kb = n => Math.round(n / 1024) + 'KB';
console.log('來源 ' + kb(fs.statSync(src).size) + ' → ' + path.relative(root, out) + ' ' + kb(fs.statSync(out).size));

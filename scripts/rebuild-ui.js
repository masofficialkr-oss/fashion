const fs = require('fs');
const path = require('path');
const root = 'C:/Users/jkhch/Desktop/fashion';
const htmlPath = path.join(root, 'index.html');
const h = fs.readFileSync(htmlPath, 'utf8');
const marker = '<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core';
const i = h.indexOf(marker);
if (i < 0) {
  console.error('script start not found');
  process.exit(1);
}
const tail = h.slice(i);

// Patch photo preview handler in tail for uploadPlaceholder
let patchedTail = tail.replace(
  `reader.onload = () => {
        state.photoDataUrl = reader.result;
        const img = document.getElementById('photoPreview');
        img.src = state.photoDataUrl; img.style.display = 'block';
        setAiSteps('사진 준비됨 · AI 체형 분석을 눌러주세요.');
      };`,
  `reader.onload = () => {
        state.photoDataUrl = reader.result;
        const img = document.getElementById('photoPreview');
        img.src = state.photoDataUrl; img.style.display = 'block';
        const ph = document.getElementById('uploadPlaceholder');
        if (ph) ph.style.display = 'none';
        setAiSteps('사진 준비됨');
      };`
);

// Also patch renderAll photo restore
patchedTail = patchedTail.replace(
  `if (state.photoDataUrl) {
        const img = document.getElementById('photoPreview');
        img.src = state.photoDataUrl; img.style.display = 'block';
      }`,
  `if (state.photoDataUrl) {
        const img = document.getElementById('photoPreview');
        img.src = state.photoDataUrl; img.style.display = 'block';
        const ph = document.getElementById('uploadPlaceholder');
        if (ph) ph.style.display = 'none';
      }`
);

const head = fs.readFileSync(path.join(root, '_ui_head.html'), 'utf8');
fs.writeFileSync(htmlPath, head + '\n' + patchedTail);
console.log('rebuilt index.html', fs.statSync(htmlPath).size);

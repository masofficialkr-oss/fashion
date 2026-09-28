// src/ 조각을 합쳐 단일 파일 index.html 을 만든다: node scripts/build.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, 'src', f), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\s+$/, '') + '\n';
const JS = ['prelude.js', 'catalog.js', 'commerce.js', 'ar.js', 'app.js'];

const html = read('head.html') + '  <script>\n' + JS.map(read).join('\n') + '  </script>\n</body>\n</html>\n';
fs.writeFileSync(path.join(root, 'index.html'), html);
console.log('index.html', (html.length / 1024).toFixed(1) + 'KB', html.split('\n').length + ' lines');

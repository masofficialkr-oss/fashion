const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'assets', 'shop');
fs.mkdirSync(dir, { recursive: true });

const items = [
  { id: 'm01', g: 'M', label: 'OVERSHIRT', c1: '#3d5a80', c2: '#1e293b', kind: 'shirt' },
  { id: 'm02', g: 'M', label: 'SLIM KNIT', c1: '#6b4f3a', c2: '#3f2a1d', kind: 'knit' },
  { id: 'm03', g: 'M', label: 'CROP JACKET', c1: '#2f2f2f', c2: '#111111', kind: 'jacket' },
  { id: 'm04', g: 'M', label: 'WIDE PANTS', c1: '#4a5568', c2: '#2d3748', kind: 'pants' },
  { id: 'm05', g: 'M', label: 'STRAIGHT JEAN', c1: '#2c5282', c2: '#1a365d', kind: 'jean' },
  { id: 'm06', g: 'M', label: 'SLIM SLACKS', c1: '#1a202c', c2: '#000000', kind: 'pants' },
  { id: 'm07', g: 'M', label: 'LINEN SHIRT', c1: '#8a9a7b', c2: '#5c6b4f', kind: 'shirt' },
  { id: 'm08', g: 'M', label: 'HOOD ZIP', c1: '#5b6e8c', c2: '#334155', kind: 'hood' },
  { id: 'm09', g: 'M', label: 'CARGO', c1: '#5c584e', c2: '#3f3b34', kind: 'pants' },
  { id: 'm10', g: 'M', label: 'WOOL COAT', c1: '#4a3f35', c2: '#2a241f', kind: 'coat' },
  { id: 'w01', g: 'W', label: 'BLOUSE', c1: '#c4a484', c2: '#8b6b4a', kind: 'blouse' },
  { id: 'w02', g: 'W', label: 'CROP TOP', c1: '#9f7aea', c2: '#6b46c1', kind: 'crop' },
  { id: 'w03', g: 'W', label: 'CARDIGAN', c1: '#e8b4b8', c2: '#b87a80', kind: 'knit' },
  { id: 'w04', g: 'W', label: 'A-LINE SKIRT', c1: '#7c5c6e', c2: '#4a3542', kind: 'skirt' },
  { id: 'w05', g: 'W', label: 'WIDE TROUSER', c1: '#718096', c2: '#4a5568', kind: 'pants' },
  { id: 'w06', g: 'W', label: 'SLIM JEAN', c1: '#2b6cb0', c2: '#1a365d', kind: 'jean' },
  { id: 'w07', g: 'W', label: 'WRAP DRESS', c1: '#c53030', c2: '#742a2a', kind: 'dress' },
  { id: 'w08', g: 'W', label: 'TAILOR JACKET', c1: '#2d3748', c2: '#1a202c', kind: 'jacket' },
  { id: 'w09', g: 'W', label: 'PLEAT SKIRT', c1: '#d69e2e', c2: '#975a16', kind: 'skirt' },
  { id: 'w10', g: 'W', label: 'PUFFER', c1: '#4fd1c5', c2: '#2c7a7b', kind: 'coat' },
];

function shape(kind) {
  if (kind === 'skirt' || kind === 'dress') {
    return '<path d="M90 120 L150 120 L170 260 L70 260 Z" fill="rgba(255,255,255,0.9)"/><rect x="95" y="70" width="50" height="55" rx="8" fill="rgba(255,255,255,0.9)"/>';
  }
  if (kind === 'pants' || kind === 'jean' || kind === 'cargo') {
    return '<path d="M85 110 H155 V150 L165 270 H125 L120 160 L115 270 H75 L85 150 Z" fill="rgba(255,255,255,0.9)"/>';
  }
  if (kind === 'coat' || kind === 'jacket' || kind === 'hood') {
    return '<path d="M70 90 L100 70 L140 70 L170 90 L185 150 L155 150 L150 250 H90 L85 150 L55 150 Z" fill="rgba(255,255,255,0.9)"/>';
  }
  if (kind === 'crop') {
    return '<path d="M75 95 L100 75 L140 75 L165 95 L170 150 H70 Z" fill="rgba(255,255,255,0.9)"/>';
  }
  if (kind === 'blouse') {
    return '<path d="M78 85 L100 70 L140 70 L162 85 L170 200 H70 Z" fill="rgba(255,255,255,0.9)"/>';
  }
  return '<path d="M75 80 L100 65 L140 65 L165 80 L175 210 H65 Z" fill="rgba(255,255,255,0.9)"/>';
}

for (const it of items) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 240 300">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${it.c2}"/>
      <stop offset="100%" stop-color="${it.c1}"/>
    </linearGradient>
  </defs>
  <rect width="240" height="300" fill="url(#bg)"/>
  <circle cx="200" cy="40" r="50" fill="rgba(255,255,255,0.08)"/>
  <text x="16" y="28" fill="rgba(255,255,255,0.95)" font-family="Arial,sans-serif" font-size="12" font-weight="700">${it.g === 'M' ? 'MEN' : 'WOMEN'}</text>
  <g transform="translate(0,8)">${shape(it.kind)}</g>
  <rect x="14" y="250" width="212" height="36" rx="10" fill="rgba(0,0,0,0.35)"/>
  <text x="120" y="273" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="13" font-weight="700">${it.label}</text>
</svg>`;
  fs.writeFileSync(path.join(dir, `${it.id}.svg`), svg);
}

console.log('wrote', items.length, 'svg files to', dir);

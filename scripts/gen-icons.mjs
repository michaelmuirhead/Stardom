// Generates Stardom's PWA icons as PNGs — no dependencies (built-in zlib only).
// Draws a gold five-pointed star on the app's dark radial background.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = (() => {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];

function starVerts(cx, cy, outer, inner) {
  const v = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (-90 + i * 36) * Math.PI / 180;
    v.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return v;
}
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function makeIcon(size, starFactor) {
  const cx = size / 2, cy = size / 2;
  const outer = size * starFactor, inner = outer * 0.40;
  const poly = starVerts(cx, cy, outer, inner);
  const bgC = [32, 34, 58], bgE = [15, 16, 24];     // radial center -> edge
  const starTop = [255, 215, 107], starBot = [243, 184, 31];
  const maxd = Math.hypot(cx, cy);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bg = mix(bgC, bgE, Math.min(1, Math.hypot(x - cx, y - cy) / maxd));
      let cov = 0;
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        if (inPoly(x + (sx + 0.5) / 2, y + (sy + 0.5) / 2, poly)) cov++;
      }
      cov /= 4;
      let col = bg;
      if (cov > 0) {
        const t = Math.min(1, Math.max(0, (y - (cy - outer)) / (2 * outer)));
        col = mix(bg, mix(starTop, starBot, t), cov);
      }
      const o = (y * size + x) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255;
    }
  }
  return png(size, rgba);
}

mkdirSync('icons', { recursive: true });
writeFileSync('icons/icon-192.png', makeIcon(192, 0.36));
writeFileSync('icons/icon-512.png', makeIcon(512, 0.36));
writeFileSync('icons/icon-maskable-512.png', makeIcon(512, 0.30)); // extra safe-zone padding
writeFileSync('icons/apple-touch-icon-180.png', makeIcon(180, 0.36));
console.log('Icons generated in icons/');

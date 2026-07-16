// Gera os ícones do app e da bandeja sem depender de libs de imagem:
// codifica PNG na mão (zlib do próprio Node) e embrulha num ICO.
// Rode com: npm run icons
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// -------- PNG --------

let TABLE = null;
function crcTable() {
  if (TABLE) return TABLE;
  TABLE = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    TABLE[n] = c;
  }
  return TABLE;
}

function crc32(buf) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ICO aceita PNG embutido (Vista+), então é só cabeçalho + diretório + o PNG.
function encodeICO(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);            // tipo: ícone
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = [];
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;       // 0 significa 256
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);               // planes
    e.writeUInt16LE(32, 6);              // bpp
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

// -------- Desenho (supersampling 4x4 pra ter antialias) --------

const SS = 4;

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function sdRoundBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - hw + r;
  const qy = Math.abs(py - cy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// shade(x, y) -> [r,g,b,a] com a em 0..1
function render(size, shade) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          const c = shade(px, py);
          if (!c) continue;
          // acumula com alpha pré-multiplicado pra borda não "sujar"
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      if (a > 0) {
        out[i] = Math.round(r / a);
        out[i + 1] = Math.round(g / a);
        out[i + 2] = Math.round(b / a);
        out[i + 3] = Math.round((a / n) * 255);
      }
    }
  }
  return out;
}

const WHITE = [255, 255, 255];

// Bandeja: disco cheio com anel branco. A 16px um relógio vira borrão —
// a cor sozinha é o que se lê, então o desenho é só um ponto de status.
function trayShader(size, color) {
  const c = size / 2;
  const r = size * 0.44;
  return (x, y) => {
    const d = Math.hypot(x - c, y - c);
    if (d > r) return null;
    // anel branco fino na borda pra destacar em qualquer cor de barra
    if (d > r - size * 0.09) return [...WHITE, 0.9];
    return [...color, 1];
  };
}

// App: badge arredondado indigo com um relógio branco.
function appShader(size) {
  const c = size / 2;
  const hw = size * 0.42;
  const radius = size * 0.22;
  const face = size * 0.30;
  const hand = size * 0.035;
  return (x, y) => {
    if (sdRoundBox(x, y, c, c, hw, hw, radius) > 0) return null;
    const dFace = Math.hypot(x - c, y - c);
    // aro do relógio
    if (Math.abs(dFace - face) <= size * 0.035) return [...WHITE, 1];
    if (dFace < face) {
      // ponteiros: 12h e 3h
      const hHand = distSeg(x, y, c, c, c, c - face * 0.55);
      const mHand = distSeg(x, y, c, c, c + face * 0.72, c);
      if (hHand <= hand || mHand <= hand) return [...WHITE, 1];
      if (dFace <= size * 0.045) return [...WHITE, 1]; // pino central
    }
    return [79, 70, 229, 1]; // indigo
  };
}

// -------- Saída --------

const STATES = {
  'waiting': [107, 114, 128],   // cinza  — esperando o FiveM
  'offduty': [245, 158, 11],    // âmbar  — conectado, fora de serviço
  'onduty': [34, 197, 94],      // verde  — em serviço, ponto aberto
  'paused': [71, 85, 105],      // ardósia — pausado pelo usuário
};

function main() {
  const root = path.join(__dirname, '..');
  const assets = path.join(root, 'assets');
  const build = path.join(root, 'build');
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(build, { recursive: true });

  for (const [name, color] of Object.entries(STATES)) {
    for (const size of [16, 32]) {
      const png = encodePNG(size, render(size, trayShader(size, color)));
      const suffix = size === 32 ? '@2x' : '';
      fs.writeFileSync(path.join(assets, `tray-${name}${suffix}.png`), png);
    }
    console.log(`assets/tray-${name}.png (+@2x)`);
  }

  const appSizes = [16, 32, 48, 64, 128, 256];
  const pngs = appSizes.map((size) => ({ size, buf: encodePNG(size, render(size, appShader(size))) }));
  fs.writeFileSync(path.join(build, 'icon.ico'), encodeICO(pngs));
  fs.writeFileSync(path.join(assets, 'icon.png'), pngs[pngs.length - 1].buf);
  console.log(`build/icon.ico (${appSizes.join(', ')}px)`);
  console.log('assets/icon.png (256px)');
}

main();

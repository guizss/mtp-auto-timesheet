// Gera o som da notificação sem depender de lib nem de arquivo externo:
// escreve um WAV na mão, igual ao que tools/make-icons.js faz com PNG.
// Rode com: npm run sound
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;   // suficiente: nossos tons vão até ~1.5kHz
const DURATION_S = 0.26;
const AMP = 0.16;            // baixo de propósito — o pedido era "sutil"

// Duas notas ascendentes curtas. Sobe = positivo; curto = não compete com o jogo.
const NOTES = [
  { start: 0.000, dur: 0.085, freq: 1046.5 }, // C6
  { start: 0.062, dur: 0.190, freq: 1396.9 }, // F6
];

function renderTone(buf, { start, dur, freq }) {
  const from = Math.floor(start * SAMPLE_RATE);
  const n = Math.floor(dur * SAMPLE_RATE);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Ataque rápido evita clique; decaimento exponencial dá o "tin" natural.
    const attack = Math.min(1, t / 0.005);
    const decay = Math.exp(-t / (dur * 0.34));
    const env = attack * decay;
    // Fundamental + um harmônico fraco pra não soar como bipe de micro-ondas.
    const s = Math.sin(2 * Math.PI * freq * t) * 0.86
            + Math.sin(2 * Math.PI * freq * 2 * t) * 0.14;
    const idx = from + i;
    if (idx < buf.length) buf[idx] += s * env * AMP;
  }
}

function encodeWav(samples) {
  const dataSize = samples.length * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);           // tamanho do bloco fmt
  buf.writeUInt16LE(1, 20);            // PCM
  buf.writeUInt16LE(1, 22);            // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);            // block align
  buf.writeUInt16LE(16, 34);           // bits por amostra
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

function main() {
  const total = Math.ceil(DURATION_S * SAMPLE_RATE);
  const samples = new Float64Array(total);
  for (const n of NOTES) renderTone(samples, n);

  const assets = path.join(__dirname, '..', 'assets');
  fs.mkdirSync(assets, { recursive: true });
  const wav = encodeWav(samples);
  const out = path.join(assets, 'notify.wav');
  fs.writeFileSync(out, wav);
  console.log(`assets/notify.wav — ${(wav.length / 1024).toFixed(1)} KB, ${(DURATION_S * 1000).toFixed(0)}ms`);
}

main();

// sunset-ahora · CANDIDATO V1 (not frozen). Derived deterministically from A1_v4_master (+ a trace of C1 v2), same frame as every C-size layer:
// 440×952 RGBA straight alpha. Recipe (contract): strong detail reduction, chroma −55 %, lift toward pearl, condensation and wet zone softened,
// C1 trace ≈ 6 % in F, baked at its final presence (≈ 15 %), painted at opacity 1 over AHORA's atmosphere. No B, no C2, no matrix, no A2.
const fs = require('fs'), zlib = require('zlib'); const dec = require('../../c1/decode-png.cjs');
const P = Object.assign({ desat: 0.55, pearl: '#EEF2F8', lift: 0.45, sx: 1.6, sy: 7, syWet: 12, wetFrom: 665, presence: 0.15, c1: 0.06 }, JSON.parse(process.argv[2] || '{}'));
const A = dec('../../frozen-A1-A2/A1_v4_master.png'), C1 = dec('../../frozen-C1/C1v2_master.png');
const w = 440, h = 952, n = w * h;
const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)), enc = (v) => { v = Math.max(0, Math.min(1, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
const toOk = (r, g, b) => { const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]; };
const fromOk = (L, a, b) => { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3; return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]; };
// 1 · A1 → C size (2×2 average in linear light)
const L3 = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += lin(A.data[((2 * y + dy) * 880 + 2 * x + dx) * A.C + c] / 255); L3[c][y * w + x] = s / 4; }
// 2 · detail reduction: anisotropic Gaussian — long along the plates (vertical), short across them, so the plates stay and the drops go; the wet zone smoother still
const gauss = (src, sigma, horiz, sigmaAt) => { const out = new Float64Array(n); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sg = sigmaAt ? sigmaAt(y) : sigma; const R = Math.ceil(sg * 3); let s = 0, ws = 0; for (let k = -R; k <= R; k++) { const xx = horiz ? Math.min(w - 1, Math.max(0, x + k)) : x, yy = horiz ? y : Math.min(h - 1, Math.max(0, y + k)); const g = Math.exp(-(k * k) / (2 * sg * sg)); s += src[yy * w + xx] * g; ws += g; } out[y * w + x] = s / ws; } return out; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const syAt = (y) => P.sy + (P.syWet - P.sy) * sm(P.wetFrom - 30, P.wetFrom + 30, y);
for (let c = 0; c < 3; c++) { L3[c] = gauss(L3[c], P.sx, true); L3[c] = gauss(L3[c], 0, false, syAt); }
// 3 · colour: chroma −55 %, lightness toward pearl
const pr = toOk(...[1, 3, 5].map((i) => lin(parseInt(P.pearl.slice(i, i + 2), 16) / 255)));
const out = Buffer.alloc(n * 4); const presence = []; 
for (let i = 0; i < n; i++) { const [L, a, b] = toOk(L3[0][i], L3[1][i], L3[2][i]); const L2 = L + (pr[0] - L) * P.lift, a2 = a * (1 - P.desat) + pr[1] * P.lift * 0.5, b2 = b * (1 - P.desat) + pr[2] * P.lift * 0.5; const rgb = fromOk(L2, a2, b2).map((v) => Math.max(0, v));
  // 4 · C1 trace (≈ 6 %, absolute) over the baked light glass (≈ 15 %), premultiplied
  const ac = (C1.data[i * 4 + 3] / 255) * P.c1, aa = P.presence; const ao = ac + aa * (1 - ac);
  const col = [0, 1, 2].map((c) => (lin(C1.data[i * 4 + c] / 255) * ac + rgb[c] * aa * (1 - ac)) / ao);
  for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(enc(col[c]) * 255); out[i * 4 + 3] = Math.round(ao * 255); }
const png = (f, W0, H0, buf) => { const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4); d.copy(o, 8); o.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(t), d])) >>> 0, 8 + d.length); return o; };
  const rows = Buffer.alloc((W0 * 4 + 1) * H0); for (let y = 0; y < H0; y++) buf.copy(rows, y * (W0 * 4 + 1) + 1, y * W0 * 4, (y + 1) * W0 * 4); const ih = Buffer.alloc(13); ih.writeUInt32BE(W0, 0); ih.writeUInt32BE(H0, 4); ih[8] = 8; ih[9] = 6;
  fs.writeFileSync(f, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))])); };
png('sunset-ahora_v1.png', w, h, out); fs.writeFileSync('sunset-ahora_v1.params.json', JSON.stringify(P, null, 1));
let aMin = 1, aMax = 0; for (let i = 0; i < n; i++) { const a = out[i * 4 + 3] / 255; aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); } console.log('alpha', aMin.toFixed(3), aMax.toFixed(3));

// 纯 JS MD5（RFC 1321）。
//
// WebCrypto 只提供 SHA-1/256/384/512，而酷狗 Web 接口的签名是
// `md5(salt + 按 key 排序的 k=v 串 + body + salt)`，因此必须自带实现。
// 只处理字符串输入（UTF-8 编码后计算），够登录接口使用。

const SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

// T[i] = floor(abs(sin(i + 1)) * 2^32)，标准 MD5 常量表，运行时算一次即可。
const T = new Uint32Array(64);
for (let i = 0; i < 64; i++) T[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;

const encoder = new TextEncoder();

export function md5Hex(input) {
  const bytes = encoder.encode(String(input));
  const padded = new Uint8Array((((bytes.length + 9) + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = BigInt(bytes.length) * 8n;
  view.setUint32(padded.length - 8, Number(bits & 0xffffffffn), true);
  view.setUint32(padded.length - 4, Number((bits >> 32n) & 0xffffffffn), true);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;
  const words = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true);
    let A = a; let B = b; let C = c; let D = d;
    for (let i = 0; i < 64; i++) {
      let F; let g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const sum = (A + F + T[i] + words[g]) >>> 0;
      const rotated = ((sum << SHIFT[i]) | (sum >>> (32 - SHIFT[i]))) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotated) >>> 0;
    }
    a = (a + A) >>> 0;
    b = (b + B) >>> 0;
    c = (c + C) >>> 0;
    d = (d + D) >>> 0;
  }

  return [a, b, c, d].map((word) => {
    let out = '';
    for (let i = 0; i < 4; i++) out += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return out;
  }).join('');
}

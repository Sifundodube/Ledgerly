const fs = require("node:fs");
const zlib = require("node:zlib");

const size = 256;
const pixels = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  const row = y * (size * 4 + 1);
  pixels[row] = 0;
  for (let x = 0; x < size; x += 1) {
    const offset = row + 1 + x * 4;
    const background = x >= 18 && x < size - 18 && y >= 18 && y < size - 18;
    const vertical = x >= 82 && x < 112 && y >= 66 && y < 190;
    const foot = x >= 82 && x < 174 && y >= 160 && y < 190;
    const white = (vertical || foot) && background;
    pixels[offset] = white ? 255 : background ? 39 : 246;
    pixels[offset + 1] = white ? 255 : background ? 107 : 247;
    pixels[offset + 2] = white ? 255 : background ? 82 : 244;
    pixels[offset + 3] = 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name);
  const body = Buffer.concat([type, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", zlib.deflateSync(pixels)),
  chunk("IEND", Buffer.alloc(0)),
]);
fs.mkdirSync("assets", { recursive: true });
fs.writeFileSync("assets/icon.png", png);

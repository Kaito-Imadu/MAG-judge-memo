// Generate PWA icons (192x192 and 512x512) using only Node.js built-in modules
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function createPNG(size) {
  // Colors
  const bg = [0x1B, 0x4F, 0x72]; // #1B4F72
  const accent = [0x2E, 0x86, 0xC1]; // #2E86C1
  const white = [0xFF, 0xFF, 0xFF];

  // Create raw pixel data (RGBA)
  const pixels = Buffer.alloc(size * size * 4);
  const cornerR = Math.floor(size * 0.18);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // Rounded rect check (approximate)
      const inCorner = (
        (x < cornerR && y < cornerR && Math.hypot(x - cornerR, y - cornerR) > cornerR) ||
        (x >= size - cornerR && y < cornerR && Math.hypot(x - (size - cornerR - 1), y - cornerR) > cornerR) ||
        (x < cornerR && y >= size - cornerR && Math.hypot(x - cornerR, y - (size - cornerR - 1)) > cornerR) ||
        (x >= size - cornerR && y >= size - cornerR && Math.hypot(x - (size - cornerR - 1), y - (size - cornerR - 1)) > cornerR)
      );

      if (inCorner) {
        pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 0;
        continue;
      }

      // Accent line at ~68% height
      const lineY = Math.floor(size * 0.68);
      const lineH = Math.floor(size * 0.03);
      const lineX1 = Math.floor(size * 0.15);
      const lineX2 = Math.floor(size * 0.85);
      if (y >= lineY && y < lineY + lineH && x >= lineX1 && x < lineX2) {
        pixels[idx] = accent[0]; pixels[idx+1] = accent[1]; pixels[idx+2] = accent[2]; pixels[idx+3] = 255;
      } else {
        pixels[idx] = bg[0]; pixels[idx+1] = bg[1]; pixels[idx+2] = bg[2]; pixels[idx+3] = 255;
      }
    }
  }

  // Draw "MAG" text approximation (simple block letters centered)
  const letterSize = Math.floor(size * 0.12);
  const startY = Math.floor(size * 0.25);
  const centerX = Math.floor(size / 2);

  // Simple "M" "A" "G" as filled rectangles (branded look)
  const blockW = Math.floor(size * 0.55);
  const blockH = Math.floor(size * 0.18);
  const blockX = centerX - Math.floor(blockW / 2);
  for (let y = startY; y < startY + blockH && y < size; y++) {
    for (let x = blockX; x < blockX + blockW && x < size; x++) {
      const idx = (y * size + x) * 4;
      if (pixels[idx + 3] === 255) {
        pixels[idx] = white[0]; pixels[idx+1] = white[1]; pixels[idx+2] = white[2];
      }
    }
  }

  // Sub text block
  const subW = Math.floor(size * 0.45);
  const subH = Math.floor(size * 0.07);
  const subX = centerX - Math.floor(subW / 2);
  const subY = startY + blockH + Math.floor(size * 0.05);
  for (let y = subY; y < subY + subH && y < size; y++) {
    for (let x = subX; x < subX + subW && x < size; x++) {
      const idx = (y * size + x) * 4;
      if (pixels[idx + 3] === 255) {
        pixels[idx] = 0xFF; pixels[idx+1] = 0xFF; pixels[idx+2] = 0xFF;
        pixels[idx+3] = 200; // semi-transparent
      }
    }
  }

  // Build PNG file
  // Add filter byte (0 = None) before each row
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0; // filter: None
    pixels.copy(rawData, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const compressed = deflateSync(rawData);

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  const chunks = [
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ];

  return Buffer.concat([signature, ...chunks]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeB = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeB, data]));
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, typeB, data, crcB]);
}

// CRC32
function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate both sizes
for (const size of [192, 512]) {
  const png = createPNG(size);
  writeFileSync(`public/icon-${size}x${size}.png`, png);
  console.log(`Created public/icon-${size}x${size}.png (${png.length} bytes)`);
}

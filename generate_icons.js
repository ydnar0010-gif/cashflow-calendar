import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let c = 0xffffffff;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let curr = n;
    for (let k = 0; k < 8; k++) {
      curr = (curr & 1) ? (0xedb88320 ^ (curr >>> 1)) : (curr >>> 1);
    }
    table[n] = curr;
  }
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function createPng(width, height) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits per channel
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);

  const bgR = 9, bgG = 9, bgB = 11;
  const fgR = 236, fgG = 72, fgB = 153;

  const margin = Math.floor(width * 0.18);
  const calLeft = margin;
  const calRight = width - margin;
  const calTop = Math.floor(height * 0.22);
  const calBottom = height - margin;
  const headerHeight = Math.floor(height * 0.18);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      let r = bgR, g = bgG, b = bgB, a = 255;

      const cornerRadius = Math.floor(width * 0.2);
      let inAppBounds = true;
      if (x < cornerRadius && y < cornerRadius) {
        if ((x - cornerRadius)**2 + (y - cornerRadius)**2 > cornerRadius**2) inAppBounds = false;
      } else if (x > width - cornerRadius && y < cornerRadius) {
        if ((x - (width - cornerRadius))**2 + (y - cornerRadius)**2 > cornerRadius**2) inAppBounds = false;
      } else if (x < cornerRadius && y > height - cornerRadius) {
        if ((x - cornerRadius)**2 + (y - (height - cornerRadius))**2 > cornerRadius**2) inAppBounds = false;
      } else if (x > width - cornerRadius && y > height - cornerRadius) {
        if ((x - (width - cornerRadius))**2 + (y - (height - cornerRadius))**2 > cornerRadius**2) inAppBounds = false;
      }

      if (!inAppBounds) {
        a = 0;
      } else {
        if (x >= calLeft && x <= calRight && y >= calTop && y <= calBottom) {
          if (y <= calTop + headerHeight) {
            r = fgR; g = fgG; b = fgB;
          } else {
            const borderWidth = Math.max(2, Math.floor(width * 0.025));
            if (x < calLeft + borderWidth || x > calRight - borderWidth || y > calBottom - borderWidth) {
              r = fgR; g = fgG; b = fgB;
            } else {
              r = 24; g = 24; b = 27;
              const gridCellX = Math.floor((x - calLeft) / ((calRight - calLeft) / 3));
              const gridCellY = Math.floor((y - calTop - headerHeight) / ((calBottom - calTop - headerHeight) / 3));
              const dotCenterX = calLeft + (gridCellX + 0.5) * ((calRight - calLeft) / 3);
              const dotCenterY = calTop + headerHeight + (gridCellY + 0.5) * ((calBottom - calTop - headerHeight) / 3);
              const distSq = (x - dotCenterX)**2 + (y - dotCenterY)**2;
              const dotRadius = Math.max(2, width * 0.028);
              if (distSq <= dotRadius**2) {
                if ((gridCellX + gridCellY) % 2 === 0) {
                  r = fgR; g = fgG; b = fgB;
                } else {
                  r = 16; g = 185; b = 129;
                }
              }
            }
          }
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const idatData = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180));
console.log('PNG icons created successfully.');

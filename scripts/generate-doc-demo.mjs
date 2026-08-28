import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FRAME_DELAY_CENTISECONDS = 220;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const output = Buffer.allocUnsafe(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return output;
}

function parsePng(buffer) {
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('Demo source is not a PNG file');
  }

  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    chunks.push({ data: buffer.subarray(dataStart, dataStart + length), type });
    offset = dataStart + length + 4;
    if (type === 'IEND') break;
  }

  const header = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  const imageData = chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data);
  if (!header || imageData.length === 0) throw new Error('Demo source PNG is incomplete');
  return { header, imageData };
}

function createFrameControl(sequence, width, height) {
  const data = Buffer.alloc(26);
  data.writeUInt32BE(sequence, 0);
  data.writeUInt32BE(width, 4);
  data.writeUInt32BE(height, 8);
  data.writeUInt32BE(0, 12);
  data.writeUInt32BE(0, 16);
  data.writeUInt16BE(FRAME_DELAY_CENTISECONDS, 20);
  data.writeUInt16BE(100, 22);
  data.writeUInt8(0, 24);
  data.writeUInt8(0, 25);
  return createChunk('fcTL', data);
}

async function createAnimatedPng(inputPaths, outputPath) {
  const frames = await Promise.all(inputPaths.map(async (inputPath) => parsePng(await readFile(inputPath))));
  const firstHeader = frames[0].header;
  const width = firstHeader.readUInt32BE(0);
  const height = firstHeader.readUInt32BE(4);

  for (const frame of frames.slice(1)) {
    if (frame.header.readUInt32BE(0) !== width || frame.header.readUInt32BE(4) !== height) {
      throw new Error('All demo frames must have matching dimensions');
    }
    if (!frame.header.subarray(8).equals(firstHeader.subarray(8))) {
      throw new Error('All demo frames must use matching PNG color settings');
    }
  }

  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(frames.length, 0);
  animationControl.writeUInt32BE(0, 4);

  const outputChunks = [PNG_SIGNATURE, createChunk('IHDR', firstHeader), createChunk('acTL', animationControl)];
  let sequence = 0;
  frames.forEach((frame, frameIndex) => {
    outputChunks.push(createFrameControl(sequence, width, height));
    sequence += 1;
    for (const imageData of frame.imageData) {
      if (frameIndex === 0) {
        outputChunks.push(createChunk('IDAT', imageData));
        continue;
      }
      const frameData = Buffer.allocUnsafe(imageData.length + 4);
      frameData.writeUInt32BE(sequence, 0);
      imageData.copy(frameData, 4);
      outputChunks.push(createChunk('fdAT', frameData));
      sequence += 1;
    }
  });
  outputChunks.push(createChunk('IEND', Buffer.alloc(0)));
  await writeFile(outputPath, Buffer.concat(outputChunks));
  console.log(`Generated ${path.relative(process.cwd(), outputPath)}`);
}

const assetDir = path.join(process.cwd(), 'docs/assets');
const demoFrames = ['main-window', 'large-json-viewer', 'context-menu', 'compare-dialog'];

await createAnimatedPng(
  demoFrames.map((name) => path.join(assetDir, `${name}.png`)),
  path.join(assetDir, 'demo.png')
);
await createAnimatedPng(
  demoFrames.map((name) => path.join(assetDir, `${name}-en.png`)),
  path.join(assetDir, 'demo-en.png')
);

import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_SIZES_MB = [5, 10, 15, 20];
const DEFAULT_OUTPUT_DIR = path.resolve('json');

function parseArgs(args) {
  const sizes = [];
  let outputDir = DEFAULT_OUTPUT_DIR;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--out' || arg === '--output') {
      const next = args[index + 1];
      if (!next) {
        throw new Error(`${arg} requires a directory path`);
      }
      outputDir = path.resolve(next);
      index += 1;
      continue;
    }

    const size = Number(arg);
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`Invalid sample size: ${arg}`);
    }
    sizes.push(size);
  }

  return {
    outputDir,
    sizesMb: sizes.length > 0 ? sizes : DEFAULT_SIZES_MB,
  };
}

function createSampleItem(index) {
  return {
    id: index,
    name: `HanJson sample ${index}`,
    active: index % 2 === 0,
    score: index % 1000,
    tags: ['large', 'json', 'formatter', 'benchmark'],
    message: 'x'.repeat(160),
    nested: {
      requestId: `req-${String(index).padStart(8, '0')}`,
      timestamp: '2026-04-27T00:00:00.000Z',
      values: [index, index + 1, index + 2],
    },
  };
}

function writeChunk(stream, chunk) {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function finishStream(stream) {
  return new Promise((resolve, reject) => {
    stream.end((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function formatBytes(value) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

async function writeSample(outputDir, sizeMb) {
  const targetBytes = Math.ceil(sizeMb * 1024 * 1024);
  const filePath = path.join(outputDir, `sample-${sizeMb}mb.json`);
  const stream = createWriteStream(filePath, { encoding: 'utf8' });
  let bytesWritten = 0;
  let itemCount = 0;

  await writeChunk(stream, '[');
  bytesWritten += 1;

  while (bytesWritten < targetBytes - 1) {
    const prefix = itemCount === 0 ? '' : ',';
    const item = JSON.stringify(createSampleItem(itemCount));
    const chunk = `${prefix}${item}`;
    await writeChunk(stream, chunk);
    bytesWritten += Buffer.byteLength(chunk, 'utf8');
    itemCount += 1;
  }

  await writeChunk(stream, ']');
  bytesWritten += 1;
  await finishStream(stream);

  const { size } = await stat(filePath);
  return {
    filePath,
    itemCount,
    size,
  };
}

async function main() {
  const { outputDir, sizesMb } = parseArgs(process.argv.slice(2));
  await mkdir(outputDir, { recursive: true });

  for (const sizeMb of sizesMb) {
    const result = await writeSample(outputDir, sizeMb);
    console.log(`${result.filePath}  ${formatBytes(result.size)}  items=${result.itemCount}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

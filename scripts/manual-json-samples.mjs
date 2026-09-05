import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// User-facing fixtures always live beside the existing samples, never in temp directories.
export async function saveManualJsonSample(name, text, directory = path.resolve('json')) {
  if (path.basename(name) !== name || !name.endsWith('.json')) throw new Error('Invalid JSON sample name');
  await mkdir(directory, { recursive: true });
  const fingerprint = createHash('sha256').update(text).digest('hex').slice(0, 12);
  for (const candidate of [name, `${name.slice(0, -5)}-${fingerprint}.json`]) {
    const file = path.join(directory, candidate);
    try {
      await writeFile(file, text, { flag: 'wx' });
      return file;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if ((await readFile(file, 'utf8')) === text) return file;
    }
  }
  throw new Error(`Existing samples differ; refusing to overwrite ${name}`);
}

import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function validateJsonSaveRequest(value: unknown): { name: string; text: string } {
  if (!value || typeof value !== 'object') throw new TypeError('Invalid save request');
  const request = value as { name?: unknown; text?: unknown };
  if (typeof request.text !== 'string' || typeof request.name !== 'string') throw new TypeError('Invalid save request');
  // Suggested names must never supply a path, including Windows paths on macOS.
  const name =
    Array.from(request.name.slice(0, 150), (character) =>
      character.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(character) ? '-' : character
    ).join('') || 'document.json';
  return { name, text: request.text };
}

/** Replace only after the complete UTF-8 file is written; failures leave the target intact. */
export async function writeJsonFileAtomically(destination: string, text: string) {
  const temporary = path.join(path.dirname(destination), `.fxxkjson-${randomUUID()}.tmp`);
  let created = false;
  try {
    const file = await fs.open(temporary, 'wx', 0o600);
    created = true;
    try {
      await file.writeFile(text, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    await fs.rename(temporary, destination);
    created = false;
  } finally {
    if (created) await fs.unlink(temporary).catch(() => {});
  }
}

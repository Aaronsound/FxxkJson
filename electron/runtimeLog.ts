import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

export const logDir = path.join(app.getPath('userData'), 'logs');
export const logFilePath = path.join(logDir, 'runtime.log');

const MAX_LOG_READ_BYTES = 1024 * 1024;
const ERROR_EVENT_PATTERN = /(failed|error|timeout|stalled|gone|exception|rejection)/i;
const WARN_EVENT_PATTERN = /(blocked|warning|fallback|disabled)/i;

type RuntimeLogLevel = 'info' | 'warn' | 'error';

export async function appendRuntimeLog(entry: string) {
  await fs.mkdir(logDir, { recursive: true });
  await fs.appendFile(logFilePath, `[${new Date().toISOString()}] ${entry}\n`, 'utf8');
}

export async function readRecentRuntimeLog(maxBytes = 160 * 1024) {
  await fs.mkdir(logDir, { recursive: true });

  try {
    const stats = await fs.stat(logFilePath);
    const byteLength = Math.max(0, Math.min(stats.size, Math.floor(maxBytes)));
    const start = Math.max(0, stats.size - byteLength);
    const file = await fs.open(logFilePath, 'r');

    try {
      const buffer = Buffer.alloc(byteLength);
      await file.read(buffer, 0, byteLength, start);
      return {
        path: logFilePath,
        content: buffer.toString('utf8'),
        truncated: start > 0,
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        path: logFilePath,
        content: '',
        truncated: false,
      };
    }

    throw error;
  }
}

function getRuntimeLogLevel(event: string): RuntimeLogLevel {
  if (ERROR_EVENT_PATTERN.test(event)) {
    return 'error';
  }

  if (WARN_EVENT_PATTERN.test(event)) {
    return 'warn';
  }

  return 'info';
}

export function logRuntimeEvent(event: string, details: object = {}) {
  appendRuntimeLog(
    JSON.stringify({
      event,
      level: getRuntimeLogLevel(event),
      ...details,
    })
  ).catch(() => {
    // Ignore logging failures in the main process.
  });
}

export function getLogReadLimit(maxBytes: unknown) {
  if (typeof maxBytes !== 'number' || !Number.isFinite(maxBytes)) {
    return undefined;
  }

  return Math.min(MAX_LOG_READ_BYTES, Math.max(0, Math.floor(maxBytes)));
}

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  '.git',
  '.npm-cache',
  'dist-electron',
  'dist-renderer',
  'json',
  'node_modules',
  'release',
]);
const INCLUDED_EXTENSIONS = new Set([
  '.css',
  '.cjs',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);
const INCLUDED_ROOT_FILES = new Set([
  'package.json',
  'README.md',
  'tsconfig.json',
  'tsconfig.electron.json',
  'vite.config.ts',
]);

// Escaped strings keep this guard from matching its own marker list.
const MOJIBAKE_PATTERNS = [
  { label: 'replacement character', value: '\uFFFD' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u5A0C\uFF05\u6E41' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u9359\uE208\u7F8B' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u8930\u6485\u58A0' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u7487\u8BEB\u5F47' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u93C3\u30E5\u7E54' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u6FB6\u8FAB\u89E6' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u93CD\u8235\u20AC' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u59DD\uFF45\u6E2A' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u9428\u6B12\uE1A4' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u6DC7\uE06A\uFFFD' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u7F02\u681E\u7DEB' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u7035\u715A' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u5BB8\u67E5\u20AC\u5909\u8151\u9359\u5145\u6676' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u5BB8\u67E5\u20AC' },
  { label: 'UTF-8-as-GBK mojibake', value: '\u9359\u5145' },
  { label: 'Latin-1 mojibake', value: '\u00C3' },
  { label: 'Latin-1 mojibake', value: '\u00C2' },
  { label: 'Latin-1 mojibake', value: '\u00EF\u00BF\u00BD' },
];

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(ROOT, fullPath);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walk(fullPath);
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name);
    if (INCLUDED_EXTENSIONS.has(extension) || INCLUDED_ROOT_FILES.has(relativePath)) {
      yield fullPath;
    }
  }
}

function getLineAndColumn(text, offset) {
  const before = text.slice(0, offset);
  const lines = before.split(/\r?\n/u);

  return {
    line: lines.length,
    column: lines.at(-1).length + 1,
  };
}

async function main() {
  const findings = [];

  for await (const filePath of walk(ROOT)) {
    const text = await fs.readFile(filePath, 'utf8');
    for (const pattern of MOJIBAKE_PATTERNS) {
      const offset = text.indexOf(pattern.value);
      if (offset === -1) {
        continue;
      }

      const location = getLineAndColumn(text, offset);
      findings.push({
        file: path.relative(ROOT, filePath),
        label: pattern.label,
        ...location,
      });
    }
  }

  if (findings.length > 0) {
    console.error('Potential text encoding problems found:');
    for (const finding of findings) {
      console.error(`- ${finding.file}:${finding.line}:${finding.column} (${finding.label})`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Text encoding check passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

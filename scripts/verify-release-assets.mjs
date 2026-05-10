import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const EXPECTED_ASSETS_BY_TARGET = {
  'macos-arm64': ['.dmg', '.zip'],
  'macos-x64': ['.dmg', '.zip'],
  'windows-x64': ['.exe', '.zip'],
};

function printUsage() {
  console.error([
    'Usage:',
    '  node scripts/verify-release-assets.mjs local <target> [directory]',
    '  node scripts/verify-release-assets.mjs release <assets-json-file> [target...]',
    '',
    `Targets: ${Object.keys(EXPECTED_ASSETS_BY_TARGET).join(', ')}`,
  ].join('\n'));
}

function getExpectation(target) {
  const expected = EXPECTED_ASSETS_BY_TARGET[target];
  if (!expected) {
    throw new Error(`Unknown release target "${target}"`);
  }
  return expected;
}

function assertTargetAssets(target, assets) {
  const expectedExtensions = getExpectation(target);
  const names = assets.map((asset) => asset.name);

  expectedExtensions.forEach((extension) => {
    const found = assets.find((asset) => (
      asset.name.startsWith(`${target}-`)
      && asset.name.endsWith(extension)
      && asset.size > 0
    ));

    if (!found) {
      throw new Error(`Missing ${target} asset ending in ${extension}. Found: ${names.join(', ') || '(none)'}`);
    }
  });
}

async function readLocalAssets(directory) {
  const resolved = path.resolve(directory);
  const entries = await fs.readdir(resolved, { withFileTypes: true });
  const assets = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(resolved, entry.name);
    const stat = await fs.stat(filePath);
    assets.push({
      name: entry.name,
      size: stat.size,
    });
  }

  return assets;
}

async function readReleaseAssets(jsonPath) {
  const payload = await fs.readFile(path.resolve(jsonPath), 'utf8');
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed)) {
    throw new Error('Release asset JSON must be an array');
  }

  return parsed.map((asset) => ({
    name: String(asset.name ?? ''),
    size: Number(asset.size ?? 0),
  }));
}

async function verifyLocal(target, directory = 'release-upload') {
  const assets = await readLocalAssets(directory);
  assertTargetAssets(target, assets);
  console.log(`Local release assets passed for ${target}`);
  console.table(assets);
}

async function verifyRelease(jsonPath, targets) {
  const assets = await readReleaseAssets(jsonPath);
  const selectedTargets = targets.length > 0
    ? targets
    : Object.keys(EXPECTED_ASSETS_BY_TARGET);

  selectedTargets.forEach((target) => assertTargetAssets(target, assets));
  console.log(`Release asset check passed for ${selectedTargets.join(', ')}`);
  console.table(assets);
}

async function main() {
  const [mode, firstArg, ...rest] = process.argv.slice(2);

  if (mode === 'local' && firstArg) {
    await verifyLocal(firstArg, rest[0]);
    return;
  }

  if (mode === 'release' && firstArg) {
    await verifyRelease(firstArg, rest);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

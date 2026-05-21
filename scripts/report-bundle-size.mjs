import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

const rendererDir = new URL('../dist-renderer/', import.meta.url);
const assetsDir = new URL('../dist-renderer/assets/', import.meta.url);
const assetBudgetBytes = 2_500_000;

async function readAssetSizes(directory) {
  const entries = await readdir(directory);
  return Promise.all(
    entries.map(async (entry) => {
      const filePath = join(directory.pathname, entry);
      const fileStat = await stat(filePath);
      return {
        bytes: fileStat.size,
        name: basename(filePath),
      };
    })
  );
}

function formatKilobytes(bytes) {
  return `${(bytes / 1024).toFixed(bytes >= 1024 * 1024 ? 0 : 1)} kB`;
}

try {
  await stat(rendererDir);
} catch {
  throw new Error('Renderer build output is missing. Run npm run build before npm run bundle:size.');
}

const assets = (await readAssetSizes(assetsDir)).sort((left, right) => right.bytes - left.bytes);
const oversizedAssets = assets.filter((asset) => asset.bytes > assetBudgetBytes);

console.table(
  assets.slice(0, 8).map((asset) => ({
    asset: asset.name,
    size: formatKilobytes(asset.bytes),
  }))
);

if (oversizedAssets.length > 0) {
  throw new Error(
    `Renderer asset budget exceeded: ${oversizedAssets
      .map((asset) => `${asset.name} ${formatKilobytes(asset.bytes)}`)
      .join(', ')}`
  );
}

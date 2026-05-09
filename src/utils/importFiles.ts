const IMPORTABLE_EXTENSIONS = ['.json', '.txt'];
const IMPORTABLE_MIME_TYPES = new Set([
  'application/json',
  'text/json',
  'text/plain',
]);

export function isJsonImportFile(file: Pick<File, 'name' | 'type'>) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return IMPORTABLE_EXTENSIONS.some((extension) => name.endsWith(extension))
    || IMPORTABLE_MIME_TYPES.has(type);
}

export function getFirstJsonImportFile(files: ArrayLike<File> | Iterable<File> | null | undefined) {
  if (!files) {
    return null;
  }

  return Array.from(files).find(isJsonImportFile) ?? null;
}

export function readImportedFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Import cancelled', 'AbortError'));
      return;
    }
    const reader = new FileReader();
    const cleanup = () => {
      signal.removeEventListener('abort', cancel);
      reader.onload = reader.onerror = reader.onabort = null;
    };
    const cancel = () => {
      cleanup();
      reader.abort();
      reject(new DOMException('Import cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    reader.onload = () => {
      cleanup();
      resolve(String(reader.result ?? ''));
    };
    reader.onerror = () => {
      cleanup();
      reject(reader.error ?? new Error('Unable to read file'));
    };
    reader.onabort = () => {
      cleanup();
      reject(new DOMException('Import cancelled', 'AbortError'));
    };
    try {
      reader.readAsText(file, 'utf-8');
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

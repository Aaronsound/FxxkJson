import { formatJsonText } from '../utils/jsonFormat';
import { compactJsonText } from '../utils/losslessJson';

self.onmessage = (event: MessageEvent<{ text: string; mode: 'formatted' | 'compact' }>) => {
  try {
    const text =
      event.data.mode === 'compact' ? compactJsonText(event.data.text) : formatJsonText(event.data.text).formatted;
    const buffer = new TextEncoder().encode(text).buffer;
    self.postMessage({ buffer }, { transfer: [buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};

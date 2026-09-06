export interface ClosedTabSnapshot {
  title: string;
  text: string;
}

// Keep source strings only, never editor models, worker indexes or disk snapshots.
// UTF-16 length is a conservative payload budget even when V8 stores Latin-1 strings compactly.
export function createClosedTabHistory(maxCount = 10, maxBytes = 128 * 1024 * 1024) {
  const entries: ClosedTabSnapshot[] = [];
  let bytes = 0;
  return {
    get size() {
      return entries.length;
    },
    get bytes() {
      return bytes;
    },
    push(snapshot: ClosedTabSnapshot) {
      const size = (snapshot.text.length + snapshot.title.length) * 2;
      if (!snapshot.text) return;
      // Do not let Reopen unexpectedly restore an older tab when the latest cannot be retained.
      if (size > maxBytes) {
        entries.length = 0;
        bytes = 0;
        return;
      }
      entries.push(snapshot);
      bytes += size;
      while (entries.length > maxCount || bytes > maxBytes) {
        const removed = entries.shift()!;
        bytes -= (removed.text.length + removed.title.length) * 2;
      }
    },
    pop() {
      const snapshot = entries.pop();
      if (snapshot) bytes -= (snapshot.text.length + snapshot.title.length) * 2;
      return snapshot;
    },
  };
}

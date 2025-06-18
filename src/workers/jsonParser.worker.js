// ── src/workers/jsonParser.worker.js ──
/* eslint-disable no-restricted-globals */

// Worker 只负责把原始 JSON 字符串转成带缩进的字符串
self.onmessage = (e) => {
  const raw = e.data;
  try {
    const obj = JSON.parse(raw);
    const formatted = JSON.stringify(obj, null, 2);
    postMessage({ success: true, data: formatted });
  } catch (err) {
    postMessage({ success: false, error: err.message });
  }
};

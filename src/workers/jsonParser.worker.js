/* eslint-disable no-restricted-globals */

/**
 * Worker 只负责 JSON 格式化。
 * 通过 requestId + tabId 回传，避免主线程出现“晚到结果覆盖新输入”的竞态。
 */
self.onmessage = (e) => {
  const { raw, requestId, tabId } = e.data || {};

  try {
    const obj = JSON.parse(raw);
    const formatted = JSON.stringify(obj, null, 2);
    postMessage({ success: true, data: formatted, requestId, tabId });
  } catch (err) {
    postMessage({
      success: false,
      error: err instanceof Error ? err.message : '未知错误',
      requestId,
      tabId,
    });
  }
};

// Hidden windows on some Windows CI hosts do not answer screenshot requests.
// Diagnostics must never keep a failed test (and its Electron child) alive forever.
export async function captureElectronScreenshot(cdp, params = {}, timeoutMs = 10_000) {
  let timeout;
  try {
    return await Promise.race([
      cdp.send('Page.captureScreenshot', { format: 'png', ...params }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Electron screenshot timed out')), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

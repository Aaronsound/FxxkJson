import http from 'node:http';
import process from 'node:process';

const DEFAULT_TIMEOUT_MS = 60000;
const KEY_MODIFIER = process.platform === 'darwin' ? 4 : 2;

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if ((response.statusCode ?? 500) >= 400) {
          reject(new Error(`HTTP ${response.statusCode}: ${body}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
  });
}

export async function waitFor(action, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await action();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        return;
      }

      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  close() {
    this.ws?.close();
  }
}

export async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Renderer evaluation failed');
  }

  return result.result?.value;
}

export async function pressShortcut(cdp, key, code) {
  const upperKey = key.toUpperCase();
  const keyCode = upperKey.length === 1 ? upperKey.charCodeAt(0) : undefined;
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers: KEY_MODIFIER,
    commands: code === 'KeyA' ? ['selectAll'] : undefined,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    modifiers: KEY_MODIFIER,
  });
}

export async function insertText(cdp, text) {
  await cdp.send('Input.insertText', { text });
}

export async function clickSelector(cdp, selector) {
  const clicked = await evaluate(
    cdp,
    `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: rect.left + Math.min(20, rect.width / 2),
      clientY: rect.top + Math.min(10, rect.height / 2)
    }));
    element.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: rect.left + Math.min(20, rect.width / 2),
      clientY: rect.top + Math.min(10, rect.height / 2)
    }));
    element.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      button: 0,
      clientX: rect.left + Math.min(20, rect.width / 2),
      clientY: rect.top + Math.min(10, rect.height / 2)
    }));
    return true;
  })()`
  );

  if (!clicked) {
    throw new Error(`Could not click ${selector}`);
  }
}

export async function clickButtonByText(cdp, text) {
  const clicked = await evaluate(
    cdp,
    `(() => {
    const button = Array.from(document.querySelectorAll('button'))
      .find((item) => item.textContent?.trim() === ${JSON.stringify(text)});
    if (!button) return false;
    button.click();
    return true;
  })()`
  );

  if (!clicked) {
    throw new Error(`Could not click button ${text}`);
  }
}

export async function connectToElectronPage(port) {
  const targets = await waitFor(async () => getJson(`http://127.0.0.1:${port}/json/list`), 'Electron debug target');
  const page = targets.find(
    (target) => target.type === 'page' && target.webSocketDebuggerUrl && !target.url.startsWith('devtools://')
  );

  if (!page) {
    throw new Error('Could not find Electron renderer target');
  }

  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  return cdp;
}

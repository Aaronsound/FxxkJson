import { clickButtonByText, clickSelector, evaluate, insertText, pressShortcut, waitFor } from './e2e-cdp-helpers.mjs';

async function rightClickSelector(cdp, selector) {
  const point = await evaluate(
    cdp,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + Math.min(20, rect.width / 2),
        y: rect.top + Math.min(10, rect.height / 2)
      };
    })()`
  );

  if (!point) {
    throw new Error(`Could not right click ${selector}`);
  }

  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    button: 'right',
    buttons: 2,
    clickCount: 1,
    x: point.x,
    y: point.y,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    button: 'right',
    buttons: 0,
    clickCount: 1,
    x: point.x,
    y: point.y,
  });
}

async function selectRightLineText(cdp, targetText) {
  return evaluate(
    cdp,
    `(() => {
      const line = Array.from(document.querySelectorAll('.right-editor-pane .large-json-line-text'))
        .find((element) => element.textContent?.includes(${JSON.stringify(targetText)}));
      if (!line) return '';
      line.closest('.large-json-viewer')?.focus({ preventScroll: true });

      const lineText = line.textContent ?? '';
      const start = lineText.indexOf(${JSON.stringify(targetText)});
      if (start < 0) return '';
      const end = start + ${JSON.stringify(targetText)}.length;

      const findTextPoint = (node, targetOffset) => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        let consumed = 0;
        while (textNode) {
          const length = textNode.textContent?.length ?? 0;
          if (consumed + length >= targetOffset) {
            return { node: textNode, offset: Math.max(0, targetOffset - consumed) };
          }
          consumed += length;
          textNode = walker.nextNode();
        }
        return null;
      };

      const startPoint = findTextPoint(line, start);
      const endPoint = findTextPoint(line, end);
      if (!startPoint || !endPoint) return '';

      const range = document.createRange();
      range.setStart(startPoint.node, startPoint.offset);
      range.setEnd(endPoint.node, endPoint.offset);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const rect = line.getBoundingClientRect();
      line.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: rect.left + 40,
        clientY: rect.top + Math.min(10, rect.height / 2)
      }));
      return window.getSelection()?.toString() ?? '';
    })()`
  );
}

async function openTraceIdContextMenu(cdp) {
  const openedContextMenu = await evaluate(
    cdp,
    `(() => {
      const line = Array.from(document.querySelectorAll('.right-editor-pane .large-json-line-text'))
        .find((element) => element.getAttribute('title')?.includes('traceId'));
      if (!line) return false;
      const rect = line.getBoundingClientRect();
      line.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        button: 2,
        clientX: rect.left + 32,
        clientY: rect.top + Math.min(10, rect.height / 2)
      }));
      return true;
    })()`
  );

  if (!openedContextMenu) {
    throw new Error('Could not open right-side context menu');
  }

  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(Array.from(document.querySelectorAll('.large-json-context-menu-item')).find((button) => button.textContent?.trim() === '编辑当前值'))`
      ),
    'right context menu'
  );
}

export async function runSearchReplaceScenario(cdp) {
  await evaluate(
    cdp,
    `(() => {
      const target = document.querySelector('.left-editor-pane .monaco-editor textarea')
        ?? document.querySelector('.left-editor-pane .large-raw-viewer')
        ?? document.querySelector('.left-editor-pane .monaco-editor');
      target?.focus?.();
      return Boolean(target);
    })()`
  );
  await pressShortcut(cdp, 'f', 'KeyF');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector('.left-editor-pane .pane-find-input[placeholder="搜索原始 JSON"]')
          && document.querySelector('.left-editor-pane .pane-find-input[placeholder="替换为"]'))`
      ),
    'left search and replace widget'
  );
  await insertText(cdp, 'requestId');
  await waitFor(
    () => evaluate(cdp, `(document.querySelector('.left-editor-pane .pane-find-count')?.textContent ?? '') !== '0/0'`),
    'left search results'
  );
  await evaluate(cdp, `document.querySelector('.left-editor-pane .pane-find-input[placeholder="替换为"]')?.focus()`);
  await insertText(cdp, 'traceId');
  await clickButtonByText(cdp, '全部替换');
  await waitFor(() => evaluate(cdp, `document.body.innerText.includes('traceId')`), 'left replace all', 90000);

  await evaluate(
    cdp,
    `(() => {
      const target = document.querySelector('.right-editor-pane .large-json-viewer, .right-editor-pane .monaco-editor textarea, .right-editor-pane .monaco-editor');
      target?.focus?.();
      return Boolean(target);
    })()`
  );
  await pressShortcut(cdp, 'f', 'KeyF');
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.right-editor-pane .pane-find-input'))`),
    'right search widget'
  );
  await insertText(cdp, 'traceId');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => {
        const text = document.querySelector('.right-editor-pane .pane-find-count')?.textContent ?? '';
        return text !== '0/0' && text.includes('/');
      })()`
      ),
    'right search results'
  );
}

export async function runRightNodeScenario(cdp) {
  const clickedNode = await evaluate(
    cdp,
    `(() => {
      const line = Array.from(document.querySelectorAll('.right-editor-pane .large-json-line-text'))
        .find((element) => element.getAttribute('title')?.includes('traceId'));
      if (!line) return false;
      const rect = line.getBoundingClientRect();
      line.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: rect.left + 32,
        clientY: rect.top + Math.min(10, rect.height / 2)
      }));
      return true;
    })()`
  );

  if (!clickedNode) {
    throw new Error('Could not click a right-side traceId node');
  }

  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(
        document.querySelector('.right-editor-pane .rightNodeSelectionHighlight')
        && (document.body.innerText.includes('已定位到 offset') || document.body.innerText.includes('已选中右侧节点 offset'))
      )`
      ),
    'right click locate highlight'
  );

  await openTraceIdContextMenu(cdp);
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.large-json-context-menu-item'))
      .find((button) => button.textContent?.trim() === '删除当前节点')?.click()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `document.body.innerText.includes('删除当前节点') && document.body.innerText.includes('req-e2e-000000')`
      ),
    'delete node confirmation preview'
  );
  await evaluate(cdp, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(
    () =>
      evaluate(
        cdp,
        `!document.querySelector('.right-node-mutation-card') && document.body.innerText.includes('req-e2e-000000')`
      ),
    'delete node dialog escaped'
  );

  await openTraceIdContextMenu(cdp);
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.large-json-context-menu-item'))
      .find((button) => button.textContent?.trim() === '重命名 key')?.click()`
  );
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.right-node-mutation-card input'))`),
    'rename key dialog'
  );
  await evaluate(
    cdp,
    `(() => {
      const input = document.querySelector('.right-node-mutation-card input');
      if (!input) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, ' renamedRequestId ');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`
  );
  await waitFor(
    () =>
      evaluate(cdp, `document.body.innerText.includes('首尾空格') && document.body.innerText.includes('已有同名 key')`),
    'rename key warnings'
  );
  await clickButtonByText(cdp, '取消');
  await waitFor(
    () => evaluate(cdp, `!document.querySelector('.right-node-mutation-card')`),
    'rename key dialog cancelled'
  );

  await openTraceIdContextMenu(cdp);
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.large-json-context-menu-item'))
      .find((button) => button.textContent?.trim() === '编辑当前值')?.click()`
  );
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.modal-card .monaco-editor textarea'))`),
    'node edit modal'
  );
  const directEdit = await evaluate(
    cdp,
    `(() => {
      if (window.__HANJSON_E2E_EDIT_MODAL__?.setValue) {
        window.__HANJSON_E2E_EDIT_MODAL__.setValue('"req-e2e-updated"');
        return true;
      }
      const monacoApi = window.monaco;
      const models = monacoApi?.editor?.getModels?.() ?? [];
      const model = models.find((item) => item.getValue().includes('req-e2e-000000')) ?? models.at(-1);
      if (!model) return false;
      model.setValue('"req-e2e-updated"');
      return true;
    })()`
  );
  if (!directEdit) {
    await clickSelector(cdp, '.modal-card .monaco-editor textarea');
    await pressShortcut(cdp, 'a', 'KeyA');
    await insertText(cdp, JSON.stringify('req-e2e-updated'));
  }
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.modal-actions button'))
      .find((button) => button.textContent?.includes('更新当前节点'))?.click()`
  );
  await waitFor(
    () =>
      evaluate(cdp, `document.body.innerText.includes('req-e2e-updated') && !document.querySelector('.modal-card')`),
    'node edit saved',
    90000
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => {
        return document.body.innerText.includes('req-e2e-updated')
          && (document.body.innerText.includes('已定位到 offset') || document.body.innerText.includes('已选中右侧节点 offset'))
          && !document.querySelector('.modal-card');
      })()`
      ),
    'right node save state restored after edit'
  );
}

export async function runClipboardAndCompareScenario(cdp) {
  const selectedRightValue = await selectRightLineText(cdp, 'req-e2e-updated');
  if (selectedRightValue !== 'req-e2e-updated') {
    throw new Error(`Right selected value was not preserved after mouseup: ${selectedRightValue}`);
  }
  await pressShortcut(cdp, 'c', 'KeyC', 1);
  await waitFor(
    () => evaluate(cdp, `window.electronAPI.readClipboardText().then((text) => text === 'req-e2e-updated')`),
    'right selected value copied with Alt+C'
  );

  await clickSelector(cdp, '.add-tab');
  await waitFor(() => evaluate(cdp, `document.querySelectorAll('.tab-bar .tab').length >= 2`), 'second tab created');
  await clickSelector(cdp, '.left-editor-pane .monaco-editor textarea');
  await evaluate(cdp, `window.electronAPI.writeClipboardText('{"pastedFromContextMenu":true}')`);
  await rightClickSelector(cdp, '.left-editor-pane .monaco-editor textarea');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(Array.from(document.querySelectorAll('.large-json-context-menu-item'))
            .find((button) => button.textContent?.trim() === '粘贴'))`
      ),
    'left editor context menu paste item'
  );
  await evaluate(
    cdp,
    `Array.from(document.querySelectorAll('.large-json-context-menu-item'))
      .find((button) => button.textContent?.trim() === '粘贴')?.click()`
  );
  await waitFor(
    () => evaluate(cdp, `document.body.innerText.includes('pastedFromContextMenu')`),
    'left context menu paste inserted clipboard text'
  );
  await pressShortcut(cdp, 'a', 'KeyA');
  await insertText(cdp, '{"broken": true,');
  await clickButtonByText(cdp, '对比 JSON');
  await waitFor(() => evaluate(cdp, `Boolean(document.querySelector('.json-compare-card'))`), 'compare dialog opened');
  await clickButtonByText(cdp, '开始对比');
  await waitFor(() => evaluate(cdp, `document.body.innerText.includes('解析失败')`), 'invalid JSON compare error');
}

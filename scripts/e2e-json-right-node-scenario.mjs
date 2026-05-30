import { clickButtonByText, clickSelector, evaluate, insertText, pressShortcut, waitFor } from './e2e-cdp-helpers.mjs';
import { openTraceIdContextMenu } from './e2e-json-dom-actions.mjs';

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

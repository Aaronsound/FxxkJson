import { clickButtonByText, clickSelector, evaluate, insertText, pressShortcut, waitFor } from './e2e-cdp-helpers.mjs';
import { rightClickSelector, selectRightLineText } from './e2e-json-dom-actions.mjs';

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
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.left-editor-pane .monaco-editor textarea'))`),
    'second tab left editor'
  );
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

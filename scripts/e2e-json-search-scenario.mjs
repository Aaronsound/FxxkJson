import { clickButtonByText, evaluate, insertText, pressShortcut, waitFor } from './e2e-cdp-helpers.mjs';

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

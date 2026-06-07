import { clickButtonByText, clickSelector, evaluate, waitFor } from './e2e-cdp-helpers.mjs';

async function waitForEditModal(cdp) {
  await waitFor(
    () =>
      evaluate(cdp, `Boolean(document.querySelector('.modal-card') && window.__HANJSON_E2E_EDIT_MODAL__?.getValue)`),
    'edit JSON modal'
  );
}

async function openEditAndRequireFolding(cdp, label) {
  await clickButtonByText(cdp, '编辑 JSON');
  await waitForEditModal(cdp);
  await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => {
          const config = window.__HANJSON_E2E_EDIT_MODAL__.getFoldingConfig();
          return config.folding === true
            && config.showFoldingControls === 'always'
            && config.largeFileOptimizations === false
            && config.foldingMaximumRegions >= 200000;
        })()`
      ),
    label,
    90000
  );
  await waitFor(
    () => evaluate(cdp, `window.__HANJSON_E2E_EDIT_MODAL__.getVisibleFoldingControlCount() > 0`),
    `${label} visible folding controls`,
    90000
  );
}

async function closeEditModal(cdp, label) {
  await waitFor(
    () =>
      evaluate(
        cdp,
        `!Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.trim() === '取消')?.disabled`
      ),
    `${label} cancel enabled`,
    120000
  );
  await clickButtonByText(cdp, '取消');
  await waitFor(() => evaluate(cdp, `!document.querySelector('.modal-card')`), `${label} closed`);
}

async function openEditContextMenu(cdp) {
  const opened = await evaluate(
    cdp,
    `(() => {
      const shell = document.querySelector('.modal-editor-shell');
      if (!shell) return false;
      shell.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 180,
        clientY: 260,
        button: 2
      }));
      return true;
    })()`
  );
  if (!opened) {
    throw new Error('Could not open edit modal context menu');
  }
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.large-json-context-menu'))`),
    'edit context menu'
  );
}

async function copyLiteralIntoSecondTab(cdp) {
  const originalTabTitle = await evaluate(
    cdp,
    `document.querySelector('.tab-bar .tab.active .tab-title')?.textContent?.trim() ?? ''`
  );
  if (!originalTabTitle) {
    throw new Error('Could not identify the original active tab before copying literal');
  }

  await openEditContextMenu(cdp);
  await clickButtonByText(cdp, '复制 JSON 字符串字面量');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `window.electronAPI.readClipboardText().then((text) => text.startsWith('"[') && text.includes('req-e2e-000000'))`
      ),
    'large JSON literal copied',
    120000
  );
  await closeEditModal(cdp, 'copy literal edit JSON modal');

  await clickSelector(cdp, '.add-tab');
  await waitFor(
    () => evaluate(cdp, `document.querySelectorAll('.tab-bar .tab').length >= 2`),
    'second tab after literal copy'
  );
  await evaluate(
    cdp,
    `(async () => {
      const literal = await window.electronAPI.readClipboardText();
      await window.__HANJSON_E2E_APP__.importText('literal-from-clipboard.json', new Blob([literal]).size, literal);
      return true;
    })()`
  );
  await waitFor(
    () => evaluate(cdp, `document.body.innerText.includes('literal-from-clipboard.json')`),
    'literal imported into second tab',
    120000
  );

  const selected = await evaluate(
    cdp,
    `(() => {
      const originalTab = Array.from(document.querySelectorAll('.tab-bar .tab'))
        .find((tab) => tab.querySelector('.tab-title')?.textContent?.trim() === ${JSON.stringify(originalTabTitle)});
      if (!originalTab) return false;
      originalTab.click();
      return true;
    })()`
  );
  if (!selected) {
    throw new Error('Could not switch back to the original tab');
  }
  await waitFor(
    () =>
      evaluate(
        cdp,
        `document.querySelector('.tab-bar .tab.active .tab-title')?.textContent?.trim() === ${JSON.stringify(
          originalTabTitle
        )}`
      ),
    'original sample tab restored',
    120000
  );
}

export async function runRepeatedEditFoldingScenario(cdp) {
  await openEditAndRequireFolding(cdp, 'first edit JSON folding controls');
  await copyLiteralIntoSecondTab(cdp);
  await openEditAndRequireFolding(cdp, 'first edit after copy literal and tab switch folding controls');
  await closeEditModal(cdp, 'first edit after copy literal and tab switch folding controls');
  await openEditAndRequireFolding(cdp, 'second edit JSON folding controls');
  await closeEditModal(cdp, 'second edit JSON folding controls');
}

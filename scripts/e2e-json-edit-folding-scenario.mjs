import { clickButtonByText, evaluate, waitFor } from './e2e-cdp-helpers.mjs';

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
  await clickButtonByText(cdp, '取消');
  await waitFor(() => evaluate(cdp, `!document.querySelector('.modal-card')`), `${label} closed`);
}

export async function runRepeatedEditFoldingScenario(cdp) {
  await openEditAndRequireFolding(cdp, 'first edit JSON folding controls');
  await openEditAndRequireFolding(cdp, 'second edit JSON folding controls');
}

import { clickButtonByText, clickSelector, evaluate, waitFor } from './e2e-cdp-helpers.mjs';

const ARRAY_SAMPLE = JSON.stringify([
  { id: 0, name: 'FxxkJson edit transform sample 0', active: true },
  { id: 1, name: 'FxxkJson edit transform sample 1', active: false },
]);

const OBJECT_SAMPLE = JSON.stringify({ name: 'Aaron', age: 18 });

async function importText(cdp, name, content) {
  await evaluate(
    cdp,
    `(async () => {
      await window.__HANJSON_E2E_APP__.importText(${JSON.stringify(name)}, ${Buffer.byteLength(content)}, ${JSON.stringify(
        content
      )});
      return true;
    })()`
  );
}

async function getEditModalValue(cdp) {
  return evaluate(cdp, `window.__HANJSON_E2E_EDIT_MODAL__?.getValue?.() ?? ''`);
}

async function openEditModal(cdp) {
  await waitFor(
    () =>
      evaluate(
        cdp,
        `!Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.trim() === '编辑 JSON')?.disabled`
      ),
    'edit JSON button enabled'
  );
  await clickButtonByText(cdp, '编辑 JSON');
  await waitFor(
    () =>
      evaluate(cdp, `Boolean(document.querySelector('.modal-card') && window.__HANJSON_E2E_EDIT_MODAL__?.getValue)`),
    'edit JSON modal'
  );
}

function extractObjectAroundMarker(text, marker) {
  const markerOffset = text.indexOf(marker);
  const startOffset = text.lastIndexOf('{', markerOffset);
  if (markerOffset < 0 || startOffset < 0) {
    throw new Error(`Could not find object marker ${marker}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let offset = startOffset; offset < text.length; offset += 1) {
    const character = text[offset];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startOffset, offset + 1);
      }
    }
  }

  throw new Error(`Could not extract object marker ${marker}`);
}

export async function runEditTransformScenario(cdp) {
  await importText(cdp, 'edit-transform-array.json', ARRAY_SAMPLE);
  await openEditModal(cdp);
  await waitFor(
    () => getEditModalValue(cdp).then((value) => value.includes('FxxkJson edit transform sample 1')),
    'edit transform array imported'
  );

  const arrayEditValue = await getEditModalValue(cdp);
  const selectedObject = extractObjectAroundMarker(arrayEditValue, '"id": 1');
  const expectedSelectedString = JSON.stringify(JSON.stringify(JSON.parse(selectedObject)));
  const selected = await evaluate(
    cdp,
    `window.__HANJSON_E2E_EDIT_MODAL__?.selectText(${JSON.stringify(selectedObject)}) ?? false`
  );
  if (!selected) {
    throw new Error('Could not select JSON object in edit modal');
  }

  await waitFor(() => evaluate(cdp, `document.body.innerText.includes('将转换选中内容')`), 'selection transform hint');
  await clickButtonByText(cdp, '转成 JSON 字符串');
  await waitFor(
    () => getEditModalValue(cdp).then((value) => value.includes(expectedSelectedString)),
    'selected object converted to JSON string'
  );
  await clickButtonByText(cdp, '复制转换结果');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `window.electronAPI.readClipboardText().then((text) => text === ${JSON.stringify(expectedSelectedString)})`
      ),
    'converted selection copied'
  );
  await clickButtonByText(cdp, '取消');
  await waitFor(() => evaluate(cdp, `!document.querySelector('.modal-card')`), 'array edit modal closed');

  await clickSelector(cdp, '.add-tab');
  await waitFor(
    () => evaluate(cdp, `document.querySelectorAll('.tab-bar .tab').length >= 2`),
    'edit transform object tab'
  );
  await importText(cdp, 'edit-transform-object.json', OBJECT_SAMPLE);
  await openEditModal(cdp);
  await waitFor(
    () => getEditModalValue(cdp).then((value) => value.includes('Aaron')),
    'edit transform object imported'
  );

  const expectedDocumentString = JSON.stringify(JSON.stringify(JSON.parse(OBJECT_SAMPLE)));
  await waitFor(
    () => evaluate(cdp, `document.body.innerText.includes('未选中内容，将转换整段')`),
    'document transform hint'
  );
  await clickButtonByText(cdp, '转成 JSON 字符串');
  await waitFor(
    () => getEditModalValue(cdp).then((value) => value === expectedDocumentString),
    'whole object converted to JSON string'
  );
  await clickButtonByText(cdp, '复制转换结果');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `window.electronAPI.readClipboardText().then((text) => text === ${JSON.stringify(expectedDocumentString)})`
      ),
    'converted document copied'
  );
  await clickButtonByText(cdp, '取消');
  await waitFor(() => evaluate(cdp, `!document.querySelector('.modal-card')`), 'object edit modal closed');
  await clickSelector(cdp, '.add-tab');
}

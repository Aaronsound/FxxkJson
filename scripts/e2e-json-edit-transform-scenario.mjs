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

async function getTextStartLine(cdp, text) {
  return evaluate(
    cdp,
    `(() => {
      const editor = window.__HANJSON_E2E_EDIT_MODAL__?.__editor;
      const model = editor?.getModel?.();
      const value = model?.getValue?.() ?? '';
      const offset = value.indexOf(${JSON.stringify(text)});
      return model && offset >= 0 ? model.getPositionAt(offset).lineNumber : null;
    })()`
  );
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

async function getFoldControlHealth(cdp) {
  return evaluate(
    cdp,
    `(() => {
      const buttons = Array.from(document.querySelectorAll('.modal-editor-shell .edit-modal-fold-button'));
      const rects = buttons.map((button) => button.getBoundingClientRect());
      const roundedTops = rects.map((rect) => Math.round(rect.top));
      const lineNumbers = buttons.map((button) => button.getAttribute('data-line-number') ?? '');
      const hasOverlap = rects.some((rect, index) => rects.some((other, otherIndex) => {
        if (index >= otherIndex) return false;
        return !(rect.right <= other.left
          || other.right <= rect.left
          || rect.bottom <= other.top
          || other.bottom <= rect.top);
      }));
      return {
        collapsedCount: buttons.filter((button) => button.classList.contains('collapsed')).length,
        hasDuplicateLine: new Set(lineNumbers).size !== lineNumbers.length,
        hasDuplicateTop: new Set(roundedTops).size !== roundedTops.length,
        hasOverlap,
      };
    })()`
  );
}

async function clickObjectFoldAfterTransform(cdp, lineNumber, label) {
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector('.modal-editor-shell .edit-modal-fold-button[data-line-number="${lineNumber}"]'))`
      ),
    `${label} restored selection folding control`
  );
  await evaluate(
    cdp,
    `document.querySelector('.modal-editor-shell .edit-modal-fold-button[data-line-number="${lineNumber}"]')?.click()`
  );
  await waitFor(async () => {
    const health = await getFoldControlHealth(cdp);
    return health.collapsedCount > 0 && !health.hasOverlap && !health.hasDuplicateTop && !health.hasDuplicateLine;
  }, `${label} restored object folded without overlapping controls`);
}

async function requireObjectFoldControl(cdp, lineNumber, label) {
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector('.modal-editor-shell .edit-modal-fold-button[data-line-number="${lineNumber}"]:not(.collapsed)'))`
      ),
    `${label} restored expanded folding control`
  );
}

async function collapseObjectBeforeTransform(cdp, lineNumber, label) {
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector('.modal-editor-shell .edit-modal-fold-button[data-line-number="${lineNumber}"]'))`
      ),
    `${label} initial selection folding control`
  );
  await evaluate(
    cdp,
    `document.querySelector('.modal-editor-shell .edit-modal-fold-button[data-line-number="${lineNumber}"]')?.click()`
  );
  await waitFor(
    () =>
      evaluate(cdp, `document.querySelectorAll('.modal-editor-shell .edit-modal-fold-button.collapsed').length > 0`),
    `${label} object collapsed before selection transform`
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
  const selectionScenarios = [
    { collapseBeforeTransform: true, id: 0 },
    { collapseBeforeTransform: true, id: 1 },
    { collapseBeforeTransform: false, id: 0 },
    { collapseBeforeTransform: false, id: 1 },
  ];

  for (const scenario of selectionScenarios) {
    const label = `edit transform object ${scenario.id} ${
      scenario.collapseBeforeTransform ? 'after pre-collapse' : 'without pre-collapse'
    }`;
    await importText(cdp, `${label}.json`, ARRAY_SAMPLE);
    await openEditModal(cdp);
    await waitFor(
      () => getEditModalValue(cdp).then((value) => value.includes('FxxkJson edit transform sample 1')),
      `${label} array imported`
    );

    const arrayEditValue = await getEditModalValue(cdp);
    const selectedObject = extractObjectAroundMarker(arrayEditValue, `"id": ${scenario.id}`);
    const expectedSelectedString = JSON.stringify(JSON.stringify(JSON.parse(selectedObject)));
    const startLine = await getTextStartLine(cdp, selectedObject);
    if (!startLine) {
      throw new Error(`Could not find start line for ${label}`);
    }

    if (scenario.collapseBeforeTransform) {
      await collapseObjectBeforeTransform(cdp, startLine, label);
    }

    const selected = await evaluate(
      cdp,
      `window.__HANJSON_E2E_EDIT_MODAL__?.selectText(${JSON.stringify(selectedObject)}) ?? false`
    );
    if (!selected) {
      throw new Error(`Could not select JSON object for ${label}`);
    }

    await openEditContextMenu(cdp);
    await clickButtonByText(cdp, '选中内容转成 JSON 字符串');
    await waitFor(
      () => getEditModalValue(cdp).then((value) => value.includes(expectedSelectedString)),
      `${label} selected object converted to JSON string`
    );
    await openEditContextMenu(cdp);
    await clickButtonByText(cdp, '还原选中转义内容');
    await waitFor(
      () => getEditModalValue(cdp).then((value) => value.includes(selectedObject)),
      `${label} selected JSON string restored with surrounding indentation`
    );
    await requireObjectFoldControl(cdp, startLine, label);
    await clickObjectFoldAfterTransform(cdp, startLine, label);
    await clickButtonByText(cdp, '取消');
    await waitFor(() => evaluate(cdp, `!document.querySelector('.modal-card')`), `${label} array edit modal closed`);
    await clickSelector(cdp, '.add-tab');
  }

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
  await openEditContextMenu(cdp);
  await clickButtonByText(cdp, '整段转成 JSON 字符串');
  await waitFor(
    () => getEditModalValue(cdp).then((value) => value === expectedDocumentString),
    'whole object converted to JSON string'
  );
  await clickButtonByText(cdp, '取消');
  await waitFor(() => evaluate(cdp, `!document.querySelector('.modal-card')`), 'object edit modal closed');
  await clickSelector(cdp, '.add-tab');
}

import { evaluate, waitFor } from './e2e-cdp-helpers.mjs';

export async function rightClickSelector(cdp, selector) {
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

export async function selectRightLineText(cdp, targetText) {
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

export async function openTraceIdContextMenu(cdp) {
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

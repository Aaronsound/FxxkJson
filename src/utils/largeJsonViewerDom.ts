import { clamp } from './largeJsonViewerRender';

const MAX_LINE_TITLE_LENGTH = 1000;

export function getTextOffsetWithin(root: HTMLElement, node: Node, offset: number, fallbackLength: number) {
  const range = document.createRange();

  try {
    range.selectNodeContents(root);
    range.setEnd(node, offset);
    return clamp(range.toString().length, 0, fallbackLength);
  } catch {
    return fallbackLength;
  } finally {
    range.detach();
  }
}

export function getLineTextElementFromNode(node: Node, container: HTMLElement) {
  const element = node instanceof Element ? node : node.parentElement;
  const lineElement = element?.closest<HTMLElement>('.large-json-line-text') ?? null;

  if (!lineElement || !container.contains(lineElement)) {
    return null;
  }

  return lineElement;
}

export function getLineNumberFromElement(element: HTMLElement) {
  const lineNumber = Number(element.dataset.lineNumber);
  return Number.isFinite(lineNumber) ? lineNumber : null;
}

export function getFirstMeaningfulOffset(lineText: string) {
  const match = lineText.match(/\S/);
  return match?.index ?? 0;
}

export function getLineNumberForOffset(lineStarts: Uint32Array, offset: number) {
  let low = 0;
  let high = lineStarts.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result + 1;
}

export function getLargeJsonLineTitle(lineText: string) {
  if (lineText.length <= MAX_LINE_TITLE_LENGTH) {
    return lineText;
  }

  return `${lineText.slice(0, MAX_LINE_TITLE_LENGTH)}...`;
}

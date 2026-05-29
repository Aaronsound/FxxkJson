import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import LargeJsonReadonlyViewer from './LargeJsonReadonlyViewer';
import { buildLargeViewerData } from '../utils/largeJsonViewerData';

export const fixtureText = [
  '{',
  '  "outer": {',
  '    "items": [',
  '      1,',
  '      2',
  '    ]',
  '  },',
  '  "name": "alpha"',
  '}',
].join('\n');

export function renderViewer(overrides: Partial<React.ComponentProps<typeof LargeJsonReadonlyViewer>> = {}) {
  const text = overrides.text ?? fixtureText;
  const data = overrides.data ?? buildLargeViewerData(text, 1);
  if (!data) {
    throw new Error('Expected large viewer fixture data');
  }

  const props: React.ComponentProps<typeof LargeJsonReadonlyViewer> = {
    text,
    data,
    isDarkMode: false,
    wrapLongLines: false,
    collapsedLines: [],
    searchTerm: '',
    activeMatchIndex: 0,
    onCollapsedLinesChange: vi.fn(),
    onMatchCountChange: vi.fn(),
    onLocateOffset: vi.fn(),
    onCopyPath: vi.fn(),
    onCopyKey: vi.fn(),
    onCopyValue: vi.fn(),
    onCopyCompactJson: vi.fn(),
    onCopyFormattedJson: vi.fn(),
    onEditValue: vi.fn(),
    onDeleteValue: vi.fn(),
    onRenameKey: vi.fn(),
    onUnescapeValue: vi.fn(),
    onOpenFind: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<LargeJsonReadonlyViewer {...props} />),
    data,
    props,
  };
}

export function requireElement<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Expected element for selector: ${selector}`);
  }
  return element;
}

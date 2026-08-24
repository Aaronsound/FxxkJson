import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsonToolTabBar from './JsonToolTabBar';

function renderTabBar(overrides: Partial<React.ComponentProps<typeof JsonToolTabBar>> = {}) {
  const props: React.ComponentProps<typeof JsonToolTabBar> = {
    activeTabId: 'tab-1',
    renamingTab: null,
    tabs: [
      { id: 'tab-1', title: 'a.json' },
      { id: 'tab-2', title: 'very-long-sample-file-name.json' },
    ],
    onAddTab: vi.fn(),
    onCancelRenaming: vi.fn(),
    onCloseTab: vi.fn(),
    onFinishRenaming: vi.fn(),
    onRenamingChange: vi.fn(),
    onSelectTab: vi.fn(),
    onStartRenaming: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<JsonToolTabBar {...props} />),
    props,
  };
}

describe('JsonToolTabBar', () => {
  afterEach(() => {
    cleanup();
  });

  it('closes a tab without selecting it', () => {
    const { props } = renderTabBar();

    fireEvent.click(screen.getByRole('button', { name: 'close a.json' }));

    expect(props.onCloseTab).toHaveBeenCalledWith('tab-1');
    expect(props.onSelectTab).not.toHaveBeenCalled();
  });

  it('keeps tab and close button positions stable for repeated close clicks', () => {
    const tabStyles = readFileSync(join(process.cwd(), 'src/styles/tabs-overrides.css'), 'utf8');

    expect(tabStyles).toContain('--tab-width: 128px;');
    expect(tabStyles).toContain('flex: 0 0 var(--tab-width);');
    expect(tabStyles).toContain('width: var(--tab-width);');
    expect(tabStyles).toContain('box-sizing: border-box;');
    expect(tabStyles).toContain('flex: 1 1 auto;');
    expect(tabStyles).toContain('width: 20px;');
    expect(tabStyles).toContain('height: 20px;');
  });
});

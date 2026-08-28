import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
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

    fireEvent.click(screen.getByRole('button', { name: '关闭 a.json' }));

    expect(props.onCloseTab).toHaveBeenCalledWith('tab-1');
    expect(props.onSelectTab).not.toHaveBeenCalled();
  });

  it('keeps tab and close button positions stable for repeated close clicks', () => {
    const tabStyles = readFileSync(join(process.cwd(), 'src/styles/tabs.css'), 'utf8');

    expect(tabStyles).toContain('--tab-width: 128px;');
    expect(tabStyles).toContain('flex: 0 0 var(--tab-width);');
    expect(tabStyles).toContain('width: var(--tab-width);');
    expect(tabStyles).toContain('box-sizing: border-box;');
    expect(tabStyles).toContain('flex: 1 1 auto;');
    expect(tabStyles).toContain('width: 20px;');
    expect(tabStyles).toContain('height: 20px;');
  });

  it('keeps the add action outside the scrolling tab list', () => {
    const { container, props } = renderTabBar();

    const tabList = screen.getByRole('tablist', { name: 'JSON 标签页' });
    const addButton = screen.getByRole('button', { name: '新建标签' });
    expect(tabList.contains(addButton)).toBe(false);
    expect(container.querySelector('.tab-bar-actions')?.contains(addButton)).toBe(true);

    fireEvent.click(addButton);
    expect(props.onAddTab).toHaveBeenCalledTimes(1);
  });

  it('switches tabs with arrow, Home and End keys', () => {
    const { props } = renderTabBar();
    const tabs = screen.getAllByRole('tab');

    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');

    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
    fireEvent.keyDown(tabs[0], { key: 'End' });
    fireEvent.keyDown(tabs[1], { key: 'Home' });

    expect(props.onSelectTab).toHaveBeenNthCalledWith(1, 'tab-2');
    expect(props.onSelectTab).toHaveBeenNthCalledWith(2, 'tab-2');
    expect(props.onSelectTab).toHaveBeenNthCalledWith(3, 'tab-1');
  });

  it('shows fixed scroll controls when tabs overflow', async () => {
    renderTabBar();
    const tabList = screen.getByRole('tablist', { name: 'JSON 标签页' });
    const scrollBy = vi.fn();
    Object.defineProperties(tabList, {
      clientWidth: { configurable: true, value: 200 },
      scrollLeft: { configurable: true, value: 0, writable: true },
      scrollWidth: { configurable: true, value: 600 },
      scrollBy: { configurable: true, value: scrollBy },
    });

    fireEvent(window, new Event('resize'));

    const scrollRight = await screen.findByRole('button', { name: '向右滚动标签' });
    expect(screen.getByRole('button', { name: '向左滚动标签' })).toBeDisabled();
    fireEvent.click(scrollRight);

    await waitFor(() => expect(scrollBy).toHaveBeenCalledWith({ behavior: 'smooth', left: 160 }));
  });
});

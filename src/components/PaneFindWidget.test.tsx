import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PaneFindWidget from './PaneFindWidget';
import { DEFAULT_SEARCH_OPTIONS } from '../types/jsonTool';

function renderWidget(overrides: Partial<React.ComponentProps<typeof PaneFindWidget>> = {}) {
  const props: React.ComponentProps<typeof PaneFindWidget> = {
    value: 'alpha',
    currentIndex: 1,
    matchCount: 2,
    isDarkMode: false,
    placeholder: '搜索',
    searchOptions: DEFAULT_SEARCH_OPTIONS,
    onChange: vi.fn(),
    onSearchOptionsChange: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<PaneFindWidget {...props} />),
    props,
  };
}

describe('PaneFindWidget', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders clickable search result previews', () => {
    const onSelectResult = vi.fn();

    renderWidget({
      resultListLabel: '已载入 2 条',
      resultItems: [
        { index: 0, label: '#1 · 第 8 行', detail: '"name": "alpha"' },
        { index: 1, label: '#2 · 第 20 行', detail: '"name": "beta"' },
      ],
      activeResultIndex: 1,
      onSelectResult,
    });

    expect(screen.getByText('已载入 2 条')).toBeInTheDocument();
    expect(screen.getByText('"name": "alpha"')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /#1 · 第 8 行/ }));
    expect(onSelectResult).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: /#2 · 第 20 行/ })).toHaveClass('active');
  });

  it('shows loaded search progress when more results are available', () => {
    renderWidget({
      currentIndex: 1,
      matchCount: 2000,
      hasMore: true,
    });

    expect(screen.getByText('1/2000+')).toBeInTheDocument();
    expect(screen.getByText('已加载 2000 条')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '加载更多' })).toBeInTheDocument();
  });
});

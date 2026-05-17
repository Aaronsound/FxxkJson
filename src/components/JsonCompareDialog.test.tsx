import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsonCompareDialog from './JsonCompareDialog';

const tabs = [
  { id: 'left', title: 'left.json' },
  { id: 'right', title: 'right.json' },
];

describe('JsonCompareDialog', () => {
  afterEach(() => {
    cleanup();
  });

  it('compares two tabs and renders structured differences', () => {
    render(
      <JsonCompareDialog
        tabs={tabs}
        activeTabId="left"
        isDarkMode={false}
        getTabText={(tabId) => (tabId === 'left'
          ? '{"name":"old","remove":true}'
          : '{"name":"new","add":1}')}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));

    expect(screen.getByText('新增 1 · 删除 1 · 修改 1')).toBeInTheDocument();
    expect(screen.getByText('$.add')).toBeInTheDocument();
    expect(screen.getByText('$.remove')).toBeInTheDocument();
    expect(screen.getByText('$.name')).toBeInTheDocument();
  });

  it('requires two different tabs', () => {
    render(
      <JsonCompareDialog
        tabs={[tabs[0]]}
        activeTabId="left"
        isDarkMode={false}
        getTabText={() => '{}'}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: '开始对比' })).toBeDisabled();
    expect(screen.getByText('请选择两个不同的标签进行对比。')).toBeInTheDocument();
  });

  it('shows parse errors for invalid JSON', () => {
    render(
      <JsonCompareDialog
        tabs={tabs}
        activeTabId="left"
        isDarkMode={false}
        getTabText={(tabId) => (tabId === 'left' ? '{' : '{}')}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));

    expect(within(screen.getByText(/左侧解析失败/).closest('.modal-error') as HTMLElement).getByText(/左侧解析失败/)).toBeInTheDocument();
  });
});

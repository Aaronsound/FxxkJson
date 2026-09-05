import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JsonCompareDialog from './JsonCompareDialog';
import {
  compareJsonTexts,
  createJsonComparison,
  type JsonCompareWorkerRequest,
  type JsonCompareWorkerResponse,
} from '../utils/jsonDiff';

class CompareWorkerMock {
  static instances: CompareWorkerMock[] = [];
  onmessage: ((event: { data: JsonCompareWorkerResponse }) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  comparison: ReturnType<typeof createJsonComparison> | null = null;
  postMessage(request: JsonCompareWorkerRequest) {
    if ('leftText' in request) this.comparison = createJsonComparison(request.leftText, request.rightText);
    const comparison = this.comparison;
    if (!comparison) throw new Error('No active comparison');
    queueMicrotask(() => this.onmessage?.({ data: { result: comparison.next() } }));
  }
  constructor() {
    CompareWorkerMock.instances.push(this);
  }
}

const tabs = [
  { id: 'left', title: 'left.json' },
  { id: 'right', title: 'right.json' },
];

describe('JsonCompareDialog', () => {
  beforeEach(() => {
    CompareWorkerMock.instances = [];
    vi.stubGlobal('Worker', CompareWorkerMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('compares two tabs and renders structured differences', async () => {
    render(
      <JsonCompareDialog
        tabs={tabs}
        activeTabId="left"
        isDarkMode={false}
        getTabText={(tabId) => (tabId === 'left' ? '{"name":"old","remove":true}' : '{"name":"new","add":1}')}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));

    expect(await screen.findByText('新增 1 · 删除 1 · 修改 1')).toBeInTheDocument();
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

  it('clears old results when a different document is selected', async () => {
    render(
      <JsonCompareDialog
        tabs={[...tabs, { id: 'third', title: 'third.json' }]}
        activeTabId="left"
        isDarkMode={false}
        getTabText={(id) => JSON.stringify({ id })}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));
    await screen.findByText('$.id');
    fireEvent.change(screen.getByLabelText('右侧'), { target: { value: 'third' } });
    expect(screen.queryByText('$.id')).not.toBeInTheDocument();
    expect(screen.getByText('选择两个标签后开始对比')).toBeInTheDocument();
  });

  it('cancels work on selection changes and ignores a late reply', async () => {
    vi.spyOn(CompareWorkerMock.prototype, 'postMessage').mockImplementation(() => {});
    const { unmount } = render(
      <JsonCompareDialog
        tabs={[...tabs, { id: 'third', title: 'third.json' }]}
        activeTabId="left"
        isDarkMode={false}
        getTabText={() => '{}'}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));
    const oldWorker = CompareWorkerMock.instances[0];
    expect(screen.getByRole('button', { name: '正在对比…' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('右侧'), { target: { value: 'third' } });
    expect(oldWorker.terminate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));
    await act(async () => oldWorker.onmessage?.({ data: { result: compareJsonTexts('{}', '{}') } }));
    expect(screen.queryByText('两个 JSON 内容一致。')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '正在对比…' })).toBeDisabled();
    unmount();
    expect(CompareWorkerMock.instances[1].terminate).toHaveBeenCalledTimes(1);
  });

  it('loads all 5000 differences, navigates cached batches and bounds rendered rows', async () => {
    render(
      <JsonCompareDialog
        tabs={tabs}
        activeTabId="left"
        isDarkMode={false}
        getTabText={(id) => JSON.stringify(Array(5000).fill(id))}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));
    expect(await screen.findByText(/已加载 2000 处差异，仍有更多/)).toBeInTheDocument();
    expect(screen.getByText('新增 0 · 删除 0 · 修改 2000')).toBeInTheDocument();
    const worker = CompareWorkerMock.instances[0];
    const post = vi.spyOn(worker, 'postMessage');
    expect(worker.terminate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '继续加载' }));
    expect(screen.getByRole('button', { name: '继续加载' })).toBeDisabled();
    await screen.findByText('当前显示第 2001–4000 处');
    expect(screen.getByText('$[2000]')).toBeInTheDocument();
    expect(screen.queryByText('$[0]')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.json-compare-row')).toHaveLength(2000);
    fireEvent.click(screen.getByRole('button', { name: '继续加载' }));
    await screen.findByText('已完成全部对比，共 5000 处差异。');
    expect(screen.getByText('当前显示第 4001–5000 处')).toBeInTheDocument();
    expect(screen.getByText('$[4999]')).toBeInTheDocument();
    expect(screen.getByText('新增 0 · 删除 0 · 修改 5000')).toBeInTheDocument();
    expect(document.querySelectorAll('.json-compare-row')).toHaveLength(1000);
    expect(screen.getByRole('button', { name: '继续加载' })).toBeDisabled();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '上一批' }));
    expect(screen.getByText('$[2000]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '上一批' }));
    expect(screen.getByText('$[0]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一批' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '下一批' }));
    expect(screen.getByText('$[3999]')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(1, { next: true });
    expect(CompareWorkerMock.instances).toHaveLength(1);
  }, 15000);

  it('cancels a pending continuation and ignores late batches after changing files', async () => {
    render(
      <JsonCompareDialog
        tabs={[...tabs, { id: 'third', title: 'third.json' }]}
        activeTabId="left"
        isDarkMode={false}
        getTabText={(id) => JSON.stringify(Array(2001).fill(id))}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));
    await screen.findByText(/已加载 2000 处差异/);
    const worker = CompareWorkerMock.instances[0];
    vi.spyOn(worker, 'postMessage').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: '继续加载' }));
    fireEvent.change(screen.getByLabelText('右侧'), { target: { value: 'third' } });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    const batch = worker.comparison?.next();
    if (!batch) throw new Error('Missing continuation');
    await act(async () => worker.onmessage?.({ data: { result: batch } }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/已完成全部对比/)).not.toBeInTheDocument();
  });

  it('preserves loaded results after a continuation failure and allows restarting', async () => {
    render(
      <JsonCompareDialog
        tabs={tabs}
        activeTabId="left"
        isDarkMode={false}
        getTabText={(id) => JSON.stringify(Array(2001).fill(id))}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));
    await screen.findByText(/已加载 2000 处差异/);
    vi.spyOn(CompareWorkerMock.instances[0], 'postMessage').mockImplementation(() => {
      throw new Error('batch failed');
    });
    fireEvent.click(screen.getByRole('button', { name: '继续加载' }));
    expect(screen.getByRole('alert')).toHaveTextContent('batch failed');
    expect(screen.getByText('$[0]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续加载' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));
    await screen.findByText(/已加载 2000 处差异/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '继续加载' })).toBeEnabled();
  });

  it('allows retry after a worker failure', async () => {
    const post = vi.spyOn(CompareWorkerMock.prototype, 'postMessage').mockImplementationOnce(() => {
      throw new Error('load failed');
    });
    render(
      <JsonCompareDialog tabs={tabs} activeTabId="left" isDarkMode={false} getTabText={() => '{}'} onClose={vi.fn()} />
    );
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));
    expect(screen.getByRole('alert')).toHaveTextContent('load failed');
    expect(CompareWorkerMock.instances[0].terminate).toHaveBeenCalled();
    post.mockRestore();
    fireEvent.click(screen.getByRole('button', { name: '开始对比' }));
    expect(await screen.findByText('两个 JSON 内容一致。')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows parse errors for invalid JSON', async () => {
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

    await screen.findByText(/左侧解析失败/);
    expect(
      within(screen.getByText(/左侧解析失败/).closest('.modal-error') as HTMLElement).getByText(/左侧解析失败/)
    ).toBeInTheDocument();
  });

  it('closes consistently when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <JsonCompareDialog tabs={tabs} activeTabId="left" isDarkMode={false} getTabText={() => '{}'} onClose={onClose} />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import JsonSaveDialog from './JsonSaveDialog';
import { createTranslator } from '../utils/i18n';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('JsonSaveDialog', () => {
  it('saves the exact raw snapshot, including invalid JSON, with a new suggested name', async () => {
    const saveJsonFile = vi.fn().mockResolvedValue('/tmp/saved.json');
    vi.stubGlobal('electronAPI', { saveJsonFile });
    const onClose = vi.fn();
    render(<JsonSaveDialog raw={'{broken\r\n'} title="sample.json" isDarkMode={false} onClose={onClose} />);
    fireEvent.click(screen.getByText('选择保存位置'));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(saveJsonFile).toHaveBeenCalledWith({ name: 'sample-raw.json', text: '{broken\r\n' });
  });
  it('keeps the dialog open after cancellation or native disk failure', async () => {
    const saveJsonFile = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('disk full'));
    vi.stubGlobal('electronAPI', { saveJsonFile });
    const onClose = vi.fn();
    render(<JsonSaveDialog raw="{}" title="sample" isDarkMode={true} onClose={onClose} t={createTranslator('en')} />);
    fireEvent.click(screen.getByText('Choose location'));
    await waitFor(() => expect(screen.getByText('Choose location')).not.toBeDisabled());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Choose location'));
    expect(await screen.findByRole('alert')).toHaveTextContent('disk full');
    expect(onClose).not.toHaveBeenCalled();
  });
  it('handles unsupported environments without losing contents', async () => {
    vi.stubGlobal('electronAPI', undefined);
    render(<JsonSaveDialog raw="{}" title="sample" isDarkMode={false} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('选择保存位置'));
    expect(await screen.findByRole('alert')).toHaveTextContent('桌面应用');
  });
  it('prepares compact content in a worker and prevents duplicate submissions', async () => {
    const saveJsonFile = vi.fn().mockResolvedValue(null);
    vi.stubGlobal('electronAPI', { saveJsonFile });
    let worker: FakeWorker | undefined;
    class FakeWorker {
      onmessage?: (event: { data: { buffer: ArrayBuffer } }) => void;
      onerror?: () => void;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor() {
        worker = this;
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const { unmount } = render(
      <JsonSaveDialog raw={'{ "id": 9007199254740993 }'} title="sample" isDarkMode={false} onClose={vi.fn()} />
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'compact' } });
    fireEvent.click(screen.getByText('选择保存位置'));
    expect(screen.getByText('选择保存位置')).toBeDisabled();
    if (!worker) throw new Error('Expected export worker');
    expect(worker.postMessage).toHaveBeenCalledWith({ text: '{ "id": 9007199254740993 }', mode: 'compact' });
    worker.onmessage?.({ data: { buffer: new TextEncoder().encode('{"id":9007199254740993}').buffer } });
    await waitFor(() =>
      expect(saveJsonFile).toHaveBeenCalledWith({ name: 'sample-compact.json', text: '{"id":9007199254740993}' })
    );
    expect(worker.terminate).toHaveBeenCalledOnce();
    unmount();
  });
});

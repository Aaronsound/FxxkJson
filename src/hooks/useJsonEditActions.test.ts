import { describe, expect, it, vi } from 'vitest';
import { JsonValidationError } from '../utils/jsonErrorLocation';
import { useJsonEditActions } from './useJsonEditActions';

function createArgs(): Parameters<typeof useJsonEditActions>[0] {
  return {
    activeTab: { id: 'a', title: 'bad.json' },
    editJsonSession: { key: 1, mode: 'document', initialValue: '{', rawSource: true },
    editJsonValueRef: { current: '{"a":1 "b":2}' },
    getTabContent: () => '{',
    getFormattedContent: () => '',
    getLargeViewerData: () => null,
    getRawRevision: () => 3,
    workerStructureEnabledRef: { current: {} },
    beginPerformanceSession: vi.fn(),
    closeEditJson: vi.fn(),
    mutatePerformanceSession: vi.fn(),
    queueFormatAfterEditSave: vi.fn(),
    requestWorkerEditJson: vi.fn(),
    requestWorkerEditJsonResult: vi.fn(),
    resetSearchState: vi.fn(),
    setEditJsonBusyLabel: vi.fn(),
    setEditJsonError: vi.fn(),
    setLargeRawViewerData: vi.fn(),
    setLargeViewerData: vi.fn(),
    setLargeViewerStatus: vi.fn(),
    setProcessingStage: vi.fn(),
    setStructureStatus: vi.fn(),
    setTabFormatting: vi.fn(),
    setTabLargeMode: vi.fn(),
    showCopyLiteralNotice: vi.fn(),
    updateFormattedContent: vi.fn(),
    updateTabContent: vi.fn(),
  };
}

describe('useJsonEditActions invalid raw document', () => {
  it('retains the draft and modal, forwarding the draft error location on failed save', async () => {
    const args = createArgs();
    const location = { offset: 7, length: 3, line: 1, column: 8, rawRevision: 3 };
    vi.mocked(args.requestWorkerEditJsonResult).mockRejectedValueOnce(new JsonValidationError('invalid', location));
    await useJsonEditActions(args).handleSaveEditJson();
    expect(args.setEditJsonError).toHaveBeenCalledWith('保存 JSON 失败：invalid', location);
    expect(args.closeEditJson).not.toHaveBeenCalled();
    expect(args.updateTabContent).not.toHaveBeenCalled();
    expect(args.editJsonValueRef.current).toBe('{"a":1 "b":2}');
    expect(args.setEditJsonBusyLabel).toHaveBeenLastCalledWith(null);
  });

  it('saves corrected raw content without reserialization and queues normal formatting', async () => {
    const args = createArgs();
    const text = '{"a":1,"b":2}';
    args.editJsonValueRef.current = text;
    vi.mocked(args.requestWorkerEditJsonResult).mockResolvedValueOnce({
      type: 'edit-json-result',
      requestId: 1,
      tabId: 'a',
      success: true,
      data: text,
    });
    await useJsonEditActions(args).handleSaveEditJson();
    expect(args.requestWorkerEditJsonResult).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'save', preserveRawText: true, text })
    );
    expect(args.updateTabContent).toHaveBeenCalledWith('a', text, true, text.length);
    expect(args.queueFormatAfterEditSave).toHaveBeenCalledWith('a', text, expect.any(Object));
    expect(args.closeEditJson).toHaveBeenCalledOnce();
  });
});

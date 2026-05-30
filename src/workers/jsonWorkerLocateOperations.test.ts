import { parseTree } from 'jsonc-parser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLineStarts } from '../utils/searchText';
import {
  createJsonWorkerLocateOperations,
  getLocateCandidateOffsets,
  getResolvedNodes,
} from './jsonWorkerLocateOperations';
import {
  getDirectLocateRange,
  getDirectRightLocateRange,
  getPathCalibratedDirectLocateRange,
  getRightOnlyLocateResult,
} from './jsonWorkerLocateRanges';

async function flushLocateTimer() {
  await vi.advanceTimersByTimeAsync(16);
  await Promise.resolve();
}

describe('jsonWorkerLocateOperations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('postMessage', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('includes nearby non-whitespace offsets on the same line', () => {
    const text = '{\n  "name": "demo"\n}';
    const offsets = getLocateCandidateOffsets(text, text.indexOf('"name"') - 1);

    expect(offsets).toContain(text.indexOf('"name"'));
  });

  it('resolves matching raw and formatted nodes', () => {
    const rawText = '{"name":"demo"}';
    const formattedText = '{\n  "name": "demo"\n}';
    const resolved = getResolvedNodes(
      {
        rawTree: parseTree(rawText),
        formattedTree: parseTree(formattedText),
        formattedText,
      },
      formattedText.indexOf('"demo"')
    );

    expect(resolved?.path).toEqual(['name']);
    expect(resolved?.leftNode.offset).toBe(rawText.indexOf('"demo"'));
  });

  it('returns a right-only locate result from direct formatted text', () => {
    const formattedText = '{\n  "name": "demo"\n}';
    const result = getRightOnlyLocateResult(
      'tab-a',
      7,
      formattedText.indexOf('"demo"'),
      { requestId: 6, formattedText },
      (_tabId, _requestId, text) => parseTree(text)
    );

    expect(result).toMatchObject({
      found: true,
      path: ['name'],
      requestId: 7,
      rightOnly: true,
      tabId: 'tab-a',
      type: 'locate-result',
    });
    expect(result.rightStartOffset).toBe(formattedText.indexOf('"demo"'));
  });

  it('returns not found for right-only locate when formatted text is unavailable', () => {
    expect(getRightOnlyLocateResult('tab-a', 7, 0, null, () => undefined)).toMatchObject({
      found: false,
      requestId: 7,
      rightOnly: true,
      tabId: 'tab-a',
      type: 'locate-result',
    });
  });

  it('returns direct identity ranges and safe fallbacks', () => {
    const formattedText = '{\n  "name": "demo"\n}';
    const viewerData = {
      lineCount: 3,
      lineStarts: buildLineStarts(formattedText),
      regions: [],
    };
    const cached = {
      directLocate: true,
      directLocateMode: 'identity',
      formattedText,
      viewerData,
    };

    expect(getDirectLocateRange(cached, formattedText.indexOf('"demo"'))).toEqual({
      endOffset: 18,
      startOffset: 2,
    });
    expect(getDirectRightLocateRange(null, 4.8)).toEqual({
      endOffset: 5,
      startOffset: 4,
    });
  });

  it('calibrates direct locate ranges through JSON paths', () => {
    const rawText = '{"name":"demo","count":1}';
    const formattedText = '{\n  "name": "demo",\n  "count": 1\n}';
    const result = getPathCalibratedDirectLocateRange(
      'tab-a',
      {
        directLocate: true,
        formattedText,
        rawText,
        requestId: 3,
      },
      formattedText.indexOf('"demo"'),
      (_tabId, _requestId, text) => parseTree(text)
    );

    expect(result).toMatchObject({
      leftRange: {
        startOffset: rawText.indexOf('"demo"'),
        endOffset: rawText.indexOf('"demo"') + '"demo"'.length,
      },
      path: ['name'],
      rightRange: {
        startOffset: formattedText.indexOf('"demo"'),
        endOffset: formattedText.indexOf('"demo"') + '"demo"'.length,
      },
    });
  });

  it('posts path-calibrated locate results and ignores stale requests', async () => {
    const rawText = '{"name":"demo"}';
    const formattedText = '{\n  "name": "demo"\n}';
    const latestLocateRequestByTab = new Map<string, number>();
    const structureCache = new Map([
      [
        'tab-a',
        {
          directLocate: true,
          formattedText,
          rawText,
          requestId: 1,
        },
      ],
    ]);
    const operations = createJsonWorkerLocateOperations({
      ensureStructureTrees: vi.fn(() => true),
      getDirectValueTree: vi.fn((_tabId, _requestId, text) => parseTree(text)),
      latestLocateRequestByTab,
      structureCache,
      viewerCache: new Map(),
    });

    operations.handleLocateMessage({ offset: formattedText.indexOf('"demo"'), requestId: 1, tabId: 'tab-a' });
    operations.handleLocateMessage({ offset: 0, requestId: 2, tabId: 'tab-b' });
    latestLocateRequestByTab.set('tab-a', 99);
    await flushLocateTimer();

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        found: false,
        requestId: 2,
        tabId: 'tab-b',
        type: 'locate-result',
      })
    );

    operations.handleLocateMessage({ offset: formattedText.indexOf('"demo"'), requestId: 3, tabId: 'tab-a' });
    await flushLocateTimer();

    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        found: true,
        path: ['name'],
        pathText: '$.name',
        requestId: 3,
        tabId: 'tab-a',
      })
    );
  });

  it('posts right-only direct locate results from viewer cache', async () => {
    const formattedText = '{\n  "name": "demo"\n}';
    const operations = createJsonWorkerLocateOperations({
      ensureStructureTrees: vi.fn(() => true),
      getDirectValueTree: vi.fn((_tabId, _requestId, text) => parseTree(text)),
      latestLocateRequestByTab: new Map(),
      structureCache: new Map(),
      viewerCache: new Map([
        [
          'tab-a',
          {
            formattedText,
            requestId: 4,
            viewerData: {
              lineCount: 3,
              lineStarts: buildLineStarts(formattedText),
              regions: [],
            },
          },
        ],
      ]),
    });

    operations.handleLocateRightDirectMessage({
      offset: formattedText.indexOf('"demo"'),
      requestId: 5,
      tabId: 'tab-a',
    });
    await flushLocateTimer();

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        found: true,
        path: ['name'],
        pathText: '$.name',
        requestId: 5,
        rightOnly: true,
        tabId: 'tab-a',
      })
    );
  });
});

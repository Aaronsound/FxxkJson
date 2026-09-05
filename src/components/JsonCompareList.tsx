import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { JsonDiffEntry, JsonDiffType } from '../utils/jsonDiff';
import type { I18nKey } from '../utils/i18n';
import { COMPARISON_BLOCK_SIZE, comparisonBlockAt, comparisonBlockOffsets } from '../utils/comparisonListLayout';

interface Props {
  diffs: JsonDiffEntry[];
  hidden: boolean;
  startIndex: number;
  onSelect: (diff: JsonDiffEntry) => void;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
}
const typeLabels: Record<JsonDiffType, I18nKey> = {
  added: 'compare.added',
  removed: 'compare.removed',
  changed: 'compare.changed',
};

export function JsonCompareList({ diffs, hidden, startIndex, onSelect, t }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const heights = useRef(new Map<number, number>());
  const [revision, setRevision] = useState(0);
  const [viewport, setViewport] = useState({ top: 0, height: 400 });
  const savedScroll = useRef({ top: 0, left: 0 });
  const selectedIndex = useRef<number | null>(null);
  const [pendingFocus, setPendingFocus] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const wasHidden = useRef(false);
  const frame = useRef<number | null>(null);
  const measuredWidth = useRef(0);
  const offsets = useMemo(() => {
    void revision;
    return comparisonBlockOffsets(diffs.length, heights.current);
  }, [diffs.length, revision]);
  const headerHeight = headerRef.current?.offsetHeight || 32;
  const top = Math.max(0, viewport.top - headerHeight);
  const first = Math.max(0, comparisonBlockAt(offsets, top) - 1);
  const last = Math.min(offsets.length - 2, comparisonBlockAt(offsets, top + viewport.height) + 1);
  const blocks = useMemo(() => {
    const visible = new Set<number>();
    for (let block = first; block <= last; block += 1) visible.add(block);
    // Keep a keyboard-focused row mounted if the user scrolls it off screen.
    if (focusedIndex !== null) visible.add(Math.floor(focusedIndex / COMPARISON_BLOCK_SIZE));
    if (pendingFocus !== null) visible.add(Math.floor(pendingFocus / COMPARISON_BLOCK_SIZE));
    return Array.from(visible).sort((a, b) => a - b);
  }, [first, last, focusedIndex, pendingFocus]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (hidden && frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (!hidden && wasHidden.current) {
      list.scrollTop = savedScroll.current.top;
      list.scrollLeft = savedScroll.current.left;
      list
        .querySelector<HTMLButtonElement>(`[data-diff-index="${selectedIndex.current}"] button`)
        ?.focus({ preventScroll: true });
    }
    wasHidden.current = hidden;
  }, [hidden]);

  useLayoutEffect(() => {
    if (hidden) return;
    const list = listRef.current;
    if (!list) return;
    const elements = blocks.flatMap((index) => {
      const element = list.querySelector<HTMLElement>(`[data-diff-block="${index}"]`);
      return element ? [element] : [];
    });
    const measure = () => {
      if (list.hidden || !list.clientWidth) return;
      let changed = false;
      let correction = 0;
      if (list.clientWidth !== measuredWidth.current) {
        heights.current.clear();
        measuredWidth.current = list.clientWidth;
        changed = true;
      }
      for (const block of elements) {
        const index = Number(block.dataset.diffBlock);
        const height = block.getBoundingClientRect().height;
        if (height > 0 && heights.current.get(index) !== height) {
          if (offsets[index + 1] <= list.scrollTop - headerHeight)
            correction += height - (offsets[index + 1] - offsets[index]);
          heights.current.set(index, height);
          changed = true;
        }
      }
      if (correction) list.scrollTop += correction;
      setViewport((current) =>
        current.top === list.scrollTop && current.height === list.clientHeight
          ? current
          : { top: list.scrollTop, height: list.clientHeight }
      );
      if (changed) setRevision((value) => value + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    for (const block of elements) observer.observe(block);
    return () => observer.disconnect();
  }, [blocks, hidden, offsets, headerHeight]);

  useLayoutEffect(() => {
    if (pendingFocus === null) return;
    const button = listRef.current?.querySelector<HTMLButtonElement>(`[data-diff-index="${pendingFocus}"] button`);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    setPendingFocus(null);
  }, [pendingFocus]);
  useLayoutEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );

  return (
    <div
      ref={listRef}
      hidden={hidden}
      className="json-compare-list"
      role="table"
      aria-label={t('compare.listLabel')}
      aria-rowcount={diffs.length + 1}
      onScroll={(event) => {
        const list = event.currentTarget;
        if (hidden) return;
        savedScroll.current = { top: list.scrollTop, left: list.scrollLeft };
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          if (list.hidden) return;
          setViewport({ top: list.scrollTop, height: list.clientHeight || 400 });
        });
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedIndex(null);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
        const row = (event.target as HTMLElement).closest<HTMLElement>('[data-diff-index]');
        if (!row) return;
        const next = Number(row.dataset.diffIndex) + (event.shiftKey ? -1 : 1);
        if (next < 0 || next >= diffs.length) return;
        event.preventDefault();
        setPendingFocus(next);
      }}
    >
      <div ref={headerRef} className="json-compare-list-header" role="row" aria-rowindex={1}>
        <span role="columnheader">{t('compare.type')}</span>
        <span role="columnheader">{t('compare.path')}</span>
        <span role="columnheader">{t('compare.leftValue')}</span>
        <span role="columnheader">{t('compare.rightValue')}</span>
      </div>
      <div className="json-compare-virtual-body" role="rowgroup" style={{ height: offsets.at(-1) }}>
        {blocks.map((block) => (
          <div
            key={block}
            data-diff-block={block}
            className="json-compare-block"
            role="presentation"
            style={{ top: offsets[block] }}
          >
            {diffs.slice(block * COMPARISON_BLOCK_SIZE, (block + 1) * COMPARISON_BLOCK_SIZE).map((diff, local) => {
              const index = block * COMPARISON_BLOCK_SIZE + local;
              return (
                <div
                  className="json-compare-row"
                  role="row"
                  aria-rowindex={index + 2}
                  data-diff-index={index}
                  data-diff-number={startIndex + index}
                  key={index}
                >
                  <span role="cell">
                    <span className={`json-compare-type json-compare-type-${diff.type}`}>
                      {t(typeLabels[diff.type])}
                    </span>
                  </span>
                  <span role="cell">
                    <code>{diff.pathText}</code>
                    <button
                      type="button"
                      disabled={hidden}
                      className="json-compare-detail-button"
                      onFocus={() => setFocusedIndex(index)}
                      onClick={() => {
                        selectedIndex.current = index;
                        if (listRef.current)
                          savedScroll.current = { top: listRef.current.scrollTop, left: listRef.current.scrollLeft };
                        onSelect(diff);
                      }}
                      aria-label={t('compare.viewValueAt', { path: diff.pathText })}
                    >
                      {t('compare.viewValue')}
                    </button>
                  </span>
                  <code role="cell">{diff.leftPreview}</code>
                  <code role="cell">{diff.rightPreview}</code>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

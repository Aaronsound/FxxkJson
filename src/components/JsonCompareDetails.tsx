import { useEffect, useRef, useState } from 'react';
import { DIFF_VALUE_CHUNK_SIZE, type JsonDiffEntry, type JsonDiffSide, type JsonDiffValue } from '../utils/jsonDiff';
import type { I18nKey } from '../utils/i18n';
import { writeTextToClipboard } from '../utils/clipboard';

interface Props {
  diff: JsonDiffEntry;
  getValue: (
    path: Array<string | number>,
    side: JsonDiffSide,
    offset: number,
    full?: boolean
  ) => Promise<JsonDiffValue>;
  t: (key: I18nKey, params?: Record<string, string | number>) => string;
  onClose: () => void;
}

function ValuePane({ diff, getValue, t, side }: Omit<Props, 'onClose'> & { side: JsonDiffSide }) {
  const [offset, setOffset] = useState(0);
  const [value, setValue] = useState<JsonDiffValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [message, setMessage] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setValue(null);
    setMessage('');
    getValue(diff.path, side, offset)
      .then((result) => {
        if (active) setValue(result);
      })
      .catch((error) => {
        if (active) setMessage(t('compare.failed', { error: String(error) }));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [diff, getValue, offset, side, t]);
  const copy = async () => {
    setCopying(true);
    setMessage('');
    try {
      const result = await getValue(diff.path, side, 0, true);
      if (!alive.current) return;
      await writeTextToClipboard(result.text);
      if (alive.current) setMessage(t('compare.copied'));
    } catch (error) {
      if (alive.current) setMessage(t('compare.failed', { error: String(error) }));
    } finally {
      if (alive.current) setCopying(false);
    }
  };
  const total = value?.total ?? 0;
  const hasNext = !!value && value.offset + value.text.length < total;
  return (
    <section
      className="json-compare-value"
      aria-label={t(side === 'left' ? 'compare.leftValue' : 'compare.rightValue')}
    >
      <strong>{t(side === 'left' ? 'compare.leftValue' : 'compare.rightValue')}</strong>
      {loading ? (
        <p role="status">{t('compare.loadingValue')}</p>
      ) : (
        <pre tabIndex={0}>{value?.missing ? t('compare.missingValue') : value?.text}</pre>
      )}
      <div className="json-compare-value-status" role="status">
        {message}
      </div>
      <div className="json-compare-value-actions">
        {value && !value.missing && (
          <span>
            {t('compare.valueRange', { start: value.offset + 1, end: value.offset + value.text.length, total })}
          </span>
        )}
        <button
          type="button"
          disabled={loading || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - DIFF_VALUE_CHUNK_SIZE))}
        >
          {t('compare.previousPart')}
        </button>
        <button type="button" disabled={loading || !hasNext} onClick={() => setOffset(offset + DIFF_VALUE_CHUNK_SIZE)}>
          {t('compare.nextPart')}
        </button>
        <button
          type="button"
          disabled={loading || !hasNext}
          onClick={() => setOffset(Math.floor((total - 1) / DIFF_VALUE_CHUNK_SIZE) * DIFF_VALUE_CHUNK_SIZE)}
        >
          {t('compare.lastPart')}
        </button>
        <button type="button" disabled={loading || copying || !value || value.missing} onClick={() => void copy()}>
          {copying ? t('compare.copying') : t('compare.copyValue')}
        </button>
      </div>
    </section>
  );
}

export function JsonCompareDetails(props: Props) {
  return (
    <div className="json-compare-details">
      <div className="json-compare-value-actions">
        <strong>{props.t('compare.details')}</strong>
        <code>{props.diff.pathText}</code>
        <button type="button" onClick={props.onClose}>
          {props.t('compare.backToList')}
        </button>
      </div>
      <p>{props.t('compare.valueHint')}</p>
      <div className="json-compare-value-grid">
        <ValuePane {...props} side="left" />
        <ValuePane {...props} side="right" />
      </div>
    </div>
  );
}

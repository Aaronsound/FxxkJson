import React, {
  UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { JsonTableData, JsonTableStatus } from '../types/jsonTool';

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 34;
const OVERSCAN = 8;

interface JsonTableViewerProps {
  data: JsonTableData | null;
  status: JsonTableStatus;
  error: string | null;
  isDarkMode: boolean;
}

const JsonTableViewer: React.FC<JsonTableViewerProps> = ({
  data,
  status,
  error,
  isDarkMode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const visibleRange = useMemo(() => {
    const rowCount = data?.rows.length ?? 0;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(
      rowCount,
      Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
    );

    return { start, end };
  }, [data?.rows.length, scrollTop, viewportHeight]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      setViewportHeight(node.clientHeight);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  const handleViewportRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setViewportHeight(node?.clientHeight ?? 0);
  }, []);

  if (status === 'building') {
    return (
      <div className={`json-table-viewer json-table-viewer-empty ${isDarkMode ? 'dark' : ''}`}>
        正在构建表格视图...
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={`json-table-viewer json-table-viewer-empty ${isDarkMode ? 'dark' : ''}`}>
        {error ?? '表格视图构建失败'}
      </div>
    );
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className={`json-table-viewer json-table-viewer-empty ${isDarkMode ? 'dark' : ''}`}>
        暂无表格数据
      </div>
    );
  }

  const visibleRows = data.rows.slice(visibleRange.start, visibleRange.end);
  const topPadding = visibleRange.start * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (data.rows.length - visibleRange.end) * ROW_HEIGHT);

  return (
    <div className={`json-table-viewer ${isDarkMode ? 'dark' : ''}`}>
      <div className="json-table-summary">
        <span>{data.kind === 'array' ? '数组' : data.kind === 'object' ? '对象' : '值'}</span>
        <span>{data.sampledRows.toLocaleString()} / {data.totalRows.toLocaleString()} 行</span>
        {data.truncatedColumns && <span>列已截断</span>}
        {data.truncatedRows && <span>行已截断</span>}
      </div>
      <div
        ref={handleViewportRef}
        className="json-table-scroll"
        onScroll={handleScroll}
      >
        <table className="json-table">
          <thead>
            <tr style={{ height: HEADER_HEIGHT }}>
              <th className="json-table-index">#</th>
              {data.columns.map((column) => (
                <th key={column.id} title={column.label}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {topPadding > 0 && (
              <tr aria-hidden="true">
                <td colSpan={data.columns.length + 1} style={{ height: topPadding, padding: 0 }} />
              </tr>
            )}
            {visibleRows.map((row) => (
              <tr key={row.id} style={{ height: ROW_HEIGHT }}>
                <td className="json-table-index">{row.index + 1}</td>
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}:${data.columns[index]?.id ?? index}`} title={cell}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {bottomPadding > 0 && (
              <tr aria-hidden="true">
                <td colSpan={data.columns.length + 1} style={{ height: bottomPadding, padding: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default JsonTableViewer;

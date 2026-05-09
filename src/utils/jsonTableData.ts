import {
  TABLE_VIEW_CELL_TEXT_LIMIT,
  TABLE_VIEW_COLUMN_LIMIT,
  TABLE_VIEW_ROW_LIMIT,
} from '../types/jsonTool';
import type {
  JsonTableColumn,
  JsonTableData,
  JsonTableRow,
} from '../types/jsonTool';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncateText(value: string, limit = TABLE_VIEW_CELL_TEXT_LIMIT) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function getValuePreview(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value).length} props}`;
  }

  if (typeof value === 'string') {
    return truncateText(value);
  }

  return truncateText(String(value));
}

function getValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

function buildArrayTableData(json: unknown[]): JsonTableData {
  const sampled = json.slice(0, TABLE_VIEW_ROW_LIMIT);
  const columnIds: string[] = [];
  const seenColumns = new Set<string>();
  let truncatedColumns = false;

  for (const item of sampled) {
    if (!isRecord(item)) {
      continue;
    }

    for (const key of Object.keys(item)) {
      if (seenColumns.has(key)) {
        continue;
      }

      if (columnIds.length >= TABLE_VIEW_COLUMN_LIMIT) {
        truncatedColumns = true;
        continue;
      }

      seenColumns.add(key);
      columnIds.push(key);
    }
  }

  const columns: JsonTableColumn[] = columnIds.length > 0
    ? columnIds.map((key) => ({ id: key, label: key }))
    : [{ id: '$value', label: 'value' }];

  const rows: JsonTableRow[] = sampled.map((item, index) => ({
    id: String(index),
    index,
    cells: columns.map((column) => (
      column.id === '$value'
        ? getValuePreview(item)
        : isRecord(item) && Object.prototype.hasOwnProperty.call(item, column.id)
          ? getValuePreview(item[column.id])
          : ''
    )),
  }));

  return {
    kind: 'array',
    columns,
    rows,
    totalRows: json.length,
    sampledRows: sampled.length,
    truncatedRows: json.length > sampled.length,
    truncatedColumns,
  };
}

function buildObjectTableData(json: Record<string, unknown>): JsonTableData {
  const entries = Object.entries(json);
  const sampled = entries.slice(0, TABLE_VIEW_ROW_LIMIT);
  const columns: JsonTableColumn[] = [
    { id: 'key', label: 'key' },
    { id: 'type', label: 'type' },
    { id: 'value', label: 'value' },
  ];

  const rows: JsonTableRow[] = sampled.map(([key, value], index) => ({
    id: key,
    index,
    cells: [key, getValueType(value), getValuePreview(value)],
  }));

  return {
    kind: 'object',
    columns,
    rows,
    totalRows: entries.length,
    sampledRows: sampled.length,
    truncatedRows: entries.length > sampled.length,
    truncatedColumns: false,
  };
}

export function buildJsonTableData(json: unknown): JsonTableData {
  if (Array.isArray(json)) {
    return buildArrayTableData(json);
  }

  if (isRecord(json)) {
    return buildObjectTableData(json);
  }

  return {
    kind: 'value',
    columns: [
      { id: 'type', label: 'type' },
      { id: 'value', label: 'value' },
    ],
    rows: [{
      id: '0',
      index: 0,
      cells: [getValueType(json), getValuePreview(json)],
    }],
    totalRows: 1,
    sampledRows: 1,
    truncatedRows: false,
    truncatedColumns: false,
  };
}

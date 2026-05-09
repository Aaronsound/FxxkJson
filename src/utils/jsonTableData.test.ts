import { describe, expect, it } from 'vitest';
import { TABLE_VIEW_COLUMN_LIMIT, TABLE_VIEW_ROW_LIMIT } from '../types/jsonTool';
import { buildJsonTableData } from './jsonTableData';

describe('jsonTableData', () => {
  it('builds columns from an array of objects', () => {
    const table = buildJsonTableData([
      { id: 1, name: 'alpha' },
      { id: 2, active: true },
    ]);

    expect(table.kind).toBe('array');
    expect(table.columns.map((column) => column.id)).toEqual(['id', 'name', 'active']);
    expect(table.rows[0].cells).toEqual(['1', 'alpha', '']);
    expect(table.rows[1].cells).toEqual(['2', '', 'true']);
  });

  it('uses a value column for primitive arrays', () => {
    const table = buildJsonTableData(['a', 2, null]);

    expect(table.columns.map((column) => column.id)).toEqual(['$value']);
    expect(table.rows.map((row) => row.cells[0])).toEqual(['a', '2', 'null']);
  });

  it('builds key/type/value rows for root objects', () => {
    const table = buildJsonTableData({ ok: true, nested: { count: 2 } });

    expect(table.kind).toBe('object');
    expect(table.columns.map((column) => column.id)).toEqual(['key', 'type', 'value']);
    expect(table.rows).toEqual([
      { id: 'ok', index: 0, cells: ['ok', 'boolean', 'true'] },
      { id: 'nested', index: 1, cells: ['nested', 'object', '{1 props}'] },
    ]);
  });

  it('caps sampled rows and columns', () => {
    const wideRow = Object.fromEntries(
      Array.from({ length: TABLE_VIEW_COLUMN_LIMIT + 2 }, (_, index) => [`k${index}`, index])
    );
    const rows = Array.from({ length: TABLE_VIEW_ROW_LIMIT + 1 }, () => wideRow);
    const table = buildJsonTableData(rows);

    expect(table.rows).toHaveLength(TABLE_VIEW_ROW_LIMIT);
    expect(table.columns).toHaveLength(TABLE_VIEW_COLUMN_LIMIT);
    expect(table.truncatedRows).toBe(true);
    expect(table.truncatedColumns).toBe(true);
  });
});

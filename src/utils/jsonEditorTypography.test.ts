import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { getMonacoOptions } from './jsonEditorInteractions';
import {
  JSON_EDITOR_FONT_FAMILY,
  JSON_EDITOR_FONT_SIZE,
  JSON_EDITOR_FONT_SIZE_CSS,
  JSON_EDITOR_LINE_HEIGHT,
  JSON_EDITOR_LINE_HEIGHT_CSS,
} from './jsonEditorTypography';

describe('JSON editor typography', () => {
  it('keeps Monaco options and large-viewer CSS variables in sync', () => {
    const options = getMonacoOptions({
      largeMode: false,
      wrapLongLines: false,
      readOnly: true,
    });

    expect(options.fontFamily).toBe(JSON_EDITOR_FONT_FAMILY);
    expect(options.fontSize).toBe(JSON_EDITOR_FONT_SIZE);
    expect(options.lineHeight).toBe(JSON_EDITOR_LINE_HEIGHT);

    const appCss = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8');

    expect(appCss).toContain(`--json-editor-font-family: ${JSON_EDITOR_FONT_FAMILY};`);
    expect(appCss).toContain(`--json-editor-font-size: ${JSON_EDITOR_FONT_SIZE_CSS};`);
    expect(appCss).toContain(`--json-editor-line-height: ${JSON_EDITOR_LINE_HEIGHT_CSS};`);
  });
});

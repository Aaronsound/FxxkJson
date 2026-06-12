import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it, vi } from 'vitest';
import { getMonacoOptions } from './jsonEditorInteractions';
import {
  JSON_EDITOR_DARK_COLORS,
  JSON_EDITOR_DARK_CSS_VARIABLES,
  JSON_EDITOR_DARK_THEME,
  JSON_EDITOR_FONT_FAMILY,
  JSON_EDITOR_FONT_SIZE,
  JSON_EDITOR_FONT_SIZE_CSS,
  JSON_EDITOR_LIGHT_COLORS,
  JSON_EDITOR_LIGHT_CSS_VARIABLES,
  JSON_EDITOR_LIGHT_THEME,
  JSON_EDITOR_LINE_HEIGHT,
  JSON_EDITOR_LINE_HEIGHT_CSS,
  configureJsonEditorThemes,
  getJsonEditorCssVariables,
  getJsonEditorTheme,
} from './jsonEditorTypography';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('JSON editor typography', () => {
  it('uses jsonEditorTypography as the single source for Monaco options and CSS variables', () => {
    const options = getMonacoOptions({
      largeMode: false,
      wrapLongLines: false,
      readOnly: true,
    });

    expect(options.fontFamily).toBe(JSON_EDITOR_FONT_FAMILY);
    expect(options.fontLigatures).toBe(false);
    expect(options.fontSize).toBe(JSON_EDITOR_FONT_SIZE);
    expect(options.fontWeight).toBe('normal');
    expect(options.letterSpacing).toBe(0);
    expect(options.lineHeight).toBe(JSON_EDITOR_LINE_HEIGHT);
    expect(options.bracketPairColorization).toEqual({ enabled: false });
    expect(JSON_EDITOR_FONT_FAMILY).toBe('Consolas, "Courier New", monospace');
    expect(JSON_EDITOR_FONT_SIZE).toBe(14);
    expect(JSON_EDITOR_LINE_HEIGHT).toBe(19);

    expect(getJsonEditorCssVariables(false)).toEqual(JSON_EDITOR_LIGHT_CSS_VARIABLES);
    expect(getJsonEditorCssVariables(true)).toEqual(JSON_EDITOR_DARK_CSS_VARIABLES);
    expect(JSON_EDITOR_LIGHT_CSS_VARIABLES).toMatchObject({
      '--json-editor-background': JSON_EDITOR_LIGHT_COLORS.background,
      '--json-editor-font-family': JSON_EDITOR_FONT_FAMILY,
      '--json-editor-font-size': JSON_EDITOR_FONT_SIZE_CSS,
      '--json-editor-foreground': JSON_EDITOR_LIGHT_COLORS.foreground,
      '--json-editor-line-height': JSON_EDITOR_LINE_HEIGHT_CSS,
      '--json-editor-token-key': JSON_EDITOR_LIGHT_COLORS.key,
      '--json-editor-token-string': JSON_EDITOR_LIGHT_COLORS.string,
    });
    expect(JSON_EDITOR_DARK_CSS_VARIABLES).toMatchObject({
      '--json-editor-background': JSON_EDITOR_DARK_COLORS.background,
      '--json-editor-font-family': JSON_EDITOR_FONT_FAMILY,
      '--json-editor-font-size': JSON_EDITOR_FONT_SIZE_CSS,
      '--json-editor-foreground': JSON_EDITOR_DARK_COLORS.foreground,
      '--json-editor-line-height': JSON_EDITOR_LINE_HEIGHT_CSS,
      '--json-editor-token-key': JSON_EDITOR_DARK_COLORS.key,
      '--json-editor-token-string': JSON_EDITOR_DARK_COLORS.string,
    });

    const appCss = [
      readFileSync(join(process.cwd(), 'src/App.css'), 'utf8'),
      ...readdirSync(join(process.cwd(), 'src/styles'))
        .filter((fileName) => fileName.endsWith('.css'))
        .map((fileName) => readFileSync(join(process.cwd(), 'src/styles', fileName), 'utf8')),
    ].join('\n');

    for (const variableName of Object.keys(JSON_EDITOR_LIGHT_CSS_VARIABLES)) {
      expect(appCss).toContain(`var(${variableName})`);
      expect(appCss).not.toMatch(new RegExp(`${escapeRegExp(variableName)}\\s*:`));
    }

    const workspaceSource = readFileSync(join(process.cwd(), 'src/components/JsonToolWorkspace.tsx'), 'utf8');
    expect(workspaceSource).toContain('getJsonEditorCssVariables(isDarkMode)');

    for (const componentPath of ['src/components/LeftJsonEditorPane.tsx', 'src/components/RightJsonEditorPane.tsx']) {
      const editorSource = readFileSync(join(process.cwd(), componentPath), 'utf8');
      expect(editorSource).toContain('JsonMonacoEditor');
      expect(editorSource).not.toContain('options={{');
      expect(editorSource).not.toContain('import Editor');
    }

    const editModalSource = readFileSync(join(process.cwd(), 'src/components/JsonEditModal.tsx'), 'utf8');
    expect(editModalSource).toContain('JsonMonacoEditor');
    expect(editModalSource).not.toContain('options={{');
    expect(editModalSource).not.toContain('import Editor');

    const monacoWrapperSource = readFileSync(join(process.cwd(), 'src/components/JsonMonacoEditor.tsx'), 'utf8');
    expect(monacoWrapperSource).toContain('configureJsonEditorThemes(monaco)');
    expect(monacoWrapperSource).toContain('getMonacoOptions({');
    expect(monacoWrapperSource).toContain('getJsonEditorTheme(isDarkMode)');

    expect(getJsonEditorTheme(false)).toBe(JSON_EDITOR_LIGHT_THEME);
    expect(getJsonEditorTheme(true)).toBe(JSON_EDITOR_DARK_THEME);
  });

  it('registers explicit Monaco themes from the shared JSON editor colors', () => {
    const defineTheme = vi.fn();

    configureJsonEditorThemes(
      {
        editor: {
          defineTheme,
        },
      },
      true
    );

    expect(defineTheme).toHaveBeenCalledTimes(2);
    expect(defineTheme).toHaveBeenNthCalledWith(
      1,
      JSON_EDITOR_LIGHT_THEME,
      expect.objectContaining({
        base: 'vs',
        inherit: false,
        colors: expect.objectContaining({
          'editorBracketHighlight.foreground1': JSON_EDITOR_LIGHT_COLORS.punctuation,
          'editor.background': JSON_EDITOR_LIGHT_COLORS.background,
          'editor.foreground': JSON_EDITOR_LIGHT_COLORS.foreground,
          'editorLineNumber.foreground': JSON_EDITOR_LIGHT_COLORS.lineNumber,
        }),
        rules: expect.arrayContaining([
          { token: '', foreground: '000000', fontStyle: '' },
          { token: 'string.key', foreground: 'a31515', fontStyle: '' },
          { token: 'string.value', foreground: '0451a5', fontStyle: '' },
          { token: 'delimiter', foreground: '000000', fontStyle: '' },
        ]),
      })
    );
    expect(defineTheme).toHaveBeenNthCalledWith(
      2,
      JSON_EDITOR_DARK_THEME,
      expect.objectContaining({
        base: 'vs-dark',
        inherit: false,
        colors: expect.objectContaining({
          'editorBracketHighlight.foreground1': JSON_EDITOR_DARK_COLORS.punctuation,
          'editor.background': JSON_EDITOR_DARK_COLORS.background,
          'editor.foreground': JSON_EDITOR_DARK_COLORS.foreground,
          'editorLineNumber.foreground': JSON_EDITOR_DARK_COLORS.lineNumber,
        }),
        rules: expect.arrayContaining([
          { token: '', foreground: 'd4d4d4', fontStyle: '' },
          { token: 'string.key', foreground: 'ff8f8f', fontStyle: '' },
          { token: 'string.value', foreground: '75beff', fontStyle: '' },
          { token: 'delimiter', foreground: 'd4d4d4', fontStyle: '' },
        ]),
      })
    );
  });

  it('can preserve structural folding for repeated large edit modal sessions', () => {
    const options = getMonacoOptions({
      largeMode: false,
      wrapLongLines: true,
      enableStructuralFolding: true,
      preserveStructuralFolding: true,
    });

    expect(options.folding).toBe(true);
    expect(options.showFoldingControls).toBe('always');
    expect(options.largeFileOptimizations).toBe(false);
    expect(options.foldingMaximumRegions).toBe(200000);

    const editModalSource = readFileSync(join(process.cwd(), 'src/components/JsonEditModal.tsx'), 'utf8');
    expect(editModalSource).toContain('preserveStructuralFolding');
    expect(editModalSource).toContain('const editModelPath = `hanjson-edit-${sessionKey}.json`;');
    expect(editModalSource).toContain('path={editModelPath}');
  });
});

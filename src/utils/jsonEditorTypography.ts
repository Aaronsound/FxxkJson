export const JSON_EDITOR_FONT_FAMILY = 'Consolas, "Courier New", monospace';
export const JSON_EDITOR_FONT_SIZE = 14;
export const JSON_EDITOR_LINE_HEIGHT = 19;

export const JSON_EDITOR_FONT_SIZE_CSS = `${JSON_EDITOR_FONT_SIZE}px`;
export const JSON_EDITOR_LINE_HEIGHT_CSS = `${JSON_EDITOR_LINE_HEIGHT}px`;

export const JSON_EDITOR_LIGHT_THEME = 'vs-light';
export const JSON_EDITOR_DARK_THEME = 'vs-dark';

type JsonEditorThemeColors = {
  foreground: string;
  background: string;
  lineNumber: string;
  key: string;
  string: string;
  number: string;
  literal: string;
  punctuation: string;
};

export const JSON_EDITOR_LIGHT_COLORS = {
  foreground: '#000000',
  background: '#ffffff',
  lineNumber: '#237893',
  key: '#a31515',
  string: '#0451a5',
  number: '#0451a5',
  literal: '#0451a5',
  punctuation: '#000000',
} as const satisfies JsonEditorThemeColors;

export const JSON_EDITOR_DARK_COLORS = {
  foreground: '#d4d4d4',
  background: '#1e1e1e',
  lineNumber: '#858585',
  key: '#ff8f8f',
  string: '#75beff',
  number: '#75beff',
  literal: '#75beff',
  punctuation: '#d4d4d4',
} as const satisfies JsonEditorThemeColors;

export type JsonEditorCssVariables = {
  '--json-editor-font-family': string;
  '--json-editor-font-size': string;
  '--json-editor-line-height': string;
  '--json-editor-foreground': string;
  '--json-editor-background': string;
  '--json-editor-line-number': string;
  '--json-editor-token-key': string;
  '--json-editor-token-string': string;
  '--json-editor-token-number': string;
  '--json-editor-token-literal': string;
  '--json-editor-token-punctuation': string;
};

function buildJsonEditorCssVariables(colors: JsonEditorThemeColors): JsonEditorCssVariables {
  return {
    '--json-editor-font-family': JSON_EDITOR_FONT_FAMILY,
    '--json-editor-font-size': JSON_EDITOR_FONT_SIZE_CSS,
    '--json-editor-line-height': JSON_EDITOR_LINE_HEIGHT_CSS,
    '--json-editor-foreground': colors.foreground,
    '--json-editor-background': colors.background,
    '--json-editor-line-number': colors.lineNumber,
    '--json-editor-token-key': colors.key,
    '--json-editor-token-string': colors.string,
    '--json-editor-token-number': colors.number,
    '--json-editor-token-literal': colors.literal,
    '--json-editor-token-punctuation': colors.punctuation,
  };
}

export const JSON_EDITOR_LIGHT_CSS_VARIABLES = buildJsonEditorCssVariables(JSON_EDITOR_LIGHT_COLORS);
export const JSON_EDITOR_DARK_CSS_VARIABLES = buildJsonEditorCssVariables(JSON_EDITOR_DARK_COLORS);

export function getJsonEditorCssVariables(isDarkMode: boolean) {
  return isDarkMode ? JSON_EDITOR_DARK_CSS_VARIABLES : JSON_EDITOR_LIGHT_CSS_VARIABLES;
}

export function getJsonEditorTheme(isDarkMode: boolean) {
  return isDarkMode ? JSON_EDITOR_DARK_THEME : JSON_EDITOR_LIGHT_THEME;
}

export const JSON_EDITOR_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace';
export const JSON_EDITOR_FONT_SIZE = 12;
export const JSON_EDITOR_LINE_HEIGHT = 18;

export const JSON_EDITOR_FONT_SIZE_CSS = `${JSON_EDITOR_FONT_SIZE}px`;
export const JSON_EDITOR_LINE_HEIGHT_CSS = `${JSON_EDITOR_LINE_HEIGHT}px`;

export const JSON_EDITOR_LIGHT_THEME = 'vs-light';
export const JSON_EDITOR_DARK_THEME = 'vs-dark';

export const JSON_EDITOR_LIGHT_COLORS = {
  foreground: '#000000',
  background: '#ffffff',
  lineNumber: '#237893',
  key: '#a31515',
  string: '#0451a5',
  number: '#0451a5',
  literal: '#0451a5',
  punctuation: '#000000',
} as const;

export const JSON_EDITOR_DARK_COLORS = {
  foreground: '#d4d4d4',
  background: '#1e1e1e',
  lineNumber: '#858585',
  key: '#ff8f8f',
  string: '#75beff',
  number: '#75beff',
  literal: '#75beff',
  punctuation: '#d4d4d4',
} as const;

export function getJsonEditorTheme(isDarkMode: boolean) {
  return isDarkMode ? JSON_EDITOR_DARK_THEME : JSON_EDITOR_LIGHT_THEME;
}

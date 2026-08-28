import { readStorageItem } from './safeStorage';

export const ACCENT_THEME_STORAGE_KEY = 'fxxkjson.accentTheme';
export const DEFAULT_ACCENT_THEME = 'emerald';

export type AppAccentTheme = 'emerald' | 'mist' | 'graphite' | 'obsidian' | 'blue' | 'indigo' | 'violet';

export function isAppAccentTheme(value: string | null): value is AppAccentTheme {
  return (
    value === 'emerald' ||
    value === 'mist' ||
    value === 'graphite' ||
    value === 'obsidian' ||
    value === 'blue' ||
    value === 'indigo' ||
    value === 'violet'
  );
}

export function getInitialAccentTheme(): AppAccentTheme {
  const storedTheme = readStorageItem(ACCENT_THEME_STORAGE_KEY);
  return isAppAccentTheme(storedTheme) ? storedTheme : DEFAULT_ACCENT_THEME;
}

import { messages } from './i18nMessages';
import { readStorageItem } from './safeStorage';

export type AppLanguage = 'zh' | 'en';

export const LANGUAGE_STORAGE_KEY = 'fxxkjson.language';

type TranslateParams = Record<string, string | number>;

export type I18nKey = keyof typeof messages.zh;

export function isAppLanguage(value: string | null): value is AppLanguage {
  return value === 'zh' || value === 'en';
}

export function getInitialLanguage(): AppLanguage {
  if (typeof window === 'undefined') {
    return 'zh';
  }

  const storedLanguage = readStorageItem(LANGUAGE_STORAGE_KEY);
  return isAppLanguage(storedLanguage) ? storedLanguage : 'zh';
}

export function createTranslator(language: AppLanguage) {
  return (key: I18nKey, params: TranslateParams = {}): string => {
    const template: string = messages[language][key] ?? messages.zh[key] ?? key;
    return Object.entries(params).reduce<string>(
      (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
      template
    );
  };
}

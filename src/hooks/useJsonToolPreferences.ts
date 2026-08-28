import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ACCENT_THEME_STORAGE_KEY, getInitialAccentTheme } from '../utils/accentTheme';
import { createTranslator, getInitialLanguage, LANGUAGE_STORAGE_KEY } from '../utils/i18n';
import { readStorageItem, writeStorageItem } from '../utils/safeStorage';

const PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY = 'fxxkjson.performancePanel.visible.v2';

export function useJsonToolPreferences() {
  const [accentTheme, setAccentTheme] = useState(getInitialAccentTheme);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [language, setLanguage] = useState(getInitialLanguage);
  const [wrapLongLines, setWrapLongLines] = useState(false);
  const [showPerformancePanel, setShowPerformancePanel] = useState(() => {
    return readStorageItem(PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY) !== 'false';
  });
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    writeStorageItem(PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY, String(showPerformancePanel));
  }, [showPerformancePanel]);

  useLayoutEffect(() => {
    writeStorageItem(ACCENT_THEME_STORAGE_KEY, accentTheme);
    document.documentElement.dataset.accentTheme = accentTheme;
  }, [accentTheme]);

  useEffect(() => {
    writeStorageItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  return {
    accentTheme,
    isDarkMode,
    language,
    setAccentTheme,
    setIsDarkMode,
    setLanguage,
    setShowPerformancePanel,
    setWrapLongLines,
    showPerformancePanel,
    t,
    wrapLongLines,
  };
}

import { useEffect, useMemo, useState } from 'react';
import { createTranslator, getInitialLanguage, LANGUAGE_STORAGE_KEY } from '../utils/i18n';

const PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY = 'fxxkjson.performancePanel.visible.v2';

export function useJsonToolPreferences() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [language, setLanguage] = useState(getInitialLanguage);
  const [wrapLongLines, setWrapLongLines] = useState(false);
  const [showPerformancePanel, setShowPerformancePanel] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.localStorage.getItem(PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY) !== 'false';
  });
  const t = useMemo(() => createTranslator(language), [language]);

  useEffect(() => {
    window.localStorage.setItem(PERFORMANCE_PANEL_VISIBILITY_STORAGE_KEY, String(showPerformancePanel));
  }, [showPerformancePanel]);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  }, [language]);

  return {
    isDarkMode,
    language,
    setIsDarkMode,
    setLanguage,
    setShowPerformancePanel,
    setWrapLongLines,
    showPerformancePanel,
    t,
    wrapLongLines,
  };
}

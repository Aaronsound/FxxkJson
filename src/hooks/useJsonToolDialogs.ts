import { useEffect, useState } from 'react';

export function useJsonToolDialogs() {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isCompareOpen, setIsCompareOpen] = useState(false);
  const [runtimeInfo, setRuntimeInfo] = useState<RuntimeAppInfo | null>(null);
  const [isArchitectureWarningDismissed, setIsArchitectureWarningDismissed] = useState(false);
  const [isDiagnosticsLogOpen, setIsDiagnosticsLogOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    window.electronAPI
      ?.getRuntimeInfo?.()
      .then((info) => {
        if (isMounted) {
          setRuntimeInfo(info);
        }
      })
      .catch(() => {
        if (isMounted) {
          setRuntimeInfo(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    isAboutOpen,
    isArchitectureWarningDismissed,
    isCompareOpen,
    isDiagnosticsLogOpen,
    runtimeInfo,
    setIsAboutOpen,
    setIsArchitectureWarningDismissed,
    setIsCompareOpen,
    setIsDiagnosticsLogOpen,
  };
}

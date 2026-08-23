import Editor from '@monaco-editor/react';
import type { EditorProps, OnMount } from '@monaco-editor/react';
import { useMemo, type FC } from 'react';
import { getMonacoOptions } from '../utils/jsonEditorInteractions';
import { configureJsonEditorThemes, getJsonEditorTheme } from '../utils/jsonEditorTypography';

type JsonMonacoEditorProps = Omit<EditorProps, 'options' | 'theme' | 'loading' | 'onMount'> & {
  enableStructuralFolding?: boolean;
  isDarkMode: boolean;
  largeMode: boolean;
  onMount?: OnMount;
  preserveStructuralFolding?: boolean;
  readOnly?: boolean;
  wrapLongLines: boolean;
};

const JsonMonacoEditor: FC<JsonMonacoEditorProps> = ({
  beforeMount,
  enableStructuralFolding,
  isDarkMode,
  largeMode,
  onMount,
  preserveStructuralFolding,
  readOnly = false,
  wrapLongLines,
  ...editorProps
}) => {
  const options = useMemo(
    () =>
      getMonacoOptions({
        enableStructuralFolding,
        largeMode,
        preserveStructuralFolding,
        readOnly,
        wrapLongLines,
      }),
    [enableStructuralFolding, largeMode, preserveStructuralFolding, readOnly, wrapLongLines]
  );
  const handleBeforeMount: EditorProps['beforeMount'] = (monaco) => {
    configureJsonEditorThemes(monaco);
    beforeMount?.(monaco);
  };

  return (
    <Editor
      {...editorProps}
      beforeMount={handleBeforeMount}
      onMount={onMount}
      theme={getJsonEditorTheme(isDarkMode)}
      options={options}
      loading={null}
    />
  );
};

export default JsonMonacoEditor;

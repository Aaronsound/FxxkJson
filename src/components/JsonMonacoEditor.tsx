import Editor from '@monaco-editor/react';
import type { EditorProps, OnMount } from '@monaco-editor/react';
import type React from 'react';
import { getMonacoOptions } from '../utils/jsonEditorInteractions';
import { getJsonEditorTheme } from '../utils/jsonEditorTypography';

type JsonMonacoEditorProps = Omit<EditorProps, 'options' | 'theme' | 'loading' | 'onMount'> & {
  enableStructuralFolding?: boolean;
  isDarkMode: boolean;
  largeMode: boolean;
  onMount?: OnMount;
  readOnly?: boolean;
  wrapLongLines: boolean;
};

const JsonMonacoEditor: React.FC<JsonMonacoEditorProps> = ({
  enableStructuralFolding,
  isDarkMode,
  largeMode,
  onMount,
  readOnly = false,
  wrapLongLines,
  ...editorProps
}) => (
  <Editor
    {...editorProps}
    onMount={onMount}
    theme={getJsonEditorTheme(isDarkMode)}
    options={getMonacoOptions({
      enableStructuralFolding,
      largeMode,
      readOnly,
      wrapLongLines,
    })}
    loading={null}
  />
);

export default JsonMonacoEditor;

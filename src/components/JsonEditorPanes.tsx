import type React from 'react';
import Split from 'react-split';
import { createTranslator, type I18nKey } from '../utils/i18n';
import LeftJsonEditorPane from './LeftJsonEditorPane';
import RightJsonEditorPane from './RightJsonEditorPane';

type LeftPaneProps = React.ComponentProps<typeof LeftJsonEditorPane>;
type RightPaneProps = React.ComponentProps<typeof RightJsonEditorPane>;

interface JsonEditorPanesProps {
  isDarkMode: boolean;
  leftPaneProps: LeftPaneProps;
  rightPaneProps: RightPaneProps;
  t?: (key: I18nKey, params?: Record<string, string | number>) => string;
}

const defaultT = createTranslator('zh');

const JsonEditorPanes: React.FC<JsonEditorPanesProps> = ({
  isDarkMode,
  leftPaneProps,
  rightPaneProps,
  t = defaultT,
}) => (
  <Split
    className="editor-split"
    sizes={[50, 50]}
    minSize={200}
    gutterSize={6}
    style={{
      display: 'flex',
      flex: 1,
      minHeight: 0,
    }}
  >
    <LeftJsonEditorPane {...leftPaneProps} isDarkMode={isDarkMode} t={t} />

    <RightJsonEditorPane {...rightPaneProps} isDarkMode={isDarkMode} t={t} />
  </Split>
);

export default JsonEditorPanes;
export type { LeftPaneProps, RightPaneProps };

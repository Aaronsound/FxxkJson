import type React from 'react';

interface PaneProcessingStatusProps {
  message: string;
}

const PaneProcessingStatus: React.FC<PaneProcessingStatusProps> = ({ message }) => (
  <div className="editor-processing-layer" aria-busy="true">
    <div className="editor-processing-status" role="status" aria-live="polite">
      <span className="editor-processing-spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  </div>
);

export default PaneProcessingStatus;

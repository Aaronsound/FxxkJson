import type React from 'react';

interface OperationNoticeProps {
  children: React.ReactNode;
  kind?: 'success' | 'info' | 'error';
}

const OperationNotice: React.FC<OperationNoticeProps> = ({ children, kind = 'success' }) => (
  <span className={`operation-notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'} aria-live="polite">
    <span className="operation-notice-mark" aria-hidden="true">
      {kind === 'success' ? '✓' : kind === 'error' ? '!' : 'i'}
    </span>
    <span>{children}</span>
  </span>
);

export default OperationNotice;

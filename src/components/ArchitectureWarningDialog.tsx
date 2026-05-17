import React from 'react';

interface ArchitectureWarningDialogProps {
  isDarkMode: boolean;
  onClose: () => void;
  onOpenAbout: () => void;
}

const ArchitectureWarningDialog: React.FC<ArchitectureWarningDialogProps> = ({
  isDarkMode,
  onClose,
  onOpenAbout,
}) => (
  <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="architecture-warning-title">
    <div className={isDarkMode ? 'modal-card modal-card-dark architecture-warning-card' : 'modal-card architecture-warning-card'}>
      <div className="modal-header about-dialog-header">
        <h3 id="architecture-warning-title">检测到 x64 版本正在转译运行</h3>
      </div>
      <p className="architecture-warning-text">
        当前在 M 系列 Mac 上通过 Rosetta 运行 x64 版本。建议下载安装 macos-arm64 包，可以明显改善启动、导入和格式化大 JSON 的流畅度。
      </p>
      <div className="modal-actions about-dialog-actions">
        <button type="button" onClick={onClose}>知道了</button>
        <button type="button" onClick={onOpenAbout}>查看关于</button>
      </div>
    </div>
  </div>
);

export default ArchitectureWarningDialog;

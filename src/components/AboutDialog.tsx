import React, { useEffect } from 'react';

interface AboutDialogProps {
  version: string;
  isDarkMode: boolean;
  runtimeInfo?: RuntimeAppInfo | null;
  onClose: () => void;
}

const FEATURE_ITEMS = [
  '支持大 JSON 导入、格式化和轻量浏览，20MB 级文件也能保持顺畅滚动。',
  '右侧格式化视图支持搜索、折叠、复制值、编辑当前节点和定位左侧原始 JSON。',
  '内置 JSON 修复、转义、反转义、编辑保存和格式保留能力。',
  '提供性能面板和诊断日志，方便排查大文件处理、搜索和定位问题。',
];

const AboutDialog: React.FC<AboutDialogProps> = ({
  version,
  isDarkMode,
  runtimeInfo = null,
  onClose,
}) => {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => {
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [onClose]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="about-dialog-title">
      <div className={isDarkMode ? 'modal-card modal-card-dark about-dialog-card' : 'modal-card about-dialog-card'}>
        <div className="modal-header about-dialog-header">
          <h3 id="about-dialog-title">关于 FuckJson</h3>
          <button type="button" className="about-dialog-close" onClick={onClose} aria-label="关闭关于">
            ×
          </button>
        </div>

        <dl className="about-dialog-meta">
          <div>
            <dt>名称</dt>
            <dd>FuckJson</dd>
          </div>
          <div>
            <dt>版本</dt>
            <dd>{version}</dd>
          </div>
          <div>
            <dt>运行架构</dt>
            <dd>
              {runtimeInfo
                ? `${runtimeInfo.arch}${runtimeInfo.isMacTranslated ? '（Rosetta 转译）' : ''}`
                : '未知'}
            </dd>
          </div>
          <div>
            <dt>作者</dt>
            <dd>Alosan</dd>
          </div>
          <div>
            <dt>邮箱</dt>
            <dd>
              <a href="mailto:hanwalter@163.com">hanwalter@163.com</a>
            </dd>
          </div>
        </dl>

        {runtimeInfo?.isMacTranslated && (
          <div className="about-dialog-warning" role="alert">
            当前正在通过 Rosetta 运行 x64 版本。M 系列 Mac 建议安装 macos-arm64 包，导入和格式化大 JSON 会更流畅。
          </div>
        )}

        <section className="about-dialog-section" aria-labelledby="about-feature-title">
          <h4 id="about-feature-title">功能介绍</h4>
          <ul>
            {FEATURE_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <div className="modal-actions about-dialog-actions">
          <button type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
};

export default AboutDialog;

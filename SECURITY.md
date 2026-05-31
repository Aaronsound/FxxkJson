# Security Policy / 安全策略

## Supported Versions / 支持版本

Security fixes are handled on the latest released version.  
安全修复优先处理最新发布版本。

## Reporting a Vulnerability / 报告漏洞

Please do not open a public issue for a vulnerability that exposes user data or allows arbitrary code execution.  
如果漏洞可能暴露用户数据，或可能导致任意代码执行，请不要直接公开提交 issue。

Use GitHub private vulnerability reporting if it is enabled for the repository. If it is not available, open a minimal public issue asking for a private contact path without including exploit details.  
如果仓库启用了 GitHub private vulnerability reporting，请优先使用它。若不可用，请只提交一个简短公开 issue 请求私下联系方式，不要包含漏洞细节。

## Data Handling / 数据处理

FxxkJson is intended to process JSON locally on the user's machine. The app does not include analytics or remote JSON processing.  
FxxkJson 设计为在用户本机处理 JSON。应用不包含分析 SDK、遥测上传或远程 JSON 处理逻辑。

When sharing screenshots, logs, or sample JSON, remove private data, tokens, credentials, and customer/user information first.  
分享截图、日志或样例 JSON 前，请先移除私密数据、token、凭据和客户/用户信息。

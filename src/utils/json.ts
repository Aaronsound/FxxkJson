/**
 * 将 JSON 对象序列化成两空格缩进字符串。
 */
export function formatJson(input: unknown): string {
  return JSON.stringify(input, null, 2);
}

/**
 * 将一段 JSON 文本转成“字符串字面量”。
 * 例：{"a":1} -> "{\"a\":1}"
 */
export function toEscapedJsonLiteral(jsonText: string): string {
  const parsed = JSON.parse(jsonText);
  const compactJson = JSON.stringify(parsed);
  return JSON.stringify(compactJson);
}

/**
 * 从文件路径中提取文件名，兼容 Windows/macOS 路径分隔符。
 */
export function extractFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || 'Untitled';
}

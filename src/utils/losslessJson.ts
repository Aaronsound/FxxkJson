/** JSON tokens, including whole strings. Never turn number tokens into JS numbers. */
export function* jsonTokens(text: string) {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code <= 32) continue;
    const start = index;
    if (code === 34) {
      let end = index;
      for (;;) {
        end = text.indexOf('"', end + 1);
        if (end < 0) throw new SyntaxError('Unterminated JSON string');
        let slash = end - 1;
        while (text.charCodeAt(slash) === 92) slash -= 1;
        if ((end - slash) % 2 === 1) break;
      }
      index = end;
    } else if (code !== 123 && code !== 125 && code !== 91 && code !== 93 && code !== 44 && code !== 58) {
      while (index + 1 < text.length) {
        const next = text.charCodeAt(index + 1);
        if (next <= 32 || next === 123 || next === 125 || next === 91 || next === 93 || next === 44 || next === 58)
          break;
        index += 1;
      }
    }
    yield { text: text.slice(start, index + 1), index: start };
  }
}

/** The caller validates JSON first. This operation changes whitespace only. */
export function layoutJsonTokens(text: string, indent = '  ', newline = '\n') {
  const encoder = new TextEncoder();
  // TextEncoder replaces lone UTF-16 surrogates. Escape them instead, preserving
  // the JSON string value (including a literal surrogate supplied by an editor).
  const safeText = /[\uD800-\uDFFF]/.test(text)
    ? text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g, (value) =>
        value.length === 2 ? value : `\\u${value.charCodeAt(0).toString(16)}`
      )
    : text;
  const trimmed = safeText.trim();
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return trimmed;
  const source = encoder.encode(safeText);
  // ASCII has identical UTF-16 and UTF-8 offsets. Its native string search can
  // skip long values faster than Uint8Array.indexOf without changing byte copies.
  const ascii = source.length === safeText.length;
  let output = new Uint8Array(Math.ceil(source.length * (indent ? 1.5 : 1)) + 128);
  let size = 0;
  let depth = 0;
  const indentation = [encoder.encode(newline)];
  const put = (bytes: Uint8Array, from = 0, to = bytes.length) => {
    const length = to - from;
    if (size + length > output.length) {
      const grown = new Uint8Array(Math.max(size + length, output.length * 2));
      grown.set(output.subarray(0, size));
      output = grown;
    }
    if (length < 64) {
      for (let index = from; index < to; index += 1) output[size++] = bytes[index];
    } else {
      output.set(bytes.subarray(from, to), size);
      size += length;
    }
  };
  const line = () => {
    while (indentation.length <= depth) indentation.push(encoder.encode(newline + indent.repeat(indentation.length)));
    put(indentation[depth]);
  };
  const space = new Uint8Array([32]);
  let start = 0;
  let previous = 0;
  for (let index = 0; index < source.length; index += 1) {
    const code = source[index];
    if (code === 34) {
      let end = index;
      do {
        end = ascii ? safeText.indexOf('"', end + 1) : source.indexOf(34, end + 1);
        let slash = end - 1;
        while (source[slash] === 92) slash -= 1;
        if ((end - slash) % 2 === 1) break;
      } while (end >= 0);
      if (end < 0) throw new SyntaxError('Unterminated JSON string');
      index = end;
      previous = 34;
      continue;
    }
    if (code <= 32) {
      if (index > start) put(source, start, index);
      start = index + 1;
      continue;
    }
    if (code === 123 || code === 91 || code === 125 || code === 93 || code === 44 || code === 58) {
      if (code === 125 || code === 93) {
        if (index > start) put(source, start, index);
        depth -= 1;
        if (indent && previous !== 123 && previous !== 91) line();
        put(source, index, index + 1);
      } else {
        put(source, start, index + 1);
      }
      if (code === 123 || code === 91) {
        depth += 1;
        let next = index + 1;
        while (source[next] <= 32) next += 1;
        if (indent && source[next] !== 125 && source[next] !== 93) line();
      } else if (code === 44 && indent) line();
      else if (code === 58 && indent) put(space);
      start = index + 1;
    }
    previous = code;
  }
  if (start < source.length) put(source, start);
  return new TextDecoder().decode(output.subarray(0, size));
}

export function compactJsonText(text: string) {
  JSON.parse(text);
  return layoutJsonTokens(text, '');
}

/** Returns the first repeated key's source offset; object scopes remain independent. */
function* scanDuplicateJsonKey(text: string): Generator<void, { key: string; offset: number } | null> {
  const scopes: Array<Set<string> | null> = [];
  let previous = '';
  let previousOffset = 0;
  for (const match of jsonTokens(text)) {
    const token = match.text;
    if (token === '{') scopes.push(new Set());
    else if (token === '[') scopes.push(null);
    else if (token === '}' || token === ']') scopes.pop();
    else if (token === ':') {
      const keys = scopes[scopes.length - 1];
      // The document is already validated. Most keys need no escape decoding;
      // avoid a parser call for every ordinary property in large documents.
      const key = previous.includes('\\') ? (JSON.parse(previous) as string) : previous.slice(1, -1);
      if (keys?.has(key)) return { key, offset: previousOffset };
      keys?.add(key);
    }
    previous = token;
    previousOffset = match.index;
    yield;
  }
  return null;
}

export function findDuplicateJsonKey(text: string) {
  const scan = scanDuplicateJsonKey(text);
  let next = scan.next();
  while (!next.done) next = scan.next();
  return next.value;
}

export async function findDuplicateJsonKeyAsync(text: string, isCurrent: () => boolean) {
  const scan = scanDuplicateJsonKey(text);
  let next = scan.next();
  let count = 0;
  while (!next.done) {
    if (++count % 4096 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!isCurrent()) return null;
    }
    next = scan.next();
  }
  return next.value;
}

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JsonMonacoEditor from './JsonMonacoEditor';

const editorRender = vi.hoisted(() => vi.fn((_props: { options?: Record<string, unknown> }) => null));

vi.mock('@monaco-editor/react', () => ({
  default: editorRender,
}));

function getLastEditorOptions() {
  const latestProps = editorRender.mock.calls.at(-1)?.[0];
  if (!latestProps?.options) {
    throw new Error('Monaco options were not rendered');
  }
  return latestProps.options;
}

describe('JsonMonacoEditor', () => {
  beforeEach(() => {
    editorRender.mockClear();
  });

  it('keeps the options object stable until an editor option changes', () => {
    const { rerender } = render(
      <JsonMonacoEditor defaultValue="{}" isDarkMode={false} largeMode={false} wrapLongLines={false} />
    );
    const initialOptions = getLastEditorOptions();

    rerender(
      <JsonMonacoEditor
        defaultValue={'{"name":"updated"}'}
        isDarkMode={false}
        largeMode={false}
        wrapLongLines={false}
      />
    );
    expect(getLastEditorOptions()).toBe(initialOptions);

    rerender(
      <JsonMonacoEditor defaultValue={'{"name":"updated"}'} isDarkMode={false} largeMode={false} wrapLongLines />
    );
    expect(getLastEditorOptions()).not.toBe(initialOptions);
    expect(getLastEditorOptions()).toMatchObject({ wordWrap: 'on' });
  });
});

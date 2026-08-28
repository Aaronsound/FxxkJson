import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import OperationNotice from './OperationNotice';
import PaneProcessingStatus from './PaneProcessingStatus';

describe('editor feedback components', () => {
  afterEach(cleanup);

  it('announces processing without visually replacing the editor', () => {
    const { container } = render(<PaneProcessingStatus message="正在格式化..." />);
    expect(screen.getByRole('status')).toHaveTextContent('正在格式化...');
    expect(container.querySelector('.editor-processing-layer')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a consistent success notice', () => {
    render(<OperationNotice>复制成功</OperationNotice>);
    expect(screen.getByRole('status')).toHaveTextContent('复制成功');
  });
});

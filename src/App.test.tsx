import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('渲染工具栏核心按钮', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: '导入 JSON' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '格式化' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '清除' })).toBeInTheDocument();
});

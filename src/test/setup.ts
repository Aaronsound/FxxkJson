import '@testing-library/jest-dom/vitest';

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
}

if (!HTMLElement.prototype.scrollTo) {
  HTMLElement.prototype.scrollTo = function scrollTo(options?: ScrollToOptions | number, y?: number) {
    if (typeof options === 'number') {
      Object.defineProperty(this, 'scrollLeft', {
        configurable: true,
        value: options,
        writable: true,
      });
      Object.defineProperty(this, 'scrollTop', {
        configurable: true,
        value: y ?? 0,
        writable: true,
      });
      return;
    }

    Object.defineProperty(this, 'scrollLeft', {
      configurable: true,
      value: options?.left ?? 0,
      writable: true,
    });
    Object.defineProperty(this, 'scrollTop', {
      configurable: true,
      value: options?.top ?? 0,
      writable: true,
    });
  };
}

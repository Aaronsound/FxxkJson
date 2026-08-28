import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { clickButtonByText, evaluate, waitFor } from './e2e-cdp-helpers.mjs';
import {
  assertElectronMemoryBudget,
  collectFailureArtifacts,
  connectAndPrepareElectronPage,
  getAvailablePort,
  readElectronMemorySnapshot,
  startElectronApp,
} from './e2e-electron-app.mjs';
import { importSampleThroughNativeFileFlow, prepareSampleJsonFile } from './e2e-json-fixtures.mjs';
import { runRepeatedEditFoldingScenario } from './e2e-json-edit-folding-scenario.mjs';
import { runEditTransformScenario } from './e2e-json-edit-transform-scenario.mjs';
import { runMultiTabMemoryScenario } from './e2e-json-multi-tab-memory-scenario.mjs';
import {
  runClipboardAndCompareScenario,
  runRightNodeScenario,
  runSearchReplaceScenario,
} from './e2e-json-flow-scenarios.mjs';

const require = createRequire(import.meta.url);

function printSuccessSummary(sizeMb, samplePath, memorySnapshot, multiTabMemory) {
  console.log('FxxkJson Electron E2E passed');
  console.table([
    { step: 'sample', detail: `${sizeMb}MB generated at ${samplePath}` },
    { step: 'import', detail: 'native MessagePort stream imported JSON through the desktop file flow' },
    {
      step: 'memory',
      detail: `${memorySnapshot.totalWorkingSetMb.toFixed(1)} MB working set, ${memorySnapshot.totalPeakWorkingSetMb.toFixed(1)} MB peak, ${memorySnapshot.rendererHeapMb.toFixed(1)} MB renderer heap`,
    },
    {
      step: 'multi-tab cleanup',
      detail: `${multiTabMemory.expanded.totalWorkingSetMb.toFixed(1)} MB with auxiliary tabs, ${multiTabMemory.afterClose.totalWorkingSetMb.toFixed(1)} MB after close`,
    },
    { step: 'edit folding', detail: 'edit modal keeps JSON folding controls across repeated opens' },
    {
      step: 'toolbar UI',
      detail:
        'menus stay bounded, accent themes persist, status text remains readable, and English labels are complete',
    },
    { step: 'pane focus', detail: 'the active raw or formatted pane has a visible header accent' },
    { step: 'split resize', detail: 'center gutter resizes both editor panes' },
    { step: 'dual find escape', detail: 'Escape closes the search belonging to the active pane' },
    { step: 'large folding', detail: 'fold-all stays compact while root and nested nodes preserve expand semantics' },
    { step: 'search', detail: 'right pane traceId search returned results' },
    { step: 'locate', detail: 'right node click highlighted left raw JSON' },
    { step: 'delete cancel', detail: 'right node delete preview closes with Escape' },
    { step: 'rename warnings', detail: 'right node rename dialog shows whitespace and duplicate-key warnings' },
    { step: 'edit', detail: 'large right node edit saved back to original JSON' },
    { step: 'edit transforms', detail: 'edit modal converts selected and full JSON into string values' },
    { step: 'save state', detail: 'edited content and locate status remained available after save' },
    { step: 'selection copy', detail: 'right selected value remains selected and copies with Alt+C' },
    { step: 'context paste', detail: 'left editor context menu paste inserts desktop clipboard text' },
    { step: 'compare invalid', detail: 'JSON compare reports parse errors for invalid input' },
  ]);
}

async function assertToolbarUi(cdp) {
  const checkboxAlignment = await evaluate(
    cdp,
    `(() => {
      const labels = Array.from(document.querySelectorAll('.toolbar-checkbox'));
      return labels.map((label) => {
        const input = label.querySelector('input');
        const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
        if (!(input instanceof HTMLInputElement) || !textNode) return null;
        const textRange = document.createRange();
        textRange.selectNodeContents(textNode);
        const inputRect = input.getBoundingClientRect();
        const textRect = textRange.getBoundingClientRect();
        return Math.abs(inputRect.top + inputRect.height / 2 - (textRect.top + textRect.height / 2));
      });
    })()`
  );
  if (
    !Array.isArray(checkboxAlignment) ||
    checkboxAlignment.some((offset) => typeof offset !== 'number' || offset > 1.5)
  ) {
    throw new Error(`Toolbar checkbox labels were not vertically aligned: ${JSON.stringify(checkboxAlignment)}`);
  }

  const openMore = () =>
    evaluate(
      cdp,
      `(() => {
        const summary = document.querySelector('.toolbar-more-trigger');
        if (!(summary instanceof HTMLElement)) return false;
        summary.click();
        return true;
      })()`
    );

  if (!(await openMore())) throw new Error('More menu trigger was unavailable');
  const desktopMenuWidth = await evaluate(
    cdp,
    `document.querySelector('.toolbar-more-popover')?.getBoundingClientRect().width ?? 0`
  );
  if (desktopMenuWidth < 131 || desktopMenuWidth > 145) {
    throw new Error(`Desktop More menu did not use its compact width: ${desktopMenuWidth}`);
  }
  await evaluate(cdp, `document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await waitFor(
    () => evaluate(cdp, `!document.querySelector('.toolbar-more-menu')?.hasAttribute('open')`),
    'outside pointer closes More menu'
  );

  await openMore();
  const selectedTheme = await evaluate(
    cdp,
    `(() => {
      document.querySelector('.toolbar-theme-menu > .toolbar-language-trigger')?.click();
      const options = document.querySelectorAll('[data-accent-theme-option]');
      const option = document.querySelector('[data-accent-theme-option="mist"]');
      if (options.length !== 7 || !(option instanceof HTMLElement)) return false;
      option.click();
      return true;
    })()`
  );
  if (!selectedTheme) throw new Error('The seven accent theme options or Mist blue were unavailable');
  await waitFor(
    () => evaluate(cdp, `document.documentElement.dataset.accentTheme === 'mist'`),
    'accent theme switches to mist blue'
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `getComputedStyle(document.querySelector('.toolbar-button-primary')).backgroundColor === 'rgb(80, 122, 137)'`
      ),
    'accent theme transition completes'
  );
  const accentThemeMetrics = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('.toolbar-button-primary');
      if (!(button instanceof HTMLElement)) return null;
      return {
        accent: getComputedStyle(document.querySelector('.app-container')).getPropertyValue('--app-accent').trim(),
        buttonBackground: getComputedStyle(button).backgroundColor,
        danger: getComputedStyle(document.querySelector('.app-container')).getPropertyValue('--app-danger').trim(),
        stored: localStorage.getItem('fxxkjson.accentTheme'),
      };
    })()`
  );
  if (
    accentThemeMetrics?.accent !== '#507a89' ||
    accentThemeMetrics.buttonBackground !== 'rgb(80, 122, 137)' ||
    accentThemeMetrics.danger !== '#c62828' ||
    accentThemeMetrics.stored !== 'mist'
  ) {
    throw new Error(`Accent theme did not update its CSS variables: ${JSON.stringify(accentThemeMetrics)}`);
  }

  await openMore();
  await clickButtonByText(cdp, '深色模式');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.app-container')?.classList.contains('dark-mode')`),
    'dark mode'
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `getComputedStyle(document.querySelector('.toolbar-button-primary')).backgroundColor === 'rgb(137, 181, 195)'`
      ),
    'dark accent theme transition completes'
  );
  const darkThemeContrast = await evaluate(
    cdp,
    `(() => {
      const button = document.querySelector('.toolbar-button-primary');
      if (!(button instanceof HTMLElement)) return null;
      const parseRgb = (value) => (value.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number);
      const luminance = (value) => {
        const channels = parseRgb(value).map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const style = getComputedStyle(button);
      const foreground = luminance(style.color);
      const background = luminance(style.backgroundColor);
      return {
        accent: getComputedStyle(document.querySelector('.app-container')).getPropertyValue('--app-accent').trim(),
        contrast: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05),
      };
    })()`
  );
  if (darkThemeContrast?.accent !== '#89b5c3' || darkThemeContrast.contrast < 4.5) {
    throw new Error(`Dark accent theme contrast was insufficient: ${JSON.stringify(darkThemeContrast)}`);
  }
  await openMore();
  await clickButtonByText(cdp, '浅色模式');
  await waitFor(
    () => evaluate(cdp, `!document.querySelector('.app-container')?.classList.contains('dark-mode')`),
    'light mode restores after accent check'
  );

  await openMore();
  await evaluate(
    cdp,
    `(() => {
      document.querySelector('.toolbar-theme-menu > .toolbar-language-trigger')?.click();
      const option = document.querySelector('[data-accent-theme-option="graphite"]');
      if (!(option instanceof HTMLElement)) return false;
      option.click();
      return true;
    })()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `document.documentElement.dataset.accentTheme === 'graphite' && getComputedStyle(document.querySelector('.toolbar-button-primary')).backgroundColor === 'rgb(102, 113, 124)'`
      ),
    'graphite accent theme transition completes'
  );

  await openMore();
  await evaluate(
    cdp,
    `(() => {
      document.querySelector('.toolbar-theme-menu > .toolbar-language-trigger')?.click();
      const option = document.querySelector('[data-accent-theme-option="obsidian"]');
      if (!(option instanceof HTMLElement)) return false;
      option.click();
      return true;
    })()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `document.documentElement.dataset.accentTheme === 'obsidian' && getComputedStyle(document.querySelector('.toolbar-button-primary')).backgroundColor === 'rgb(37, 43, 49)'`
      ),
    'obsidian accent theme transition completes'
  );
  await openMore();
  await clickButtonByText(cdp, '深色模式');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => {
          const button = document.querySelector('.toolbar-button-primary');
          if (!(button instanceof HTMLElement)) return false;
          const style = getComputedStyle(button);
          return document.querySelector('.app-container')?.classList.contains('dark-mode') && style.backgroundColor === 'rgb(215, 220, 225)' && style.color === 'rgb(24, 27, 31)';
        })()`
      ),
    'obsidian theme switches to silver in dark mode'
  );
  await openMore();
  await clickButtonByText(cdp, '浅色模式');
  await waitFor(
    () => evaluate(cdp, `!document.querySelector('.app-container')?.classList.contains('dark-mode')`),
    'light mode restores after obsidian check'
  );

  await openMore();
  await evaluate(
    cdp,
    `(() => {
      document.querySelector('.toolbar-theme-menu > .toolbar-language-trigger')?.click();
      const option = document.querySelector('[data-accent-theme-option="emerald"]');
      if (!(option instanceof HTMLElement)) return false;
      option.click();
      return true;
    })()`
  );
  await waitFor(
    () => evaluate(cdp, `document.documentElement.dataset.accentTheme === 'emerald'`),
    'accent theme restores to emerald'
  );

  await openMore();
  await evaluate(cdp, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(
    () => evaluate(cdp, `!document.querySelector('.toolbar-more-menu')?.hasAttribute('open')`),
    'Escape closes More menu'
  );

  await openMore();
  await evaluate(
    cdp,
    `(() => {
      document.querySelector('.toolbar-language-menu:not(.toolbar-theme-menu) > .toolbar-language-trigger')?.click();
      const option = Array.from(document.querySelectorAll('.toolbar-language-option'))
        .find((element) => element.textContent?.trim().endsWith('English'));
      if (!(option instanceof HTMLElement)) return false;
      option.click();
      return true;
    })()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Import JSON')`
      ),
    'toolbar switches to English'
  );

  await evaluate(
    cdp,
    `(() => {
      const label = Array.from(document.querySelectorAll('.toolbar-checkbox'))
        .find((element) => element.textContent?.includes('Show performance'));
      const input = label?.querySelector('input[type="checkbox"]');
      if (!(input instanceof HTMLInputElement)) return false;
      if (!input.checked) input.click();
      return true;
    })()`
  );
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.performance-panel')?.textContent?.includes('Performance')`),
    'performance panel renders in English'
  );

  await openMore();
  await clickButtonByText(cdp, 'Diagnostics');
  await waitFor(
    () => evaluate(cdp, `document.querySelector('[role="dialog"]')?.textContent?.includes('Diagnostics log')`),
    'diagnostics dialog renders in English'
  );
  await evaluate(cdp, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(() => evaluate(cdp, `!document.querySelector('[role="dialog"]')`), 'Escape closes diagnostics dialog');

  await openMore();
  await evaluate(
    cdp,
    `(() => {
      document.querySelector('.toolbar-language-trigger')?.click();
      const option = Array.from(document.querySelectorAll('.toolbar-language-option'))
        .find((element) => element.textContent?.includes('Chinese'));
      if (!(option instanceof HTMLElement)) return false;
      option.click();
      return true;
    })()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === '导入 JSON')`
      ),
    'toolbar switches back to Chinese'
  );

  await evaluate(cdp, `window.resizeTo(480, 700)`);
  await waitFor(() => evaluate(cdp, `window.innerWidth <= 860`), 'window enters compact toolbar breakpoint');
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.toolbar-more-compact-actions'))`),
    'compact actions move into More menu'
  );
  const compactMetrics = await evaluate(
    cdp,
    `(() => {
      const row = document.querySelector('.toolbar-command-row');
      const secondary = document.querySelector('.toolbar-command-group-secondary');
      const more = document.querySelector('.toolbar-more-trigger');
      const compact = document.querySelector('.toolbar-more-compact-actions');
      if (!(row instanceof HTMLElement) || !(secondary instanceof HTMLElement) || !(more instanceof HTMLElement)) return null;
      const moreRect = more.getBoundingClientRect();
      return {
        rowHeight: row.getBoundingClientRect().height,
        secondaryDisplay: getComputedStyle(secondary).display,
        moreLeft: moreRect.left,
        moreRight: moreRect.right,
        compactActionCount: compact?.querySelectorAll('button').length ?? 0,
        viewportWidth: window.innerWidth,
      };
    })()`
  );
  if (
    !compactMetrics ||
    compactMetrics.rowHeight > 40 ||
    compactMetrics.secondaryDisplay !== 'none' ||
    compactMetrics.moreLeft < 0 ||
    compactMetrics.moreRight > compactMetrics.viewportWidth ||
    compactMetrics.compactActionCount !== 7
  ) {
    throw new Error(`Compact toolbar did not keep More visible: ${JSON.stringify(compactMetrics)}`);
  }
  await openMore();
  await waitFor(
    () => evaluate(cdp, `document.querySelector('.toolbar-more-compact-actions')?.getBoundingClientRect().height > 0`),
    'compact actions are visible inside More menu'
  );
  const compactMenuMetrics = await evaluate(
    cdp,
    `(() => {
      const menu = document.querySelector('.toolbar-more-popover');
      if (!(menu instanceof HTMLElement)) return null;
      const rect = menu.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        overflowY: getComputedStyle(menu).overflowY,
        sectionLabels: Array.from(menu.querySelectorAll('.toolbar-more-section-label')).map((item) => item.textContent?.trim()),
        viewportHeight: window.innerHeight,
      };
    })()`
  );
  if (
    !compactMenuMetrics ||
    compactMenuMetrics.bottom > compactMenuMetrics.viewportHeight + 1 ||
    compactMenuMetrics.overflowY !== 'auto' ||
    !compactMenuMetrics.sectionLabels.includes('内容处理') ||
    !compactMenuMetrics.sectionLabels.includes('文档操作') ||
    compactMenuMetrics.sectionLabels.includes('设置与帮助')
  ) {
    throw new Error(`Compact More menu was not grouped and viewport-bounded: ${JSON.stringify(compactMenuMetrics)}`);
  }
  await evaluate(cdp, `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await evaluate(cdp, `window.resizeTo(1200, 800)`);
  await waitFor(() => evaluate(cdp, `window.innerWidth >= 1100`), 'window restores desktop toolbar width');
}

async function assertPaneFocusAffordance(cdp) {
  const result = await evaluate(
    cdp,
    `(() => {
      const leftPane = document.querySelector('.left-editor-pane');
      const rightPane = document.querySelector('.right-editor-pane');
      const leftHeader = leftPane?.querySelector('.editor-pane-header');
      const rightHeader = rightPane?.querySelector('.editor-pane-header');
      const leftInput = leftPane?.querySelector('textarea');
      const rightInput = rightPane?.querySelector('textarea');
      if (
        !(leftPane instanceof HTMLElement) ||
        !(rightPane instanceof HTMLElement) ||
        !(leftHeader instanceof HTMLElement) ||
        !(rightHeader instanceof HTMLElement) ||
        !(leftInput instanceof HTMLTextAreaElement) ||
        !(rightInput instanceof HTMLTextAreaElement)
      ) return null;

      leftInput.focus();
      const leftFocused = {
        leftActive: leftPane.matches(':focus-within'),
        leftShadow: getComputedStyle(leftHeader).boxShadow,
        rightActive: rightPane.matches(':focus-within'),
      };
      rightInput.focus();
      const rightFocused = {
        leftActive: leftPane.matches(':focus-within'),
        rightActive: rightPane.matches(':focus-within'),
        rightShadow: getComputedStyle(rightHeader).boxShadow,
      };
      return { leftFocused, rightFocused };
    })()`
  );

  if (
    !result?.leftFocused.leftActive ||
    result.leftFocused.rightActive ||
    result.leftFocused.leftShadow === 'none' ||
    result.rightFocused.leftActive ||
    !result.rightFocused.rightActive ||
    result.rightFocused.rightShadow === 'none'
  ) {
    throw new Error(`Editor pane focus affordance was unavailable: ${JSON.stringify(result)}`);
  }
}

async function assertReadableToolbarStatus(cdp) {
  await evaluate(cdp, `window.resizeTo(480, 700)`);
  await waitFor(() => evaluate(cdp, `window.innerWidth <= 860`), 'window enters compact status layout');
  const result = await evaluate(
    cdp,
    `(() => {
      const status = document.querySelector('.toolbar-feedback');
      const content = status?.querySelector('.toolbar-feedback-content');
      const hint = status?.querySelector('.toolbar-hint');
      if (!(status instanceof HTMLElement) || !(content instanceof HTMLElement) || !(hint instanceof HTMLElement)) {
        return null;
      }
      const rect = status.getBoundingClientRect();
      return {
        ariaLabel: status.getAttribute('aria-label'),
        contentWhiteSpace: getComputedStyle(content).whiteSpace,
        hintTitle: hint.getAttribute('title'),
        hintText: hint.textContent?.trim() ?? '',
        right: rect.right,
        scrollWidth: status.scrollWidth,
        clientWidth: status.clientWidth,
        viewportWidth: window.innerWidth,
      };
    })()`
  );
  if (
    result?.ariaLabel !== '当前状态' ||
    result.contentWhiteSpace !== 'normal' ||
    !result.hintTitle ||
    result.hintTitle !== result.hintText ||
    result.right > result.viewportWidth + 1 ||
    result.scrollWidth > result.clientWidth + 1
  ) {
    throw new Error(`Toolbar status was clipped in compact layout: ${JSON.stringify(result)}`);
  }
  await evaluate(cdp, `window.resizeTo(1200, 800)`);
  await waitFor(() => evaluate(cdp, `window.innerWidth >= 1100`), 'window restores desktop width after status check');
}

async function assertSplitResize(cdp) {
  const result = await evaluate(
    cdp,
    `(() => {
      const gutter = document.querySelector('.editor-split > .gutter.gutter-horizontal');
      const left = document.querySelector('.editor-split > .left-editor-pane');
      const right = document.querySelector('.editor-split > .right-editor-pane');
      if (!(gutter instanceof HTMLElement) || !(left instanceof HTMLElement) || !(right instanceof HTMLElement)) {
        return null;
      }

      const gutterRect = gutter.getBoundingClientRect();
      const before = left.getBoundingClientRect().width;
      const startX = gutterRect.left + gutterRect.width / 2;
      const targetX = startX + 120;
      gutter.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: startX, clientY: gutterRect.top + 40 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: targetX, clientY: gutterRect.top + 40 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: targetX, clientY: gutterRect.top + 40 }));
      const after = left.getBoundingClientRect().width;

      const movedGutterRect = gutter.getBoundingClientRect();
      const movedX = movedGutterRect.left + movedGutterRect.width / 2;
      gutter.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: movedX, clientY: movedGutterRect.top + 40 }));
      window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: startX, clientY: movedGutterRect.top + 40 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: startX, clientY: movedGutterRect.top + 40 }));

      return { before, after, gutterWidth: gutterRect.width };
    })()`
  );

  if (!result || result.gutterWidth < 9 || Math.abs(result.after - result.before) < 80) {
    throw new Error(`Center gutter did not resize editor panes: ${JSON.stringify(result)}`);
  }
}

async function assertDualPaneFindEscape(cdp) {
  const dispatchShortcut = (paneSelector, key, altKey = false) =>
    evaluate(
      cdp,
      `(() => {
        const input = document.querySelector(${JSON.stringify(`${paneSelector} textarea`)});
        if (!(input instanceof HTMLTextAreaElement)) return false;
        input.focus();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, altKey: ${altKey}, bubbles: true }));
        return true;
      })()`
    );

  if (!(await dispatchShortcut('.left-editor-pane', 'f', true))) {
    throw new Error('Left editor input was unavailable for the dual-search Escape check');
  }
  await waitFor(
    () => evaluate(cdp, `Boolean(document.querySelector('.left-editor-pane .pane-find-widget'))`),
    'left pane find opens'
  );

  if (!(await dispatchShortcut('.right-editor-pane', 'f', true))) {
    throw new Error('Right editor input was unavailable for the dual-search Escape check');
  }
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector('.left-editor-pane .pane-find-widget') && document.querySelector('.right-editor-pane .pane-find-widget'))`
      ),
    'both pane finds open'
  );

  await dispatchShortcut('.left-editor-pane', 'Escape');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `!document.querySelector('.left-editor-pane .pane-find-widget') && Boolean(document.querySelector('.right-editor-pane .pane-find-widget'))`
      ),
    'Escape closes the left pane find only'
  );

  await dispatchShortcut('.right-editor-pane', 'Escape');
  await waitFor(
    () => evaluate(cdp, `!document.querySelector('.right-editor-pane .pane-find-widget')`),
    'Escape closes the right pane find'
  );
}

async function assertLargeViewerAutoWrap(cdp) {
  const hasLargeViewer = await evaluate(
    cdp,
    `Boolean(document.querySelector('.right-editor-pane .large-json-viewer'))`
  );
  if (!hasLargeViewer) {
    return;
  }

  await evaluate(
    cdp,
    `(() => {
      const label = Array.from(document.querySelectorAll('.toolbar-checkbox'))
        .find((element) => element.textContent?.includes('自动换行'));
      const input = label?.querySelector('input[type="checkbox"]');
      if (!(input instanceof HTMLInputElement)) return false;
      if (!input.checked) input.click();
      return true;
    })()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `(() => {
          const rows = Array.from(document.querySelectorAll('.right-editor-pane .large-json-row.wrap'));
          const shortRows = rows.filter((row) => {
            const length = row.querySelector('.large-json-line-text')?.textContent?.length ?? 0;
            return length > 0 && length < 60;
          });
          const longRow = rows.find((row) => row.querySelector('.large-json-line-text')?.textContent?.includes('"message"'));
          const rowRects = rows
            .map((row) => row.getBoundingClientRect())
            .sort((left, right) => left.top - right.top);
          const rowsDoNotOverlap = rowRects.every((rect, index) => {
            const next = rowRects[index + 1];
            return !next || rect.bottom <= next.top + 0.5;
          });
          return shortRows.length >= 3
            && shortRows.every((row) => Math.round(row.getBoundingClientRect().height) === 18)
            && Boolean(longRow && longRow.getBoundingClientRect().height > 18)
            && rowsDoNotOverlap;
        })()`
      ),
    'large viewer wraps only long rows',
    90000
  );
  await evaluate(
    cdp,
    `(() => {
      const label = Array.from(document.querySelectorAll('.toolbar-checkbox'))
        .find((element) => element.textContent?.includes('自动换行'));
      const input = label?.querySelector('input[type="checkbox"]');
      if (input instanceof HTMLInputElement && input.checked) input.click();
      return true;
    })()`
  );
}

async function assertLargeViewerFoldAllSemantics(cdp) {
  const hasLargeViewer = await evaluate(
    cdp,
    `Boolean(document.querySelector('.right-editor-pane .large-json-viewer'))`
  );
  if (!hasLargeViewer) {
    return;
  }

  await clickButtonByText(cdp, '折叠全部');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector(
          '.right-editor-pane .large-json-line-text[data-line-number="1"][data-collapsed="true"]'
        ))`
      ),
    'large viewer fold all',
    90000
  );

  await evaluate(
    cdp,
    `document.querySelector(
      '.right-editor-pane .large-json-line-text[data-line-number="1"]'
    )?.parentElement?.querySelector('.large-json-fold-button')?.click()`
  );
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector(
          '.right-editor-pane .large-json-line-text[data-line-number="2"][data-collapsed="true"]'
        ))`
      ),
    'large viewer expands root while nested folds remain collapsed',
    90000
  );

  await clickButtonByText(cdp, '展开全部');
  await waitFor(
    () =>
      evaluate(
        cdp,
        `Boolean(document.querySelector(
          '.right-editor-pane .large-json-line-text[data-line-number="2"]:not([data-collapsed="true"])'
        ))`
      ),
    'large viewer unfold all',
    90000
  );
}

async function run() {
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.HANJSON_E2E_FORCE) {
    console.log('FxxkJson Electron E2E skipped: no DISPLAY is available on Linux');
    return;
  }

  const cwd = process.cwd();
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'fxxkjson-e2e-'));
  const port = await getAvailablePort();
  const electronCli = require.resolve('electron/cli.js');
  const appMain = path.join(cwd, 'dist-electron/main.js');
  let child = null;
  let cdp = null;
  let getStderr = () => '';

  try {
    const { samplePath, sizeMb } = await prepareSampleJsonFile(tempDir);
    const electronApp = await startElectronApp({
      appMain,
      cwd,
      electronCli,
      extraEnvironment: {
        HANJSON_E2E_NATIVE_IMPORT: '1',
        HANJSON_E2E_NATIVE_IMPORT_PATH: samplePath,
      },
      port,
    });
    child = electronApp.child;
    getStderr = electronApp.getStderr;

    cdp = await connectAndPrepareElectronPage(port);
    await assertToolbarUi(cdp);
    await assertSplitResize(cdp);
    await assertPaneFocusAffordance(cdp);
    await assertDualPaneFindEscape(cdp);
    await runEditTransformScenario(cdp);
    await importSampleThroughNativeFileFlow(cdp);
    await waitFor(
      () => evaluate(cdp, `document.body.innerText.includes('req-e2e-000000')`),
      'imported and formatted JSON',
      90000
    );
    await assertReadableToolbarStatus(cdp);
    await assertLargeViewerAutoWrap(cdp);
    await assertLargeViewerFoldAllSemantics(cdp);
    const memorySnapshot = await readElectronMemorySnapshot(cdp);
    assertElectronMemoryBudget(memorySnapshot, sizeMb);
    const multiTabMemory = await runMultiTabMemoryScenario(cdp, tempDir, sizeMb);

    await runRepeatedEditFoldingScenario(cdp);
    await runSearchReplaceScenario(cdp);
    await runRightNodeScenario(cdp);
    await runClipboardAndCompareScenario(cdp);
    printSuccessSummary(sizeMb, samplePath, memorySnapshot, multiTabMemory);
  } catch (error) {
    const stderr = getStderr();
    await collectFailureArtifacts({ cdp, stderr });
    if (stderr) {
      console.error(stderr);
    }
    throw error;
  } finally {
    cdp?.close();
    if (child && !child.killed) {
      child.kill();
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

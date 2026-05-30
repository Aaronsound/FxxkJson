import { app, session } from 'electron';
import type { WebContents } from 'electron';
import { logRuntimeEvent } from './runtimeLog';

export function blockPackagedExternalRequests() {
  if (!app.isPackaged) {
    return;
  }

  session.defaultSession.webRequest.onBeforeRequest(
    {
      urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'],
    },
    (details, callback) => {
      logRuntimeEvent('blocked-external-request', {
        url: details.url,
        resourceType: details.resourceType,
      });
      callback({ cancel: true });
    }
  );
}

export function hardenDefaultSession() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

export function guardMainWindowContents(webContents: WebContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    logRuntimeEvent('blocked-window-open', { url });
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    logRuntimeEvent('blocked-navigation', { url });
  });
}

import { createServer } from 'vite';

const WORKER_MODULES = [
  '/src/workers/jsonCompare.worker.ts',
  '/src/workers/jsonParser.worker.js',
  '/src/workers/jsonWorkerFormatOperations.ts',
  '/src/workers/jsonWorkerStructureOperations.js',
  '/src/workers/jsonWorkerTextPayload.ts',
];

const SERVER_CLOSE_TIMEOUT_MS = 2000;

async function closeServer(server) {
  let closeTimedOut = false;
  let closeTimeout = null;
  // Node exits with code 13 when top-level await is left pending after Vite close stalls.
  const timeout = new Promise((resolve) => {
    closeTimeout = setTimeout(() => {
      closeTimedOut = true;
      resolve();
    }, SERVER_CLOSE_TIMEOUT_MS);
  });

  try {
    await Promise.race([server.close(), timeout]);
  } catch (error) {
    console.warn(error instanceof Error ? `Vite server close failed: ${error.message}` : 'Vite server close failed');
  } finally {
    if (closeTimeout) {
      clearTimeout(closeTimeout);
    }
  }

  if (closeTimedOut) {
    console.warn('Vite server close timed out after worker import smoke finished');
  }
}

async function main() {
  const server = await createServer({
    configFile: 'vite.config.mts',
    logLevel: 'error',
    server: {
      middlewareMode: true,
    },
  });

  try {
    for (const modulePath of WORKER_MODULES) {
      const result = await server.transformRequest(modulePath);
      if (!result?.code) {
        throw new Error(`Vite returned no transformed code for ${modulePath}`);
      }
    }

    console.log('Vite worker import smoke passed');
  } finally {
    await closeServer(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

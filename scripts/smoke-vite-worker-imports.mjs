import { createServer } from 'vite';

const WORKER_MODULES = [
  '/src/workers/jsonParser.worker.js',
  '/src/workers/jsonWorkerFormatOperations.ts',
  '/src/workers/jsonWorkerStructureOperations.js',
  '/src/workers/jsonWorkerTextPayload.ts',
];

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
  await server.close();
}

import 'dotenv/config';
import { createAdaptorServer } from '@hono/node-server';
import app from './api';
import { getEnv, getDatabaseUrl, isLocalEmbeddedPostgres } from './lib/env';
import { initMockLogSocket } from './lib/mock-log-socket';

// Parse CLI arguments
const parseCliArgs = () => {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');

  return {
    port: portIndex !== -1 ? parseInt(args[portIndex + 1]) : parseInt(getEnv('PORT', '5500')!),
  };
};

const { port } = parseCliArgs();

const startServer = async () => {
  console.log(`🚀 Starting backend server on port ${port}`);

  if (!getDatabaseUrl() || isLocalEmbeddedPostgres()) {
    console.log('🔗 Using local database connection (expecting database server on dynamic port)');
  } else {
    console.log('🔗 Using external database connection');
  }

  const server = createAdaptorServer({
    fetch: app.fetch,
  });

  initMockLogSocket(server);

  server.listen(port, () => {
    console.log(`✅ API available at http://localhost:${port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `❌ Port ${port} is already in use. Stop the other process on that port, then restart.`
      );
      process.exit(1);
    }
    throw err;
  });
};

// Graceful shutdown
const shutdown = async () => {
  console.log('🛑 Shutting down server...');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();

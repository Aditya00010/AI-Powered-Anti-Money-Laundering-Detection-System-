/**
 * Project Vigilance - Backend Server Entrypoint
 * =============================================
 * Connects to MongoDB and binds the Express server to the configured port.
 */

const app = require('./src/app');
const { port, nodeEnv, mlServiceUrl } = require('./src/config/env');
const { connectDB, disconnectDB } = require('./src/config/db');

async function startServer() {
  console.log('================================================================');
  console.log(' PROJECT VIGILANCE — EXPRESS BACKEND APPLICATION LAYER');
  console.log('================================================================');
  console.log(`[Config] Environment   : ${nodeEnv}`);
  console.log(`[Config] Port          : ${port}`);
  console.log(`[Config] ML Service URL: ${mlServiceUrl}`);

  // Connect to MongoDB
  await connectDB();

  // Start HTTP server
  const server = app.listen(port, () => {
    console.log(`[Server] Express backend listening on http://localhost:${port}`);
    console.log(`[Server] Health check available at http://localhost:${port}/health`);
    console.log('================================================================');
  });

  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      console.log('[Server] Process terminated cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error(`[Server] Fatal startup error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { startServer };

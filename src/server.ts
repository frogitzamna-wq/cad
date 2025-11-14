import * as http from 'http';
import * as url from 'url';
import { IncidentsRouter } from './api/routes/incidents';
import { ResourcesRouter } from './api/routes/resources';
import { DispatchRouter } from './api/routes/dispatch';

const PORT = process.env.PORT || 3000;

// Initialize routers
const incidentsRouter = new IncidentsRouter();
const resourcesRouter = new ResourcesRouter();
const dispatchRouter = new DispatchRouter();

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url || '', true);
  const pathname = parsedUrl.pathname || '/';

  // Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'CAD BSV System'
    }));
    return;
  }

  // Root endpoint
  if (pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'BSV CAD System',
      version: '1.0.0',
      network: process.env.BSV_NETWORK || 'mainnet',
      endpoints: {
        health: '/health',
        incidents: '/api/incidents',
        resources: '/api/resources',
        dispatch: '/api/dispatch'
      }
    }));
    return;
  }

  // Try API routers
  try {
    if (await incidentsRouter.handleRequest(req, res, pathname)) return;
    if (await resourcesRouter.handleRequest(req, res, pathname)) return;
    if (await dispatchRouter.handleRequest(req, res, pathname)) return;
  } catch (error) {
    console.error('API error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
    return;
  }

  // 404 Not Found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 CAD BSV System running on port ${PORT}`);
  console.log(`   Network: ${process.env.BSV_NETWORK || 'mainnet'}`);
  console.log(`   Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log(`   Redis: ${process.env.REDIS_URL || 'Not configured'}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

import * as http from 'http';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'CAD BSV System'
    }));
  } else if (req.url === '/') {
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
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
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

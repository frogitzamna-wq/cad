import * as http from 'http';

export class ResourcesRouter {
  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<boolean> {
    // GET /api/resources - List all resources
    if (req.method === 'GET' && pathname === '/api/resources') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        resources: [
          {
            resourceId: 'unit_101',
            type: 'PATROL',
            status: 'AVAILABLE',
            location: { lat: 25.6866, lng: -100.3161 },
            callsign: 'P-101'
          },
          {
            resourceId: 'unit_102',
            type: 'AMBULANCE',
            status: 'DISPATCHED',
            location: { lat: 25.6900, lng: -100.3200 },
            callsign: 'A-102'
          }
        ],
        total: 2,
        available: 1,
        dispatched: 1
      }));
      return true;
    }

    // POST /api/resources - Register resource
    if (req.method === 'POST' && pathname === '/api/resources') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      
      await new Promise<void>(resolve => {
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              resourceId: `resource_${Date.now()}`,
              txid: `mock_txid_${Date.now()}`,
              data
            }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
          resolve();
        });
      });
      return true;
    }

    // GET /api/resources/:id - Get resource by ID
    const resourceMatch = pathname.match(/^\/api\/resources\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'GET' && resourceMatch) {
      const resourceId = resourceMatch[1];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        resourceId,
        type: 'PATROL',
        status: 'AVAILABLE',
        location: { lat: 25.6866, lng: -100.3161 },
        callsign: 'P-101',
        capabilities: ['PATROL', 'PURSUIT', 'K9']
      }));
      return true;
    }

    return false;
  }
}

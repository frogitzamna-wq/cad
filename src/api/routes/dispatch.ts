import * as http from 'http';

export class DispatchRouter {
  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<boolean> {
    // POST /api/dispatch - Create dispatch
    if (req.method === 'POST' && pathname === '/api/dispatch') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      
      await new Promise<void>(resolve => {
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              dispatchId: `dispatch_${Date.now()}`,
              incidentId: data.incidentId,
              resourceId: data.resourceId,
              status: 'CREATED',
              txid: `mock_txid_${Date.now()}`,
              timestamp: new Date().toISOString()
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

    // GET /api/dispatch/:id - Get dispatch by ID
    const dispatchMatch = pathname.match(/^\/api\/dispatch\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'GET' && dispatchMatch) {
      const dispatchId = dispatchMatch[1];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        dispatchId,
        incidentId: 'incident_123',
        resourceId: 'unit_101',
        status: 'ACCEPTED',
        eta: 5,
        createdAt: new Date().toISOString()
      }));
      return true;
    }

    // PUT /api/dispatch/:id/status - Update dispatch status
    const statusMatch = pathname.match(/^\/api\/dispatch\/([a-zA-Z0-9_-]+)\/status$/);
    if (req.method === 'PUT' && statusMatch) {
      const dispatchId = statusMatch[1];
      let body = '';
      req.on('data', chunk => { body += chunk; });
      
      await new Promise<void>(resolve => {
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              dispatchId,
              status: data.status,
              txid: `mock_txid_${Date.now()}`,
              timestamp: new Date().toISOString()
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

    return false;
  }
}

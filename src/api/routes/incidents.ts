import * as http from 'http';
import * as url from 'url';

export class IncidentsRouter {
  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<boolean> {
    // GET /api/incidents - List all incidents
    if (req.method === 'GET' && pathname === '/api/incidents') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        incidents: [],
        total: 0,
        page: 1,
        limit: 10
      }));
      return true;
    }

    // POST /api/incidents - Create incident
    if (req.method === 'POST' && pathname === '/api/incidents') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      
      await new Promise<void>(resolve => {
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              incidentId: `incident_${Date.now()}`,
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

    // GET /api/incidents/:id - Get incident by ID
    const incidentMatch = pathname.match(/^\/api\/incidents\/([a-zA-Z0-9_-]+)$/);
    if (req.method === 'GET' && incidentMatch) {
      const incidentId = incidentMatch[1];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        incidentId,
        status: 'ACTIVE',
        priority: 'HIGH',
        location: { lat: 25.6866, lng: -100.3161 },
        description: 'Mock incident',
        createdAt: new Date().toISOString()
      }));
      return true;
    }

    return false;
  }
}

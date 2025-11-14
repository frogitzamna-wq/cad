import * as http from 'http';
import * as url from 'url';
import { PIDFLOParser } from './pidf-lo/PIDFLOParser';
import { APCOMapper } from './apco/APCOMapper';

export interface I3CallStart {
  callId: string;
  callerNumber: string;
  callerLocation?: any;
  eventCode: string;
  pidflo?: string;
  timestamp: string;
}

export interface I3Response {
  status: 'ACCEPTED' | 'REJECTED' | 'PROCESSING';
  incidentId?: string;
  txid?: string;
  message?: string;
}

export class I3Server {
  private server: http.Server;
  private port: number;
  private pidfloParser: PIDFLOParser;
  private apcoMapper: APCOMapper;
  private onCallStart?: (call: I3CallStart) => Promise<I3Response>;

  constructor(port: number = 5000) {
    this.port = port;
    this.pidfloParser = new PIDFLOParser();
    this.apcoMapper = new APCOMapper();
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  /**
   * Handle incoming HTTP request
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Health check
    if (pathname === '/i3/v1/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'healthy',
        version: '3.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Protocol version
    if (pathname === '/i3/v1/version' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        protocol: 'NENA i3',
        version: '3.0',
        implementation: 'BSV CAD System'
      }));
      return;
    }

    // Call start
    if (pathname === '/i3/v1/callStart' && req.method === 'POST') {
      await this.handleCallStart(req, res);
      return;
    }

    // Call update
    if (pathname === '/i3/v1/callUpdate' && req.method === 'POST') {
      await this.handleCallUpdate(req, res);
      return;
    }

    // Call end
    if (pathname === '/i3/v1/callEnd' && req.method === 'POST') {
      await this.handleCallEnd(req, res);
      return;
    }

    // Location update
    if (pathname === '/i3/v1/locationUpdate' && req.method === 'POST') {
      await this.handleLocationUpdate(req, res);
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  /**
   * Handle callStart message
   */
  private async handleCallStart(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', chunk => { body += chunk; });

    await new Promise<void>(resolve => {
      req.on('end', async () => {
        try {
          const data: I3CallStart = JSON.parse(body);
          
          console.log(`📞 i3 callStart: ${data.callId} from ${data.callerNumber}`);

          // Parse PIDF-LO if provided
          if (data.pidflo) {
            const location = await this.pidfloParser.parse(data.pidflo);
            if (location && this.pidfloParser.validate(location)) {
              data.callerLocation = location;
              console.log(`📍 Location extracted: ${location.lat}, ${location.lng}`);
            }
          }

          // Get APCO mapping
          const mapping = this.apcoMapper.getMappingOrDefault(data.eventCode);
          console.log(`🚨 Event: ${mapping.description} (Priority: ${mapping.priority})`);

          // Call handler if registered
          let response: I3Response = {
            status: 'ACCEPTED',
            message: 'Call received and processing'
          };

          if (this.onCallStart) {
            response = await this.onCallStart(data);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(response));
        } catch (error) {
          console.error('callStart error:', error);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            status: 'REJECTED',
            message: error instanceof Error ? error.message : 'Invalid request' 
          }));
        }
        resolve();
      });
    });
  }

  /**
   * Handle callUpdate message
   */
  private async handleCallUpdate(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', chunk => { body += chunk; });

    await new Promise<void>(resolve => {
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log(`🔄 i3 callUpdate: ${data.callId}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ACCEPTED',
            message: 'Update received'
          }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
        resolve();
      });
    });
  }

  /**
   * Handle callEnd message
   */
  private async handleCallEnd(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', chunk => { body += chunk; });

    await new Promise<void>(resolve => {
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          console.log(`📴 i3 callEnd: ${data.callId}`);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ACCEPTED',
            message: 'Call ended'
          }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
        resolve();
      });
    });
  }

  /**
   * Handle locationUpdate message
   */
  private async handleLocationUpdate(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', chunk => { body += chunk; });

    await new Promise<void>(resolve => {
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          console.log(`📍 i3 locationUpdate: ${data.callId}`);

          // Parse updated location
          if (data.pidflo) {
            const location = await this.pidfloParser.parse(data.pidflo);
            if (location) {
              console.log(`📍 Updated location: ${location.lat}, ${location.lng}`);
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ACCEPTED',
            message: 'Location updated'
          }));
        } catch (error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
        resolve();
      });
    });
  }

  /**
   * Register callStart handler
   */
  onCallStartReceived(handler: (call: I3CallStart) => Promise<I3Response>) {
    this.onCallStart = handler;
  }

  /**
   * Start server
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 NENA i3 Server listening on port ${this.port}`);
        console.log(`   Health: http://localhost:${this.port}/i3/v1/status`);
        console.log(`   Version: http://localhost:${this.port}/i3/v1/version`);
        console.log(`   Endpoints:`);
        console.log(`     POST /i3/v1/callStart`);
        console.log(`     POST /i3/v1/callUpdate`);
        console.log(`     POST /i3/v1/callEnd`);
        console.log(`     POST /i3/v1/locationUpdate`);
        resolve();
      });
    });
  }

  /**
   * Stop server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('🛑 NENA i3 Server stopped');
        resolve();
      });
    });
  }

  /**
   * Get APCO mapper instance
   */
  getAPCOMapper(): APCOMapper {
    return this.apcoMapper;
  }
}

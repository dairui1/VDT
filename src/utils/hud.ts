import * as express from 'express';
import * as http from 'http';
import * as WebSocket from 'ws';
import * as path from 'path';
import { PTYManager } from './pty.js';
import { PlaywrightManager } from './playwright.js';
import { HudStartIn, HudStartOut, HudStatusOut } from '../types/index.js';

interface HudSession {
  sid: string;
  ptyManager: PTYManager;
  playwrightManager: PlaywrightManager;
  server: http.Server;
  wss: WebSocket.WebSocketServer;
  hudUrl: string;
}

export class HudManager {
  private sessions: Map<string, HudSession> = new Map();
  private basePort: number = 7788;

  async startHud(params: HudStartIn, sessionDir: string): Promise<HudStartOut> {
    const { sid, dev, browse, capture = {} } = params;

    // Find available port
    const port = await this.findAvailablePort(this.basePort);
    const hudUrl = `http://127.0.0.1:${port}/hud/${sid}`;

    // Create managers
    const ptyManager = new PTYManager();
    const playwrightManager = new PlaywrightManager();

    // Start dev server
    await ptyManager.startDevServer(sid, dev.cmd, dev.cwd, dev.env, sessionDir);

    // Setup PTY event listeners for WebSocket forwarding
    ptyManager.on('terminal_output', (eventData: { sid: string; data: string }) => {
      if (eventData.sid === sid) {
        this.broadcastToSession(sid, {
          type: 'terminal_output',
          data: eventData.data
        });
      }
    });

    // Start browser
    await playwrightManager.startBrowser(browse.entryUrl, sessionDir);

    // Setup Playwright event listeners for WebSocket forwarding
    playwrightManager.on('console_event', (consoleEvent: any) => {
      this.broadcastToSession(sid, {
        type: 'console_event',
        data: consoleEvent
      });
    });

    playwrightManager.on('network_event', (networkEvent: any) => {
      this.broadcastToSession(sid, {
        type: 'network_event', 
        data: networkEvent
      });
    });

    // Create Express app and WebSocket server
    const app = express.default();
    const server = http.createServer(app);
    const wss = new WebSocket.WebSocketServer({ server });

    // Setup WebSocket connections
    wss.on('connection', (ws: WebSocket.WebSocket) => {
      console.log(`WebSocket connected for session ${sid}`);
      
      ws.on('message', async (message: WebSocket.RawData) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleWebSocketMessage(sid, ws, data);
        } catch (error) {
          ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
      });

      ws.on('close', () => {
        console.log(`WebSocket disconnected for session ${sid}`);
      });
    });

    // Setup static file serving for HUD UI
    app.use('/hud', express.static(path.join(__dirname, '../../hud-ui/dist')));

    // Setup HUD route
    app.get(`/hud/${sid}`, (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(__dirname, '../../hud-ui/dist/index.html'));
    });

    // Start server
    server.listen(port, '127.0.0.1');

    // Store session
    const hudSession: HudSession = {
      sid,
      ptyManager,
      playwrightManager,
      server,
      wss,
      hudUrl,
    };

    this.sessions.set(sid, hudSession);

    // Generate resource links
    const links = [
      `vdt://sessions/${sid}/logs/devserver.ndjson`,
      `vdt://sessions/${sid}/logs/actions.ndjson`,
      `vdt://sessions/${sid}/logs/console.ndjson`,
      `vdt://sessions/${sid}/logs/network.ndjson`,
    ];

    return {
      sid,
      hudUrl,
      links,
    };
  }

  async getHudStatus(sid: string): Promise<HudStatusOut> {
    const session = this.sessions.get(sid);
    if (!session) {
      throw new Error(`HUD session ${sid} not found`);
    }

    const devStatus = session.ptyManager.getStatus(sid);
    const browserStatus = session.playwrightManager.getStatus();

    return {
      dev: devStatus,
      browser: browserStatus,
      recent: {
        actions: 0, // TODO: Count from log files
        errors: 0,
        consoleErrors: 0,
      },
      links: [
        `vdt://sessions/${sid}/logs/devserver.ndjson`,
        `vdt://sessions/${sid}/snapshots/`,
      ],
    };
  }

  async stopHud(sid: string, saveTrace: boolean = true): Promise<{ stopped: boolean; links: string[] }> {
    const session = this.sessions.get(sid);
    if (!session) {
      throw new Error(`HUD session ${sid} not found`);
    }

    // Stop PTY processes
    await session.ptyManager.stopProcess(sid);
    await session.ptyManager.dispose();

    // Stop Playwright
    await session.playwrightManager.dispose();

    // Close WebSocket server
    session.wss.close();
    session.server.close();

    // Remove from sessions
    this.sessions.delete(sid);

    const links = [
      `vdt://sessions/${sid}/logs/actions.ndjson`,
      `vdt://sessions/${sid}/logs/console.ndjson`,
    ];

    if (saveTrace) {
      links.push(`vdt://sessions/${sid}/trace.zip`);
    }

    return {
      stopped: true,
      links,
    };
  }

  private async handleWebSocketMessage(sid: string, ws: WebSocket.WebSocket, data: any): Promise<void> {
    const session = this.sessions.get(sid);
    if (!session) {
      ws.send(JSON.stringify({ error: `Session ${sid} not found` }));
      return;
    }

    try {
      switch (data.type) {
        case 'pty_input':
          await session.ptyManager.writeToProcess(sid, data.data);
          break;
        
        case 'get_status':
          const status = await this.getHudStatus(sid);
          ws.send(JSON.stringify({ type: 'status', data: status }));
          break;

        default:
          ws.send(JSON.stringify({ error: `Unknown message type: ${data.type}` }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }));
    }
  }

  private broadcastToSession(sid: string, message: any): void {
    const session = this.sessions.get(sid);
    if (!session) return;

    const messageStr = JSON.stringify(message);
    session.wss.clients.forEach((client: WebSocket.WebSocket) => {
      if (client.readyState === WebSocket.WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      
      server.listen(startPort, '127.0.0.1', () => {
        const port = (server.address() as any)?.port;
        server.close(() => resolve(port));
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          resolve(this.findAvailablePort(startPort + 1));
        } else {
          reject(err);
        }
      });
    });
  }

  // Recording methods
  async startRecording(sid: string, recordId: string, entryUrl: string, selectors?: { prefer: string[] }): Promise<void> {
    const session = this.sessions.get(sid);
    if (!session) {
      throw new Error(`HUD session ${sid} not found`);
    }

    await session.playwrightManager.startRecording(recordId, entryUrl, selectors);
  }

  async stopRecording(sid: string, recordId: string, exportFormats: Array<'playwright' | 'json'>): Promise<{
    script: { playwright?: string; json?: string };
    links: string[];
  }> {
    const session = this.sessions.get(sid);
    if (!session) {
      throw new Error(`HUD session ${sid} not found`);
    }

    return await session.playwrightManager.stopRecording(recordId, exportFormats);
  }

  async replayScript(sid: string, scriptPath: string, mode: 'headless' | 'headed' = 'headless'): Promise<{
    passed: boolean;
    summary: { steps: number; failStep?: string };
    links: string[];
  }> {
    const session = this.sessions.get(sid);
    if (!session) {
      throw new Error(`HUD session ${sid} not found`);
    }

    return await session.playwrightManager.replayScript(scriptPath, mode);
  }

  async dispose(): Promise<void> {
    // Stop all sessions
    for (const [sid] of this.sessions) {
      try {
        await this.stopHud(sid, false);
      } catch (error) {
        console.error(`Error stopping HUD session ${sid}:`, error);
      }
    }
  }
}
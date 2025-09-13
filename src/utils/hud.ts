import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { promises as fs } from 'fs';
import { HudStartIn, HudStartOut, HudStatusOut, LogEvent } from '../types/index.js';
import open from 'open';

interface HudSession {
  sessionId: string;
  port: number;
  process: ChildProcess;
  entryUrl: string;
  startTime: number;
}

export class HudManager {
  private sessions = new Map<string, HudSession>();
  private basePort = 3900;

  async startStandaloneHud(port?: number): Promise<{ hudUrl: string; port: number }> {
    const targetPort = port || await this.findAvailablePort();
    const sessionId = 'standalone-' + Date.now();
    
    // Start HUD server
    const hudDir = join(process.cwd(), 'src', 'hud');
    const hudProcess = spawn('node', ['server.js'], {
      cwd: hudDir,
      env: {
        ...process.env,
        PORT: targetPort.toString(),
        NODE_ENV: 'production'
      },
      stdio: 'pipe'
    });

    // Store session (reuse existing session structure)
    const session: HudSession = {
      sessionId,
      port: targetPort,
      process: hudProcess,
      entryUrl: 'http://localhost:3000', // Default entry URL
      startTime: Date.now()
    };
    this.sessions.set(sessionId, session);

    // Handle process events
    hudProcess.stdout?.on('data', (data) => {
      console.log(`[HUD:${sessionId}] ${data.toString().trim()}`);
    });

    hudProcess.stderr?.on('data', (data) => {
      console.error(`[HUD:${sessionId}] ${data.toString().trim()}`);
    });

    hudProcess.on('exit', (code) => {
      console.log(`HUD process for session ${sessionId} exited with code ${code}`);
      this.sessions.delete(sessionId);
    });

    // Wait for server to start
    await this.waitForServer(targetPort);

    const hudUrl = `http://localhost:${targetPort}`;
    
    // Auto-open browser
    try {
      console.log(`[VDT] Opening HUD in browser: ${hudUrl}`);
      await open(hudUrl);
    } catch (error) {
      console.warn('[VDT] Failed to auto-open browser:', error instanceof Error ? error.message : error);
      console.log(`[VDT] Please manually open: ${hudUrl}`);
    }
    
    return { hudUrl, port: targetPort };
  }

  async startHud(params: HudStartIn, sessionDir: string): Promise<HudStartOut> {
    const { sid } = params;
    const entryUrl = params.browse.entryUrl;
    
    // Check if HUD is already running for this session
    if (this.sessions.has(sid)) {
      const session = this.sessions.get(sid)!;
      return {
        sid,
        hudUrl: `http://localhost:${session.port}?sid=${sid}&url=${encodeURIComponent(entryUrl)}`,
        links: []
      };
    }

    // Find available port
    const port = await this.findAvailablePort();
    
    // Start HUD server
    const hudDir = join(process.cwd(), 'src', 'hud');
    const hudProcess = spawn('node', ['server.js'], {
      cwd: hudDir,
      env: {
        ...process.env,
        PORT: port.toString(),
        NODE_ENV: 'production'
      },
      stdio: 'pipe'
    });

    // Store session
    const session: HudSession = {
      sessionId: sid,
      port,
      process: hudProcess,
      entryUrl,
      startTime: Date.now()
    };
    this.sessions.set(sid, session);

    // Handle process events
    hudProcess.stdout?.on('data', (data) => {
      console.log(`[HUD:${sid}] ${data}`);
    });

    hudProcess.stderr?.on('data', (data) => {
      console.error(`[HUD:${sid}] ${data}`);
    });

    hudProcess.on('exit', (code) => {
      console.log(`HUD process for session ${sid} exited with code ${code}`);
      this.sessions.delete(sid);
    });

    // Wait for server to start
    await this.waitForServer(port);

    const hudUrl = `http://localhost:${port}?sid=${sid}&url=${encodeURIComponent(entryUrl)}`;

    // Auto-open browser if specified
    if (params.browse.autoOpen !== false) {
      try {
        console.log(`[VDT] Opening HUD in browser: ${hudUrl}`);
        await open(hudUrl);
      } catch (error) {
        console.warn('[VDT] Failed to auto-open browser:', error instanceof Error ? error.message : error);
        console.log(`[VDT] Please manually open: ${hudUrl}`);
      }
    }

    return {
      sid,
      hudUrl,
      links: [
        `vdt://sessions/${sid}/logs/hud.ndjson`
      ]
    };
  }

  async getHudStatus(sid: string): Promise<HudStatusOut> {
    const session = this.sessions.get(sid);
    
    if (!session) {
      return {
        dev: { status: 'exited' },
        browser: { status: 'closed', pages: 0 },
        recent: { actions: 0, errors: 0, consoleErrors: 0 },
        links: []
      };
    }

    return {
      dev: { 
        status: 'running',
        pid: session.process.pid
      },
      browser: { 
        status: 'ready', 
        pages: 1 
      },
      recent: { 
        actions: 0, 
        errors: 0, 
        consoleErrors: 0 
      },
      links: [
        `vdt://sessions/${sid}/logs/hud.ndjson`
      ]
    };
  }

  async stopHud(sid: string, saveTrace = false): Promise<{ stopped: boolean; links: string[] }> {
    const session = this.sessions.get(sid);
    
    if (!session) {
      return { stopped: false, links: [] };
    }

    // Kill the HUD process
    session.process.kill();
    this.sessions.delete(sid);

    const links = saveTrace ? [
      `vdt://sessions/${sid}/logs/hud.ndjson`,
      `vdt://sessions/${sid}/analysis/hud-trace.json`
    ] : [];

    return {
      stopped: true,
      links
    };
  }

  // Broadcast log event to HUD
  broadcastLogEvent(sid: string, logEvent: LogEvent): void {
    const session = this.sessions.get(sid);
    if (!session) return;

    // Use global function exposed by HUD server
    if (typeof (global as any).broadcastVDTLog === 'function') {
      (global as any).broadcastVDTLog(sid, logEvent);
    }
  }

  private async findAvailablePort(): Promise<number> {
    const net = await import('net');
    
    for (let port = this.basePort; port < this.basePort + 100; port++) {
      if (await this.isPortFree(port)) {
        return port;
      }
    }
    
    throw new Error('No available ports found');
  }

  private async isPortFree(port: number): Promise<boolean> {
    const net = await import('net');
    
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.on('error', () => {
        resolve(false);
      });
      
      server.listen(port, () => {
        server.close(() => {
          resolve(true);
        });
      });
    });
  }

  private async waitForServer(port: number): Promise<void> {
    const maxAttempts = 30;
    const delay = 1000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(`http://localhost:${port}`);
        if (response.ok || response.status === 404) {
          return; // Server is responding
        }
      } catch (error) {
        // Server not ready yet
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    throw new Error(`HUD server failed to start on port ${port} after ${maxAttempts} attempts`);
  }

  async dispose(): Promise<void> {
    // Stop all running HUD sessions
    const stopPromises = Array.from(this.sessions.keys()).map(sid => 
      this.stopHud(sid, false)
    );
    
    await Promise.all(stopPromises);
  }
}
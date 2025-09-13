import { HudStartIn, HudStartOut, HudStatusOut, LogEvent } from '../types/index.js';
import * as openModule from 'open';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const open = (openModule as unknown as { default?: (target: string) => Promise<unknown> }).default ?? (openModule as unknown as (target: string) => Promise<unknown>);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface HudSession {
  sessionId: string;
  entryUrl: string;
  startTime: number;
  hudProcess?: ChildProcess;
}

export class HudManager {
  private sessions = new Map<string, HudSession>();
  private readonly hudPort = 3950;
  private hudProcess: ChildProcess | null = null;
  private isHudStarting = false;

  async startStandaloneHud(port?: number, entryUrl?: string): Promise<{ hudUrl: string; port: number }> {
    // Start HUD server if not already running
    await this.ensureHudServerRunning();
    
    // Build URL with entry URL if provided
    let hudUrl = `http://localhost:${this.hudPort}`;
    if (entryUrl) {
      const urlParams = new URLSearchParams();
      urlParams.set('starthtml', entryUrl);
      hudUrl = `${hudUrl}?${urlParams.toString()}`;
    }
    
    // Auto-open browser
    try {
      console.log(`[VDT] Opening HUD in browser: ${hudUrl}`);
      await open(hudUrl);
    } catch (error) {
      console.warn('[VDT] Failed to auto-open browser:', error instanceof Error ? error.message : error);
      console.log(`[VDT] Please manually open: ${hudUrl}`);
    }
    
    return { hudUrl, port: this.hudPort };
  }

  async startHud(params: HudStartIn, sessionDir: string): Promise<HudStartOut> {
    const { sid } = params;
    const entryUrl = params.browse.entryUrl;
    const startCmd = params.dev.cmd;
    
    // Start HUD server if not already running
    await this.ensureHudServerRunning();
    
    // Store session info for tracking
    const session: HudSession = {
      sessionId: sid,
      entryUrl,
      startTime: Date.now()
    };
    this.sessions.set(sid, session);

    // Build URL with both starthtml and startcmd parameters
    const urlParams = new URLSearchParams();
    urlParams.set('starthtml', entryUrl);
    if (startCmd && startCmd.trim()) {
      urlParams.set('startcmd', startCmd);
    }
    const hudUrl = `http://localhost:${this.hudPort}?${urlParams.toString()}`;

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
        status: 'running'  // Assume HUD service is running externally
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

    // Just remove session tracking (HUD service runs externally)
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

  private async ensureHudServerRunning(): Promise<void> {
    // If server is already running or starting, wait for it
    if (this.hudProcess || this.isHudStarting) {
      // Wait a bit for the server to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
      return;
    }

    this.isHudStarting = true;

    try {
      // Find the HUD directory relative to this file
      const hudDir = join(__dirname, '../../hud');
      
      console.log(`[VDT] Starting HUD server from: ${hudDir}`);
      
      // Start the HUD server process
      this.hudProcess = spawn('node', ['server.js'], {
        cwd: hudDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env, 
          NODE_ENV: 'production',
          PORT: this.hudPort.toString()
        }
      });

      // Handle server output
      this.hudProcess.stdout?.on('data', (data) => {
        console.log(`[VDT HUD] ${data.toString().trim()}`);
      });

      this.hudProcess.stderr?.on('data', (data) => {
        console.error(`[VDT HUD Error] ${data.toString().trim()}`);
      });

      // Handle server exit
      this.hudProcess.on('exit', (code) => {
        console.log(`[VDT] HUD server exited with code: ${code}`);
        this.hudProcess = null;
        this.isHudStarting = false;
      });

      this.hudProcess.on('error', (error) => {
        console.error('[VDT] Failed to start HUD server:', error);
        this.hudProcess = null;
        this.isHudStarting = false;
      });

      // Wait for server to be ready
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('HUD server startup timeout'));
        }, 15000);

        // Check if server is responding
        const checkServer = async () => {
          try {
            const response = await fetch(`http://localhost:${this.hudPort}/`);
            if (response.ok) {
              clearTimeout(timeout);
              resolve(true);
              return;
            }
          } catch {
            // Server not ready yet
          }
          setTimeout(checkServer, 1000);
        };

        // Start checking after a short delay
        setTimeout(checkServer, 3000);
      });

      console.log(`[VDT] HUD server is ready on port ${this.hudPort}`);
    } catch (error) {
      console.error('[VDT] Failed to start HUD server:', error);
      this.hudProcess = null;
      throw error;
    } finally {
      this.isHudStarting = false;
    }
  }

  async dispose(): Promise<void> {
    // Clear all session tracking
    this.sessions.clear();
    
    // Stop HUD server if running
    if (this.hudProcess) {
      console.log('[VDT] Stopping HUD server...');
      this.hudProcess.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise((resolve) => {
        if (!this.hudProcess) {
          resolve(true);
          return;
        }
        
        this.hudProcess.on('exit', () => resolve(true));
        
        // Force kill after timeout
        setTimeout(() => {
          if (this.hudProcess) {
            this.hudProcess.kill('SIGKILL');
          }
          resolve(true);
        }, 5000);
      });
      
      this.hudProcess = null;
    }
  }
}
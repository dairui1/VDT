import { HudStartIn, HudStartOut, HudStatusOut, LogEvent } from '../types/index.js';
import * as openModule from 'open';
const open = (openModule as unknown as { default?: (target: string) => Promise<unknown> }).default ?? (openModule as unknown as (target: string) => Promise<unknown>);

interface HudSession {
  sessionId: string;
  entryUrl: string;
  startTime: number;
}

export class HudManager {
  private sessions = new Map<string, HudSession>();
  private readonly hudPort = 3950;

  async startStandaloneHud(port?: number): Promise<{ hudUrl: string; port: number }> {
    const hudUrl = `http://localhost:${this.hudPort}`;
    
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

  async dispose(): Promise<void> {
    // Clear all session tracking
    this.sessions.clear();
  }
}
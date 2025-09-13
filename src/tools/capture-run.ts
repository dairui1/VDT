import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';
import { HudManager } from '../utils/hud.js';

export class CaptureRunTool extends BaseTool {
  private hudManager = new HudManager();

  async execute(params: {
    sid: string;
    mode: 'cli' | 'web';
    shell?: {
      cwd: string;
      commands?: string[];
      env?: Record<string, string>;
      timeoutSec?: number;
    };
    web?: {
      entryUrl: string;
      actions?: boolean;
      console?: boolean;
      network?: boolean;
    };
    redact?: {
      patterns?: string[];
    };
    openHud?: boolean;
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found. Please create a session first using start_session tool.`);
      }

      // Start HUD if requested (default true for web mode)
      let hudResult = null;
      const shouldOpenHud = params.openHud !== false && params.mode === 'web' && params.web?.entryUrl;
      
      if (shouldOpenHud) {
        try {
          // Extract initial command from shell commands if available
          const initialCmd = params.shell?.commands?.[0] || '';
          
          hudResult = await this.hudManager.startHud({
            sid: params.sid,
            dev: { 
              cmd: initialCmd, 
              cwd: params.shell?.cwd || process.cwd() 
            },
            browse: { 
              entryUrl: params.web!.entryUrl,
              autoOpen: true 
            },
            capture: {
              screenshot: { mode: 'onAction' },
              network: params.web?.network ? 'summary' : 'off',
              redact: params.redact
            }
          }, this.sessionManager.getSessionDir(params.sid));
          
          // Set up log broadcasting to HUD
          this.captureManager.setLogBroadcastCallback((sessionId, logEvent) => {
            this.hudManager.broadcastLogEvent(sessionId, logEvent);
          });
          
          console.log(`[VDT] HUD started at ${hudResult.hudUrl}`);
        } catch (hudError) {
          console.warn(`[VDT] Failed to start HUD:`, hudError);
        }
      }

      let result;
      
      if (params.mode === 'cli' && params.shell) {
        // CLI capture using existing captureShell logic
        result = await this.captureManager.captureShell(
          this.sessionManager.getSessionDir(params.sid),
          params.shell,
          params.redact,
          params.sid
        );
      } else if (params.mode === 'web' && params.web) {
        // Web capture mode - user manually downloads logs
        console.log(`[VDT] Web capture mode: User will manually download logs from ${params.web.entryUrl}`);
        console.log(`[VDT] HUD provides interface for manual log collection and download`);
        
        // Create session directories for manual log uploads
        const sessionDir = this.sessionManager.getSessionDir(params.sid);
        const { FileManager } = await import('../utils/session.js');
        await FileManager.ensureDir(sessionDir);
        await FileManager.ensureDir(`${sessionDir}/logs`);
        
        // Create placeholder files to indicate expected log types
        const logTypes = [];
        if (params.web.actions) logTypes.push('actions');
        if (params.web.console) logTypes.push('console');
        if (params.web.network) logTypes.push('network');
        
        const chunks = logTypes.map(type => `logs/${type}.ndjson`);
        if (chunks.length === 0) {
          chunks.push('logs/capture.ndjson');
        }
        
        result = {
          chunks,
          summary: { 
            lines: 0, 
            errors: 0,
            webCapture: true,
            captureMethod: 'manual',
            instructions: 'Use HUD interface to interact with the web application and download logs manually'
          }
        };
      } else {
        throw new Error(`Invalid capture mode or missing parameters for mode: ${params.mode}`);
      }

      const response: any = {
        ...result,
        outputLog: this.sessionManager.getResourceLink(params.sid, 'logs/capture.ndjson')
      };

      // Add HUD information to response
      if (hudResult) {
        response.hud = {
          url: hudResult.hudUrl,
          links: hudResult.links
        };
      }

      return this.createSuccessResponse(response);

    } catch (error) {
      return this.createErrorResponse(
        params.sid,
        'capture_run',
        'CAPTURE_ERROR',
        error,
        'Check command syntax and file permissions'
      );
    }
  }
}

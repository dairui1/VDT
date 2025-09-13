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
        throw new Error(`Session ${params.sid} not found`);
      }

      // Start HUD if requested (default true for web mode)
      let hudResult = null;
      const shouldOpenHud = params.openHud !== false && params.mode === 'web' && params.web?.entryUrl;
      
      if (shouldOpenHud) {
        try {
          hudResult = await this.hudManager.startHud({
            sid: params.sid,
            dev: { 
              cmd: '', 
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
        // Web capture using Playwright
        const { PlaywrightManager } = await import('../utils/playwright.js');
        const playwright = new PlaywrightManager();
        
        try {
          await playwright.initialize();
          await playwright.startBrowser(params.web.entryUrl, this.sessionManager.getSessionDir(params.sid));
          
          // Start recording if capture options are enabled
          if (params.web.actions || params.web.console || params.web.network) {
            await playwright.startRecording(
              `capture_${Date.now()}`,
              params.web.entryUrl
            );
            
            // Let it run for a reasonable time for web capture
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            const recordingResult = await playwright.stopRecording(
              `capture_${Date.now()}`,
              ['json']
            );
            
            result = {
              chunks: ['logs/actions.ndjson', 'logs/console.ndjson', 'logs/network.ndjson'],
              summary: { 
                lines: 0, 
                errors: 0,
                webCapture: true,
                links: recordingResult.links
              }
            };
          } else {
            result = {
              chunks: ['logs/capture.ndjson'],
              summary: { lines: 0, errors: 0, webCapture: true }
            };
          }
        } finally {
          await playwright.dispose();
        }
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

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class CaptureRunTool extends BaseTool {
  async execute(params: {
    sid: string;
    mode: 'cli' | 'web' | 'file';
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
    file?: {
      path: string;
      encoding?: string;
      format?: 'auto' | 'json' | 'ndjson' | 'text';
      lineRange?: [number, number];
    };
    redact?: {
      patterns?: string[];
    };
  }): Promise<CallToolResult> {
    try {
      // First try to find the session without repoRoot to see if it exists
      let session = await this.sessionManager.getSession(params.sid);
      
      // If not found and we have shell config with cwd, try using that as repoRoot
      if (!session && params.shell?.cwd) {
        session = await this.sessionManager.getSession(params.sid, params.shell.cwd);
      }
      
      if (!session) {
        return this.createErrorResponse(
          params.sid,
          'capture_run',
          'SESSION_NOT_FOUND',
          new Error(`Session ${params.sid} not found`),
          'Check session ID and ensure session was created successfully'
        );
      }

      let result;
      
      if (params.mode === 'cli' && params.shell) {
        // CLI capture using existing captureShell logic
        result = await this.captureManager.captureShell(
          this.sessionManager.getSessionDir(params.sid, session.repoRoot),
          params.shell,
          params.redact
        );
      } else if (params.mode === 'web' && params.web) {
        // Web capture using Playwright
        const { PlaywrightManager } = await import('../utils/playwright.js');
        const playwright = new PlaywrightManager();
        
        try {
          await playwright.initialize();
          await playwright.startBrowser(params.web.entryUrl, this.sessionManager.getSessionDir(params.sid, session.repoRoot));
          
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
      } else if (params.mode === 'file' && params.file) {
        // File capture - read specified file and save to session logs
        result = await this.captureFile(
          this.sessionManager.getSessionDir(params.sid, session.repoRoot),
          params.file,
          params.redact
        );
      } else {
        throw new Error(`Invalid capture mode or missing parameters for mode: ${params.mode}`);
      }

      return this.createSuccessResponse({
        ...result,
        outputLog: this.sessionManager.getResourceLink(params.sid, 'logs/capture.ndjson')
      });

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

  private async captureFile(
    sessionDir: string, 
    fileConfig: { path: string; encoding?: string; format?: 'auto' | 'json' | 'ndjson' | 'text'; lineRange?: [number, number] },
    redactConfig?: { patterns?: string[] }
  ): Promise<{ chunks: string[]; summary: { lines: number; errors: number; fileCapture: boolean; filePath: string } }> {
    try {
      // Read the specified file
      const encoding = fileConfig.encoding || 'utf-8';
      let content = await fs.readFile(fileConfig.path, encoding as BufferEncoding);
      
      // Apply line range if specified
      if (fileConfig.lineRange) {
        const lines = content.split('\n');
        const [start, end] = fileConfig.lineRange;
        content = lines.slice(start - 1, end).join('\n');
      }
      
      // Apply redaction if specified
      if (redactConfig?.patterns) {
        content = this.applyRedaction(content, redactConfig.patterns);
      }
      
      // Ensure logs directory exists
      const logsDir = path.join(sessionDir, 'logs');
      await fs.mkdir(logsDir, { recursive: true });
      
      // Determine output format and save to capture.ndjson
      const captureLogPath = path.join(logsDir, 'capture.ndjson');
      const lines = content.split('\n');
      const timestamp = Date.now();
      
      // Convert content to NDJSON format for consistency
      const ndjsonContent = lines.map((line, index) => {
        if (line.trim()) {
          return JSON.stringify({
            ts: timestamp + index,
            level: 'info',
            module: 'file_capture',
            func: 'read_file',
            msg: line,
            kv: {
              source_file: fileConfig.path,
              line_number: (fileConfig.lineRange?.[0] || 1) + index,
              format: fileConfig.format || 'text'
            }
          });
        }
        return null;
      }).filter(Boolean).join('\n');
      
      await fs.writeFile(captureLogPath, ndjsonContent, 'utf-8');
      
      return {
        chunks: ['logs/capture.ndjson'],
        summary: {
          lines: lines.filter(line => line.trim()).length,
          errors: 0,
          fileCapture: true,
          filePath: fileConfig.path
        }
      };
    } catch (error) {
      throw new Error(`Failed to capture file ${fileConfig.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private applyRedaction(content: string, patterns: string[]): string {
    let redacted = content;
    for (const pattern of patterns) {
      try {
        const regex = new RegExp(pattern, 'g');
        redacted = redacted.replace(regex, '[REDACTED]');
      } catch (error) {
        console.warn(`[VDT] Invalid redaction pattern ${pattern}: ${error}`);
      }
    }
    return redacted;
  }
}

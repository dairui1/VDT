import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export class VerifyRunTool extends BaseTool {
  async execute(params: {
    sid: string;
    script?: string;
    commands?: string[];
    mode?: 'cli' | 'web';
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      // Execute verification commands and capture results
      let result;
      
      if (params.commands && params.commands.length > 0) {
        // CLI verification - use custom log file for verify
        const sessionDir = this.sessionManager.getSessionDir(params.sid);
        const verifyLogPath = path.join(sessionDir, 'logs', 'verify.ndjson');
        
        // Create a custom capture config for verification
        result = await this.captureManager.captureShell(
          sessionDir,
          {
            cwd: session.repoRoot || process.cwd(),
            commands: params.commands
          }
        );
        
        // Copy the capture results to verify.ndjson
        const captureLogPath = path.join(sessionDir, 'logs', 'capture.ndjson');
        try {
          const captureContent = await fs.readFile(captureLogPath, 'utf-8');
          await fs.writeFile(verifyLogPath, captureContent);
        } catch (error) {
          console.warn('Failed to copy verification logs:', error);
        }
      } else if (params.script) {
        throw new Error('Script-based verification not yet implemented');
      } else {
        throw new Error('No commands or script provided for verification');
      }

      return this.createSuccessResponse({
        ...result,
        verifyLog: this.sessionManager.getResourceLink(params.sid, 'logs/verify.ndjson'),
        passed: result.summary.errors === 0,
        summary: {
          ...result.summary,
          verificationStatus: result.summary.errors === 0 ? 'passed' : 'failed'
        }
      });

    } catch (error) {
      return this.createErrorResponse(
        params.sid,
        'verify_run',
        'VERIFY_ERROR',
        error,
        'Check script syntax and verification configuration'
      );
    }
  }
}

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';

export class StartSessionTool extends BaseTool {
  async execute(params: {
    repoRoot?: string;
    note?: string;
    ttlDays?: number;
  }): Promise<CallToolResult> {
    try {
      const { repoRoot, note, ttlDays = 7 } = params;
      
      const session = await this.sessionManager.createSession(repoRoot, note, ttlDays);
      
      const links = [
        `vdt://sessions/${session.sid}/`,
        this.sessionManager.getResourceLink(session.sid, 'meta.json'),
        this.sessionManager.getResourceLink(session.sid, 'logs/capture.ndjson')
      ];

      return this.createSuccessResponse({
        sid: session.sid,
        spec: "VDT DebugSpec v0.3 (KISS)",
        links,
        system_reminder: "Follow minimal loop: capture → analyze → clarify (if needed) → fix/replay → summary"
      });

    } catch (error) {
      return this.createErrorResponse(
        null,
        'start_session',
        'START_SESSION_ERROR',
        error,
        'Check repository root permissions and disk space'
      );
    }
  }
}

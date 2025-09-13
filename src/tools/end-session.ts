import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export class EndSessionTool extends BaseTool {
  async execute(params: {
    sid: string;
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      // Generate summary
      const summary = {
        sessionId: params.sid,
        timestamp: Date.now(),
        conclusion: 'Session completed',
        keyEvidence: [],
        nextSteps: [],
        resources: [
          this.sessionManager.getResourceLink(params.sid, 'meta.json'),
          this.sessionManager.getResourceLink(params.sid, 'logs/capture.ndjson'),
          this.sessionManager.getResourceLink(params.sid, 'analysis/buglens.md')
        ]
      };

      const sessionDir = this.sessionManager.getSessionDir(params.sid);
      const summaryPath = path.join(sessionDir, 'analysis', 'summary.md');
      
      await fs.mkdir(path.dirname(summaryPath), { recursive: true });
      
      const summaryContent = `# Session Summary

## Conclusion
${summary.conclusion}

## Key Evidence
${summary.keyEvidence.length > 0 ? summary.keyEvidence.join('\n- ') : 'No key evidence recorded'}

## Next Steps
${summary.nextSteps.length > 0 ? summary.nextSteps.join('\n- ') : 'No next steps recorded'}

## Resources
${summary.resources.map(link => `- [${link.split('/').pop()}](${link})`).join('\n')}

## Metadata
- Session ID: ${summary.sessionId}
- Completed: ${new Date(summary.timestamp).toISOString()}
`;

      await fs.writeFile(summaryPath, summaryContent, 'utf-8');

      return this.createSuccessResponse({
        ...summary,
        summaryLink: this.sessionManager.getResourceLink(params.sid, 'analysis/summary.md')
      });

    } catch (error) {
      return this.createErrorResponse(
        params.sid,
        'end_session',
        'END_SESSION_ERROR',
        error,
        'Check session validity and storage permissions'
      );
    }
  }
}

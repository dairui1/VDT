import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export class ClarifyTool extends BaseTool {
  async execute(params: {
    sid: string;
    chunks: Array<{
      id: string;
      title: string;
      excerpt: string;
    }>;
    answer: {
      selectedIds: string[];
      notes?: string;
    };
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      // Save clarification to session
      const clarifyData = {
        timestamp: Date.now(),
        selectedChunks: params.chunks.filter(c => params.answer.selectedIds.includes(c.id)),
        notes: params.answer.notes || '',
        selectedIds: params.answer.selectedIds
      };

      const sessionDir = this.sessionManager.getSessionDir(params.sid);
      const clarifyPath = path.join(sessionDir, 'analysis', 'clarify.md');
      
      // Ensure analysis directory exists
      await fs.mkdir(path.dirname(clarifyPath), { recursive: true });
      
      const clarifyContent = `# Clarification Results

## Selected Chunks
${clarifyData.selectedChunks.map(chunk => `### ${chunk.title}
${chunk.excerpt}
`).join('\n')}

## Notes
${clarifyData.notes}

## Metadata
- Timestamp: ${new Date(clarifyData.timestamp).toISOString()}
- Selected IDs: ${clarifyData.selectedIds.join(', ')}
`;

      await fs.writeFile(clarifyPath, clarifyContent, 'utf-8');

      return this.createSuccessResponse({
        selectedIds: params.answer.selectedIds,
        link: this.sessionManager.getResourceLink(params.sid, 'analysis/clarify.md')
      });

    } catch (error) {
      return this.createErrorResponse(
        params.sid,
        'clarify',
        'CLARIFY_ERROR',
        error,
        'Check session validity and storage permissions'
      );
    }
  }
}

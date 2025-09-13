import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';

export class AnalyzeCaptureTool extends BaseTool {
  async execute(params: {
    sid: string;
    focus?: {
      module?: string;
      func?: string;
      timeRange?: [number, number];
      selectedIds?: string[];
    };
  }): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      const result = await this.analysisEngine.analyzeDebugLog(
        this.sessionManager.getSessionDir(params.sid),
        params.focus
      );

      return this.createSuccessResponse({
        ...result,
        buglensReport: this.sessionManager.getResourceLink(params.sid, 'analysis/buglens.md'),
        candidateChunks: result.findings.candidateChunks || [],
        needClarify: result.findings.needClarify || false
      });

    } catch (error) {
      return this.createErrorResponse(
        params.sid,
        'analyze_capture',
        'ANALYSIS_ERROR',
        error,
        'Ensure capture logs exist and are valid'
      );
    }
  }
}

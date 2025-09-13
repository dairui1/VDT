import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from '../utils/session.js';
import { CaptureManager } from '../utils/capture.js';
import { AnalysisEngine } from '../utils/analysis.js';
import { ToolResponse } from '../types/index.js';

export abstract class BaseTool {
  protected sessionManager: SessionManager;
  protected captureManager: CaptureManager;
  protected analysisEngine: AnalysisEngine;

  constructor(
    sessionManager: SessionManager,
    captureManager: CaptureManager,
    analysisEngine: AnalysisEngine
  ) {
    this.sessionManager = sessionManager;
    this.captureManager = captureManager;
    this.analysisEngine = analysisEngine;
  }

  protected async createErrorResponse(
    sid: string | null,
    toolName: string,
    errorCode: string,
    error: unknown,
    hint: string
  ): Promise<CallToolResult> {
    if (sid) {
      await this.sessionManager.addError(
        sid,
        toolName,
        errorCode,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    const response: ToolResponse = {
      isError: true,
      message: error instanceof Error ? error.message : 'Unknown error',
      hint
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  }

  protected createSuccessResponse(data: any): CallToolResult {
    const response: ToolResponse = { data };
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(response, null, 2)
      }]
    };
  }
}

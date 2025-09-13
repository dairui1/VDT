import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export class CaptureRunTool extends BaseTool {
  private async logDebugInfo(message: string, data?: any): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n\n`;
      await fs.appendFile('/Users/zhangyu.95/hackson/VDT/tmp.txt', logEntry, 'utf-8');
    } catch (error) {
      console.warn('[VDT] Failed to write debug log:', error);
    }
  }

  async execute(params: {
    sid: string;
    file: {
      path: string;
      encoding?: string;
      format?: 'auto' | 'json' | 'ndjson' | 'text';
      lineRange?: [number, number];
    };
    redact?: {
      patterns?: string[];
    };
  }): Promise<CallToolResult> {
    // Log input parameters for debugging
    await this.logDebugInfo('CaptureRunTool.execute() called with parameters:', params);
    
    try {
      // First try to find the session without repoRoot to see if it exists
      let session = await this.sessionManager.getSession(params.sid);
      
      if (!session) {
        return this.createErrorResponse(
          params.sid,
          'capture_run',
          'SESSION_NOT_FOUND',
          new Error(`Session ${params.sid} not found`),
          'Check session ID and ensure session was created successfully'
        );
      }

      // Log file mode processing
      await this.logDebugInfo('Processing file mode with file parameter:', params.file);
      
      // File capture - read specified file and save to session logs
      const result = await this.captureFile(
        this.sessionManager.getSessionDir(params.sid, session.repoRoot),
        params.file,
        params.redact
      );
      
      // Log the result of captureFile
      await this.logDebugInfo('captureFile method completed with result:', result);

      const finalResponse = this.createSuccessResponse({
        ...result,
        outputLog: this.sessionManager.getResourceLink(params.sid, 'logs/capture.ndjson')
      });
      
      // Log the final response from capture_run tool
      await this.logDebugInfo('capture_run tool final response:', finalResponse);
      
      return finalResponse;

    } catch (error) {
      // Log error details
      await this.logDebugInfo('capture_run tool error occurred:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        params: params
      });
      
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
    // Log captureFile method entry
    await this.logDebugInfo('captureFile method called with:', { 
      sessionDir, 
      fileConfig, 
      redactConfig 
    });
    
    try {
      // Read the specified file
      const encoding = fileConfig.encoding || 'utf-8';
      await this.logDebugInfo(`Reading file: ${fileConfig.path} with encoding: ${encoding}`);
      
      let content = await fs.readFile(fileConfig.path, encoding as BufferEncoding);
      await this.logDebugInfo(`File read successfully, content length: ${content.length} characters`);
      
      // Apply line range if specified
      if (fileConfig.lineRange) {
        const lines = content.split('\n');
        const [start, end] = fileConfig.lineRange;
        await this.logDebugInfo(`Applying line range [${start}, ${end}] to ${lines.length} total lines`);
        content = lines.slice(start - 1, end).join('\n');
        await this.logDebugInfo(`After line range filtering, content length: ${content.length} characters`);
      }
      
      // Apply redaction if specified
      if (redactConfig?.patterns) {
        await this.logDebugInfo('Applying redaction with patterns:', redactConfig.patterns);
        content = this.applyRedaction(content, redactConfig.patterns);
        await this.logDebugInfo(`After redaction, content length: ${content.length} characters`);
      }
      
      // Ensure logs directory exists
      const logsDir = path.join(sessionDir, 'logs');
      await this.logDebugInfo(`Creating logs directory: ${logsDir}`);
      await fs.mkdir(logsDir, { recursive: true });
      
      // Determine output format and save to capture.ndjson
      const captureLogPath = path.join(logsDir, 'capture.ndjson');
      await this.logDebugInfo(`Writing capture log to: ${captureLogPath}`);
      
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
      await this.logDebugInfo(`Successfully wrote ${lines.filter(line => line.trim()).length} lines to capture log`);
      
      const result = {
        chunks: ['logs/capture.ndjson'],
        summary: {
          lines: lines.filter(line => line.trim()).length,
          errors: 0,
          fileCapture: true,
          filePath: fileConfig.path
        }
      };
      
      await this.logDebugInfo('captureFile method returning result:', result);
      return result;
    } catch (error) {
      await this.logDebugInfo('captureFile method error:', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined 
      });
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

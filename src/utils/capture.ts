import { spawn } from 'node-pty';
import { join } from 'path';
import { CaptureConfig, RedactConfig, LogEvent } from '../types/index.js';
import { LogProcessor } from './logs.js';
import { FileManager } from './session.js';

export class CaptureManager {
  private allowedEnvKeys = ['PATH', 'NODE_OPTIONS', 'NODE_ENV', 'HOME', 'USER'];

  async captureShell(
    sessionDir: string,
    config: CaptureConfig,
    redactConfig: RedactConfig = {}
  ): Promise<{ chunks: string[], summary: { lines: number, errors: number } }> {
    
    const logFile = join(sessionDir, 'logs', 'capture.ndjson');
    await FileManager.ensureDir(join(sessionDir, 'logs'));

    let totalLines = 0;
    let errorCount = 0;
    const chunks: string[] = [];

    // Sanitize environment
    const cleanEnv = this.sanitizeEnv(config.env || {});

    // Determine shell and commands
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
    const commands = config.commands || [];
    
    return new Promise((resolve, reject) => {
      let settled = false; // Track if promise has been settled
      
      const ptyProcess = spawn(shell, [], {
        cwd: config.cwd,
        env: { ...process.env, ...cleanEnv },
        cols: 120,
        rows: 30
      });

      const timeout = config.timeoutSec ? config.timeoutSec * 1000 : 30000;
      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        
        ptyProcess.kill();
        
        // Resolve with partial summary instead of rejecting
        resolve({
          chunks: chunks.length > 0 ? chunks : [`logs/capture.ndjson`],
          summary: { 
            lines: totalLines, 
            errors: errorCount,
            timeout: true,
            timeoutSec: config.timeoutSec || 30
          }
        });
      }, timeout);

      let buffer = '';
      let lastStderrTime = 0;

      ptyProcess.onData((data: string) => {
        buffer += data;
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            totalLines++;
            
            // Enhanced error detection
            const isError = this.detectErrorLine(line);
            const logEvent = this.parseLineWithContext(line, isError, Date.now() - lastStderrTime);
            
            if (logEvent.level === 'error') {
              errorCount++;
              lastStderrTime = Date.now();
            }

            // Apply redaction
            logEvent.msg = LogProcessor.redactSensitive(logEvent.msg, redactConfig.patterns);
            logEvent.kv = this.redactObject(logEvent.kv, redactConfig.patterns);

            // Write to file
            FileManager.writeNDJSON(logFile, logEvent);
          }
        }
      });

      ptyProcess.onExit((exitData) => {
        if (settled) return; // Don't double-settle
        settled = true;
        
        clearTimeout(timeoutHandle);
        
        const exitCode = typeof exitData === 'number' ? exitData : exitData.exitCode;
        
        // Process any remaining buffer
        if (buffer.trim()) {
          const isError = this.detectErrorLine(buffer) || exitCode !== 0;
          const logEvent = this.parseLineWithContext(buffer, isError, 0);
          logEvent.msg = LogProcessor.redactSensitive(logEvent.msg, redactConfig.patterns);
          FileManager.writeNDJSON(logFile, logEvent);
          totalLines++;
          
          if (logEvent.level === 'error') {
            errorCount++;
          }
        }

        // Add exit code event if non-zero
        if (exitCode !== 0) {
          const exitEvent: LogEvent = {
            ts: Date.now(),
            level: 'error',
            module: 'shell',
            func: 'exit',
            msg: `Process exited with code ${exitCode}`,
            kv: { exitCode, hasErrors: errorCount > 0 }
          };
          FileManager.writeNDJSON(logFile, exitEvent);
          totalLines++;
          errorCount++;
        }

        chunks.push(`logs/capture.ndjson`);
        
        resolve({
          chunks,
          summary: { lines: totalLines, errors: errorCount }
        });
      });

      // Send commands
      if (commands.length > 0) {
        for (const cmd of commands) {
          ptyProcess.write(cmd + '\r');
        }
      }
    });
  }

  private detectErrorLine(line: string): boolean {
    const lowerLine = line.toLowerCase();
    
    // Common error patterns
    const errorPatterns = [
      /error[:;]/i,
      /exception[:;]/i,
      /failed[:;]/i,
      /cannot\s+/i,
      /unable\s+to/i,
      /not\s+found/i,
      /permission\s+denied/i,
      /segmentation\s+fault/i,
      /stack\s+trace/i,
      /\berr\b/i,
      /\bfatal\b/i,
      /\bcrash/i,
      /\bassert/i,
      /\bpanic/i,
      /\bat\s+.*:\d+:\d+/  // stack trace pattern
    ];
    
    // Check for error patterns
    for (const pattern of errorPatterns) {
      if (pattern.test(line)) {
        return true;
      }
    }
    
    // Check for console.error style output
    if (lowerLine.includes('console.error') || 
        lowerLine.includes('console.warn') ||
        lowerLine.includes('stderr')) {
      return true;
    }
    
    // Check for exit codes or return values indicating error
    if (/exit\s+code\s+[1-9]/.test(lowerLine) || 
        /returned\s+[1-9]/.test(lowerLine)) {
      return true;
    }
    
    return false;
  }

  private parseLineWithContext(line: string, isError: boolean, timeSinceLastError: number): LogEvent {
    const level = isError ? 'error' : 'info';
    
    // Try to parse as structured log first
    try {
      const parsed = JSON.parse(line);
      if (LogProcessor.isLogEvent(parsed)) {
        // Override level if we detected an error pattern
        if (isError && parsed.level !== 'error') {
          parsed.level = 'error';
        }
        return parsed;
      }
    } catch {
      // Fall through to raw line handling
    }

    // Enhanced parsing for common log formats
    const module = this.extractModule(line);
    const func = this.extractFunction(line);
    const kv = this.extractKeyValues(line);
    
    // Add context about error clustering
    if (isError && timeSinceLastError < 1000) {
      kv.errorCluster = true;
    }

    return {
      ts: Date.now(),
      level,
      module,
      func,
      msg: line.trim(),
      kv
    };
  }

  private extractModule(line: string): string {
    // Try to extract module/file name from common patterns
    const patterns = [
      /at\s+.*\((.*):(\d+):(\d+)\)/,  // Stack trace
      /(\w+\.(?:js|ts|py|java)):/,    // File:line pattern
      /\[(\w+)\]/,                    // [module] pattern
      /^\s*(\w+):/                    // module: pattern
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1].split('/').pop()?.replace(/\.[^.]*$/, '') || 'unknown';
      }
    }
    
    return 'unknown';
  }

  private extractFunction(line: string): string {
    // Try to extract function name from common patterns
    const patterns = [
      /at\s+(\w+)\s+\(/,              // at functionName (
      /(\w+)\(\):/,                   // functionName():
      /in\s+(\w+)\s+at/,              // in functionName at
      /(\w+)\s+failed/                // functionName failed
    ];
    
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return 'unknown';
  }

  private extractKeyValues(line: string): Record<string, any> {
    const kv: Record<string, any> = {};
    
    // Extract line numbers
    const lineMatch = line.match(/:(\d+):(\d+)/);
    if (lineMatch) {
      kv.line = parseInt(lineMatch[1]);
      kv.column = parseInt(lineMatch[2]);
    }
    
    // Extract exit codes
    const exitCodeMatch = line.match(/exit\s+code\s+(\d+)/i);
    if (exitCodeMatch) {
      kv.exitCode = parseInt(exitCodeMatch[1]);
    }
    
    // Extract durations
    const durationMatch = line.match(/(\d+(?:\.\d+)?)\s*(ms|s|seconds?|minutes?)/i);
    if (durationMatch) {
      kv.duration = parseFloat(durationMatch[1]);
      kv.durationUnit = durationMatch[2].toLowerCase();
    }
    
    // Extract counts
    const countMatch = line.match(/(\d+)\s+(error|warning|failed|passed)/i);
    if (countMatch) {
      kv[`${countMatch[2].toLowerCase()}Count`] = parseInt(countMatch[1]);
    }
    
    return kv;
  }

  private sanitizeEnv(env: Record<string, string>): Record<string, string> {
    const cleaned: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(env)) {
      if (this.allowedEnvKeys.includes(key)) {
        cleaned[key] = value;
      }
    }
    
    return cleaned;
  }

  private redactObject(obj: any, patterns: string[] = []): any {
    if (typeof obj === 'string') {
      return LogProcessor.redactSensitive(obj, patterns);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObject(item, patterns));
    }
    
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.redactObject(value, patterns);
      }
      return result;
    }
    
    return obj;
  }
}
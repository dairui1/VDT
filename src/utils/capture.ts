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
      const ptyProcess = spawn(shell, [], {
        cwd: config.cwd,
        env: { ...process.env, ...cleanEnv },
        cols: 120,
        rows: 30
      });

      const timeout = config.timeoutSec ? config.timeoutSec * 1000 : 30000;
      const timeoutHandle = setTimeout(() => {
        ptyProcess.kill();
        reject(new Error(`Command timed out after ${config.timeoutSec || 30} seconds`));
      }, timeout);

      let buffer = '';

      ptyProcess.onData((data: string) => {
        buffer += data;
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            totalLines++;
            
            // Parse and redact
            const logEvent = LogProcessor.parseRawLine(line);
            if (logEvent.level === 'error') {
              errorCount++;
            }

            // Apply redaction
            logEvent.msg = LogProcessor.redactSensitive(logEvent.msg, redactConfig.patterns);
            logEvent.kv = this.redactObject(logEvent.kv, redactConfig.patterns);

            // Write to file
            FileManager.writeNDJSON(logFile, logEvent);
          }
        }
      });

      ptyProcess.onExit((exitCode) => {
        clearTimeout(timeoutHandle);
        
        // Process any remaining buffer
        if (buffer.trim()) {
          const logEvent = LogProcessor.parseRawLine(buffer);
          logEvent.msg = LogProcessor.redactSensitive(logEvent.msg, redactConfig.patterns);
          FileManager.writeNDJSON(logFile, logEvent);
          totalLines++;
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
import { LogEvent, LogLevel } from '../types/index.js';

export class LogProcessor {
  static createLogEvent(
    module: string,
    func: string, 
    msg: string,
    kv: Record<string, any> = {},
    level: LogLevel = 'debug'
  ): LogEvent {
    return {
      ts: Date.now(),
      level,
      module,
      func,
      msg,
      kv
    };
  }

  static parseRawLine(line: string, isStderr: boolean = false): LogEvent {
    const level: LogLevel = isStderr ? 'error' : 'info';
    
    // Try to parse as structured log
    try {
      const parsed = JSON.parse(line);
      if (this.isLogEvent(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to raw line handling
    }

    // Handle as raw line
    return {
      ts: Date.now(),
      level,
      module: 'unknown',
      func: 'unknown',
      msg: line.trim(),
      kv: {}
    };
  }

  static isLogEvent(obj: any): obj is LogEvent {
    return obj && 
           typeof obj.ts === 'number' &&
           typeof obj.level === 'string' &&
           typeof obj.module === 'string' &&
           typeof obj.func === 'string' &&
           typeof obj.msg === 'string' &&
           typeof obj.kv === 'object';
  }

  static redactSensitive(text: string, patterns: string[] = []): string {
    const defaultPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // emails
      /\b[A-Fa-f0-9]{32,}\b/g, // tokens/hashes
      /password["\s]*[:=]["\s]*[^"\s,}]+/gi, // passwords
      /token["\s]*[:=]["\s]*[^"\s,}]+/gi, // tokens
      /key["\s]*[:=]["\s]*[^"\s,}]+/gi, // API keys
    ];

    let result = text;
    [...defaultPatterns, ...patterns.map(p => new RegExp(p, 'gi'))].forEach(pattern => {
      result = result.replace(pattern, '***');
    });
    
    return result;
  }

  static findErrorWindows(events: LogEvent[], windowSize: number = 50): Array<{start: number, end: number, density: number}> {
    const windows: Array<{start: number, end: number, density: number}> = [];
    
    for (let i = 0; i < events.length - windowSize; i += Math.floor(windowSize / 2)) {
      const window = events.slice(i, i + windowSize);
      const errorCount = window.filter(e => e.level === 'error').length;
      const density = errorCount / windowSize;
      
      if (density > 0.1) { // At least 10% errors
        windows.push({
          start: i,
          end: i + windowSize,
          density
        });
      }
    }
    
    return windows.sort((a, b) => b.density - a.density);
  }
}
import { readFile, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { LogEvent } from '../types/index.js';

export type FileFormat = 'auto' | 'json' | 'ndjson' | 'text';

export interface FileReaderConfig {
  path: string;
  format?: FileFormat;
  encoding?: BufferEncoding;
  lineRange?: [number, number];
}

export interface FileReadResult {
  events: LogEvent[];
  totalLines: number;
  format: FileFormat;
}

export class FileReader {
  
  /**
   * 检测文件格式
   */
  static async detectFormat(filePath: string): Promise<FileFormat> {
    try {
      const sample = await this.readSampleLines(filePath, 10);
      
      // 检查是否为 NDJSON (每行都是有效的 JSON)
      const jsonLines = sample.filter(line => {
        try {
          JSON.parse(line.trim());
          return true;
        } catch {
          return false;
        }
      });
      
      if (jsonLines.length > 0 && jsonLines.length === sample.length) {
        return 'ndjson';
      }
      
      // 检查是否为单个 JSON 对象
      try {
        const content = await readFile(filePath, 'utf-8');
        JSON.parse(content);
        return 'json';
      } catch {
        // 默认为文本格式
        return 'text';
      }
    } catch {
      return 'text';
    }
  }

  /**
   * 读取文件的前几行进行格式检测
   */
  static async readSampleLines(filePath: string, maxLines: number = 10): Promise<string[]> {
    const lines: string[] = [];
    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineCount = 0;
    for await (const line of rl) {
      if (lineCount >= maxLines) break;
      lines.push(line);
      lineCount++;
    }

    return lines;
  }

  /**
   * 读取并解析日志文件
   */
  static async readLogFile(config: FileReaderConfig): Promise<FileReadResult> {
    const { path, format = 'auto', encoding = 'utf-8', lineRange } = config;
    
    // 检查文件是否存在
    await stat(path);
    
    // 自动检测格式
    const detectedFormat = format === 'auto' ? await this.detectFormat(path) : format;
    
    let events: LogEvent[] = [];
    let totalLines = 0;

    switch (detectedFormat) {
      case 'ndjson':
        ({ events, totalLines } = await this.readNDJSONFile(path, encoding, lineRange));
        break;
      case 'json':
        ({ events, totalLines } = await this.readJSONFile(path, encoding, lineRange));
        break;
      case 'text':
        ({ events, totalLines } = await this.readTextFile(path, encoding, lineRange));
        break;
      default:
        throw new Error(`Unsupported format: ${detectedFormat}`);
    }

    return {
      events,
      totalLines,
      format: detectedFormat
    };
  }

  /**
   * 读取 NDJSON 格式文件
   */
  private static async readNDJSONFile(
    filePath: string, 
    encoding: BufferEncoding, 
    lineRange?: [number, number]
  ): Promise<{ events: LogEvent[], totalLines: number }> {
    const events: LogEvent[] = [];
    let totalLines = 0;
    const [startLine, endLine] = lineRange || [1, Infinity];

    const fileStream = createReadStream(filePath, { encoding });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      totalLines++;
      
      if (totalLines < startLine) continue;
      if (totalLines > endLine) break;
      
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          
          // 如果是标准的 LogEvent，直接使用
          if (this.isLogEvent(parsed)) {
            events.push(parsed);
          } else {
            // 尝试转换为 LogEvent 格式
            events.push(this.convertToLogEvent(parsed, totalLines));
          }
        } catch (error) {
          // 解析失败，作为原始文本处理
          events.push(this.createRawLogEvent(line, totalLines, 'warn'));
        }
      }
    }

    return { events, totalLines };
  }

  /**
   * 读取 JSON 格式文件
   */
  private static async readJSONFile(
    filePath: string, 
    encoding: BufferEncoding, 
    lineRange?: [number, number]
  ): Promise<{ events: LogEvent[], totalLines: number }> {
    const content = await readFile(filePath, encoding);
    const parsed = JSON.parse(content);
    
    let events: LogEvent[] = [];
    
    if (Array.isArray(parsed)) {
      // JSON 数组格式
      const [startIdx, endIdx] = lineRange ? [lineRange[0] - 1, lineRange[1] - 1] : [0, parsed.length - 1];
      const slice = parsed.slice(Math.max(0, startIdx), Math.min(parsed.length, endIdx + 1));
      
      events = slice.map((item, index) => {
        if (this.isLogEvent(item)) {
          return item;
        }
        return this.convertToLogEvent(item, startIdx + index + 1);
      });
    } else {
      // 单个 JSON 对象
      if (this.isLogEvent(parsed)) {
        events.push(parsed);
      } else {
        events.push(this.convertToLogEvent(parsed, 1));
      }
    }

    return { events, totalLines: Array.isArray(parsed) ? parsed.length : 1 };
  }

  /**
   * 读取纯文本格式文件
   */
  private static async readTextFile(
    filePath: string, 
    encoding: BufferEncoding, 
    lineRange?: [number, number]
  ): Promise<{ events: LogEvent[], totalLines: number }> {
    const events: LogEvent[] = [];
    let totalLines = 0;
    const [startLine, endLine] = lineRange || [1, Infinity];

    const fileStream = createReadStream(filePath, { encoding });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      totalLines++;
      
      if (totalLines < startLine) continue;
      if (totalLines > endLine) break;
      
      if (line.trim()) {
        events.push(this.createRawLogEvent(line, totalLines));
      }
    }

    return { events, totalLines };
  }

  /**
   * 检查对象是否为有效的 LogEvent
   */
  private static isLogEvent(obj: any): obj is LogEvent {
    return obj && 
           typeof obj.ts === 'number' &&
           typeof obj.level === 'string' &&
           typeof obj.module === 'string' &&
           typeof obj.func === 'string' &&
           typeof obj.msg === 'string' &&
           typeof obj.kv === 'object';
  }

  /**
   * 将任意对象转换为 LogEvent
   */
  private static convertToLogEvent(obj: any, lineNumber: number): LogEvent {
    const now = Date.now();
    
    // 尝试提取通用字段
    const timestamp = obj.timestamp || obj.ts || obj.time || now;
    const level = this.normalizeLevel(obj.level || obj.severity || 'info');
    const message = obj.message || obj.msg || obj.text || JSON.stringify(obj);
    const module = obj.module || obj.component || obj.logger || 'unknown';
    const func = obj.function || obj.func || obj.method || 'unknown';
    
    // 提取其他键值对
    const kv = { ...obj };
    delete kv.timestamp;
    delete kv.ts;
    delete kv.time;
    delete kv.level;
    delete kv.severity;
    delete kv.message;
    delete kv.msg;
    delete kv.text;
    delete kv.module;
    delete kv.component;
    delete kv.logger;
    delete kv.function;
    delete kv.func;
    delete kv.method;
    
    // 添加行号信息
    kv.lineNumber = lineNumber;

    return {
      ts: typeof timestamp === 'number' ? timestamp : now,
      level,
      module,
      func,
      msg: message,
      kv
    };
  }

  /**
   * 创建原始文本的 LogEvent
   */
  private static createRawLogEvent(line: string, lineNumber: number, level: LogEvent['level'] = 'info'): LogEvent {
    return {
      ts: Date.now(),
      level,
      module: 'file',
      func: 'raw',
      msg: line.trim(),
      kv: { lineNumber }
    };
  }

  /**
   * 标准化日志级别
   */
  private static normalizeLevel(level: string): LogEvent['level'] {
    const normalized = level.toLowerCase();
    
    switch (normalized) {
      case 'trace':
      case 'debug':
      case 'info':
      case 'warn':
      case 'warning':
        return normalized === 'warning' ? 'warn' : normalized as LogEvent['level'];
      case 'error':
      case 'err':
      case 'fatal':
      case 'critical':
        return 'error';
      default:
        return 'info';
    }
  }
}
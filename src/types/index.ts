export interface VDTSession {
  sid: string;
  repoRoot: string;
  createdAt: number;
  ttlDays: number;
  note?: string;
  errors: VDTError[];
}

export interface VDTError {
  timestamp: number;
  tool: string;
  code: string;
  message: string;
}

export interface LogEvent {
  ts: number;
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  module: string;
  func: string;
  msg: string;
  kv: Record<string, any>;
}

export interface BugLensChunk {
  id: string;
  title: string;
  excerpt: string;
  refs: string[];
  metadata?: {
    type: 'error_window' | 'module' | 'function' | 'rapid_sequence';
    startIdx?: number;
    endIdx?: number;
    errorCount?: number;
    density?: number;
    module?: string;
    func?: string;
    eventCount?: number;
    duration?: number;
  };
}

export interface AnalysisFindings {
  clusters: any[];
  suspects: any[];
  needClarify?: boolean;
  candidateChunks?: BugLensChunk[];
}

export interface CaptureConfig {
  cwd: string;
  commands?: string[];
  env?: Record<string, string>;
  timeoutSec?: number;
}

export interface RedactConfig {
  patterns?: string[];
}

export interface FocusConfig {
  module?: string;
  func?: string;
  timeRange?: [number, number];
  selectedIds?: string[];
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
export type LogFormat = 'ndjson';

export interface ToolResponse<T = any> {
  isError?: boolean;
  message?: string;
  hint?: string;
  data?: T;
}
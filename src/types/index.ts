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

// v0.2 HUD Types
export interface HudStartIn {
  sid: string;
  dev: { cmd: string; cwd: string; env?: Record<string, string> };
  browse: { entryUrl: string; autoOpen?: boolean };
  capture?: {
    screenshot?: { mode: 'none' | 'onAction' | 'interval'; ms?: number };
    network?: 'off' | 'summary';
    redact?: { patterns?: string[] };
  };
}

export interface HudStartOut {
  sid: string;
  hudUrl: string;
  links: string[]; // ResourceLinks to ndjson files
}

export interface HudStatusOut {
  dev: { status: 'running' | 'exited'; pid?: number };
  browser: { status: 'ready' | 'closed'; pages: number };
  recent: { actions: number; errors: number; consoleErrors: number };
  links: string[];
}

export interface RecordStartIn {
  sid: string;
  entryUrl: string;
  selectors?: { prefer: string[] };
  screenshot?: { mode: 'none' | 'onAction' | 'interval'; ms?: number };
}

export interface RecordStartOut {
  recordId: string;
  links: string[];
}

export interface RecordStopIn {
  sid: string;
  recordId: string;
  export: Array<'playwright' | 'json'>;
}

export interface RecordStopOut {
  script: {
    playwright?: string;
    json?: string;
  };
  links: string[];
}

export interface ReplayRunIn {
  sid: string;
  script: string; // vdt:// link
  mode?: 'headless' | 'headed';
  stability?: { networkIdleMs?: number; uiIdleMs?: number; seed?: number; freezeTime?: boolean };
  mocks?: { enable?: boolean; rules?: Array<{ url: string; method?: string; respond: any }> };
}

export interface ReplayRunOut {
  passed: boolean;
  summary: { steps: number; failStep?: string };
  links: string[];
}

export interface AnalyzeWebCaptureIn {
  sid: string;
  focus?: string;
  topk?: number;
}

export interface AnalyzeWebCaptureOut {
  links: string[];
  findings: any;
}

// Event Types for ndjson
export interface DevServerEvent {
  ts: number;
  stream: 'stdout' | 'stderr';
  level: 'info' | 'warn' | 'error';
  msg: string;
}

export interface ActionEvent {
  ts: number;
  type: 'click' | 'input' | 'navigate' | 'keydown' | 'drag';
  url: string;
  selector?: string;
  selectorMeta?: {
    strategy: string;
    fallbacks?: string[];
  };
  value?: string;
  coords?: { x: number; y: number };
  screenshot?: string;
  stepId: string;
}

export interface ConsoleEvent {
  ts: number;
  type: 'error' | 'warn' | 'log';
  args: any[];
  stack?: string;
  stepIdHint?: string;
}

export interface NetworkEvent {
  ts: number;
  phase: 'request' | 'response' | 'failed';
  method: string;
  url: string;
  status?: number;
  timing?: { ttfb?: number };
  bytes?: number;
  reqId: string;
  stepIdHint?: string;
}
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

// Reasoner Types for LLM integration
export type ReasonerTaskType = 'analyze_log' | 'propose_patch' | 'review_patch';

export interface ReasonerTask {
  task: ReasonerTaskType;
  sid: string;
  inputs: {
    logs?: string[]; // vdt:// resource links
    buglens?: string; // vdt:// link to buglens-web.md
    code?: string[]; // file:// links to source code
    diff?: string; // vdt:// link to patch diff
  };
  question?: string; // optional freeform question
  constraints?: string[]; // e.g., ["minimal change", "no behavior change"]
  model_prefs?: {
    effort?: 'low' | 'medium' | 'high';
    max_tokens?: number;
    temperature?: number;
  };
  redact?: boolean;
}

export interface ReasonerInsight {
  title: string;
  evidence: string[]; // log line ranges or file spans
  confidence: number; // 0-1 score
}

export interface ReasonerSuspect {
  file: string;
  lines?: number[];
  rationale: string;
}

export interface ReasonerResult {
  insights: ReasonerInsight[];
  suspects: ReasonerSuspect[];
  patch_suggestion?: string; // only for propose_patch task
  next_steps: string[];
  notes: string; // natural language summary
}

export interface ReasonerRunIn {
  sid: string;
  task: ReasonerTaskType;
  inputs: ReasonerTask['inputs'];
  backend?: string; // which reasoner backend to use
  args?: { model?: string; effort?: string; [key: string]: any };
  question?: string;
  constraints?: string[];
  redact?: boolean;
}

export interface ReasonerRunOut {
  links: string[]; // vdt:// links to result files
  result: ReasonerResult;
}

// Backend Configuration Types
export type BackendType = 'mcp' | 'cli' | 'http';

export interface BackendConfig {
  type: BackendType;
  cmd?: string; // for cli type
  args?: string[]; // for cli type
  base_url?: string; // for http type
  model?: string;
  api_key_env?: string; // environment variable name
  cost_hint?: 'low' | 'medium' | 'high';
  supports?: ReasonerTaskType[];
}

export interface ReasonerConfig {
  default_backend: string;
  fallback_backend?: string;
  backends: Record<string, BackendConfig>;
  routing: Record<ReasonerTaskType | 'auto', string>;
  thresholds: {
    reason_score_advanced: number;
  };
  timeouts: {
    default_sec: number;
    analyze_sec: number;
    patch_sec: number;
  };
}

// Reasoning Score Calculation
export interface ReasoningMetrics {
  error_density: number;
  stacktrace_novelty: number;
  context_span: number;
  churn_score: number;
  repeat_failures: number;
  entropy_logs: number;
  spec_mismatch: number;
}
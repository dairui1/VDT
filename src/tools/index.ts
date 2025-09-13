import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from '../utils/session.js';
import { CaptureManager } from '../utils/capture.js';
import { AnalysisEngine } from '../utils/analysis.js';

// Import individual tool implementations
import { StartSessionTool } from './start-session.js';
import { CaptureRunTool } from './capture-run.js';
import { AnalyzeCaptureTool } from './analyze-capture.js';
import { EndSessionTool } from './end-session.js';

export class VDTTools {
  private sessionManager: SessionManager;
  private captureManager: CaptureManager;
  private analysisEngine: AnalysisEngine;

  // Tool instances
  private startSessionTool: StartSessionTool;
  private captureRunTool: CaptureRunTool;
  private analyzeCaptureTool: AnalyzeCaptureTool;
  private endSessionTool: EndSessionTool;

  constructor() {
    this.sessionManager = new SessionManager();
    this.captureManager = new CaptureManager();
    this.analysisEngine = new AnalysisEngine();

    // Initialize tool instances
    this.startSessionTool = new StartSessionTool(this.sessionManager, this.captureManager, this.analysisEngine);
    this.captureRunTool = new CaptureRunTool(this.sessionManager, this.captureManager, this.analysisEngine);
    this.analyzeCaptureTool = new AnalyzeCaptureTool(this.sessionManager, this.captureManager, this.analysisEngine);
    this.endSessionTool = new EndSessionTool(this.sessionManager, this.captureManager, this.analysisEngine);
  }

  async initialize(): Promise<void> {
    // Initialize core components
  }

  async dispose(): Promise<void> {
    // Cleanup resources
  }

  // Core tool: start_session
  async startSession(params: {
    repoRoot?: string;
    note?: string;
    ttlDays?: number;
  }): Promise<CallToolResult> {
    return this.startSessionTool.execute(params);
  }

  // Core tool: capture_run
  async captureRun(params: {
    sid: string;
    mode: 'cli' | 'web';
    shell?: {
      cwd: string;
      commands?: string[];
      env?: Record<string, string>;
      timeoutSec?: number;
    };
    web?: {
      entryUrl: string;
      actions?: boolean;
      console?: boolean;
      network?: boolean;
    };
    redact?: {
      patterns?: string[];
    };
  }): Promise<CallToolResult> {
    return this.captureRunTool.execute(params);
  }

  // Core tool: analyze_capture  
  async analyzeCapture(params: {
    sid: string;
    focus?: {
      module?: string;
      func?: string;
      timeRange?: [number, number];
      selectedIds?: string[];
    };
    task?: 'propose_patch' | 'analyze_root_cause';
    inputs?: {
      code?: string[];
      diff?: string;
    };
    context?: {
      selectedIds?: string[];
      notes?: string;
    };
    backend?: string;
    args?: { model?: string; effort?: string; [key: string]: any };
    question?: string;
    constraints?: string[];
    redact?: boolean;
  }): Promise<CallToolResult> {
    return this.analyzeCaptureTool.execute(params);
  }

  // Core tool: end_session
  async endSession(params: {
    sid: string;
  }): Promise<CallToolResult> {
    return this.endSessionTool.execute(params);
  }
}
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SessionManager } from '../utils/session.js';
import { ASTInstrumenter } from '../utils/ast.js';
import { CaptureManager } from '../utils/capture.js';
import { AnalysisEngine } from '../utils/analysis.js';
import { HudManager } from '../utils/hud.js';
import { WebCaptureAnalyzer } from '../utils/web-analyzer.js';
import { ToolResponse, HudStartIn, RecordStartIn, RecordStopIn, ReplayRunIn, AnalyzeWebCaptureIn } from '../types/index.js';

export class VDTTools {
  private sessionManager: SessionManager;
  private instrumenter: ASTInstrumenter;
  private captureManager: CaptureManager;
  private analysisEngine: AnalysisEngine;
  private hudManager: HudManager;
  private webAnalyzer: WebCaptureAnalyzer;

  constructor() {
    this.sessionManager = new SessionManager();
    this.instrumenter = new ASTInstrumenter();
    this.captureManager = new CaptureManager();
    this.analysisEngine = new AnalysisEngine();
    this.hudManager = new HudManager();
    this.webAnalyzer = new WebCaptureAnalyzer();
  }

  async startSession(params: {
    repoRoot?: string;
    note?: string;
    ttlDays?: number;
  }): Promise<CallToolResult> {
    try {
      const { repoRoot, note, ttlDays = 7 } = params;
      
      const session = await this.sessionManager.createSession(repoRoot, note, ttlDays);
      
      const links = [
        this.sessionManager.getResourceLink(session.sid, 'analysis/buglens.md'),
        this.sessionManager.getResourceLink(session.sid, 'logs/capture.ndjson'),
        this.sessionManager.getResourceLink(session.sid, 'meta.json')
      ];

      const response: ToolResponse = {
        data: {
          sid: session.sid,
          links
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    } catch (error) {
      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check repository root permissions and disk space'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async writeLog(params: {
    sid: string;
    files: string[];
    anchors?: string[];
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
    format?: 'ndjson';
    dryRun?: boolean;
    allowlist?: string[];
    force?: boolean;
  }): Promise<CallToolResult> {
    try {
      const { 
        sid, 
        files, 
        anchors = [], 
        level = 'debug', 
        format = 'ndjson', 
        dryRun = true,
        allowlist = [],
        force = false
      } = params;

      const session = await this.sessionManager.getSession(sid);
      if (!session) {
        throw new Error(`Session ${sid} not found`);
      }

      // Check allowlist if provided
      const filteredFiles = allowlist.length > 0 
        ? files.filter(file => allowlist.some(pattern => file.includes(pattern)))
        : files;

      if (filteredFiles.length === 0) {
        throw new Error('No files match allowlist criteria');
      }

      const sessionDir = this.sessionManager.getSessionDir(sid);
      const results = [];

      // Process each file
      for (const targetFile of filteredFiles) {
        const result = await this.instrumenter.instrumentFile(
          targetFile, 
          anchors, 
          level, 
          format, 
          sessionDir
        );
        
        results.push({
          file: targetFile,
          ...result
        });
      }

      const response: ToolResponse = {
        data: {
          results,
          patchLink: results.some(r => r.diff) ? 
            this.sessionManager.getResourceLink(sid, 'patches/0001-write-log.diff') : null,
          applied: !dryRun,
          totalModifications: results.reduce((acc, r) => {
            const mods = r.hints.find(h => h.includes('Instrumented'))?.match(/\d+/);
            return acc + (mods ? parseInt(mods[0]) : 0);
          }, 0)
        }
      };

      return {
        content: [{
          type: 'text', 
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'write_log', 'INSTRUMENT_ERROR', 
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check file permissions and syntax. Use allowlist to restrict scope.'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async applyWriteLog(params: {
    sid: string;
    files: string[];
  }): Promise<CallToolResult> {
    try {
      const { sid, files } = params;

      const session = await this.sessionManager.getSession(sid);
      if (!session) {
        throw new Error(`Session ${sid} not found`);
      }

      const sessionDir = this.sessionManager.getSessionDir(sid);
      const results = [];

      // Apply instrumentation to each file
      for (const targetFile of files) {
        const result = await this.instrumenter.applyInstrumentation(targetFile, sessionDir);
        results.push({
          file: targetFile,
          ...result
        });
      }

      const response: ToolResponse = {
        data: {
          results,
          successCount: results.filter(r => r.success).length,
          totalFiles: results.length
        }
      };

      return {
        content: [{
          type: 'text', 
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'apply_write_log', 'APPLY_ERROR', 
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Ensure write_log was run first and patch files exist.'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async doCapture(params: {
    sid: string;
    shell: {
      cwd: string;
      commands?: string[];
      env?: Record<string, string>;
      timeoutSec?: number;
    };
    redact?: {
      patterns?: string[];
    };
  }): Promise<CallToolResult> {
    try {
      const { sid, shell, redact = {} } = params;

      const session = await this.sessionManager.getSession(sid);
      if (!session) {
        throw new Error(`Session ${sid} not found`);
      }

      const sessionDir = this.sessionManager.getSessionDir(sid);
      const result = await this.captureManager.captureShell(sessionDir, shell, redact);

      const response: ToolResponse = {
        data: {
          chunks: result.chunks.map(chunk => 
            this.sessionManager.getResourceLink(sid, chunk)
          ),
          summary: result.summary
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'do_capture', 'CAPTURE_ERROR',
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check command permissions and timeout settings. Consider shorter capture duration.'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async analyzeDebugLog(params: {
    sid: string;
    focus?: {
      module?: string;
      func?: string;
      timeRange?: [number, number];
      selectedIds?: string[];
    };
    ruleset?: string;
  }): Promise<CallToolResult> {
    try {
      const { sid, focus, ruleset = 'js-web-default' } = params;

      const session = await this.sessionManager.getSession(sid);
      if (!session) {
        throw new Error(`Session ${sid} not found`);
      }

      const sessionDir = this.sessionManager.getSessionDir(sid);
      const result = await this.analysisEngine.analyzeDebugLog(sessionDir, focus, ruleset);

      const response: ToolResponse = {
        data: {
          findings: result.findings,
          links: result.links.map(link => 
            this.sessionManager.getResourceLink(sid, link)
          )
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'analyze_debug_log', 'ANALYSIS_ERROR',
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Ensure capture.ndjson exists and contains valid log data'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  // v0.2 HUD Tools
  async hudStart(params: HudStartIn): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      const sessionDir = this.sessionManager.getSessionDir(params.sid);
      const result = await this.hudManager.startHud(params, sessionDir);

      const response: ToolResponse = {
        data: result
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'hud_start', 'HUD_START_ERROR',
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check development server configuration and port availability'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async hudStatus(params: { sid: string }): Promise<CallToolResult> {
    try {
      const result = await this.hudManager.getHudStatus(params.sid);

      const response: ToolResponse = {
        data: result
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check if HUD session exists and is running'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async hudStop(params: { sid: string; saveTrace?: boolean }): Promise<CallToolResult> {
    try {
      const result = await this.hudManager.stopHud(params.sid, params.saveTrace);

      const response: ToolResponse = {
        data: result
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check if HUD session exists'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async recordStart(params: RecordStartIn): Promise<CallToolResult> {
    try {
      const recordId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.hudManager.startRecording(params.sid, recordId, params.entryUrl, params.selectors);

      const response: ToolResponse = {
        data: {
          recordId,
          links: [`vdt://sessions/${params.sid}/logs/actions.rec.ndjson`]
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'record_start', 'RECORD_START_ERROR',
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Ensure HUD session is running and browser is ready'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async recordStop(params: RecordStopIn): Promise<CallToolResult> {
    try {
      const result = await this.hudManager.stopRecording(params.sid, params.recordId, params.export);

      const response: ToolResponse = {
        data: result
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'record_stop', 'RECORD_STOP_ERROR',
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check if recording session exists and is active'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async replayRun(params: ReplayRunIn): Promise<CallToolResult> {
    try {
      const result = await this.hudManager.replayScript(params.sid, params.script, params.mode);

      const response: ToolResponse = {
        data: result
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'replay_run', 'REPLAY_ERROR',
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Check script path and browser availability'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async analyzeWebCapture(params: AnalyzeWebCaptureIn): Promise<CallToolResult> {
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      const sessionDir = this.sessionManager.getSessionDir(params.sid);
      const result = await this.webAnalyzer.analyzeWebCapture(sessionDir, params);

      const response: ToolResponse = {
        data: result
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };

    } catch (error) {
      await this.sessionManager.addError(params.sid, 'analyze_web_capture', 'WEB_ANALYSIS_ERROR',
        error instanceof Error ? error.message : 'Unknown error');

      const response: ToolResponse = {
        isError: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Ensure web capture data exists in session logs'
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      };
    }
  }

  async dispose(): Promise<void> {
    await this.hudManager.dispose();
  }
}
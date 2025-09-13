import * as fs from 'fs/promises';
import * as path from 'path';
import { ActionEvent, ConsoleEvent, NetworkEvent, AnalyzeWebCaptureIn, AnalyzeWebCaptureOut } from '../types/index.js';

interface WebCaptureData {
  actions: ActionEvent[];
  console: ConsoleEvent[];
  network: NetworkEvent[];
}

interface ErrorWindow {
  startTime: number;
  endTime: number;
  stepId?: string;
  errors: ConsoleEvent[];
  relatedActions: ActionEvent[];
  relatedNetwork: NetworkEvent[];
}

export class WebCaptureAnalyzer {
  async analyzeWebCapture(
    sessionDir: string,
    params: AnalyzeWebCaptureIn
  ): Promise<AnalyzeWebCaptureOut> {
    const { sid, focus, topk = 3 } = params;

    // Load capture data
    const captureData = await this.loadCaptureData(sessionDir);
    
    // Find error windows
    const errorWindows = this.findErrorWindows(captureData, 500); // 500ms window
    
    // Generate BugLens-Web report
    const reportPath = await this.generateBugLensWeb(sessionDir, sid, captureData, errorWindows, topk);
    
    const findings = {
      errorWindows: errorWindows.length,
      totalActions: captureData.actions.length,
      totalErrors: captureData.console.filter(e => e.type === 'error').length,
      totalNetworkEvents: captureData.network.length,
    };

    return {
      links: [reportPath],
      findings,
    };
  }

  private async loadCaptureData(sessionDir: string): Promise<WebCaptureData> {
    const logsDir = path.join(sessionDir, 'logs');
    
    const data: WebCaptureData = {
      actions: [],
      console: [],
      network: [],
    };

    // Load actions from both regular and recording logs
    const actionFiles = ['actions.ndjson', 'actions.rec.ndjson', 'actions.replay.ndjson'];
    for (const file of actionFiles) {
      const filePath = path.join(logsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const events = content.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line) as ActionEvent);
        data.actions.push(...events);
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    // Load console logs
    const consoleFiles = ['console.ndjson', 'console.rec.ndjson', 'console.replay.ndjson'];
    for (const file of consoleFiles) {
      const filePath = path.join(logsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const events = content.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line) as ConsoleEvent);
        data.console.push(...events);
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    // Load network logs
    const networkFiles = ['network.ndjson', 'network.rec.ndjson', 'network.replay.ndjson'];
    for (const file of networkFiles) {
      const filePath = path.join(logsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const events = content.split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line) as NetworkEvent);
        data.network.push(...events);
      } catch (error) {
        // File doesn't exist, skip
      }
    }

    // Sort all by timestamp
    data.actions.sort((a, b) => a.ts - b.ts);
    data.console.sort((a, b) => a.ts - b.ts);
    data.network.sort((a, b) => a.ts - b.ts);

    return data;
  }

  private findErrorWindows(data: WebCaptureData, windowMs: number): ErrorWindow[] {
    const errors = data.console.filter(e => e.type === 'error');
    const windows: ErrorWindow[] = [];

    for (const error of errors) {
      const startTime = error.ts - windowMs;
      const endTime = error.ts + windowMs;

      const relatedActions = data.actions.filter(a => 
        a.ts >= startTime && a.ts <= endTime
      );

      const relatedNetwork = data.network.filter(n => 
        n.ts >= startTime && n.ts <= endTime
      );

      const windowErrors = data.console.filter(e =>
        e.type === 'error' && e.ts >= startTime && e.ts <= endTime
      );

      windows.push({
        startTime,
        endTime,
        stepId: error.stepIdHint,
        errors: windowErrors,
        relatedActions,
        relatedNetwork,
      });
    }

    return windows;
  }

  private async generateBugLensWeb(
    sessionDir: string,
    sid: string,
    data: WebCaptureData,
    errorWindows: ErrorWindow[],
    topk: number
  ): Promise<string> {
    const analysisDir = path.join(sessionDir, 'analysis');
    await fs.mkdir(analysisDir, { recursive: true });

    const reportPath = path.join(analysisDir, 'buglens-web.md');
    
    let report = `# BugLens-Web v0.2

## Context
- Session: ${sid}
- Generated: ${new Date().toISOString()}
- Total Actions: ${data.actions.length}
- Total Errors: ${data.console.filter(e => e.type === 'error').length}

## Reproduction Path (excerpt)
`;

    // Show first few actions
    const keyActions = data.actions.slice(0, Math.min(5, data.actions.length));
    keyActions.forEach((action, index) => {
      report += `${index + 1}) ${action.type} ${action.url} (${action.stepId})\n`;
      if (action.screenshot) {
        report += `   ![snapshot](../${action.screenshot})\n`;
      }
    });

    report += `
## Key Console & Errors
`;

    // Show error windows
    const topErrorWindows = errorWindows.slice(0, topk);
    topErrorWindows.forEach((window, index) => {
      report += `
### Error Window ${index + 1}
- Time Range: ${new Date(window.startTime).toISOString()} - ${new Date(window.endTime).toISOString()}
- Step ID: ${window.stepId || 'unknown'}

Errors:
`;
      window.errors.forEach(error => {
        const argsStr = error.args.map(arg => 
          typeof arg === 'string' ? arg : JSON.stringify(arg)
        ).join(' ');
        report += `- [${error.type}] ${argsStr}\n`;
        if (error.stack) {
          report += `  Stack: ${error.stack}\n`;
        }
      });

      if (window.relatedActions.length > 0) {
        report += `\nRelated Actions:\n`;
        window.relatedActions.forEach(action => {
          report += `- ${action.type} ${action.selector || action.coords ? `(${action.selector || JSON.stringify(action.coords)})` : ''}\n`;
        });
      }

      if (window.relatedNetwork.length > 0) {
        report += `\nRelated Network:\n`;
        window.relatedNetwork.forEach(net => {
          report += `- ${net.method} ${net.url} (${net.status || 'pending'})\n`;
        });
      }
    });

    report += `
## Hypotheses
`;

    // Generate hypotheses based on error patterns
    const hypotheses = this.generateHypotheses(errorWindows, data);
    hypotheses.forEach((hypothesis, index) => {
      report += `
${index + 1}) ${hypothesis.title}
   - Evidence: ${hypothesis.evidence}
   - Verify: ${hypothesis.verify}
`;
    });

    report += `
## Suggested Patches
`;

    // Generate patch suggestions
    const patches = this.generatePatchSuggestions(errorWindows, data);
    patches.forEach(patch => {
      report += `
- File: ${patch.file}
- Change: ${patch.description}
- Code: \`${patch.code}\`
`;
    });

    await fs.writeFile(reportPath, report, 'utf-8');
    
    return `vdt://sessions/${path.basename(sessionDir)}/analysis/buglens-web.md`;
  }

  private generateHypotheses(errorWindows: ErrorWindow[], data: WebCaptureData): Array<{
    title: string;
    evidence: string;
    verify: string;
  }> {
    const hypotheses: Array<{ title: string; evidence: string; verify: string }> = [];

    // Common patterns
    const networkErrors = errorWindows.some(w => 
      w.relatedNetwork.some(n => n.status && n.status >= 400)
    );

    if (networkErrors) {
      hypotheses.push({
        title: "Network request failure causing UI errors",
        evidence: "Error windows contain failed network requests (4xx/5xx status)",
        verify: "Check network request handling and error boundaries"
      });
    }

    const clickErrors = errorWindows.some(w =>
      w.relatedActions.some(a => a.type === 'click') && w.errors.length > 0
    );

    if (clickErrors) {
      hypotheses.push({
        title: "Click event handler throwing exceptions",
        evidence: "Errors occur immediately after click actions",
        verify: "Add error handling to click event listeners"
      });
    }

    const consoleErrors = data.console.filter(e => e.type === 'error');
    if (consoleErrors.length > 3) {
      hypotheses.push({
        title: "Widespread error handling issues",
        evidence: `${consoleErrors.length} console errors detected`,
        verify: "Review error boundaries and exception handling"
      });
    }

    return hypotheses;
  }

  private generatePatchSuggestions(errorWindows: ErrorWindow[], data: WebCaptureData): Array<{
    file: string;
    description: string;
    code: string;
  }> {
    const patches: Array<{ file: string; description: string; code: string }> = [];

    // Example patch suggestions based on common patterns
    const hasClickErrors = errorWindows.some(w =>
      w.relatedActions.some(a => a.type === 'click')
    );

    if (hasClickErrors) {
      patches.push({
        file: "components/Button.tsx",
        description: "Add error boundary to click handler",
        code: "try { handleClick(); } catch (error) { console.error('Click error:', error); }"
      });
    }

    return patches;
  }
}
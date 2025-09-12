import { join } from 'path';
import { promises as fs } from 'fs';
import { LogEvent, AnalysisFindings, FocusConfig, BugLensChunk } from '../types/index.js';
import { FileManager } from './session.js';
import { LogProcessor } from './logs.js';

export class AnalysisEngine {
  async analyzeDebugLog(
    sessionDir: string,
    focus?: FocusConfig,
    ruleset: string = 'js-web-default'
  ): Promise<{ findings: AnalysisFindings, links: string[] }> {
    
    const logFile = join(sessionDir, 'logs', 'capture.ndjson');
    const events = await FileManager.readNDJSON(logFile);
    
    if (events.length === 0) {
      return {
        findings: { clusters: [], suspects: [], needClarify: true },
        links: []
      };
    }

    // Apply focus filters
    const filteredEvents = this.applyFocus(events, focus);
    
    // Find error-dense windows
    const errorWindows = LogProcessor.findErrorWindows(filteredEvents);
    
    // Cluster by module/function
    const clusters = this.clusterByModuleFunc(filteredEvents);
    
    // Find suspects (error-prone patterns)
    const suspects = this.findSuspects(filteredEvents, errorWindows);
    
    // Generate BugLens
    const bugLensPath = await this.generateBugLens(sessionDir, {
      events: filteredEvents,
      errorWindows,
      clusters,
      suspects,
      focus
    });

    const findings: AnalysisFindings = {
      clusters,
      suspects,
      needClarify: filteredEvents.length < 20 || clusters.length > 10
    };

    return {
      findings,
      links: [`analysis/buglens.md`]
    };
  }

  private applyFocus(events: LogEvent[], focus?: FocusConfig): LogEvent[] {
    if (!focus) return events;

    let filtered = events;

    if (focus.module) {
      filtered = filtered.filter(e => e.module.includes(focus.module!));
    }

    if (focus.func) {
      filtered = filtered.filter(e => e.func.includes(focus.func!));
    }

    if (focus.timeRange) {
      const [start, end] = focus.timeRange;
      filtered = filtered.filter(e => e.ts >= start && e.ts <= end);
    }

    if (focus.selectedIds) {
      // For MVP, selectedIds would be line numbers or similar
      // This is a simplified implementation
      const startIdx = focus.selectedIds.length > 0 ? parseInt(focus.selectedIds[0]) : 0;
      const endIdx = focus.selectedIds.length > 1 ? parseInt(focus.selectedIds[1]) : filtered.length;
      filtered = filtered.slice(startIdx, endIdx);
    }

    return filtered;
  }

  private clusterByModuleFunc(events: LogEvent[]): any[] {
    const clusters = new Map<string, LogEvent[]>();

    for (const event of events) {
      const key = `${event.module}:${event.func}`;
      if (!clusters.has(key)) {
        clusters.set(key, []);
      }
      clusters.get(key)!.push(event);
    }

    return Array.from(clusters.entries()).map(([key, events]) => ({
      id: key,
      module: events[0].module,
      func: events[0].func,
      count: events.length,
      errorCount: events.filter(e => e.level === 'error').length,
      timeSpan: events.length > 0 ? events[events.length - 1].ts - events[0].ts : 0
    }));
  }

  private findSuspects(events: LogEvent[], errorWindows: any[]): any[] {
    const suspects = [];

    // Find functions with high error rates
    const funcStats = new Map<string, { total: number, errors: number }>();
    
    for (const event of events) {
      const key = `${event.module}:${event.func}`;
      if (!funcStats.has(key)) {
        funcStats.set(key, { total: 0, errors: 0 });
      }
      const stats = funcStats.get(key)!;
      stats.total++;
      if (event.level === 'error') {
        stats.errors++;
      }
    }

    // Find suspects with >20% error rate and >5 total calls
    for (const [key, stats] of funcStats.entries()) {
      if (stats.total >= 5 && stats.errors / stats.total > 0.2) {
        const [module, func] = key.split(':');
        suspects.push({
          type: 'high-error-rate',
          module,
          func,
          errorRate: stats.errors / stats.total,
          evidence: `${stats.errors}/${stats.total} calls failed`
        });
      }
    }

    return suspects;
  }

  private async generateBugLens(
    sessionDir: string,
    data: {
      events: LogEvent[],
      errorWindows: any[],
      clusters: any[],
      suspects: any[],
      focus?: FocusConfig
    }
  ): Promise<string> {
    
    const bugLensPath = join(sessionDir, 'analysis', 'buglens.md');
    await FileManager.ensureDir(join(sessionDir, 'analysis'));

    const { events, errorWindows, clusters, suspects, focus } = data;

    // Extract key logs (first few errors and their context)
    const keyLogs = this.extractKeyLogs(events, 10);

    // Generate hypotheses based on suspects and patterns
    const hypotheses = this.generateHypotheses(suspects, clusters);

    const bugLensContent = `# BugLens v0.1

## Context
- session: ${sessionDir.split('/').pop()}
- env: node@${process.version}, ${process.platform}
- focus: ${focus?.module || 'all'}:${focus?.func || 'all'}
- total events: ${events.length}
- error windows: ${errorWindows.length}

## Symptoms
- Expected: Normal execution flow
- Actual: ${suspects.length} suspicious patterns detected
- Error density: ${errorWindows.length > 0 ? errorWindows[0].density.toFixed(2) : '0.00'}

## Key Logs (excerpt)
${keyLogs.map(log => `- [${log.module}:${log.func}] ${log.msg} ${JSON.stringify(log.kv)}`).join('\n')}

## Analysis
### Clusters
${clusters.map(c => `- ${c.id}: ${c.count} events, ${c.errorCount} errors`).join('\n')}

### Suspects
${suspects.map(s => `- ${s.module}:${s.func} (${s.type}): ${s.evidence}`).join('\n')}

## Hypotheses
${hypotheses.map((h, i) => `${i + 1}) ${h.title}
   - Evidence: ${h.evidence}
   - Risk: ${h.risk}
   - Verify: ${h.verify}`).join('\n\n')}

## Suggested Patch (high-level)
${this.generatePatchSuggestion(suspects, clusters)}

---
Generated at: ${new Date().toISOString()}
`;

    await fs.writeFile(bugLensPath, bugLensContent);
    return bugLensPath;
  }

  private extractKeyLogs(events: LogEvent[], maxLogs: number): LogEvent[] {
    // Get errors and some context around them
    const keyLogs: LogEvent[] = [];
    
    for (let i = 0; i < events.length && keyLogs.length < maxLogs; i++) {
      const event = events[i];
      if (event.level === 'error') {
        // Add the error and some context
        const start = Math.max(0, i - 2);
        const end = Math.min(events.length, i + 3);
        keyLogs.push(...events.slice(start, end));
      }
    }

    // Remove duplicates and truncate
    const unique = Array.from(new Set(keyLogs));
    return unique.slice(0, maxLogs);
  }

  private generateHypotheses(suspects: any[], clusters: any[]): any[] {
    const hypotheses = [];

    if (suspects.length > 0) {
      const topSuspect = suspects[0];
      hypotheses.push({
        title: `${topSuspect.module}:${topSuspect.func} error handling issue`,
        evidence: topSuspect.evidence,
        risk: 'May affect related functionality in same module',
        verify: `Add defensive checks in ${topSuspect.func} and test edge cases`
      });
    }

    if (clusters.some(c => c.errorCount > c.count * 0.5)) {
      hypotheses.push({
        title: 'Systemic error in core flow',
        evidence: 'Multiple functions showing high error rates',
        risk: 'Core functionality may be unstable',
        verify: 'Review input validation and error propagation'
      });
    }

    if (hypotheses.length === 0) {
      hypotheses.push({
        title: 'Intermittent issue requiring more data',
        evidence: 'Low error density but some failures observed',
        risk: 'Issue may be environment or timing dependent',
        verify: 'Run capture with longer duration or different scenarios'
      });
    }

    return hypotheses;
  }

  private generatePatchSuggestion(suspects: any[], clusters: any[]): string {
    if (suspects.length === 0) {
      return '- Add more logging to identify root cause\n- Consider edge case handling';
    }

    const topSuspect = suspects[0];
    return `- Review ${topSuspect.module}:${topSuspect.func} for error handling\n- Add input validation and defensive coding\n- Consider adding retry logic if appropriate`;
  }
}
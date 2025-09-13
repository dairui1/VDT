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

    // Check for existing clarify.md to enhance focus
    let clarifyFocus = focus;
    try {
      const clarifyPath = join(sessionDir, 'analysis', 'clarify.md');
      const clarifyContent = await fs.readFile(clarifyPath, 'utf-8');
      
      // Extract selectedIds from clarify.md
      const selectedIdsMatch = clarifyContent.match(/Selected IDs: (.+)/);
      if (selectedIdsMatch) {
        const selectedIds = selectedIdsMatch[1].split(', ').map(id => id.trim());
        clarifyFocus = {
          ...focus,
          selectedIds: [...(focus?.selectedIds || []), ...selectedIds]
        };
        console.log('[VDT] Enhanced focus with clarify selections:', selectedIds);
      }
    } catch {
      // No clarify.md exists, continue with original focus
    }

    // Apply focus filters (now potentially enhanced with clarify data)
    const filteredEvents = this.applyFocus(events, clarifyFocus);
    
    // Find error-dense windows
    const errorWindows = LogProcessor.findErrorWindows(filteredEvents);
    
    // Create candidate chunks for clarification
    const candidateChunks = this.createCandidateChunks(filteredEvents, errorWindows);
    
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
      focus,
      candidateChunks
    });

    const findings: AnalysisFindings = {
      clusters,
      suspects,
      needClarify: this.shouldTriggerClarify(filteredEvents, clusters, candidateChunks),
      candidateChunks  // Add candidate chunks to findings
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

    if (focus.selectedIds && focus.selectedIds.length > 0) {
      // Map selected chunk IDs to event ranges
      const selectedRanges = this.mapChunkIdsToRanges(events, focus.selectedIds);
      if (selectedRanges.length > 0) {
        filtered = this.filterEventsByRanges(events, selectedRanges);
      }
    }

    return filtered;
  }

  private createCandidateChunks(events: LogEvent[], errorWindows: any[]): BugLensChunk[] {
    const chunks: BugLensChunk[] = [];
    const contextSize = 20; // Lines of context around key events
    
    // 1. Error window chunks
    errorWindows.forEach((window, index) => {
      const startIdx = Math.max(0, window.start - contextSize);
      const endIdx = Math.min(events.length, window.end + contextSize);
      const windowEvents = events.slice(startIdx, endIdx);
      
      const errorEvents = windowEvents.filter(e => e.level === 'error');
      const excerpt = this.createExcerpt(windowEvents.slice(0, 10)); // First 10 lines
      
      chunks.push({
        id: `error_window_${index}`,
        title: `Error Window ${index + 1} (${errorEvents.length} errors)`,
        excerpt,
        refs: [`lines ${startIdx + 1}-${endIdx}`, `density: ${window.density.toFixed(2)}`],
        metadata: {
          type: 'error_window',
          startIdx,
          endIdx,
          errorCount: errorEvents.length,
          density: window.density
        }
      });
    });

    // 2. Module-based chunks
    const moduleGroups = this.groupEventsByModule(events);
    Object.entries(moduleGroups).forEach(([module, moduleEvents]) => {
      if (moduleEvents.length < 5) return; // Skip modules with too few events
      
      const errorCount = moduleEvents.filter(e => e.level === 'error').length;
      if (errorCount === 0) return; // Skip modules with no errors
      
      const excerpt = this.createExcerpt(moduleEvents.slice(0, 8));
      const startIdx = events.indexOf(moduleEvents[0]);
      const endIdx = events.indexOf(moduleEvents[moduleEvents.length - 1]);
      
      chunks.push({
        id: `module_${module}`,
        title: `Module: ${module} (${errorCount}/${moduleEvents.length} errors)`,
        excerpt,
        refs: [`${moduleEvents.length} events`, `${errorCount} errors`],
        metadata: {
          type: 'module',
          module,
          startIdx,
          endIdx,
          eventCount: moduleEvents.length,
          errorCount
        }
      });
    });

    // 3. Function-based chunks
    const functionGroups = this.groupEventsByFunction(events);
    Object.entries(functionGroups).forEach(([funcKey, funcEvents]) => {
      if (funcEvents.length < 3) return; // Skip functions with too few events
      
      const [module, func] = funcKey.split(':');
      const errorCount = funcEvents.filter(e => e.level === 'error').length;
      if (errorCount === 0) return; // Skip functions with no errors
      
      const excerpt = this.createExcerpt(funcEvents.slice(0, 5));
      const startIdx = events.indexOf(funcEvents[0]);
      const endIdx = events.indexOf(funcEvents[funcEvents.length - 1]);
      
      chunks.push({
        id: `function_${module}_${func}`,
        title: `Function: ${module}:${func} (${errorCount} errors)`,
        excerpt,
        refs: [`${funcEvents.length} calls`, `${errorCount} errors`],
        metadata: {
          type: 'function',
          module,
          func,
          startIdx,
          endIdx,
          eventCount: funcEvents.length,
          errorCount
        }
      });
    });

    // 4. Time-based chunks for rapid error sequences
    const rapidErrorSequences = this.findRapidErrorSequences(events);
    rapidErrorSequences.forEach((sequence, index) => {
      const excerpt = this.createExcerpt(sequence.events.slice(0, 6));
      const startIdx = events.indexOf(sequence.events[0]);
      const endIdx = events.indexOf(sequence.events[sequence.events.length - 1]);
      
      chunks.push({
        id: `rapid_errors_${index}`,
        title: `Rapid Error Sequence ${index + 1} (${sequence.events.length} errors in ${sequence.duration}ms)`,
        excerpt,
        refs: [`${sequence.duration}ms duration`, `${sequence.events.length} errors`],
        metadata: {
          type: 'rapid_sequence',
          startIdx,
          endIdx,
          duration: sequence.duration,
          errorCount: sequence.events.length
        }
      });
    });

    // Sort chunks by relevance (error count and type priority)
    return chunks.sort((a, b) => {
      const priorityOrder = { 'error_window': 4, 'rapid_sequence': 3, 'function': 2, 'module': 1 };
      const aPriority = priorityOrder[a.metadata?.type as keyof typeof priorityOrder] || 0;
      const bPriority = priorityOrder[b.metadata?.type as keyof typeof priorityOrder] || 0;
      
      if (aPriority !== bPriority) return bPriority - aPriority;
      return (b.metadata?.errorCount || 0) - (a.metadata?.errorCount || 0);
    });
  }

  private mapChunkIdsToRanges(events: LogEvent[], selectedIds: string[]): Array<{start: number, end: number}> {
    const ranges: Array<{start: number, end: number}> = [];
    
    for (const id of selectedIds) {
      // Parse chunk ID to get range information
      if (id.startsWith('error_window_')) {
        const windowIndex = parseInt(id.split('_')[2]);
        const errorWindows = LogProcessor.findErrorWindows(events);
        if (errorWindows[windowIndex]) {
          ranges.push({
            start: errorWindows[windowIndex].start,
            end: errorWindows[windowIndex].end
          });
        }
      } else if (id.startsWith('module_')) {
        const module = id.substring(7); // Remove 'module_'
        const moduleEvents = events.filter(e => e.module === module);
        if (moduleEvents.length > 0) {
          ranges.push({
            start: events.indexOf(moduleEvents[0]),
            end: events.indexOf(moduleEvents[moduleEvents.length - 1])
          });
        }
      } else if (id.startsWith('function_')) {
        const parts = id.substring(9).split('_'); // Remove 'function_'
        const module = parts[0];
        const func = parts[1];
        const funcEvents = events.filter(e => e.module === module && e.func === func);
        if (funcEvents.length > 0) {
          ranges.push({
            start: events.indexOf(funcEvents[0]),
            end: events.indexOf(funcEvents[funcEvents.length - 1])
          });
        }
      }
    }
    
    return ranges;
  }

  private filterEventsByRanges(events: LogEvent[], ranges: Array<{start: number, end: number}>): LogEvent[] {
    const filtered: LogEvent[] = [];
    const used = new Set<number>();
    
    for (const range of ranges) {
      for (let i = range.start; i <= range.end && i < events.length; i++) {
        if (!used.has(i)) {
          filtered.push(events[i]);
          used.add(i);
        }
      }
    }
    
    return filtered.sort((a, b) => a.ts - b.ts); // Maintain chronological order
  }

  private createExcerpt(events: LogEvent[]): string {
    return events
      .slice(0, 5) // Max 5 lines for excerpt
      .map(e => `[${e.level}] ${e.module}:${e.func} - ${e.msg.substring(0, 60)}${e.msg.length > 60 ? '...' : ''}`)
      .join('\n');
  }

  private groupEventsByModule(events: LogEvent[]): Record<string, LogEvent[]> {
    const groups: Record<string, LogEvent[]> = {};
    for (const event of events) {
      if (!groups[event.module]) groups[event.module] = [];
      groups[event.module].push(event);
    }
    return groups;
  }

  private groupEventsByFunction(events: LogEvent[]): Record<string, LogEvent[]> {
    const groups: Record<string, LogEvent[]> = {};
    for (const event of events) {
      const key = `${event.module}:${event.func}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }
    return groups;
  }

  private findRapidErrorSequences(events: LogEvent[]): Array<{events: LogEvent[], duration: number}> {
    const sequences = [];
    const errorEvents = events.filter(e => e.level === 'error');
    
    let currentSequence: LogEvent[] = [];
    let sequenceStart = 0;
    
    for (let i = 0; i < errorEvents.length; i++) {
      const event = errorEvents[i];
      
      if (currentSequence.length === 0) {
        currentSequence = [event];
        sequenceStart = event.ts;
      } else {
        const timeDiff = event.ts - currentSequence[currentSequence.length - 1].ts;
        
        if (timeDiff < 5000) { // Within 5 seconds
          currentSequence.push(event);
        } else {
          // End current sequence if it has 3+ errors
          if (currentSequence.length >= 3) {
            sequences.push({
              events: [...currentSequence],
              duration: currentSequence[currentSequence.length - 1].ts - sequenceStart
            });
          }
          currentSequence = [event];
          sequenceStart = event.ts;
        }
      }
    }
    
    // Handle final sequence
    if (currentSequence.length >= 3) {
      sequences.push({
        events: currentSequence,
        duration: currentSequence[currentSequence.length - 1].ts - sequenceStart
      });
    }
    
    return sequences;
  }

  private shouldTriggerClarify(events: LogEvent[], clusters: any[], candidateChunks: BugLensChunk[]): boolean {
    // Trigger clarify if:
    // 1. Too many candidate chunks (>5)
    // 2. Events are spread across many modules (>10)
    // 3. Low confidence in primary error source
    
    if (candidateChunks.length > 5) return true;
    if (clusters.length > 10) return true;
    if (events.length < 20) return true;
    
    // Check error distribution
    const errorEvents = events.filter(e => e.level === 'error');
    const errorModules = new Set(errorEvents.map(e => e.module));
    if (errorModules.size > 5) return true;
    
    return false;
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
      focus?: FocusConfig,
      candidateChunks: BugLensChunk[]
    }
  ): Promise<string> {
    
    const bugLensPath = join(sessionDir, 'analysis', 'buglens.md');
    await FileManager.ensureDir(join(sessionDir, 'analysis'));

    const { events, errorWindows, clusters, suspects, focus, candidateChunks } = data;

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

## Candidate Chunks for Analysis
${candidateChunks.map(chunk => `### ${chunk.title}
**ID**: \`${chunk.id}\`
**Type**: ${chunk.metadata?.type || 'unknown'}
**Excerpt**:
\`\`\`
${chunk.excerpt}
\`\`\`
**References**: ${chunk.refs.join(', ')}
`).join('\n')}

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
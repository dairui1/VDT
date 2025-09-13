import * as fs from 'fs/promises';
import { ReasoningMetrics } from '../types/index.js';

export class ReasoningScoreCalculator {
  /**
   * Calculate reasoning complexity score based on multiple metrics
   * Score ranges from 0.0 to 1.0, higher values indicate more complex reasoning needed
   */
  async calculateReasonScore(sessionDir: string): Promise<number> {
    const metrics = await this.calculateMetrics(sessionDir);
    
    // Weighted formula as per spec
    const score = 
      0.25 * metrics.error_density +
      0.20 * metrics.stacktrace_novelty +
      0.15 * metrics.context_span +
      0.15 * metrics.churn_score +
      0.10 * metrics.repeat_failures +
      0.10 * metrics.entropy_logs +
      0.05 * metrics.spec_mismatch;

    return Math.min(1.0, Math.max(0.0, score));
  }

  private async calculateMetrics(sessionDir: string): Promise<ReasoningMetrics> {
    try {
      const [errorDensity, stacktraceNovelty, contextSpan, churnScore, repeatFailures, entropyLogs, specMismatch] = await Promise.all([
        this.calculateErrorDensity(sessionDir),
        this.calculateStacktraceNovelty(sessionDir),
        this.calculateContextSpan(sessionDir),
        this.calculateChurnScore(sessionDir),
        this.calculateRepeatFailures(sessionDir),
        this.calculateEntropyLogs(sessionDir),
        this.calculateSpecMismatch(sessionDir),
      ]);

      return {
        error_density: errorDensity,
        stacktrace_novelty: stacktraceNovelty,
        context_span: contextSpan,
        churn_score: churnScore,
        repeat_failures: repeatFailures,
        entropy_logs: entropyLogs,
        spec_mismatch: specMismatch,
      };
    } catch (error) {
      console.warn('[VDT] Error calculating reasoning metrics:', error);
      return this.getDefaultMetrics();
    }
  }

  private async calculateErrorDensity(sessionDir: string): Promise<number> {
    try {
      const consoleFiles = ['console.rec.ndjson', 'console.replay.ndjson', 'console.ndjson'];
      let totalLines = 0;
      let errorLines = 0;

      for (const file of consoleFiles) {
        try {
          const content = await fs.readFile(`${sessionDir}/logs/${file}`, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());
          totalLines += lines.length;

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'error') {
                errorLines++;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        } catch {
          // File doesn't exist
        }
      }

      return totalLines > 0 ? errorLines / totalLines : 0;
    } catch {
      return 0;
    }
  }

  private async calculateStacktraceNovelty(sessionDir: string): Promise<number> {
    try {
      const consoleFiles = ['console.rec.ndjson', 'console.replay.ndjson', 'console.ndjson'];
      const stacktraces = new Set<string>();

      for (const file of consoleFiles) {
        try {
          const content = await fs.readFile(`${sessionDir}/logs/${file}`, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.stack) {
                // Extract unique stack patterns
                const stackPattern = event.stack.split('\n')[0]; // First line usually contains the key info
                stacktraces.add(stackPattern);
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        } catch {
          // File doesn't exist
        }
      }

      // More unique stacktraces = higher novelty
      return Math.min(1.0, stacktraces.size / 10); // Normalize to 0-1 scale
    } catch {
      return 0;
    }
  }

  private async calculateContextSpan(sessionDir: string): Promise<number> {
    try {
      const actionFiles = ['actions.rec.ndjson', 'actions.replay.ndjson', 'actions.ndjson'];
      let minTs = Infinity;
      let maxTs = 0;
      let actionCount = 0;

      for (const file of actionFiles) {
        try {
          const content = await fs.readFile(`${sessionDir}/logs/${file}`, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.ts) {
                minTs = Math.min(minTs, event.ts);
                maxTs = Math.max(maxTs, event.ts);
                actionCount++;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        } catch {
          // File doesn't exist
        }
      }

      if (actionCount === 0) return 0;

      const durationMs = maxTs - minTs;
      const durationMinutes = durationMs / (1000 * 60);
      
      // Longer sessions with more actions indicate higher context complexity
      return Math.min(1.0, (durationMinutes / 10) * (actionCount / 50));
    } catch {
      return 0;
    }
  }

  private async calculateChurnScore(sessionDir: string): Promise<number> {
    // This would require git history analysis in a real implementation
    // For now, return a placeholder
    return 0.3;
  }

  private async calculateRepeatFailures(sessionDir: string): Promise<number> {
    try {
      const consoleFiles = ['console.rec.ndjson', 'console.replay.ndjson', 'console.ndjson'];
      const errorMessages = new Map<string, number>();

      for (const file of consoleFiles) {
        try {
          const content = await fs.readFile(`${sessionDir}/logs/${file}`, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.type === 'error' && event.args && event.args[0]) {
                const errorMsg = String(event.args[0]).substring(0, 100); // First 100 chars
                errorMessages.set(errorMsg, (errorMessages.get(errorMsg) || 0) + 1);
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        } catch {
          // File doesn't exist
        }
      }

      // Calculate repeat failure ratio
      let totalErrors = 0;
      let repeatedErrors = 0;
      for (const [, count] of errorMessages) {
        totalErrors += count;
        if (count > 1) {
          repeatedErrors += count;
        }
      }

      return totalErrors > 0 ? repeatedErrors / totalErrors : 0;
    } catch {
      return 0;
    }
  }

  private async calculateEntropyLogs(sessionDir: string): Promise<number> {
    try {
      const logFiles = ['devserver.ndjson', 'console.rec.ndjson', 'console.replay.ndjson'];
      const logLevels = new Map<string, number>();
      let totalLogs = 0;

      for (const file of logFiles) {
        try {
          const content = await fs.readFile(`${sessionDir}/logs/${file}`, 'utf-8');
          const lines = content.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const event = JSON.parse(line);
              if (event.level || event.type) {
                const level = event.level || event.type;
                logLevels.set(level, (logLevels.get(level) || 0) + 1);
                totalLogs++;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        } catch {
          // File doesn't exist
        }
      }

      if (totalLogs === 0) return 0;

      // Calculate Shannon entropy of log levels
      let entropy = 0;
      for (const [, count] of logLevels) {
        const probability = count / totalLogs;
        entropy -= probability * Math.log2(probability);
      }

      // Normalize entropy (log2 of max possible unique levels)
      return Math.min(1.0, entropy / 3); // Assuming max 8 log levels
    } catch {
      return 0;
    }
  }

  private async calculateSpecMismatch(sessionDir: string): Promise<number> {
    // This would require comparing against known spec patterns
    // For now, return a placeholder based on failed replays
    try {
      const content = await fs.readFile(`${sessionDir}/logs/actions.replay.ndjson`, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // If we have replay data, check for failures
      return lines.length > 0 ? 0.2 : 0;
    } catch {
      return 0;
    }
  }

  private getDefaultMetrics(): ReasoningMetrics {
    return {
      error_density: 0.1,
      stacktrace_novelty: 0.1,
      context_span: 0.1,
      churn_score: 0.1,
      repeat_failures: 0.1,
      entropy_logs: 0.1,
      spec_mismatch: 0.1,
    };
  }
}
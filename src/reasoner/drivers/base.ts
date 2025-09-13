import { ReasonerTask, ReasonerResult, BackendConfig } from '../../types/index.js';

export interface DriverContext {
  sessionDir: string;
  timeout: number;
  redact: boolean;
}

export abstract class ReasonerDriver {
  protected config: BackendConfig;

  constructor(config: BackendConfig) {
    this.config = config;
  }

  abstract execute(task: ReasonerTask, context: DriverContext): Promise<ReasonerResult>;

  protected async applyRedaction(text: string): Promise<string> {
    if (!text) return text;

    // Common patterns to redact
    const patterns = [
      /Bearer\s+[A-Za-z0-9_-]+/g,           // Bearer tokens
      /sk-[A-Za-z0-9_-]{48,}/g,             // OpenAI API keys
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email addresses
      /\b\d{3}-?\d{2}-?\d{4}\b/g,           // Phone numbers
      /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, // Credit card numbers
    ];

    let redacted = text;
    for (const pattern of patterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }

    return redacted;
  }

  protected validateResult(result: any): ReasonerResult {
    // Ensure result conforms to ReasonerResult interface
    return {
      insights: Array.isArray(result.insights) ? result.insights : [],
      suspects: Array.isArray(result.suspects) ? result.suspects : [],
      patch_suggestion: result.patch_suggestion || undefined,
      next_steps: Array.isArray(result.next_steps) ? result.next_steps : [],
      notes: result.notes || '',
    };
  }

  protected buildSystemPrompt(): string {
    return `You are a code reasoning specialist. Output **only JSON** conforming to the provided schema. If unsure, include low confidence.
Prefer minimal, auditable conclusions with explicit evidence (log line ranges or file spans).`;
  }

  protected buildUserPrompt(task: ReasonerTask, artifacts: Record<string, string>): string {
    const schema = this.getSchemaForTask(task.task);
    
    let prompt = `Context: session=${task.sid}, task=${task.task}\n`;
    
    if (task.constraints && task.constraints.length > 0) {
      prompt += `Constraints: ${task.constraints.join(', ')}\n`;
    }
    
    prompt += `\nArtifacts:\n`;
    for (const [key, content] of Object.entries(artifacts)) {
      const preview = content.length > 2000 ? content.substring(0, 2000) + '...[truncated]' : content;
      prompt += `- ${key}: ${preview}\n`;
    }
    
    prompt += `\nSchema: ${JSON.stringify(schema)}\n`;
    
    prompt += `\nTask: ${this.getInstructionsForTask(task.task)}\n`;
    
    if (task.question) {
      prompt += `\nQuestion: ${task.question}\n`;
    }
    
    prompt += `\nGuardrails: Never output non-JSON text. Focus on evidence-based analysis.`;
    
    return prompt;
  }

  private getSchemaForTask(taskType: string): any {
    const baseSchema = {
      insights: [{ title: 'string', evidence: ['string'], confidence: 'number 0-1' }],
      suspects: [{ file: 'string', lines: ['number'], rationale: 'string' }],
      next_steps: ['string'],
      notes: 'string',
    };

    if (taskType === 'propose_patch') {
      return {
        ...baseSchema,
        patch_suggestion: 'string (diff format)',
      };
    }

    return baseSchema;
  }

  private getInstructionsForTask(taskType: string): string {
    switch (taskType) {
      case 'analyze_log':
        return `1. Identify error patterns and anomalies in logs
2. Correlate errors with user actions and timestamps
3. Suggest specific code locations that might be causing issues
4. Rate confidence based on evidence strength
5. Recommend next debugging steps`;

      case 'propose_patch':
        return `1. Analyze the issue based on provided logs and context
2. Identify the root cause in source code
3. Generate a minimal patch in diff format
4. Ensure the patch doesn't break existing functionality
5. Provide reasoning for the proposed changes`;

      case 'review_patch':
        return `1. Review the provided patch for correctness
2. Identify potential regressions or side effects
3. Check if the patch follows best practices
4. Suggest additional tests or validation steps
5. Rate the patch quality and safety`;

      default:
        return 'Analyze the provided data and return structured insights.';
    }
  }
}
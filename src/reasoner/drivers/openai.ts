import { ReasonerTask, ReasonerResult, BackendConfig } from '../../types/index.js';
import { ReasonerDriver, DriverContext } from './base.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  response_format?: { type: 'json_object' };
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class OpenAIDriver extends ReasonerDriver {
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(config: BackendConfig) {
    super(config);
    this.baseUrl = config.base_url || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-4.1-mini';
    
    const apiKeyEnv = config.api_key_env || 'OPENAI_API_KEY';
    this.apiKey = process.env[apiKeyEnv] || '';
    
    if (!this.apiKey) {
      throw new Error(`API key not found in environment variable: ${apiKeyEnv}`);
    }
  }

  async execute(task: ReasonerTask, context: DriverContext): Promise<ReasonerResult> {
    try {
      // Load and process artifacts
      const artifacts = await this.loadArtifacts(task, context);
      
      // Apply redaction if enabled
      const processedArtifacts: Record<string, string> = {};
      for (const [key, content] of Object.entries(artifacts)) {
        processedArtifacts[key] = context.redact ? await this.applyRedaction(content) : content;
      }

      // Build messages
      const messages: OpenAIMessage[] = [
        {
          role: 'system',
          content: this.buildSystemPrompt(),
        },
        {
          role: 'user',
          content: this.buildUserPrompt(task, processedArtifacts),
        },
      ];

      // Build request
      const request: OpenAIRequest = {
        model: this.model,
        messages,
        max_tokens: task.model_prefs?.max_tokens || 4000,
        temperature: task.model_prefs?.temperature || 0.2,
        response_format: { type: 'json_object' },
      };

      // Execute request with timeout
      const result = await this.executeWithTimeout(request, context.timeout);
      
      // Parse and validate result
      const parsed = JSON.parse(result);
      return this.validateResult(parsed);

    } catch (error) {
      console.error('[VDT] OpenAI execution failed:', error);
      throw new Error(`OpenAI execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async loadArtifacts(task: ReasonerTask, context: DriverContext): Promise<Record<string, string>> {
    const artifacts: Record<string, string> = {};

    // Load log files
    if (task.inputs.logs) {
      for (const logLink of task.inputs.logs) {
        try {
          const logPath = this.vdtLinkToPath(logLink, context.sessionDir);
          const content = await import('fs/promises').then(fs => fs.readFile(logPath, 'utf-8'));
          artifacts[`log_${logLink.split('/').pop()}`] = content;
        } catch (error) {
          console.warn(`[VDT] Failed to load log file ${logLink}:`, error);
        }
      }
    }

    // Load BugLens report
    if (task.inputs.buglens) {
      try {
        const buglensPath = this.vdtLinkToPath(task.inputs.buglens, context.sessionDir);
        const content = await import('fs/promises').then(fs => fs.readFile(buglensPath, 'utf-8'));
        artifacts['buglens'] = content;
      } catch (error) {
        console.warn(`[VDT] Failed to load BugLens file ${task.inputs.buglens}:`, error);
      }
    }

    // Load source code files
    if (task.inputs.code) {
      for (const codeLink of task.inputs.code) {
        try {
          const codePath = this.fileLinkToPath(codeLink);
          const content = await import('fs/promises').then(fs => fs.readFile(codePath, 'utf-8'));
          artifacts[`code_${codeLink.split('/').pop()}`] = content;
        } catch (error) {
          console.warn(`[VDT] Failed to load code file ${codeLink}:`, error);
        }
      }
    }

    // Load diff file
    if (task.inputs.diff) {
      try {
        const diffPath = this.vdtLinkToPath(task.inputs.diff, context.sessionDir);
        const content = await import('fs/promises').then(fs => fs.readFile(diffPath, 'utf-8'));
        artifacts['diff'] = content;
      } catch (error) {
        console.warn(`[VDT] Failed to load diff file ${task.inputs.diff}:`, error);
      }
    }

    return artifacts;
  }

  private vdtLinkToPath(vdtLink: string, sessionDir: string): string {
    // Convert vdt://sessions/{sid}/path to actual file path
    const match = vdtLink.match(/^vdt:\/\/sessions\/[^/]+\/(.+)$/);
    if (!match) {
      throw new Error(`Invalid VDT link format: ${vdtLink}`);
    }
    return `${sessionDir}/${match[1]}`;
  }

  private fileLinkToPath(fileLink: string): string {
    // Convert file://path to actual file path
    if (fileLink.startsWith('file://')) {
      return fileLink.substring(7);
    }
    return fileLink;
  }

  private async executeWithTimeout(request: OpenAIRequest, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data: OpenAIResponse = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response choices returned from OpenAI');
      }

      return data.choices[0].message.content;

    } catch (error) {
      clearTimeout(timeout);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      
      throw error;
    }
  }
}
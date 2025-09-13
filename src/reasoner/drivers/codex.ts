import { spawn } from 'child_process';
import { ReasonerTask, ReasonerResult, BackendConfig } from '../../types/index.js';
import { ReasonerDriver, DriverContext } from './base.js';

export class CodexDriver extends ReasonerDriver {
  constructor(config: BackendConfig) {
    super(config);
  }

  async execute(task: ReasonerTask, context: DriverContext): Promise<ReasonerResult> {
    if (this.config.type === 'mcp') {
      return await this.executeMCP(task, context);
    } else if (this.config.type === 'cli') {
      return await this.executeCLI(task, context);
    } else {
      throw new Error(`Unsupported Codex backend type: ${this.config.type}`);
    }
  }

  private async executeMCP(task: ReasonerTask, context: DriverContext): Promise<ReasonerResult> {
    // For MCP mode, we'll use a simplified approach since the MCP protocol
    // would be handled externally by Claude adding the codex MCP
    throw new Error('MCP mode should be handled by Claude adding codex MCP externally');
  }

  private async executeCLI(task: ReasonerTask, context: DriverContext): Promise<ReasonerResult> {
    try {
      // Load and process artifacts
      const artifacts = await this.loadArtifacts(task, context);
      
      // Apply redaction if enabled
      const processedArtifacts: Record<string, string> = {};
      for (const [key, content] of Object.entries(artifacts)) {
        processedArtifacts[key] = context.redact ? await this.applyRedaction(content) : content;
      }

      // Build prompts
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(task, processedArtifacts);

      // Construct the full prompt for codex exec
      const fullPrompt = `System: ${systemPrompt}

User: ${userPrompt}`;

      // Execute codex CLI
      const result = await this.runCodexCLI(fullPrompt, context.timeout);
      
      // Parse and validate result
      const parsed = JSON.parse(result);
      return this.validateResult(parsed);

    } catch (error) {
      console.error('[VDT] Codex execution failed:', error);
      throw new Error(`Codex execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  private async runCodexCLI(prompt: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const cmd = this.config.cmd || 'codex';
      const args = this.config.args || ['-m', 'gpt-5', '-c', 'model_reasoning_effort=high', 'exec'];
      
      // Add exec command if not already present
      if (!args.includes('exec')) {
        args.push('exec');
      }

      const child = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Codex process exited with code ${code}. Stderr: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to start codex process: ${error.message}`));
      });

      // Set timeout
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Codex execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on('close', () => {
        clearTimeout(timeout);
      });

      // Send prompt to stdin
      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}
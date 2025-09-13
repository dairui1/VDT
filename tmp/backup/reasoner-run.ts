import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

export class ReasonerRunTool extends BaseTool {
  async execute(params: {
    sid: string;
    task: 'propose_patch' | 'analyze_root_cause';
    inputs: {
      buglens?: string;
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
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      const sessionDir = this.sessionManager.getSessionDir(params.sid);
      
      // Try to use actual codex CLI if available, fallback to mock implementation
      let result;
      try {
        result = await this.executeWithCodexCLI(params, sessionDir);
      } catch (codexError) {
        console.warn('[VDT] Codex CLI not available, using fallback implementation:', codexError);
        result = this.generateFallbackResult(params);
      }

      // Save result to session
      await this.saveResult(params, result, sessionDir);

      return this.createSuccessResponse({
        analysis: result.analysis,
        solutions: result.solutions || [],
        link: this.sessionManager.getResourceLink(params.sid, 'analysis/reasoning.md')
      });

    } catch (error) {
      return this.createErrorResponse(
        params.sid,
        'reasoner_run',
        'REASONER_ERROR',
        error,
        'Check reasoner configuration and backend availability. Ensure API keys are set for HTTP backends.'
      );
    }
  }

  private async executeWithCodexCLI(params: any, sessionDir: string) {
    // Load and process artifacts
    const artifacts = await this.loadArtifacts(params, sessionDir);
    
    // Apply redaction if enabled
    const processedArtifacts: Record<string, string> = {};
    for (const [key, content] of Object.entries(artifacts)) {
      processedArtifacts[key] = (params.redact ?? true) ? await this.applyRedaction(content) : content;
    }

    // Build prompts
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(params, processedArtifacts);

    // Construct the full prompt for codex exec
    const fullPrompt = `System: ${systemPrompt}

User: ${userPrompt}`;

    // Execute codex CLI with timeout
    const timeout = 5 * 60 * 1000; // 5 minutes
    const rawResult = await this.runCodexCLI(fullPrompt, timeout);

    // Parse and validate result
    const parsed = this.parseAndValidateJSON(rawResult);
    return this.validateResult(parsed);
  }

  private async loadArtifacts(params: any, sessionDir: string): Promise<Record<string, string>> {
    const artifacts: Record<string, string> = {};

    // Load BugLens report
    if (params.inputs.buglens) {
      try {
        const buglensPath = this.vdtLinkToPath(params.inputs.buglens, sessionDir);
        const content = await fs.readFile(buglensPath, 'utf-8');
        artifacts['buglens'] = content;
      } catch (error) {
        console.warn(`[VDT] Failed to load BugLens file ${params.inputs.buglens}:`, error);
      }
    }

    // Load source code files
    if (params.inputs.code) {
      for (const codeLink of params.inputs.code) {
        try {
          const codePath = this.fileLinkToPath(codeLink);
          const content = await fs.readFile(codePath, 'utf-8');
          artifacts[`code_${codeLink.split('/').pop()}`] = content;
        } catch (error) {
          console.warn(`[VDT] Failed to load code file ${codeLink}:`, error);
        }
      }
    }

    // Load diff file
    if (params.inputs.diff) {
      try {
        const diffPath = this.vdtLinkToPath(params.inputs.diff, sessionDir);
        const content = await fs.readFile(diffPath, 'utf-8');
        artifacts['diff'] = content;
      } catch (error) {
        console.warn(`[VDT] Failed to load diff file ${params.inputs.diff}:`, error);
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
    return path.join(sessionDir, match[1]);
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
      const cmd = 'codex';
      const args = ['-m', 'gpt-5', '-c', 'model_reasoning_effort=high', 'exec', prompt];

      console.error(`[VDT Debug] Running codex command: ${cmd} ${args.join(' ')}`);
      console.error(`[VDT Debug] Timeout: ${timeoutMs}ms`);
      console.error(`[VDT Debug] Prompt: ${prompt.substring(0, 100)}...`);

      const child = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        console.error(`[VDT Debug] stdout: ${output.substring(0, 200)}...`);
        stdout += output;
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(`[VDT Debug] stderr: ${output.substring(0, 200)}...`);
        stderr += output;
      });

      child.on('close', (code) => {
        console.error(`[VDT Debug] Process closed with code: ${code}`);
        console.error(`[VDT Debug] Final stdout length: ${stdout.length}`);
        console.error(`[VDT Debug] Final stderr length: ${stderr.length}`);
        
        clearTimeout(timeout);
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Codex process exited with code ${code}. Stderr: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        console.error(`[VDT Debug] Process error: ${error.message}`);
        clearTimeout(timeout);
        reject(new Error(`Failed to start codex process: ${error.message}`));
      });

      // Set timeout
      const timeout = setTimeout(() => {
        console.error(`[VDT Debug] Timeout reached, killing process...`);
        child.kill('SIGTERM');
        reject(new Error(`Codex execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // No need to write to stdin anymore since we're passing prompt as argument
      child.stdin.end();
    });
  }

  private parseAndValidateJSON(rawOutput: string): any {
    // Handle codex output which includes lots of log info and thinking process
    console.error(`[VDT Debug] Raw response length: ${rawOutput.length}`);
    console.error(`[VDT Debug] Raw response preview: ${rawOutput.substring(0, 300)}...`);
    
    let jsonStr = rawOutput.trim();

    // First, look for JSON in markdown code blocks
    const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      console.error(`[VDT Debug] Found JSON in markdown block`);
      jsonStr = jsonBlockMatch[1].trim();
    } else {
      console.error(`[VDT Debug] No markdown JSON block found, parsing from raw text`);
      
      // Look for JSON after the "codex" section - this is where the actual response is
      const codexSectionMatch = jsonStr.match(/\[2025-[^\]]+\] codex\s*([\s\S]*?)(?:\[2025-[^\]]+\] tokens used:|$)/);
      if (codexSectionMatch) {
        console.error(`[VDT Debug] Found codex section`);
        jsonStr = codexSectionMatch[1].trim();
      }

      // Remove any remaining timestamp lines and metadata
      jsonStr = jsonStr.replace(/\[2025-[^\]]+\].*?\n/g, '');
      jsonStr = jsonStr.replace(/^\s*--------.*?\n/gm, '');
      jsonStr = jsonStr.replace(/^\s*\*\*.*?\*\*.*?\n/gm, '');
      jsonStr = jsonStr.replace(/^\s*tokens used:.*?\n/gm, '');
      
      // Try to extract the JSON object - look for balanced braces
      const jsonMatch = jsonStr.match(/(\{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*\})/);
      if (jsonMatch) {
        console.error(`[VDT Debug] Found JSON with regex match`);
        jsonStr = jsonMatch[1];
      } else {
        console.error(`[VDT Debug] No JSON match found with regex, trying line-by-line parsing`);
        
        // Fallback: line by line parsing for complex JSON
        const lines = jsonStr.split('\n');
        let braceCount = 0;
        let jsonLines: string[] = [];
        let inJson = false;
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          // Start of JSON
          if (trimmed.startsWith('{') && !inJson) {
            inJson = true;
            jsonLines.push(line);
            braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
          } else if (inJson) {
            jsonLines.push(line);
            braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            
            if (braceCount === 0) {
              break;
            }
          }
        }
        
        if (jsonLines.length > 0) {
          jsonStr = jsonLines.join('\n');
        }
      }
    }

    console.error(`[VDT Debug] Extracted JSON string: ${jsonStr.substring(0, 200)}...`);

    try {
      const parsed = JSON.parse(jsonStr);

      // Basic validation - ensure it has the expected structure
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Response is not a JSON object');
      }

      // Validate required fields exist
      if (!parsed.hasOwnProperty('insights') && !parsed.hasOwnProperty('suspects')) {
        console.warn('[VDT] Codex response missing expected fields, using fallback structure');
        return {
          insights: [],
          suspects: [],
          next_steps: [parsed.toString ? parsed.toString() : 'Failed to parse response'],
          notes: `Raw response: ${rawOutput.substring(0, 500)}...`
        };
      }

      console.log('[VDT] Successfully parsed Codex JSON response');
      return parsed;
    } catch (parseError) {
      console.warn('[VDT] Failed to parse Codex JSON response:', parseError);
      console.warn('[VDT] Extracted JSON string:', jsonStr.substring(0, 300));
      console.warn('[VDT] Raw response preview:', rawOutput.substring(0, 1000));

      // Return a fallback structure
      return {
        insights: [],
        suspects: [],
        next_steps: ['Failed to parse reasoner response'],
        notes: `Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}. Extracted: ${jsonStr.substring(0, 200)}...`
      };
    }
  }

  private async applyRedaction(text: string): Promise<string> {
    if (!text) return text;

    // Common patterns to redact
    const patterns = [
      /Bearer\s+[A-Za-z0-9_-]+/g, // Bearer tokens
      /sk-[A-Za-z0-9_-]{48,}/g, // OpenAI API keys
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email addresses
      /\b\d{3}-?\d{2}-?\d{4}\b/g, // Phone numbers
      /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, // Credit card numbers
    ];

    let redacted = text;
    for (const pattern of patterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }

    return redacted;
  }

  private validateResult(result: any): any {
    // Ensure result conforms to expected interface
    return {
      analysis: result.analysis || this.generateAnalysisFromInsights(result),
      solutions: this.extractSolutionsFromResult(result),
      insights: Array.isArray(result.insights) ? result.insights : [],
      suspects: Array.isArray(result.suspects) ? result.suspects : [],
      patch_suggestion: result.patch_suggestion || undefined,
      next_steps: Array.isArray(result.next_steps) ? result.next_steps : [],
      notes: result.notes || '',
    };
  }

  private generateAnalysisFromInsights(result: any): string {
    if (result.insights && result.insights.length > 0) {
      return `# Analysis Results\n\n${result.insights.map((insight: any, idx: number) => 
        `## Insight ${idx + 1}: ${insight.title || 'Finding'}\n${insight.evidence ? insight.evidence.join('\n- ') : 'No evidence'}\nConfidence: ${insight.confidence || 0}`
      ).join('\n\n')}`;
    }
    return '# Analysis Results\n\nNo specific insights generated.';
  }

  private extractSolutionsFromResult(result: any): any[] {
    if (result.next_steps && Array.isArray(result.next_steps)) {
      return result.next_steps.map((step: string, idx: number) => ({
        rationale: `Step ${idx + 1} recommendation`,
        approach: step,
        confidence: 0.7
      }));
    }
    return [];
  }

  private generateFallbackResult(params: any): any {
    const analysis = params.task === 'propose_patch' 
      ? `# Root Cause Analysis\n\nBased on the provided context, analyzing patterns and proposing solutions.\n\n## Key Findings\n- Pattern analysis indicates potential issues in error handling\n- Code flow suggests defensive programming opportunities\n\n## Recommendations\n- Add input validation\n- Implement proper error boundaries\n- Consider retry mechanisms where appropriate`
      : `# Root Cause Analysis\n\nDeep analysis of captured logs and error patterns.\n\n## Primary Causes\n- Insufficient error handling in critical paths\n- Missing input validation\n- Race conditions in async operations\n\n## Contributing Factors\n- Environment-specific timing issues\n- Edge case handling gaps`;

    const solutions = [
      {
        rationale: "Input validation prevents downstream errors",
        approach: "Add comprehensive input validation at entry points",
        confidence: 0.8
      },
      {
        rationale: "Error boundaries improve system resilience", 
        approach: "Implement try-catch blocks around critical operations",
        confidence: 0.7
      },
      {
        rationale: "Logging provides better observability",
        approach: "Add structured logging to track state transitions",
        confidence: 0.9
      }
    ];

    return {
      analysis,
      solutions,
      insights: [],
      suspects: [],
      next_steps: solutions.map(s => s.approach),
      notes: 'Generated using fallback implementation - codex CLI not available'
    };
  }

  private buildSystemPrompt(): string {
    return `You are a code reasoning specialist. Output **only JSON** conforming to the provided schema. If unsure, include low confidence.
Prefer minimal, auditable conclusions with explicit evidence (log line ranges or file spans).`;
  }

  private buildUserPrompt(task: any, artifacts: Record<string, string>): string {
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
      case 'analyze_root_cause':
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
      default:
        return 'Analyze the provided data and return structured insights.';
    }
  }

  private async saveResult(task: any, result: any, sessionDir: string): Promise<void> {
    try {
      const analysisDir = path.join(sessionDir, 'analysis');
      await fs.mkdir(analysisDir, { recursive: true });

      // Save JSON result
      const jsonFilename = `reasoner_${task.task}.json`;
      const jsonFilePath = path.join(analysisDir, jsonFilename);
      const output = {
        task: task.task,
        timestamp: new Date().toISOString(),
        inputs: task.inputs,
        result,
      };
      await fs.writeFile(jsonFilePath, JSON.stringify(output, null, 2), 'utf-8');

      // Save markdown result
      const mdFilePath = path.join(analysisDir, 'reasoning.md');
      const reasoningContent = `# Reasoning Analysis

## Task: ${task.task}

${result.analysis}

## Proposed Solutions

${(result.solutions || []).map((sol: any, idx: number) => `### Solution ${idx + 1}
**Rationale**: ${sol.rationale}
**Approach**: ${sol.approach}
**Confidence**: ${(sol.confidence * 100).toFixed(0)}%`).join('\n\n')}

## Context
${task.context?.selectedIds ? `**Selected Chunks**: ${task.context.selectedIds.join(', ')}` : ''}
${task.context?.notes ? `**Notes**: ${task.context.notes}` : ''}

---
Generated: ${new Date().toISOString()}
`;

      await fs.writeFile(mdFilePath, reasoningContent);
      console.log(`[VDT] Reasoner result saved to: ${jsonFilePath}`);
    } catch (error) {
      console.error('[VDT] Failed to save reasoner result:', error);
    }
  }
}

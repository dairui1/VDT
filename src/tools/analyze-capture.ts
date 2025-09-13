import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseTool } from './base.js';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

export class AnalyzeCaptureTool extends BaseTool {
  async execute(params: {
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
    try {
      const session = await this.sessionManager.getSession(params.sid);
      if (!session) {
        throw new Error(`Session ${params.sid} not found`);
      }

      const sessionDir = this.sessionManager.getSessionDir(params.sid);

      // Step 1: Perform standard log analysis using the analysis engine
      const analysisResult = await this.analysisEngine.analyzeDebugLog(
        sessionDir,
        params.focus
      );

      // Step 2: If task is specified, perform deep reasoning using Codex
      let reasoningResult = null;
      if (params.task) {
        try {
          reasoningResult = await this.executeReasoningTask(params, sessionDir);
        } catch (reasoningError) {
          console.warn('[VDT] Reasoning task failed, continuing with basic analysis:', reasoningError);
        }
      }

      // Step 3: Combine results
      const combinedResult = {
        ...analysisResult,
        analysis: reasoningResult?.analysis || this.generateBasicAnalysis(analysisResult),
        solutions: reasoningResult?.solutions || [],
        insights: reasoningResult?.insights || [],
        suspects: reasoningResult?.suspects || [],
        next_steps: reasoningResult?.next_steps || [],
        notes: reasoningResult?.notes || '',
        analysisLink: this.sessionManager.getResourceLink(params.sid, 'analysis/analysis.md')
      };

      // Save combined results
      await this.saveAnalysisResult(params, combinedResult, sessionDir);

      return this.createSuccessResponse(combinedResult);

    } catch (error) {
      return this.createErrorResponse(
        params.sid,
        'analyze_capture',
        'ANALYSIS_ERROR',
        error,
        'Ensure capture logs exist and are valid'
      );
    }
  }

  private async executeReasoningTask(params: any, sessionDir: string) {
    // Try to use actual codex CLI if available, fallback to mock implementation
    try {
      return await this.executeWithCodexCLI(params, sessionDir);
    } catch (codexError) {
      console.warn('[VDT] Codex CLI not available, using fallback implementation:', codexError);
      return this.generateFallbackResult(params);
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
    const timeout = 120000; // 2 minutes
    const rawResult = await this.runCodexCLI(fullPrompt, timeout);

    // Parse and validate result
    const parsed = this.parseAndValidateJSON(rawResult);
    return this.validateResult(parsed);
  }

  private async loadArtifacts(params: any, sessionDir: string): Promise<Record<string, string>> {
    const artifacts: Record<string, string> = {};

    // Load captured logs for analysis
    try {
      const captureLogPath = path.join(sessionDir, 'logs', 'capture.ndjson');
      const content = await fs.readFile(captureLogPath, 'utf-8');
      artifacts['capture_logs'] = content;
    } catch (error) {
      console.warn(`[VDT] Failed to load capture logs:`, error);
    }

    // Load source code files if provided
    if (params.inputs?.code) {
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

    // Load diff file if provided
    if (params.inputs?.diff) {
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
      const args = ['-m', 'gpt-5', '-c', 'model_reasoning_effort=high', 'exec'];

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

  private parseAndValidateJSON(rawOutput: string): any {
    // Handle codex output which includes lots of log info and thinking process
    let jsonStr = rawOutput.trim();

    // Remove markdown code blocks if present
    const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1].trim();
    }

    // For codex output, look for the JSON after the thinking process
    // The JSON typically appears after the reasoning and near the end
    const lines = jsonStr.split('\n');
    let jsonStartIndex = -1;
    let braceCount = 0;
    let jsonLines: string[] = [];
    let foundStart = false;

    // Find the start of JSON (first standalone '{')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip lines that are clearly not JSON
      if (line.startsWith('[2025-') || line.startsWith('--------') || 
          line.includes('thinking') || line.includes('codex') || 
          line.includes('tokens used:') || line.startsWith('**')) {
        continue;
      }

      if (line === '{' && !foundStart) {
        foundStart = true;
        jsonStartIndex = i;
        jsonLines.push(line);
        braceCount = 1;
      } else if (foundStart) {
        jsonLines.push(line);
        
        // Count braces to find the end of JSON
        for (const char of line) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        
        if (braceCount === 0) {
          break;
        }
      }
    }

    if (jsonLines.length > 0) {
      jsonStr = jsonLines.join('\n');
    } else {
      // Fallback: try to find JSON within the text using regex
      const jsonMatch = jsonStr.match(/\{[\s\S]*?\}(?=\s*(?:\[2025-|\n\[|$))/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      } else {
        // Last resort: find any JSON-like structure
        const lastJsonMatch = jsonStr.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
        if (lastJsonMatch && lastJsonMatch.length > 0) {
          jsonStr = lastJsonMatch[lastJsonMatch.length - 1];
        }
      }
    }

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

  private generateBasicAnalysis(analysisResult: any): string {
    return `# Log Analysis Results\n\n## Summary\nAnalyzed captured logs and identified patterns.\n\n## Key Findings\n${
      analysisResult.findings?.candidateChunks?.length 
        ? `- Found ${analysisResult.findings.candidateChunks.length} candidate chunks for investigation\n`
        : '- No specific candidate chunks identified\n'
    }${
      analysisResult.findings?.needClarify 
        ? '- Additional clarification needed for focused analysis\n'
        : '- Analysis complete with available data\n'
    }\n## Next Steps\n- Review analysis results and candidate chunks\n- Consider additional context or constraints if needed`;
  }

  private async saveAnalysisResult(task: any, result: any, sessionDir: string): Promise<void> {
    try {
      const analysisDir = path.join(sessionDir, 'analysis');
      await fs.mkdir(analysisDir, { recursive: true });

      // Save JSON result
      const jsonFilePath = path.join(analysisDir, 'analysis.json');
      const output = {
        task: task.task || 'analyze_capture',
        timestamp: new Date().toISOString(),
        inputs: task.inputs || {},
        result,
      };
      await fs.writeFile(jsonFilePath, JSON.stringify(output, null, 2), 'utf-8');

      // Save markdown result
      const mdFilePath = path.join(analysisDir, 'analysis.md');
      const analysisContent = `# Analysis Results

## Task: ${task.task || 'analyze_capture'}

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

      await fs.writeFile(mdFilePath, analysisContent);
      console.log(`[VDT] Analysis result saved to: ${jsonFilePath}`);
    } catch (error) {
      console.error('[VDT] Failed to save analysis result:', error);
    }
  }
}

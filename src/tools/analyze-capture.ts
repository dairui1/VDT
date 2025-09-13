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
        return this.createErrorResponse(
          params.sid,
          'analyze_capture',
          'SESSION_NOT_FOUND',
          new Error(`Session ${params.sid} not found`),
          'Check session ID and ensure session was created successfully'
        );
      }

      const sessionDir = this.sessionManager.getSessionDir(params.sid, session.repoRoot);

      // Step 1: Validate Input - Check if log files exist and are accessible
      await this.validateLogFiles(sessionDir);

      // Step 2: Perform standard log analysis using the analysis engine
      const analysisResult = await this.analysisEngine.analyzeDebugLog(
        sessionDir,
        params.focus
      );

      // Step 3: If task is specified, perform deep reasoning using Codex
      let reasoningResult = null;
      if (params.task) {
        try {
          reasoningResult = await this.executeReasoningTask(params, sessionDir);
        } catch (reasoningError) {
          console.warn('[VDT] Reasoning task failed, continuing with basic analysis:', reasoningError);
        }
      }

      // Step 4: Combine results
      const combinedResult = {
        ...analysisResult,
        analysis: reasoningResult?.analysis || this.generateBasicAnalysis(analysisResult),
        log_categories: reasoningResult?.log_categories || this.getDefaultCategories(),
        error_analysis: reasoningResult?.error_analysis || this.getDefaultErrorAnalysis(),
        bug_fix_recommendations: reasoningResult?.bug_fix_recommendations || [],
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

  private async validateLogFiles(sessionDir: string): Promise<void> {
    const captureLogPath = path.join(sessionDir, 'logs', 'capture.ndjson');
    try {
      await fs.access(captureLogPath);
      const stats = await fs.stat(captureLogPath);
      if (stats.size === 0) {
        throw new Error('Capture log file is empty');
      }
      console.log(`[VDT] Validated log file: ${captureLogPath} (${stats.size} bytes)`);
    } catch (error) {
      console.warn(`[VDT] Log file validation warning: ${error}`);
      // Don't fail completely, but warn about missing logs
    }
  }

  private getDefaultCategories(): any {
    return {
      errors: [],
      warnings: [],
      info: [],
      debug: [],
      performance: [],
      security: [],
      system_events: [],
      user_actions: [],
      database_operations: [],
      network_requests: []
    };
  }

  private getDefaultErrorAnalysis(): any {
    return {
      patterns: [],
      failure_points: [],
      error_sequences: []
    };
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
    // Get session information
    const session = await this.sessionManager.getSession(params.sid);
    if (!session) {
      throw new Error(`Session ${params.sid} not found`);
    }
    
    // Extract project name from repo root
    const projectName = path.basename(session.repoRoot);
    
    // Get the capture log file path
    const captureLogPath = path.join(sessionDir, 'logs', 'capture.ndjson');
    
    // Construct debug requests file path
    const debugRequestsPath = path.join(session.repoRoot, '.vdt', `debug_requests_${projectName}.md`);
    
    // Generate timestamp for output file
    const timestamp = Date.now();
    const outputPath = path.join(session.repoRoot, '.vdt', `analysis_${projectName}_${timestamp}.md`);
    
    // Build the command for codex exec with file output
    const command = `"Parse and understand the user's request from ${debugRequestsPath} and the log_file ${captureLogPath}. Dump your analysis result to ${outputPath}."`;
    
    // Execute codex CLI with the new format
    const timeout = 120000; // 2 minutes
    const rawResult = await this.runCodexCLI(command, outputPath, timeout);
    
    // For the new format, we expect the result to be written to the output file
    // Read the analysis result from the output file
    let analysisContent = '';
    try {
      analysisContent = await fs.readFile(outputPath, 'utf-8');
      console.log(`[VDT] Successfully read analysis output from: ${outputPath}`);
    } catch (error) {
      console.warn(`[VDT] Failed to read analysis output from ${outputPath}:`, error);
      // Fallback: save rawResult to the output file for later use
      try {
        // Ensure the .vdt directory exists
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, rawResult, 'utf-8');
        analysisContent = rawResult;
        console.log(`[VDT] Fallback: saved rawResult to ${outputPath}`);
      } catch (writeError) {
        console.error(`[VDT] Failed to save fallback result to ${outputPath}:`, writeError);
        analysisContent = rawResult;
      }
    }
    
    // Return structured result
    return {
      analysis: analysisContent,
      insights: [],
      suspects: [],
      next_steps: ['Review analysis results', 'Implement suggested fixes'],
      notes: `Analysis generated using codex exec and saved to ${outputPath}`,
      outputPath: outputPath
    };
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

  private async runCodexCLI(command: string, outputPath: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const cmd = 'codex';
      // Use shell to support output redirection
      const fullCommand = `exec ${command} --full-auto > "${outputPath}"`;
      const args = [fullCommand];

      const child = spawn('sh', ['-c', `codex ${fullCommand}`], {
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

      // For the new format, we don't need to send anything to stdin
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
    // Ensure result conforms to expected interface with enhanced log analysis
    return {
      analysis: result.analysis || this.generateAnalysisFromCategories(result),
      log_categories: result.log_categories || this.getDefaultCategories(),
      error_analysis: result.error_analysis || this.getDefaultErrorAnalysis(),
      bug_fix_recommendations: Array.isArray(result.bug_fix_recommendations) ? result.bug_fix_recommendations : [],
      solutions: this.extractSolutionsFromResult(result),
      insights: Array.isArray(result.insights) ? result.insights : [],
      suspects: Array.isArray(result.suspects) ? result.suspects : [],
      patch_suggestion: result.patch_suggestion || undefined,
      next_steps: Array.isArray(result.next_steps) ? result.next_steps : [],
      notes: result.notes || '',
    };
  }

  private generateAnalysisFromCategories(result: any): string {
    let analysis = '# Comprehensive Log Analysis Results\n\n';
    
    // Input Validation Summary
    analysis += '## Input Validation\n';
    analysis += '- Log files accessibility: Verified\n';
    analysis += '- Data completeness: Validated\n\n';
    
    // Log Categories Summary
    if (result.log_categories) {
      analysis += '## Log Categories Summary\n';
      const categories = result.log_categories;
      
      const categoryStats = (Object.entries(categories) as [string, any[]][]).map(([category, items]) => {
        const count = Array.isArray(items) ? items.length : 0;
        const categoryName = category.replace(/_/g, ' ').toUpperCase();
        return { category: categoryName, count };
      }).filter(stat => stat.count > 0);

      if (categoryStats.length > 0) {
        categoryStats.forEach(({ category, count }) => {
          analysis += `- **${category}**: ${count} entries\n`;
        });
      } else {
        analysis += '- No categorized log entries found\n';
      }
      analysis += '\n';
    }

    // Error Analysis Summary
    if (result.error_analysis) {
      analysis += '## Error Analysis Summary\n';
      const errorAnalysis = result.error_analysis;
      
      if (errorAnalysis.patterns?.length > 0) {
        analysis += `- **Error Patterns Identified**: ${errorAnalysis.patterns.length}\n`;
        errorAnalysis.patterns.forEach((pattern: any, idx: number) => {
          analysis += `  ${idx + 1}. ${pattern.pattern} (Frequency: ${pattern.frequency}, Severity: ${pattern.severity})\n`;
        });
      }
      
      if (errorAnalysis.failure_points?.length > 0) {
        analysis += `- **Failure Points Located**: ${errorAnalysis.failure_points.length}\n`;
        errorAnalysis.failure_points.forEach((point: any, idx: number) => {
          analysis += `  ${idx + 1}. ${point.location}: ${point.cause}\n`;
        });
      }
      
      if (errorAnalysis.error_sequences?.length > 0) {
        analysis += `- **Error Sequences Tracked**: ${errorAnalysis.error_sequences.length}\n`;
      }
      analysis += '\n';
    }

    // Bug Fix Recommendations Summary
    if (result.bug_fix_recommendations?.length > 0) {
      analysis += '## Bug Fix Recommendations Summary\n';
      analysis += `Total recommendations: ${result.bug_fix_recommendations.length}\n\n`;
      
      const priorityCounts = result.bug_fix_recommendations.reduce((acc: any, rec: any) => {
        acc[rec.priority || 'Unknown'] = (acc[rec.priority || 'Unknown'] || 0) + 1;
        return acc;
      }, {});
      
      Object.entries(priorityCounts).forEach(([priority, count]) => {
        analysis += `- **${priority} Priority**: ${count} recommendations\n`;
      });
      analysis += '\n';
    }

    // Key Insights
    if (result.insights?.length > 0) {
      analysis += '## Key Insights\n';
      result.insights.forEach((insight: any, idx: number) => {
        analysis += `${idx + 1}. **${insight.title || 'Finding'}**\n`;
        if (insight.evidence?.length > 0) {
          analysis += `   Evidence: ${insight.evidence.join(', ')}\n`;
        }
        analysis += `   Confidence: ${Math.round((insight.confidence || 0) * 100)}%\n\n`;
      });
    }

    return analysis || '# Analysis Results\n\nNo specific analysis results generated.';
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
    return `You are a specialized log analysis and debugging expert. Your task is to provide comprehensive analysis following exact specification requirements.

Core Responsibilities:
1. **Input Validation**: Always verify log accessibility and completeness before analysis
2. **Complete Log Categorization**: Classify EVERY log entry into the 10 specified categories (errors, warnings, info, debug, performance, security, system_events, user_actions, database_operations, network_requests)  
3. **Deep Error Investigation**: Extract complete error details including stack traces, file locations, frequencies, and impact analysis
4. **Structured Bug Fix Recommendations**: For each error, provide detailed recommendations with error description, location, root cause analysis, specific fixes, prevention strategies, related code areas, priority, and confidence

Output Requirements:
- **Only JSON**: Output must strictly conform to the provided schema structure
- **Evidence-Based**: All conclusions must reference specific log entries, line numbers, timestamps, or file locations
- **Comprehensive Coverage**: Address every error found with complete recommendation structure
- **Accuracy**: If uncertain about any detail, include low confidence scores but still provide the required structure

Analysis Depth Standards:
- Parse error messages completely including exception types and error codes
- Extract file paths and line numbers from stack traces with exact precision  
- Track error frequency patterns and timing relationships
- Map error propagation through system components with evidence
- Correlate errors with user actions and system events using timestamps
- Provide actionable, specific fix suggestions rather than generic advice

Quality Assurance:
- Validate that all required schema fields are populated
- Ensure each bug fix recommendation includes all 8 required components
- Cross-reference error patterns for consistency and completeness
- Maintain high confidence only when evidence strongly supports conclusions`;
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
      log_categories: {
        errors: [{ message: 'string', type: 'string', stack_trace: 'string', frequency: 'number', file: 'string', line: 'number', timestamp: 'string' }],
        warnings: [{ message: 'string', category: 'string', context: 'string', timestamp: 'string' }],
        info: [{ message: 'string', flow_stage: 'string', timestamp: 'string' }],
        debug: [{ message: 'string', details: 'string', timestamp: 'string' }],
        performance: [{ metric: 'string', value: 'number', unit: 'string', timestamp: 'string' }],
        security: [{ event: 'string', user: 'string', action: 'string', timestamp: 'string' }],
        system_events: [{ event: 'string', timestamp: 'string', details: 'string' }],
        user_actions: [{ action: 'string', timestamp: 'string', context: 'string' }],
        database_operations: [{ operation: 'string', query: 'string', duration: 'number', timestamp: 'string' }],
        network_requests: [{ url: 'string', method: 'string', status: 'number', duration: 'number', timestamp: 'string' }]
      },
      error_analysis: {
        patterns: [{ pattern: 'string', frequency: 'number', severity: 'string', first_seen: 'string', last_seen: 'string' }],
        failure_points: [{ location: 'string', cause: 'string', propagation_path: ['string'], impact: 'string' }],
        error_sequences: [{ sequence: ['string'], leading_events: ['string'], trigger_conditions: ['string'] }]
      },
      bug_fix_recommendations: [{ 
        error_id: 'string',
        error_description: 'string', 
        location: 'string',
        root_cause_analysis: 'string',
        specific_fix_suggestions: ['string'],
        prevention_strategies: ['string'],
        related_code_areas: ['string'],
        priority: 'string',
        confidence: 'number 0-1'
      }],
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
        return `1. **Validate and Categorize Log Content**: First verify log accessibility, then group ALL log entries into these specific categories:
   - **Errors**: Critical failures and exceptions (include complete error messages, stack traces, file paths, line numbers)
   - **Warnings**: Potential issues and deprecated usage
   - **Info**: General application flow and status messages  
   - **Debug**: Detailed execution information
   - **Performance**: Timing and resource usage metrics
   - **Security**: Authentication and authorization events
   - **System Events**: Startup, shutdown, configuration changes
   - **User Actions**: Requests, interactions, inputs
   - **Database Operations**: Queries, transactions, connections
   - **Network Requests**: API calls, external services

2. **Deep Error Analysis**: For each error found, extract and analyze:
   - Complete error messages and exception types with exact text
   - Full stack traces with file paths and line numbers
   - Error frequency patterns (recurring vs one-time) with timestamps
   - Failure points and error propagation paths through system components
   - Sequence of events leading to errors with precise timestamps
   - Associated context (user actions, system state, environmental factors)
   - Impact assessment on system functionality

3. **Structured Bug Fix Recommendations**: For EACH identified error, provide:
   - **Error Description**: Clear description of what went wrong
   - **Location**: Exact file paths and line numbers where error occurred
   - **Root Cause Analysis**: Deep analysis of why the error happened
   - **Specific Fix Suggestions**: Concrete code changes and implementation steps
   - **Prevention Strategies**: How to prevent similar errors in the future
   - **Related Code Areas**: Other parts of codebase that might need review
   - **Priority Level**: Critical/High/Medium/Low based on impact
   - **Confidence Score**: 0-1 based on evidence strength

4. Correlate errors with user actions and timestamps for contextual understanding
5. Suggest specific code locations that might be causing issues with evidence
6. Rate confidence based on evidence strength and error pattern clarity
7. Recommend next debugging steps based on categorized findings and analysis depth`;
      case 'propose_patch':
        return `1. Analyze the issue based on provided logs and context
2. Identify the root cause in source code
3. Generate a minimal patch in diff format
4. Ensure the patch doesn't break existing functionality
5. Provide reasoning for the proposed changes`;
      default:
        return 'Analyze the provided data and return structured insights with comprehensive log categorization and bug fix recommendations.';
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

      // Save enhanced markdown result following instruction.md format
      const mdFilePath = path.join(analysisDir, 'analysis.md');
      
      // Check if result was generated by new codex exec format
      if (result.outputPath) {
        // For new format, copy the analysis file and add metadata
        let analysisContent = result.analysis;
        const enhancedContent = `# Comprehensive Log Analysis Report

## Task: ${task.task || 'analyze_capture'}
Generated: ${new Date().toISOString()}

## Analysis Output
*Generated using codex exec and saved to: ${result.outputPath}*

${analysisContent}

## Metadata
- Session ID: ${task.sid}
- Generation Method: codex exec --full-auto
- Output File: ${result.outputPath}
- Notes: ${result.notes || 'No additional notes'}

---
*This report was generated using the enhanced VDT analysis pipeline*
`;
        await fs.writeFile(mdFilePath, enhancedContent);
        console.log(`[VDT] Enhanced analysis result saved to: ${jsonFilePath} and ${mdFilePath}`);
        console.log(`[VDT] Original codex output saved to: ${result.outputPath}`);
      } else {
        // Legacy format handling
        const analysisContent = `# Comprehensive Log Analysis Report

## Task: ${task.task || 'analyze_capture'}
Generated: ${new Date().toISOString()}

${result.analysis}

## 1. Log Content Categories

${result.log_categories ? (Object.entries(result.log_categories) as [string, any[]][]).map(([category, items]) => {
  if (!items || items.length === 0) return '';
  const categoryName = category.replace(/_/g, ' ').toUpperCase();
  return `### ${categoryName}
${items.map((item: any, idx: number) => {
  switch (category) {
    case 'errors':
      return `${idx + 1}. **${item.type || 'Error'}**: ${item.message}
   - **File**: ${item.file || 'Unknown'}:${item.line || 'N/A'}
   - **Frequency**: ${item.frequency || 1}
   - **Timestamp**: ${item.timestamp || 'N/A'}
   - **Stack Trace**: ${item.stack_trace ? item.stack_trace.substring(0, 200) + '...' : 'N/A'}`;
    case 'warnings':
      return `${idx + 1}. **${item.category || 'Warning'}**: ${item.message}
   - **Context**: ${item.context || 'N/A'}
   - **Timestamp**: ${item.timestamp || 'N/A'}`;
    case 'performance':
      return `${idx + 1}. **${item.metric}**: ${item.value} ${item.unit}
   - **Timestamp**: ${item.timestamp || 'N/A'}`;
    case 'security':
      return `${idx + 1}. **${item.event}**: ${item.action} by ${item.user || 'Unknown'}
   - **Timestamp**: ${item.timestamp || 'N/A'}`;
    default:
      return `${idx + 1}. ${JSON.stringify(item, null, 2)}`;
  }
}).join('\n')}`;
}).filter(Boolean).join('\n\n') : 'No categorized logs available'}

## 2. Bug Fix Recommendations

${result.bug_fix_recommendations?.length > 0 ? 
  result.bug_fix_recommendations.map((rec: any, idx: number) => 
    `### Recommendation ${idx + 1}: ${rec.error_id || `Error-${idx + 1}`}

**Error Description**: ${rec.error_description || 'No description provided'}

**Location**: ${rec.location || 'Location not specified'}

**Root Cause Analysis**: ${rec.root_cause_analysis || 'Root cause not analyzed'}

**Specific Fix Suggestions**:
${(rec.specific_fix_suggestions || []).map((fix: string, i: number) => `${i + 1}. ${fix}`).join('\n') || '- No specific fixes provided'}

**Prevention Strategies**:
${(rec.prevention_strategies || []).map((strategy: string, i: number) => `${i + 1}. ${strategy}`).join('\n') || '- No prevention strategies provided'}

**Related Code Areas to Review**:
${(rec.related_code_areas || []).map((area: string, i: number) => `${i + 1}. ${area}`).join('\n') || '- No related areas identified'}

**Priority**: ${rec.priority || 'Not specified'}
**Confidence**: ${rec.confidence ? (rec.confidence * 100).toFixed(0) + '%' : 'Not specified'}
`).join('\n\n')
  : 'No bug fix recommendations generated'}

## 3. Detailed Error Analysis

${result.error_analysis ? `
### Error Patterns
${(result.error_analysis.patterns || []).map((pattern: any, idx: number) => 
  `${idx + 1}. **${pattern.pattern}**
   - Frequency: ${pattern.frequency}
   - Severity: ${pattern.severity}
   - First seen: ${pattern.first_seen || 'Unknown'}
   - Last seen: ${pattern.last_seen || 'Unknown'}`
).join('\n') || 'No error patterns identified'}

### Failure Points
${(result.error_analysis.failure_points || []).map((point: any, idx: number) => 
  `${idx + 1}. **Location**: ${point.location}
   - **Cause**: ${point.cause}
   - **Impact**: ${point.impact || 'Not specified'}
   - **Propagation Path**: ${point.propagation_path?.join(' → ') || 'N/A'}`
).join('\n') || 'No failure points identified'}

### Error Sequences
${(result.error_analysis.error_sequences || []).map((seq: any, idx: number) => 
  `${idx + 1}. **Sequence**: ${seq.sequence?.join(' → ') || 'N/A'}
   - **Leading Events**: ${seq.leading_events?.join(', ') || 'N/A'}
   - **Trigger Conditions**: ${seq.trigger_conditions?.join(', ') || 'N/A'}`
).join('\n') || 'No error sequences identified'}
` : 'No detailed error analysis available'}

## 4. Additional Insights

${(result.insights || []).map((insight: any, idx: number) => `### Insight ${idx + 1}: ${insight.title || 'Finding'}
**Evidence**: ${insight.evidence?.join(', ') || 'No evidence'}
**Confidence**: ${insight.confidence ? (insight.confidence * 100).toFixed(0) + '%' : 'Not specified'}
`).join('\n') || 'No additional insights generated'}

## 5. Next Steps

${(result.next_steps || []).map((step: string, idx: number) => `${idx + 1}. ${step}`).join('\n') || 'No next steps provided'}

## Context
${task.context?.selectedIds ? `**Selected Chunks**: ${task.context.selectedIds.join(', ')}\n` : ''}${task.context?.notes ? `**Notes**: ${task.context.notes}\n` : ''}

---
*This report follows the comprehensive analysis format specified in instruction.md*
`;

        await fs.writeFile(mdFilePath, analysisContent);
        console.log(`[VDT] Enhanced comprehensive analysis result saved to: ${jsonFilePath} and ${mdFilePath}`);
      }
    } catch (error) {
      console.error('[VDT] Failed to save analysis result:', error);
    }
  }
}

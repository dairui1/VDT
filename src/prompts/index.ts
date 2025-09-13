import { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

export function getOrchestrationPrompt(params: {
  phase?: string;
  context?: string;
}): GetPromptResult {
  const { phase = 'start', context = '' } = params;

  return {
    description: 'Minimal orchestration rules for VDT debugging workflow',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `# VDT Orchestration Rules (v0.3 KISS)

## Current Phase: ${phase}

## Minimal Debugging Loop
Follow this exact sequence for optimal debugging results:

### 1. **Initialization**
- Always start with \`start_session\` to get session ID and resource links
- Review system_reminder for workflow guidance

### 2. **Capture Phase**  
- Use \`capture_run\` with appropriate mode:
  - \`mode: 'cli'\` for command-line applications
  - \`mode: 'web'\` for browser-based applications
- Ensure commands are representative of the issue scenario
- Set reasonable \`timeoutSec\` to avoid partial captures

### 3. **Analysis Phase**
- **Always** run \`analyze_capture\` immediately after capture
- Use \`task\` parameter for deep reasoning:
  - \`task: 'analyze_root_cause'\` for issue investigation
  - \`task: 'propose_patch'\` for solution generation
- Provide code files and context as needed

### 4. **Implementation & Verification**
- **Main Agent**: Apply code changes based on analysis insights
- Test changes manually or with custom verification
- If issues persist, return to step 2 with updated scenario

### 5. **Session Closure**
- Run \`end_session\` to generate comprehensive summary
- Review key evidence, conclusions, and next steps

## Critical Rules

### ✅ **Do This**
- Complete each phase before moving to next
- Use resource links (\`vdt://sessions/{sid}/...\`) for context
- Leverage Codex analysis for intelligent insights
- Iterate capture→analyze→fix→test until resolved
- Always end with session summary

### ❌ **Don't Do This**  
- Skip analysis after capture
- Apply fixes without analysis insights
- Skip testing of applied fixes
- Leave sessions open without summary

## Phase-Specific Guidance

${phase === 'capture' ? `
### Current: Capture Phase
- Ensure commands reproduce the issue reliably
- Include error scenarios and edge cases
- Monitor for timeout and partial capture warnings
` : ''}

${phase === 'analyze' ? `
### Current: Analysis Phase
- Use task parameter for focused analysis
- Provide relevant code files as inputs
- Review insights and solution confidence scores
` : ''}

${phase === 'fix' ? `
### Current: Fix Phase
- Apply analysis suggestions with defensive coding
- Maintain code style and existing patterns
- Add logging if needed for future debugging
` : ''}

## Context Integration
${context ? `
**Session Context**: ${context}

Adjust orchestration based on:
- Error patterns observed
- Module complexity
- Verification requirements
- Time constraints
` : ''}

## Success Metrics
- Issue reproduction captured successfully
- Root cause identified with high confidence  
- Fix applied and verified
- No regression in related functionality
- Complete documentation in session summary

Remember: **Quality over speed** - thorough analysis prevents multiple debugging cycles.`
        }
      }
    ]
  };
}

export function getWriteLogPrompt(params: {
  module: string[];
  anchors?: string[];
  level?: string;
  format?: string;
  notes?: string;
}): GetPromptResult {
  const { module, anchors = [], level = 'debug', format = 'ndjson', notes = '' } = params;

  return {
    description: 'Guidance for adding structured logging to code without changing logic',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `# VDT Write-Log Guidance

## Objective
Add structured logging to specified modules/functions for debugging purposes. **CRITICAL: Only add logging, never modify existing logic or control flow.**

## Target Scope
- **Modules**: ${module.join(', ')}
${anchors.length > 0 ? `- **Anchors**: ${anchors.join(', ')}` : '- **Anchors**: All functions in specified modules'}
- **Log Level**: ${level}
- **Format**: ${format}

## Logging Requirements

### 1. Log Format (NDJSON)
Every log entry must have exactly these 6 fields:
\`\`\`json
{
  "ts": 1699999999999,
  "level": "${level}",
  "module": "filename_without_extension",
  "func": "functionName",
  "msg": "descriptive_message",
  "kv": {"key1": "value1", "key2": 123}
}
\`\`\`

### 2. Log Function
Use this exact function call:
\`\`\`javascript
vdtLog({
  ts: Date.now(),
  level: '${level}',
  module: 'module_name',
  func: 'function_name',
  msg: 'enter|exit|checkpoint',
  kv: { /* relevant variables */ }
});
\`\`\`

### 3. Insertion Points
- **Function Entry**: Add logging at the start of functions
- **Key Checkpoints**: Before/after significant operations
- **Function Exit**: Before return statements
- **Error Paths**: In catch blocks and error conditions

### 4. Safety Rules
- ✅ Only INSERT new logging statements
- ✅ Add VDT comment markers: \`// VDT:log <hash>\`
- ✅ Preserve all existing code structure
- ❌ Never modify existing logic
- ❌ Never change control flow (if/else/loops)
- ❌ Never modify function signatures
- ❌ Never remove or alter existing code

### 5. Example Implementation
\`\`\`javascript
function processData(input) {
  // VDT:log a1b2c3d4
  vdtLog({
    ts: Date.now(),
    level: '${level}',
    module: 'data_processor',
    func: 'processData',
    msg: 'enter',
    kv: { inputType: typeof input, inputLength: input?.length }
  });

  // Existing logic unchanged
  const result = transform(input);
  
  // VDT:log e5f6g7h8
  vdtLog({
    ts: Date.now(),
    level: '${level}',
    module: 'data_processor',
    func: 'processData',
    msg: 'transform_complete',
    kv: { resultType: typeof result, success: !!result }
  });

  return result;
}
\`\`\`

### 6. Variable Capture Guidelines
- Capture primitive values directly
- For objects: capture size, type, key properties
- For arrays: capture length, first/last elements if relevant
- Avoid capturing sensitive data (passwords, tokens, PII)

${notes ? `\n## Additional Notes\n${notes}` : ''}

## Remember
- This is for debugging - keep logs concise but informative
- Focus on data flow and state transitions
- Every log must be valid NDJSON
- Preserve code readability and structure`
        }
      }
    ]
  };
}
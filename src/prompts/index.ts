import { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';

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

export function getClarifyPrompt(params: {
  chunks: Array<{ id: string; title: string; excerpt: string; refs: string[] }>;
  multi?: boolean;
  question?: string;
}): GetPromptResult {
  const { chunks, multi = false, question = 'Which log sections are most relevant to the issue?' } = params;

  return {
    description: 'Interactive clarification for log analysis focus',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `# VDT Log Clarification

## Question
${question}

## Available Log Chunks
${chunks.map((chunk, index) => `
### [${chunk.id}] ${chunk.title}
**Preview:**
\`\`\`
${chunk.excerpt}
\`\`\`
**References:** ${chunk.refs.join(', ')}
**Selection ID:** \`${chunk.id}\`
`).join('\n')}

## Instructions
Please review the log chunks above and ${multi ? 'select multiple relevant chunks' : 'select the most relevant chunk'} for detailed analysis.

### Selection Format
Respond with the chunk ID(s) you want to focus on:
${multi ? '- Multiple selections: `chunk1,chunk2,chunk3`' : '- Single selection: `chunk1`'}

### Selection Criteria
- **Error Proximity**: Chunks containing or near error events
- **Functional Relevance**: Chunks from modules related to the reported issue
- **Timeline Significance**: Chunks from critical time windows
- **Data Flow**: Chunks showing input/output transformations

### Example Response
\`\`\`
Selected chunks: ${chunks.slice(0, Math.min(2, chunks.length)).map(c => c.id).join(', ')}

Reasoning: 
- ${chunks[0]?.id}: Contains error events in core processing
${chunks[1] ? `- ${chunks[1].id}: Shows state transition before failure` : ''}
\`\`\`

This selection will be used to focus the detailed analysis on the most relevant log sections.`
        }
      }
    ]
  };
}

export function getFixHypothesisPrompt(params: {
  buglens_uri: string;
  top_k?: number;
}): GetPromptResult {
  const { buglens_uri, top_k = 3 } = params;

  return {
    description: 'Generate actionable fix hypotheses based on BugLens analysis',
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `# VDT Fix Hypothesis Generation

## Source Analysis
**BugLens Report**: ${buglens_uri}

## Objective
Generate ${top_k} actionable fix hypotheses based on the BugLens analysis, ranked by likelihood and impact.

## Output Format
For each hypothesis, provide:

### Hypothesis N: [Brief Title]
**Confidence**: [High/Medium/Low]
**Impact**: [Critical/High/Medium/Low]
**Evidence**: 
- List specific evidence from logs/analysis

**Root Cause**:
- Detailed explanation of what's likely causing the issue

**Proposed Fix**:
- Specific code changes or configuration updates
- Files/functions to modify
- Implementation approach

**Verification Steps**:
1. Specific test cases to run
2. Log patterns to verify fix
3. Regression test scenarios

**Risk Assessment**:
- What could break if this fix is applied
- Rollback strategy
- Areas requiring extra testing

**Time Estimate**: [Hours/Days for implementation]

---

## Hypothesis Selection Criteria
1. **Log Evidence Strength**: Direct correlation with error patterns
2. **Code Pattern Matching**: Known anti-patterns or common issues
3. **Timing/Sequence Analysis**: Order of operations revealing causation
4. **State/Data Analysis**: Invalid states or data corruption indicators
5. **Environmental Factors**: Resource constraints, timing issues

## Implementation Priority
- **P0**: Critical fixes that prevent system function
- **P1**: High-impact fixes that improve reliability
- **P2**: Medium-impact fixes that enhance robustness

## Example Output Structure
\`\`\`
### Hypothesis 1: Null Pointer in Data Transform
**Confidence**: High
**Impact**: Critical
**Evidence**: 
- 85% of errors in transform() function
- Consistent "Cannot read property" messages
- Input validation gaps in logs

**Root Cause**:
Data validation missing for edge case inputs, causing undefined access

**Proposed Fix**:
Add input validation in processData() before transform() call
Files: src/data_processor.ts lines 45-50

**Verification Steps**:
1. Unit test with null/undefined inputs
2. Monitor error rate drop to <5%
3. Verify no new validation errors

**Risk Assessment**:
Low risk - defensive coding, may reject some previously accepted inputs
Rollback: Remove validation temporarily

**Time Estimate**: 2-3 hours
\`\`\`

Focus on actionable, specific fixes that can be implemented and verified quickly.`
        }
      }
    ]
  };
}
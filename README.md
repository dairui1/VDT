# VDT - Visual Debugging Tool

VDT is a Model Context Protocol (MCP) server that provides AI-powered debugging workflows through structured logging, execution capture, and intelligent analysis.

## Version 0.1.0 (MVP)

This is the first working version implementing the core VDT debugging workflow with significant improvements addressing implementation gaps.

## ✨ Key Features

### 🔧 Tools (5)
- `vdt_start_session` - Initialize debugging session with TTL management
- `write_log` - AST-based code instrumentation with idempotency
- `apply_write_log` - Apply generated patches with backup
- `do_capture` - Enhanced shell execution capture with error detection
- `analyze_debug_log` - Intelligent log analysis with candidate chunks

### 📝 Prompts (3)
- `vdt/debugspec/write-log` - Guidance for safe code instrumentation
- `vdt/debugspec/clarify` - Interactive log analysis clarification
- `vdt/debugspec/fix-hypothesis` - Generate actionable fix suggestions

### 📁 Resources (MCP Protocol)
- Session metadata (`vdt://sessions/{sid}/meta.json`)
- Captured logs (`vdt://sessions/{sid}/logs/capture.ndjson`)
- BugLens reports (`vdt://sessions/{sid}/analysis/buglens.md`)
- Instrumentation patches (`vdt://sessions/{sid}/patches/0001-write-log.diff`)

## 🚀 Installation

```bash
pnpm install
pnpm run build
```

## 📖 Usage

### As MCP Server
```bash
node dist/server.js
```

### Complete Workflow Example

#### 1. **Start Session**
```javascript
vdt_start_session({ 
  repoRoot: './my-project', 
  note: 'Debugging render issue',
  ttlDays: 7
})
// Returns: { sid: 'uuid', links: ['vdt://sessions/{sid}/...'] }
```

#### 2. **Add Logging (Dry Run)**
```javascript
write_log({ 
  sid: 'session-id', 
  files: ['src/renderer.js'], 
  anchors: ['gridToPixel'],
  level: 'debug',
  dryRun: true,  // Safe preview
  allowlist: ['src/']
})
// Returns: { patchLink: 'vdt://sessions/{sid}/patches/...', applied: false }
```

#### 3. **Apply Patches**
```javascript
apply_write_log({ 
  sid: 'session-id', 
  files: ['src/renderer.js']
})
// Returns: { successCount: 1, results: [{ success: true, message: '...' }] }
```

#### 4. **Capture Execution**
```javascript
do_capture({ 
  sid: 'session-id', 
  shell: { 
    cwd: './my-project', 
    commands: ['pnpm run demo'],
    timeoutSec: 30
  },
  redact: {
    patterns: ['password.*']  // Custom redaction
  }
})
// Returns: { chunks: ['logs/capture.ndjson'], summary: { lines: 150, errors: 5 } }
```

#### 5. **Analyze Results**
```javascript
analyze_debug_log({ 
  sid: 'session-id', 
  focus: { module: 'renderer' },
  ruleset: 'js-web-default'
})
// Returns: { 
//   findings: { 
//     clusters: [...], 
//     suspects: [...], 
//     needClarify: false,
//     candidateChunks: [...]
//   }, 
//   links: ['analysis/buglens.md'] 
// }
```

#### 6. **Clarify Analysis (if needed)**
```javascript
// Use clarify prompt with candidate chunks
// Then re-run analysis with selectedIds
analyze_debug_log({ 
  sid: 'session-id', 
  focus: { 
    selectedIds: ['error_window_0', 'function_renderer_gridToPixel']
  }
})
```

## 🔍 Demo Project

Try the included Gobang game demo with intentional bugs:

```bash
cd examples/gobang
pnpm run demo
```

**Known Issues:**
- Missing 0.5 offset in `gridToPixel` function causing alignment issues
- Array bounds checking errors in edge cases

**VDT Workflow:**
1. Instrument the renderer: `write_log({ files: ['renderer.js'], anchors: ['gridToPixel'] })`
2. Capture demo execution: `do_capture({ commands: ['pnpm run demo'] })`
3. Analyze for the "0.5 offset" hypothesis

## 🏗️ Architecture

### Core Components
- **Node.js + TypeScript + ESM** - Modern JavaScript runtime
- **MCP SDK** - Protocol implementation with stdio transport
- **ts-morph** - AST-based safe code instrumentation
- **node-pty** - Terminal capture with enhanced error detection
- **diff** - Patch generation and application

### Data Flow
1. **Instrumentation**: AST analysis → Code injection → Patch generation
2. **Capture**: Shell execution → NDJSON logging → Error classification
3. **Analysis**: Log processing → Error clustering → Candidate chunk creation
4. **Output**: BugLens report → Fix hypotheses → Resource links

### Security Features
- **File allowlisting** for instrumentation scope control
- **Environment variable filtering** (PATH, NODE_OPTIONS only)
- **Automatic sensitive data redaction** (emails, tokens, passwords)
- **Session TTL and cleanup** with configurable retention
- **Patch backup and rollback** capabilities

## 🔧 Enhanced Error Detection

VDT now includes sophisticated error pattern recognition:

- **Pattern Matching**: `error:`, `exception:`, `failed:`, `cannot`, stack traces
- **Console Output**: `console.error`, `console.warn`, stderr detection  
- **Exit Codes**: Non-zero exit codes and process failures
- **Clustering**: Rapid error sequence detection and temporal correlation
- **Context Extraction**: Module, function, line numbers from stack traces

## 📊 Candidate Chunk System

The analysis engine creates focused debugging chunks:

- **Error Windows**: High-density error regions with context
- **Module Chunks**: Error-prone modules with event statistics
- **Function Chunks**: Individual function error patterns
- **Rapid Sequences**: Time-clustered error events

## 🧪 Testing

```bash
pnpm test          # Basic unit tests
pnpm run lint      # ESLint validation  
pnpm run typecheck # TypeScript validation
pnpm run build     # Full compilation
```

## 🔍 MCP Resources Usage

VDT exposes all debugging artifacts as MCP resources:

```javascript
// List all available resources
list_resources()

// Read specific resource
read_resource({ uri: 'vdt://sessions/{sid}/analysis/buglens.md' })
```

**Resource Types:**
- `application/json` - Session metadata
- `application/x-ndjson` - Structured logs
- `text/markdown` - BugLens analysis reports
- `text/x-diff` - Code instrumentation patches

## 🛡️ Safety & Best Practices

### Instrumentation Safety
- **Always run `dryRun: true` first** to preview changes
- **Use `allowlist`** to restrict file scope
- **Review patches** before applying with `apply_write_log`
- **Backup created automatically** in `patches/original-{timestamp}.backup`

### Performance Considerations
- **Timeout commands** appropriately (`timeoutSec` parameter)
- **Use focused analysis** with `module` or `func` filters
- **Enable redaction** for sensitive environments
- **Clean up sessions** after debugging (TTL auto-cleanup)

## 🗺️ Roadmap

- **v0.2**: Browser capture (Playwright), command replay, session cleanup tools
- **v0.3**: SSE/HTTP transport, IDE plugins, enhanced clustering algorithms
- **v0.4**: Automated fix generation, Git integration, framework testing
- **v1.0**: Production deployment, authentication, scalable indexing

## 💡 Contributing

See `examples/gobang` for a working demonstration of VDT's debugging capabilities. The example includes intentional bugs perfect for testing VDT workflows.

## 📄 License

MIT

---

## 🔧 Implementation Improvements (v0.1.1)

This version addresses key implementation gaps identified in the alignment review:

### ✅ Resolved Issues
- **Patch Application**: Complete write_log → apply_write_log workflow
- **Runtime Support**: Automatic vdtLog function injection
- **Error Classification**: Enhanced stderr and error pattern detection
- **MCP Resources**: Full resource listing and reading support
- **Candidate Chunks**: Precise chunk ID to event range mapping
- **Idempotency**: Improved hash-based duplicate detection

### 🔧 Technical Enhancements
- **Diff Generation**: Proper patch creation using `diff` library
- **Backup System**: Automatic file backup before patch application
- **Error Clustering**: Temporal and spatial error sequence analysis
- **Context Extraction**: Module/function parsing from stack traces
- **Resource URIs**: Complete `vdt://sessions/{sid}/{path}` support

VDT is now production-ready for the core debugging workflow! 🎉
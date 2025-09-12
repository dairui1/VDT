# VDT - Visual Debugging Tool

VDT is a Model Context Protocol (MCP) server that provides AI-powered debugging workflows through structured logging, execution capture, and intelligent analysis.

## Version 0.1.0 (MVP)

This is the first working version implementing the core VDT debugging workflow.

## Features

### Prompts
- `vdt/debugspec/write-log` - Guidance for adding structured logging
- `vdt/debugspec/clarify` - Interactive log analysis clarification
- `vdt/debugspec/fix-hypothesis` - Generate actionable fix suggestions

### Tools
- `vdt_start_session` - Initialize debugging session
- `write_log` - AST-based code instrumentation
- `do_capture` - Execute and capture application logs
- `analyze_debug_log` - Analyze captured logs and generate BugLens

### Resources
- Session management with `.vdt/sessions/{sid}/` structure
- NDJSON structured logging format
- BugLens markdown reports with fix hypotheses

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server
```bash
node dist/server.js
```

### Example Workflow

1. **Start Session**
```javascript
vdt_start_session({ 
  repoRoot: './my-project', 
  note: 'Debugging render issue' 
})
```

2. **Add Logging**
```javascript
write_log({ 
  sid: 'session-id', 
  files: ['src/renderer.js'], 
  anchors: ['gridToPixel'],
  level: 'debug',
  dryRun: true 
})
```

3. **Capture Execution**
```javascript
do_capture({ 
  sid: 'session-id', 
  shell: { 
    cwd: './my-project', 
    commands: ['npm run demo'] 
  } 
})
```

4. **Analyze Results**
```javascript
analyze_debug_log({ 
  sid: 'session-id', 
  focus: { module: 'renderer' } 
})
```

## Demo Project

Try the included Gobang game demo:

```bash
cd examples/gobang
npm run demo
```

This demonstrates a rendering bug (missing 0.5 offset) that VDT can help identify.

## Architecture

- **Node.js + TypeScript + ESM**
- **MCP SDK** for protocol implementation
- **ts-morph** for AST-based code instrumentation
- **node-pty** for terminal capture
- **Structured logging** with 6-field NDJSON format

## Security

- File allowlist for instrumentation
- Environment variable filtering
- Automatic sensitive data redaction
- Session TTL and cleanup

## Testing

```bash
npm test
npm run lint
npm run typecheck
```

## Roadmap

- **v0.2**: Browser capture (Playwright), command replay, session cleanup
- **v0.3**: SSE/HTTP transport, IDE plugins, enhanced clustering
- **v0.4**: Automated fix generation, Git integration, framework testing
- **v1.0**: Production deployment, authentication, scalable indexing

## Contributing

See examples/gobang for a working demonstration of VDT's debugging capabilities.

## License

MIT
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListPromptsRequestSchema, 
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { VDTTools } from './tools/index.js';
import { getWriteLogPrompt, getOrchestrationPrompt } from './prompts/index.js';
import { SessionManager } from './utils/session.js';
import { promises as fs } from 'fs';
import { join } from 'path';

class VDTServer {
  private server: Server;
  private tools: VDTTools;
  private sessionManager: SessionManager;

  constructor() {
    this.server = new Server(
      {
        name: 'vdt-mcp',
        version: '0.3.0',
      },
      {
        capabilities: {
          prompts: {},
          tools: {},
          resources: {}
        }
      }
    );

    this.sessionManager = new SessionManager();
    this.tools = new VDTTools(this.sessionManager);
    this.setupHandlers();
  }

  private setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'start_session',
            description: 'Initialize a new VDT debugging session',
            inputSchema: {
              type: 'object',
              properties: {
                repoRoot: { type: 'string', description: 'Repository root path' },
                note: { type: 'string', description: 'Session note' },
                ttlDays: { type: 'number', description: 'Session TTL in days' }
              }
            }
          },
          {
            name: 'capture_run',
            description: 'Unified capture entry point supporting CLI and Web modes',
            inputSchema: {
              type: 'object',
              properties: {
                sid: { type: 'string', description: 'Session ID' },
                mode: { type: 'string', enum: ['cli', 'web'], description: 'Capture mode' },
                shell: {
                  type: 'object',
                  properties: {
                    cwd: { type: 'string', description: 'Working directory' },
                    commands: { type: 'array', items: { type: 'string' }, description: 'Commands to execute' },
                    env: { type: 'object', description: 'Environment variables' },
                    timeoutSec: { type: 'number', description: 'Timeout in seconds' }
                  },
                  required: ['cwd']
                },
                web: {
                  type: 'object',
                  properties: {
                    entryUrl: { type: 'string', description: 'Entry URL' },
                    actions: { type: 'boolean', description: 'Capture actions' },
                    console: { type: 'boolean', description: 'Capture console logs' },
                    network: { type: 'boolean', description: 'Capture network requests' }
                  }
                },
                redact: {
                  type: 'object',
                  properties: {
                    patterns: { type: 'array', items: { type: 'string' }, description: 'Redaction patterns' }
                  }
                }
              },
              required: ['sid', 'mode']
            }
          },
          {
            name: 'analyze_capture',
            description: 'Analyze captured logs using Codex intelligence',
            inputSchema: {
              type: 'object',
              properties: {
                sid: { type: 'string', description: 'Session ID' },
                focus: {
                  type: 'object',
                  properties: {
                    module: { type: 'string', description: 'Focus module' },
                    func: { type: 'string', description: 'Focus function' },
                    timeRange: { type: 'array', items: { type: 'number' }, description: 'Time range' },
                    selectedIds: { type: 'array', items: { type: 'string' }, description: 'Selected chunk IDs' }
                  }
                },
                task: { type: 'string', enum: ['propose_patch', 'analyze_root_cause'], description: 'Reasoning task type' },
                inputs: {
                  type: 'object',
                  properties: {
                    code: { type: 'array', items: { type: 'string' }, description: 'Source code file:// links' },
                    diff: { type: 'string', description: 'Patch diff vdt:// link' }
                  }
                },
                context: {
                  type: 'object',
                  properties: {
                    selectedIds: { type: 'array', items: { type: 'string' }, description: 'Selected chunk IDs' },
                    notes: { type: 'string', description: 'Additional context notes' }
                  }
                },
                backend: { type: 'string', description: 'Backend to use' },
                args: { type: 'object', description: 'Additional arguments' },
                question: { type: 'string', description: 'Specific question' },
                constraints: { type: 'array', items: { type: 'string' }, description: 'Constraints' },
                redact: { type: 'boolean', description: 'Apply redaction' }
              },
              required: ['sid']
            }
          },
          {
            name: 'end_session',
            description: 'Complete session and generate summary report',
            inputSchema: {
              type: 'object',
              properties: {
                sid: { type: 'string', description: 'Session ID' }
              },
              required: ['sid']
            }
          }
        ]
      };
    });
    // List prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'vdt/spec/orchestration',
            description: 'Minimal orchestration rules for VDT debugging workflow',
            arguments: [
              { name: 'phase', description: 'Current workflow phase', required: false },
              { name: 'context', description: 'Session context and state', required: false }
            ]
          },
          {
            name: 'vdt/debugspec/write-log',
            description: 'Guidance for adding structured logging to code without changing logic',
            arguments: [
              { name: 'module', description: 'Target modules to instrument', required: true },
              { name: 'anchors', description: 'Specific function anchors', required: false },
              { name: 'level', description: 'Log level (trace|debug|info|warn|error)', required: false },
              { name: 'format', description: 'Log format (ndjson)', required: false },
              { name: 'notes', description: 'Additional guidance notes', required: false }
            ]
          }
        ]
      };
    });

    // Get prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'vdt/spec/orchestration':
          return getOrchestrationPrompt(args as any);
        
        case 'vdt/debugspec/write-log':
          return getWriteLogPrompt(args as any);
        
        default:
          throw new Error(`Unknown prompt: ${name}`);
      }
    });

    // List resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      // List all active sessions and their resources
      const vdtDir = join(process.cwd(), '.vdt', 'sessions');
      try {
        const sessions = await fs.readdir(vdtDir);
        const resources = [];

        for (const sessionId of sessions) {
          const sessionDir = join(vdtDir, sessionId);
          const metaPath = join(sessionDir, 'meta.json');
          
          try {
            const session = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
            
            // Add standard resources for this session
            resources.push(
              {
                uri: `vdt://sessions/${sessionId}/meta.json`,
                name: `Session ${sessionId} - Metadata`,
                description: `Session metadata and configuration`,
                mimeType: 'application/json'
              },
              {
                uri: `vdt://sessions/${sessionId}/logs/capture.ndjson`,
                name: `Session ${sessionId} - Captured Logs`,
                description: `NDJSON formatted execution logs`,
                mimeType: 'application/x-ndjson'
              },
              // Analysis artifacts
              {
                uri: `vdt://sessions/${sessionId}/analysis/analysis.md`,
                name: `Session ${sessionId} - Analysis Report`,
                description: `AI-generated analysis and solution proposals`,
                mimeType: 'text/markdown'
              },
              {
                uri: `vdt://sessions/${sessionId}/analysis/summary.md`,
                name: `Session ${sessionId} - Session Summary`,
                description: `Complete session summary with conclusions and next steps`,
                mimeType: 'text/markdown'
              },
              // Web capture artifacts (when available)
              {
                uri: `vdt://sessions/${sessionId}/logs/actions.ndjson`,
                name: `Session ${sessionId} - Browser Actions`,
                description: `Browser action recordings from web capture`,
                mimeType: 'application/x-ndjson'
              },
              {
                uri: `vdt://sessions/${sessionId}/logs/console.ndjson`,
                name: `Session ${sessionId} - Browser Console`,
                description: `Browser console messages and errors`,
                mimeType: 'application/x-ndjson'
              },
              {
                uri: `vdt://sessions/${sessionId}/logs/network.ndjson`,
                name: `Session ${sessionId} - Network Activity`,
                description: `Browser network requests and responses`,
                mimeType: 'application/x-ndjson'
              }
            );
          } catch {
            // Skip invalid sessions
          }
        }

        return { resources };
      } catch {
        return { resources: [] };
      }
    });

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;
      
      if (!uri.startsWith('vdt://sessions/')) {
        throw new Error(`Invalid VDT resource URI: ${uri}`);
      }

      // Parse VDT URI: vdt://sessions/{sid}/{path}
      const match = uri.match(/^vdt:\/\/sessions\/([^\/]+)\/(.+)$/);
      if (!match) {
        throw new Error(`Invalid VDT resource URI format: ${uri}`);
      }

      const [, sessionId, resourcePath] = match;
      const sessionDir = this.sessionManager.getSessionDir(sessionId);
      const filePath = join(sessionDir, resourcePath);

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Determine MIME type based on file extension
        let mimeType = 'text/plain';
        if (resourcePath.endsWith('.json')) {
          mimeType = 'application/json';
        } else if (resourcePath.endsWith('.md')) {
          mimeType = 'text/markdown';
        } else if (resourcePath.endsWith('.diff')) {
          mimeType = 'text/x-diff';
        } else if (resourcePath.endsWith('.ndjson')) {
          mimeType = 'application/x-ndjson';
        }

        return {
          contents: [{
            uri,
            mimeType,
            text: content
          }]
        };
      } catch (error) {
        throw new Error(`Failed to read resource ${uri}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // Call tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'start_session':
          return await this.tools.startSession(args as any);
        
        case 'capture_run':
          return await this.tools.captureRun(args as any);
        
        case 'analyze_capture':
          return await this.tools.analyzeCapture(args as any);
        
        case 'end_session':
          return await this.tools.endSession(args as any);
        
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    // Error handling
    this.server.onerror = (error) => {
      console.error('[VDT] Server error:', error);
    };

    process.on('SIGINT', async () => {
      console.error('[VDT] Shutting down server...');
      await this.tools.dispose();
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    console.error('[VDT] Starting VDT MCP Server v0.3.0');
    console.error('[VDT] Web Debug HUD support enabled');
    console.error('[VDT] Initializing reasoner backends...');
    
    // Initialize tools (including reasoner adapter)
    await this.tools.initialize();
    
    console.error('[VDT] Listening on stdio...');
    
    await this.server.connect(transport);
  }
}

// Run server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new VDTServer();
  server.run().catch((error) => {
    console.error('[VDT] Fatal error:', error);
    process.exit(1);
  });
}

export { VDTServer };
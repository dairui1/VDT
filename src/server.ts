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
import { getWriteLogPrompt, getClarifyPrompt, getFixHypothesisPrompt } from './prompts/index.js';
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
        version: '0.1.0',
      },
      {
        capabilities: {
          prompts: {},
          tools: {},
          resources: {}
        }
      }
    );

    this.tools = new VDTTools();
    this.sessionManager = new SessionManager();
    this.setupHandlers();
  }

  private setupHandlers() {
    // List tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'vdt_start_session',
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
            name: 'write_log',
            description: 'Add structured logging to code files',
            inputSchema: {
              type: 'object',
              properties: {
                sid: { type: 'string', description: 'Session ID' },
                files: { type: 'array', items: { type: 'string' }, description: 'Files to instrument' },
                anchors: { type: 'array', items: { type: 'string' }, description: 'Function anchors' },
                level: { type: 'string', enum: ['trace', 'debug', 'info', 'warn', 'error'], description: 'Log level' },
                dryRun: { type: 'boolean', description: 'Dry run mode' },
                allowlist: { type: 'array', items: { type: 'string' }, description: 'File allowlist patterns' },
                force: { type: 'boolean', description: 'Force re-instrumentation' }
              },
              required: ['sid', 'files']
            }
          },
          {
            name: 'apply_write_log',
            description: 'Apply previously generated instrumentation patches',
            inputSchema: {
              type: 'object',
              properties: {
                sid: { type: 'string', description: 'Session ID' },
                files: { type: 'array', items: { type: 'string' }, description: 'Files to apply patches to' }
              },
              required: ['sid', 'files']
            }
          },
          {
            name: 'do_capture',
            description: 'Execute and capture application output',
            inputSchema: {
              type: 'object',
              properties: {
                sid: { type: 'string', description: 'Session ID' },
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
                redact: {
                  type: 'object',
                  properties: {
                    patterns: { type: 'array', items: { type: 'string' }, description: 'Redaction patterns' }
                  }
                }
              },
              required: ['sid', 'shell']
            }
          },
          {
            name: 'analyze_debug_log',
            description: 'Analyze captured logs and generate BugLens report',
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
                ruleset: { type: 'string', description: 'Analysis ruleset' }
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
            name: 'vdt/debugspec/write-log',
            description: 'Guidance for adding structured logging to code without changing logic',
            arguments: [
              { name: 'module', description: 'Target modules to instrument', required: true },
              { name: 'anchors', description: 'Specific function anchors', required: false },
              { name: 'level', description: 'Log level (trace|debug|info|warn|error)', required: false },
              { name: 'format', description: 'Log format (ndjson)', required: false },
              { name: 'notes', description: 'Additional guidance notes', required: false }
            ]
          },
          {
            name: 'vdt/debugspec/clarify',
            description: 'Interactive clarification for log analysis focus',
            arguments: [
              { name: 'chunks', description: 'Available log chunks for selection', required: true },
              { name: 'multi', description: 'Allow multiple selections', required: false },
              { name: 'question', description: 'Clarification question', required: false }
            ]
          },
          {
            name: 'vdt/debugspec/fix-hypothesis',
            description: 'Generate actionable fix hypotheses based on BugLens analysis',
            arguments: [
              { name: 'buglens_uri', description: 'URI to BugLens analysis', required: true },
              { name: 'top_k', description: 'Number of hypotheses to generate', required: false }
            ]
          }
        ]
      };
    });

    // Get prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'vdt/debugspec/write-log':
          return getWriteLogPrompt(args as any);
        
        case 'vdt/debugspec/clarify':
          return getClarifyPrompt(args as any);
        
        case 'vdt/debugspec/fix-hypothesis':
          return getFixHypothesisPrompt(args as any);
        
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
              {
                uri: `vdt://sessions/${sessionId}/analysis/buglens.md`,
                name: `Session ${sessionId} - BugLens Report`,
                description: `AI-generated debugging analysis and hypotheses`,
                mimeType: 'text/markdown'
              },
              {
                uri: `vdt://sessions/${sessionId}/patches/0001-write-log.diff`,
                name: `Session ${sessionId} - Instrumentation Patch`,
                description: `Code instrumentation diff patch`,
                mimeType: 'text/x-diff'
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
        case 'vdt_start_session':
          return await this.tools.startSession(args as any);
        
        case 'write_log':
          return await this.tools.writeLog(args as any);
        
        case 'apply_write_log':
          return await this.tools.applyWriteLog(args as any);
        
        case 'do_capture':
          return await this.tools.doCapture(args as any);
        
        case 'analyze_debug_log':
          return await this.tools.analyzeDebugLog(args as any);
        
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
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    console.error('[VDT] Starting VDT MCP Server v0.1.0');
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
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { VDTTools } from './tools/index.js';
import { getWriteLogPrompt, getClarifyPrompt, getFixHypothesisPrompt } from './prompts/index.js';

class VDTServer {
  private server: Server;
  private tools: VDTTools;

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
    this.setupHandlers();
  }

  private setupHandlers() {
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

    // List tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'vdt_start_session':
          return await this.tools.startSession(args as any);
        
        case 'write_log':
          return await this.tools.writeLog(args as any);
        
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
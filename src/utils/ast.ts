import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { LogLevel } from '../types/index.js';

export class ASTInstrumenter {
  private project: Project;

  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
      }
    });
  }

  async instrumentFile(
    filePath: string,
    anchors: string[] = [],
    level: LogLevel = 'debug',
    format: 'ndjson' = 'ndjson'
  ): Promise<{ diff: string; applied: boolean; hints: string[] }> {
    
    const hints: string[] = [];
    
    // Read original file
    const originalContent = await fs.readFile(filePath, 'utf-8');
    
    // Check if already instrumented
    if (originalContent.includes('// VDT:log')) {
      return {
        diff: '',
        applied: false,
        hints: ['File already instrumented with VDT logs']
      };
    }

    // Parse with ts-morph
    const sourceFile = this.project.createSourceFile(filePath, originalContent, { overwrite: true });
    
    let modifications = 0;

    // Find functions to instrument
    const functions: Node[] = [
      ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.ArrowFunction),
      ...sourceFile.getDescendantsOfKind(SyntaxKind.FunctionExpression)
    ];

    for (const func of functions) {
      const funcName = this.getFunctionName(func);
      
      // Check if this function matches anchors (if specified)
      if (anchors.length > 0 && !anchors.some(anchor => funcName.includes(anchor))) {
        continue;
      }

      // Add logging at function start
      const body = func.getFirstChildByKind(SyntaxKind.Block);
      if (body) {
        const hash = this.generateHash(filePath, funcName);
        const logCall = this.generateLogCall(filePath, funcName, 'enter', {}, level);
        const comment = `// VDT:log ${hash}`;
        
        body.insertStatements(0, [comment, logCall]);
        modifications++;
      }
    }

    const instrumentedContent = sourceFile.getFullText();
    
    // Generate diff (simplified - in real implementation use proper diff library)
    const diff = this.generateDiff(originalContent, instrumentedContent, filePath);

    return {
      diff,
      applied: false, // Always return false for dry-run, actual application happens separately
      hints: [
        `Instrumented ${modifications} functions`,
        'Use apply=true to write changes to disk'
      ]
    };
  }

  async applyInstrumentation(filePath: string, newContent: string): Promise<void> {
    await fs.writeFile(filePath, newContent);
  }

  private getFunctionName(node: Node): string {
    const nameNode = node.getFirstChildByKind(SyntaxKind.Identifier);
    if (nameNode) {
      return nameNode.getText();
    }
    
    // Handle arrow functions and anonymous functions
    const parent = node.getParent();
    if (parent && Node.isVariableDeclaration(parent)) {
      return parent.getName() || 'anonymous';
    }
    
    return 'anonymous';
  }

  private generateHash(filePath: string, funcName: string): string {
    return createHash('md5').update(`${filePath}:${funcName}`).digest('hex').substring(0, 8);
  }

  private generateLogCall(
    module: string,
    func: string,
    msg: string,
    kv: Record<string, any>,
    level: LogLevel
  ): string {
    const logEvent = JSON.stringify({
      ts: 'Date.now()',
      level,
      module: module.split('/').pop()?.replace(/\.[^.]*$/, '') || 'unknown',
      func,
      msg,
      kv
    }).replace('"Date.now()"', 'Date.now()');

    return `vdtLog(${logEvent});`;
  }

  private generateDiff(original: string, modified: string, fileName: string): string {
    // Simplified diff - in real implementation use diff library
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    
    let diff = `--- a/${fileName}\n+++ b/${fileName}\n`;
    
    // Very basic diff implementation - just show added lines
    for (let i = 0; i < modifiedLines.length; i++) {
      const line = modifiedLines[i];
      if (line.includes('// VDT:log') || line.includes('vdtLog(')) {
        diff += `+${line}\n`;
      }
    }
    
    return diff;
  }

  static generateVdtLogFunction(): string {
    return `
// VDT Runtime - Auto-generated logging function
function vdtLog(event) {
  if (typeof process !== 'undefined' && process.stdout) {
    process.stdout.write(JSON.stringify(event) + '\\n');
  } else if (typeof console !== 'undefined') {
    console.log(JSON.stringify(event));
  }
}
`;
  }
}
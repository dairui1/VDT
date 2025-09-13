import { Project, SourceFile, Node, SyntaxKind } from 'ts-morph';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { LogLevel } from '../types/index.js';
import * as Diff from 'diff';

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
    format: 'ndjson' = 'ndjson',
    sessionDir?: string
  ): Promise<{ diff: string; applied: boolean; hints: string[] }> {
    
    const hints: string[] = [];
    
    // Read original file
    const originalContent = await fs.readFile(filePath, 'utf-8');
    
    // Improved idempotency check
    const existingHashes = this.extractVDTHashes(originalContent);
    if (existingHashes.length > 0) {
      return {
        diff: '',
        applied: false,
        hints: [`File already instrumented with ${existingHashes.length} VDT logs`, 
               'Use force=true to re-instrument or remove existing logs first']
      };
    }

    // Parse with ts-morph
    const sourceFile = this.project.createSourceFile(filePath, originalContent, { overwrite: true });
    
    let modifications = 0;

    // Add vdtLog runtime function at the top
    const vdtLogRuntime = this.generateVdtLogRuntime();
    sourceFile.insertText(0, vdtLogRuntime + '\n\n');

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
    
    // Generate proper diff
    const diff = this.generateDiff(originalContent, instrumentedContent, filePath);

    // Save diff to session directory if provided
    if (sessionDir && diff.trim()) {
      // Generate unique patch filename based on the target file
      const path = await import('path');
      const fileName = path.basename(filePath, path.extname(filePath));
      const fileHash = Buffer.from(filePath).toString('base64').replace(/[=/+]/g, '').substring(0, 8);
      const patchPath = `${sessionDir}/patches/patch-${fileName}-${fileHash}.diff`;
      
      await fs.mkdir(`${sessionDir}/patches`, { recursive: true });
      await fs.writeFile(patchPath, diff);
      hints.push(`Diff saved to patches/patch-${fileName}-${fileHash}.diff`);
    }

    return {
      diff,
      applied: false, // Always false for dry-run
      hints: [
        `Instrumented ${modifications} functions`,
        'Use apply=true to write changes to disk',
        ...hints
      ]
    };
  }

  async applyInstrumentation(filePath: string, sessionDir: string): Promise<{ success: boolean; message: string }> {
    try {
      // Generate unique patch filename based on the target file
      const path = await import('path');
      const fileName = path.basename(filePath, path.extname(filePath));
      const fileHash = Buffer.from(filePath).toString('base64').replace(/[=/+]/g, '').substring(0, 8);
      const patchPath = `${sessionDir}/patches/patch-${fileName}-${fileHash}.diff`;
      
      const patchContent = await fs.readFile(patchPath, 'utf-8');
      
      // Parse the diff and apply it
      const originalContent = await fs.readFile(filePath, 'utf-8');
      const patches = Diff.parsePatch(patchContent);
      
      if (patches.length === 0) {
        return { success: false, message: 'No valid patches found' };
      }

      // Find the patch that matches this file
      let targetPatch = null;
      for (const patch of patches) {
        if (patch.oldFileName === filePath || patch.newFileName === filePath || 
            patch.oldFileName?.endsWith(path.basename(filePath)) || 
            patch.newFileName?.endsWith(path.basename(filePath))) {
          targetPatch = patch;
          break;
        }
      }
      
      if (!targetPatch) {
        // If no matching patch found, use the first one (backwards compatibility)
        targetPatch = patches[0];
      }

      const result = Diff.applyPatch(originalContent, targetPatch);
      
      if (result === false) {
        return { success: false, message: 'Failed to apply patch - content may have changed' };
      }

      // Backup original file
      const timestamp = Date.now();
      const backupPath = `${sessionDir}/patches/original-${fileName}-${fileHash}-${timestamp}.backup`;
      await fs.writeFile(backupPath, originalContent);

      // Apply the changes
      await fs.writeFile(filePath, result);
      
      return { 
        success: true, 
        message: `Successfully applied instrumentation. Backup saved to patches/original-${fileName}-${fileHash}-${timestamp}.backup` 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Failed to apply patch: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private extractVDTHashes(content: string): string[] {
    const vdtLogPattern = /\/\/ VDT:log ([a-f0-9]{8})/g;
    const hashes: string[] = [];
    let match;
    
    while ((match = vdtLogPattern.exec(content)) !== null) {
      hashes.push(match[1]);
    }
    
    return hashes;
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
    const patch = Diff.createPatch(fileName, original, modified, '', '');
    return patch;
  }

  private generateVdtLogRuntime(): string {
    return `// VDT Runtime - Auto-generated logging function
function vdtLog(event) {
  if (typeof process !== 'undefined' && process.stdout) {
    process.stdout.write(JSON.stringify(event) + '\\n');
  } else if (typeof console !== 'undefined') {
    console.log(JSON.stringify(event));
  }
}`;
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
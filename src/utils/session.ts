import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { VDTSession, VDTError } from '../types/index.js';

export class SessionManager {
  private vdtDir: string;

  constructor(repoRoot: string = process.cwd()) {
    this.vdtDir = join(repoRoot, '.vdt');
  }

  get currentVdtDir(): string {
    return this.vdtDir;
  }

  async createSession(repoRoot?: string, note?: string, ttlDays: number = 7): Promise<VDTSession> {
    const sid = uuidv4();
    const sessionRoot = repoRoot || process.cwd();
    
    const session: VDTSession = {
      sid,
      repoRoot: sessionRoot,
      createdAt: Date.now(),
      ttlDays,
      note,
      errors: []
    };

    // Create session directory structure using the session's repoRoot
    const sessionDir = this.getSessionDir(sid, sessionRoot);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(join(sessionDir, 'logs'), { recursive: true });
    await fs.mkdir(join(sessionDir, 'patches'), { recursive: true });
    await fs.mkdir(join(sessionDir, 'analysis'), { recursive: true });

    // Write session metadata
    await this.writeSessionMeta(session);

    return session;
  }

  async getSession(sid: string, repoRoot?: string): Promise<VDTSession | null> {
    try {
      // If repoRoot is provided, try that first
      if (repoRoot) {
        const sessionDir = join(repoRoot, '.vdt', 'sessions', sid);
        const metaPath = join(sessionDir, 'meta.json');
        try {
          const data = await fs.readFile(metaPath, 'utf-8');
          const session = JSON.parse(data);
          return session;
        } catch {
          // Continue to try default location
        }
      }

      // Try the default vdtDir
      const metaPath = join(this.getSessionDir(sid), 'meta.json');
      try {
        const data = await fs.readFile(metaPath, 'utf-8');
        const session = JSON.parse(data);
        return session;
      } catch (error) {
        console.warn(`[VDT] Failed to read session ${sid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
      }
    } catch (error) {
      console.warn(`[VDT] Session retrieval error for ${sid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }

  async updateSession(session: VDTSession): Promise<void> {
    await this.writeSessionMeta(session);
  }

  async addError(sid: string, tool: string, code: string, message: string): Promise<void> {
    const session = await this.getSession(sid);
    if (session) {
      session.errors.push({
        timestamp: Date.now(),
        tool,
        code,
        message
      });
      await this.updateSession(session);
    }
  }

  getSessionDir(sid: string, repoRoot?: string): string {
    if (repoRoot) {
      // Use the provided repoRoot to determine session directory
      return join(repoRoot, '.vdt', 'sessions', sid);
    }
    // Fall back to the instance's vdtDir
    return join(this.vdtDir, 'sessions', sid);
  }

  getResourceLink(sid: string, path: string): string {
    return `vdt://sessions/${sid}/${path}`;
  }

  private async writeSessionMeta(session: VDTSession): Promise<void> {
    const metaPath = join(this.getSessionDir(session.sid, session.repoRoot), 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(session, null, 2));
  }
}

export class FileManager {
  static async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  static async writeNDJSON(filePath: string, data: any): Promise<void> {
    const line = JSON.stringify(data) + '\n';
    await fs.appendFile(filePath, line);
  }

  static async readNDJSON(filePath: string): Promise<any[]> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    } catch {
      return [];
    }
  }

  static async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
}
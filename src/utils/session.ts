import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { VDTSession, VDTError } from '../types/index.js';

export class SessionManager {
  private vdtDir: string;

  constructor(repoRoot: string = process.cwd()) {
    this.vdtDir = join(repoRoot, '.vdt');
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

    // Create session directory structure
    const sessionDir = this.getSessionDir(sid);
    await fs.mkdir(sessionDir, { recursive: true });
    await fs.mkdir(join(sessionDir, 'logs'), { recursive: true });
    await fs.mkdir(join(sessionDir, 'patches'), { recursive: true });
    await fs.mkdir(join(sessionDir, 'analysis'), { recursive: true });

    // Write session metadata
    await this.writeSessionMeta(session);

    return session;
  }

  async getSession(sid: string): Promise<VDTSession | null> {
    try {
      const metaPath = join(this.getSessionDir(sid), 'meta.json');
      const data = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(data);
    } catch {
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

  getSessionDir(sid: string): string {
    return join(this.vdtDir, 'sessions', sid);
  }

  getResourceLink(sid: string, path: string): string {
    return `vdt://sessions/${sid}/${path}`;
  }

  private async writeSessionMeta(session: VDTSession): Promise<void> {
    const metaPath = join(this.getSessionDir(session.sid), 'meta.json');
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
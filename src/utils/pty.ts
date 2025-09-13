import * as pty from 'node-pty';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DevServerEvent } from '../types/index.js';

export class PTYManager {
  private processes: Map<string, pty.IPty> = new Map();
  private streams: Map<string, fs.FileHandle> = new Map();

  async startDevServer(
    sid: string,
    cmd: string,
    cwd: string,
    env: Record<string, string> = {},
    sessionDir: string
  ): Promise<{ pid: number }> {
    // Security: Whitelist env variables
    const allowedEnvKeys = ['PATH', 'NODE_OPTIONS', 'HTTP_PROXY', 'HTTPS_PROXY', 'NODE_ENV'];
    const safeEnv = Object.fromEntries(
      Object.entries({ ...process.env, ...env }).filter(([key]) => 
        allowedEnvKeys.includes(key)
      )
    );

    // Parse command
    const [command, ...args] = cmd.split(' ');
    
    // Start PTY process
    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd,
      env: safeEnv,
    });

    this.processes.set(sid, ptyProcess);

    // Open log file
    const logPath = path.join(sessionDir, 'logs', 'devserver.ndjson');
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    const logFile = await fs.open(logPath, 'w');
    this.streams.set(sid, logFile);

    // Listen to output
    ptyProcess.onData((data: string) => {
      const event: DevServerEvent = {
        ts: Date.now(),
        stream: 'stdout',
        level: 'info',
        msg: data.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      };
      
      // Write to log file
      logFile.write(JSON.stringify(event) + '\n');
    });

    ptyProcess.onExit((exitData: { exitCode: number; signal?: number }) => {
      const event: DevServerEvent = {
        ts: Date.now(),
        stream: 'stdout',
        level: exitData.exitCode === 0 ? 'info' : 'error',
        msg: `Process exited with code ${exitData.exitCode}${exitData.signal ? ` (signal: ${exitData.signal})` : ''}`
      };
      
      logFile.write(JSON.stringify(event) + '\n');
      this.cleanup(sid);
    });

    return { pid: ptyProcess.pid };
  }

  getProcess(sid: string): pty.IPty | undefined {
    return this.processes.get(sid);
  }

  getStatus(sid: string): { status: 'running' | 'exited'; pid?: number } {
    const process = this.processes.get(sid);
    if (!process) {
      return { status: 'exited' };
    }
    
    return {
      status: 'running',
      pid: process.pid
    };
  }

  async writeToProcess(sid: string, data: string): Promise<void> {
    const process = this.processes.get(sid);
    if (process) {
      process.write(data);
    }
  }

  async stopProcess(sid: string): Promise<void> {
    const process = this.processes.get(sid);
    if (process) {
      process.kill();
      this.cleanup(sid);
    }
  }

  private async cleanup(sid: string): Promise<void> {
    this.processes.delete(sid);
    
    const stream = this.streams.get(sid);
    if (stream) {
      await stream.close();
      this.streams.delete(sid);
    }
  }

  async dispose(): Promise<void> {
    // Stop all processes
    for (const [sid] of this.processes) {
      await this.stopProcess(sid);
    }
  }
}
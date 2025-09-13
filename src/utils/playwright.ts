import { chromium, Browser, Page, BrowserContext } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ActionEvent, ConsoleEvent, NetworkEvent } from '../types/index.js';

interface RecordingSession {
  recordId: string;
  page: Page;
  stepCounter: number;
  logFiles: {
    actions: fs.FileHandle;
    console: fs.FileHandle;
    network: fs.FileHandle;
  };
  snapshotDir: string;
}

export class PlaywrightManager extends EventEmitter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private recordings: Map<string, RecordingSession> = new Map();
  private sessionDir: string = '';

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
  }

  async startBrowser(entryUrl: string, sessionDir: string): Promise<void> {
    if (!this.browser) {
      await this.initialize();
    }

    this.sessionDir = sessionDir;
    this.context = await this.browser!.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: undefined, // We'll handle screenshots manually
    });

    this.page = await this.context.newPage();
    
    // Setup console logging
    this.page.on('console', async (msg) => {
      const consoleEvent: ConsoleEvent = {
        ts: Date.now(),
        type: msg.type() as 'error' | 'warn' | 'log',
        args: await Promise.all(msg.args().map(arg => arg.jsonValue())),
        stack: msg.location() ? `${msg.location().url}:${msg.location().lineNumber}:${msg.location().columnNumber}` : undefined,
      };

      // Emit for HUD listeners
      this.emit('console_event', consoleEvent);

      // Write to console log if we have an active recording
      for (const recording of this.recordings.values()) {
        recording.logFiles.console.write(JSON.stringify(consoleEvent) + '\n');
      }
    });

    // Setup network logging
    this.page.on('request', (request) => {
      const networkEvent: NetworkEvent = {
        ts: Date.now(),
        phase: 'request',
        method: request.method(),
        url: request.url(),
        reqId: `net_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      // Emit for HUD listeners
      this.emit('network_event', networkEvent);

      // Write to network log if we have an active recording
      for (const recording of this.recordings.values()) {
        recording.logFiles.network.write(JSON.stringify(networkEvent) + '\n');
      }
    });

    this.page.on('response', (response) => {
      const networkEvent: NetworkEvent = {
        ts: Date.now(),
        phase: 'response',
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
        reqId: `net_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      // Emit for HUD listeners
      this.emit('network_event', networkEvent);

      // Write to network log if we have an active recording
      for (const recording of this.recordings.values()) {
        recording.logFiles.network.write(JSON.stringify(networkEvent) + '\n');
      }
    });

    await this.page.goto(entryUrl);
  }

  async startRecording(recordId: string, entryUrl: string, selectors?: { prefer: string[] }): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized. Call startBrowser first.');
    }

    // Create recording session directories
    const snapshotDir = path.join(this.sessionDir, 'snapshots', `rec_${recordId}`);
    await fs.mkdir(snapshotDir, { recursive: true });

    // Open log files
    const logsDir = path.join(this.sessionDir, 'logs');
    await fs.mkdir(logsDir, { recursive: true });

    const actionsFile = await fs.open(path.join(logsDir, 'actions.rec.ndjson'), 'w');
    const consoleFile = await fs.open(path.join(logsDir, 'console.rec.ndjson'), 'w');
    const networkFile = await fs.open(path.join(logsDir, 'network.rec.ndjson'), 'w');

    const recording: RecordingSession = {
      recordId,
      page: this.page,
      stepCounter: 0,
      logFiles: {
        actions: actionsFile,
        console: consoleFile,
        network: networkFile,
      },
      snapshotDir,
    };

    this.recordings.set(recordId, recording);

    // Navigate to entry URL
    await this.page.goto(entryUrl);

    // Setup action recording
    await this.setupActionRecording(recording, selectors);
  }

  private async setupActionRecording(recording: RecordingSession, selectors?: { prefer: string[] }): Promise<void> {
    const { page, logFiles, snapshotDir } = recording;

    // Record clicks - using locator approach instead of page events
    await page.addInitScript(() => {
      document.addEventListener('click', async (event) => {
        // This will be captured by the evaluate script below
        (window as any).__vdt_last_click = {
          x: event.clientX,
          y: event.clientY,
          target: event.target,
          timestamp: Date.now()
        };
      });
    });

    // Poll for click events
    const checkClickEvents = async () => {
      try {
        const clickData = await page.evaluate(() => {
          const click = (window as any).__vdt_last_click;
          if (click && click.timestamp > (window as any).__vdt_last_processed || 0) {
            (window as any).__vdt_last_processed = click.timestamp;
            return click;
          }
          return null;
        });

        if (clickData) {
          const stepId = `act_${String(++recording.stepCounter).padStart(5, '0')}`;
          const screenshot = path.join(snapshotDir, `${stepId}.png`);
          
          // Take screenshot
          await page.screenshot({ path: screenshot });

          const actionEvent: ActionEvent = {
            ts: clickData.timestamp,
            type: 'click',
            url: page.url(),
            coords: { x: clickData.x, y: clickData.y },
            screenshot: `snapshots/rec_${recording.recordId}/${stepId}.png`,
            stepId,
          };

          logFiles.actions.write(JSON.stringify(actionEvent) + '\n');
        }
      } catch (error) {
        console.error('Error checking click events:', error);
      }
    };

    // Check for click events every 100ms
    const clickInterval = setInterval(checkClickEvents, 100);

    // Store interval for cleanup
    (recording as any).clickInterval = clickInterval;

    // Record navigation
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        const stepId = `act_${String(++recording.stepCounter).padStart(5, '0')}`;
        
        const actionEvent: ActionEvent = {
          ts: Date.now(),
          type: 'navigate',
          url: frame.url(),
          stepId,
        };

        logFiles.actions.write(JSON.stringify(actionEvent) + '\n');
      }
    });
  }

  async stopRecording(recordId: string, exportFormats: Array<'playwright' | 'json'>): Promise<{
    script: { playwright?: string; json?: string };
    links: string[];
  }> {
    const recording = this.recordings.get(recordId);
    if (!recording) {
      throw new Error(`Recording ${recordId} not found`);
    }

    // Clean up intervals
    if ((recording as any).clickInterval) {
      clearInterval((recording as any).clickInterval);
    }

    // Close log files
    await recording.logFiles.actions.close();
    await recording.logFiles.console.close();
    await recording.logFiles.network.close();

    // Generate scripts
    const scriptsDir = path.join(this.sessionDir, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });

    const scripts: { playwright?: string; json?: string } = {};
    const links: string[] = [];

    if (exportFormats.includes('playwright')) {
      const playwrightScript = await this.generatePlaywrightScript(recordId);
      const scriptPath = path.join(scriptsDir, `rec_${recordId}.spec.ts`);
      await fs.writeFile(scriptPath, playwrightScript);
      scripts.playwright = `vdt://sessions/${path.basename(this.sessionDir)}/scripts/rec_${recordId}.spec.ts`;
    }

    if (exportFormats.includes('json')) {
      const jsonScript = await this.generateJsonScript(recordId);
      const scriptPath = path.join(scriptsDir, `rec_${recordId}.actions.json`);
      await fs.writeFile(scriptPath, JSON.stringify(jsonScript, null, 2));
      scripts.json = `vdt://sessions/${path.basename(this.sessionDir)}/scripts/rec_${recordId}.actions.json`;
    }

    // Add log files to links
    links.push(
      `vdt://sessions/${path.basename(this.sessionDir)}/logs/actions.rec.ndjson`,
      `vdt://sessions/${path.basename(this.sessionDir)}/snapshots/rec_${recordId}/`
    );

    this.recordings.delete(recordId);
    return { script: scripts, links };
  }

  private async generatePlaywrightScript(recordId: string): Promise<string> {
    // Read actions from log file
    const actionsPath = path.join(this.sessionDir, 'logs', 'actions.rec.ndjson');
    const actionsContent = await fs.readFile(actionsPath, 'utf-8');
    const actions = actionsContent.split('\n').filter(line => line.trim()).map(line => JSON.parse(line) as ActionEvent);

    let script = `import { test, expect } from '@playwright/test';

test('recorded session ${recordId}', async ({ page }) => {
`;

    for (const action of actions) {
      switch (action.type) {
        case 'navigate':
          script += `  await page.goto('${action.url}');\n`;
          break;
        case 'click':
          if (action.selector) {
            script += `  await page.click('${action.selector}');\n`;
          } else if (action.coords) {
            script += `  await page.mouse.click(${action.coords.x}, ${action.coords.y});\n`;
          }
          break;
        case 'input':
          if (action.selector && action.value) {
            script += `  await page.fill('${action.selector}', '${action.value}');\n`;
          }
          break;
      }
    }

    script += `});
`;

    return script;
  }

  private async generateJsonScript(recordId: string): Promise<any> {
    const actionsPath = path.join(this.sessionDir, 'logs', 'actions.rec.ndjson');
    const actionsContent = await fs.readFile(actionsPath, 'utf-8');
    const actions = actionsContent.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));

    return {
      recordId,
      timestamp: Date.now(),
      actions,
    };
  }

  async replayScript(scriptPath: string, mode: 'headless' | 'headed' = 'headless'): Promise<{
    passed: boolean;
    summary: { steps: number; failStep?: string };
    links: string[];
  }> {
    // This is a simplified implementation
    // In a real implementation, you would execute the Playwright script
    
    const replayDir = path.join(this.sessionDir, 'snapshots', `replay_${new Date().toISOString().split('T')[0]}`);
    await fs.mkdir(replayDir, { recursive: true });

    // For now, return a mock result
    return {
      passed: true,
      summary: { steps: 5 },
      links: [
        `vdt://sessions/${path.basename(this.sessionDir)}/logs/console.replay.ndjson`,
        `vdt://sessions/${path.basename(this.sessionDir)}/logs/network.replay.ndjson`,
      ],
    };
  }

  getStatus(): { status: 'ready' | 'closed'; pages: number } {
    if (!this.context) {
      return { status: 'closed', pages: 0 };
    }
    
    return {
      status: 'ready',
      pages: this.context.pages().length,
    };
  }

  async dispose(): Promise<void> {
    // Close all recordings
    for (const [recordId] of this.recordings) {
      try {
        await this.stopRecording(recordId, []);
      } catch (error) {
        console.error(`Error stopping recording ${recordId}:`, error);
      }
    }

    if (this.context) {
      await this.context.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
  }
}
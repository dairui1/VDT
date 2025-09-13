import * as path from 'path';
import * as fs from 'fs/promises';
import { ReasonerTask, ReasonerResult, ReasonerTaskType, BackendConfig } from '../types/index.js';
import { ReasonerConfigManager } from '../utils/reasoner-config.js';
import { ReasoningScoreCalculator } from '../utils/reasoning-score.js';
import { ReasonerDriver, DriverContext } from './drivers/base.js';
import { CodexDriver } from './drivers/codex.js';
import { OpenAIDriver } from './drivers/openai.js';

export class ReasonerAdapter {
  private configManager: ReasonerConfigManager;
  private scoreCalculator: ReasoningScoreCalculator;
  private drivers: Map<string, ReasonerDriver> = new Map();

  constructor(vdtRoot?: string) {
    this.configManager = new ReasonerConfigManager(vdtRoot);
    this.scoreCalculator = new ReasoningScoreCalculator();
  }

  async initialize(): Promise<void> {
    await this.configManager.loadConfig();
    await this.loadDrivers();
  }

  async executeTask(task: ReasonerTask, sessionDir: string): Promise<ReasonerResult> {
    try {
      // Determine which backend to use
      const backendName = await this.selectBackend(task, sessionDir);
      const driver = this.drivers.get(backendName);

      if (!driver) {
        throw new Error(`Driver not found for backend: ${backendName}`);
      }

      // Build execution context
      const context: DriverContext = {
        sessionDir,
        timeout: this.configManager.getTimeout(task.task),
        redact: task.redact ?? true,
      };

      // Execute with retry logic
      let lastError: Error | null = null;
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await driver.execute(task, context);
          
          // Save result to session
          await this.saveResult(task, result, sessionDir);
          
          return result;

        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn(`[VDT] Reasoner attempt ${attempt + 1} failed:`, lastError.message);

          // Try fallback backend on last attempt
          if (attempt === maxRetries) {
            const fallbackBackend = this.configManager.getFallbackBackend();
            if (fallbackBackend && fallbackBackend !== backendName) {
              const fallbackDriver = this.drivers.get(fallbackBackend);
              if (fallbackDriver) {
                console.log(`[VDT] Trying fallback backend: ${fallbackBackend}`);
                try {
                  const result = await fallbackDriver.execute(task, context);
                  await this.saveResult(task, result, sessionDir);
                  return result;
                } catch (fallbackError) {
                  console.error(`[VDT] Fallback backend also failed:`, fallbackError);
                }
              }
            }
          }

          // Wait before retry (exponential backoff)
          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError || new Error('All retry attempts failed');

    } catch (error) {
      console.error('[VDT] ReasonerAdapter execution failed:', error);
      throw error;
    }
  }

  private async selectBackend(task: ReasonerTask, sessionDir: string): Promise<string> {
    const routingBackend = this.configManager.getRoutingBackend(task.task);
    
    if (routingBackend !== 'auto') {
      return routingBackend;
    }

    // Calculate reasoning score for automatic backend selection
    const reasonScore = await this.scoreCalculator.calculateReasonScore(sessionDir);
    const threshold = this.configManager.getAdvancedThreshold();

    console.log(`[VDT] Reasoning score: ${reasonScore.toFixed(3)}, threshold: ${threshold}`);

    if (reasonScore >= threshold) {
      // Use high-quality backend
      const config = this.configManager.getConfig();
      const advancedBackends = Object.entries(config.backends)
        .filter(([, cfg]) => cfg.cost_hint === 'high')
        .map(([name]) => name);

      return advancedBackends[0] || this.configManager.getDefaultBackend();
    } else {
      // Use default/cheaper backend
      return this.configManager.getDefaultBackend();
    }
  }

  private async loadDrivers(): Promise<void> {
    const config = this.configManager.getConfig();

    for (const [name, backendConfig] of Object.entries(config.backends)) {
      try {
        const driver = this.createDriver(backendConfig);
        this.drivers.set(name, driver);
        console.log(`[VDT] Loaded reasoner driver: ${name} (${backendConfig.type})`);
      } catch (error) {
        console.warn(`[VDT] Failed to load reasoner driver ${name}:`, error);
      }
    }

    if (this.drivers.size === 0) {
      console.warn('[VDT] No reasoner drivers loaded. Reasoning features will be unavailable.');
    }
  }

  private createDriver(config: BackendConfig): ReasonerDriver {
    switch (config.type) {
      case 'cli':
        // Determine driver type based on command
        if (config.cmd === 'codex' || config.cmd?.includes('codex')) {
          return new CodexDriver(config);
        }
        // For other CLI tools, use OpenAI driver as fallback
        return new OpenAIDriver(config);

      case 'http':
        return new OpenAIDriver(config);

      case 'mcp':
        if (config.cmd === 'codex' || config.cmd?.includes('codex')) {
          return new CodexDriver(config);
        }
        throw new Error(`Unsupported MCP backend: ${config.cmd}`);

      default:
        throw new Error(`Unsupported backend type: ${config.type}`);
    }
  }

  private async saveResult(task: ReasonerTask, result: ReasonerResult, sessionDir: string): Promise<void> {
    try {
      const analysisDir = path.join(sessionDir, 'analysis');
      await fs.mkdir(analysisDir, { recursive: true });

      const filename = `reasoner_${task.task}.json`;
      const filePath = path.join(analysisDir, filename);

      const output = {
        task: task.task,
        timestamp: new Date().toISOString(),
        inputs: task.inputs,
        result,
      };

      await fs.writeFile(filePath, JSON.stringify(output, null, 2), 'utf-8');
      console.log(`[VDT] Reasoner result saved to: ${filePath}`);

    } catch (error) {
      console.error('[VDT] Failed to save reasoner result:', error);
    }
  }

  // Utility method to check if reasoning is available
  isAvailable(): boolean {
    return this.drivers.size > 0;
  }

  // Get list of available backends
  getAvailableBackends(): string[] {
    return Array.from(this.drivers.keys());
  }

  // Get backend configuration
  getBackendConfig(name: string): BackendConfig | undefined {
    return this.configManager.getBackend(name);
  }
}
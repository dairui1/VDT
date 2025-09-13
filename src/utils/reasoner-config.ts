import * as fs from 'fs/promises';
import * as path from 'path';
import { ReasonerConfig, BackendConfig } from '../types/index.js';

const DEFAULT_CONFIG: ReasonerConfig = {
  default_backend: 'codex',
  fallback_backend: 'openai',
  backends: {
    codex: {
      type: 'mcp',
      cmd: 'codex',
      args: ['-m', 'gpt-5', '-c', 'model_reasoning_effort=high', 'mcp'],
      cost_hint: 'high',
      supports: ['analyze_log', 'propose_patch', 'review_patch'],
    },
    openai: {
      type: 'http',
      base_url: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      api_key_env: 'OPENAI_API_KEY',
      cost_hint: 'low',
      supports: ['analyze_log', 'propose_patch', 'review_patch'],
    },
    openrouter: {
      type: 'http',
      base_url: 'https://openrouter.ai/api/v1',
      model: 'meta-llama/llama-3.1-70b-instruct',
      api_key_env: 'OPENROUTER_API_KEY',
      cost_hint: 'medium',
      supports: ['analyze_log', 'propose_patch', 'review_patch'],
    },
  },
  routing: {
    propose_patch: 'codex',
    review_patch: 'codex',
    analyze_log: 'auto',
    auto: 'auto',
  },
  thresholds: {
    reason_score_advanced: 0.55,
  },
  timeouts: {
    default_sec: 90,
    analyze_sec: 120,
    patch_sec: 120,
  },
};

export class ReasonerConfigManager {
  private config: ReasonerConfig;
  private configPath: string;

  constructor(vdtRoot?: string) {
    this.configPath = path.join(vdtRoot || process.cwd(), '.vdt', 'reasoners.json');
    this.config = { ...DEFAULT_CONFIG };
  }

  async loadConfig(): Promise<ReasonerConfig> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const userConfig = JSON.parse(configContent) as Partial<ReasonerConfig>;
      
      // Merge with defaults
      this.config = {
        ...DEFAULT_CONFIG,
        ...userConfig,
        backends: {
          ...DEFAULT_CONFIG.backends,
          ...userConfig.backends,
        },
        routing: {
          ...DEFAULT_CONFIG.routing,
          ...userConfig.routing,
        },
        thresholds: {
          ...DEFAULT_CONFIG.thresholds,
          ...userConfig.thresholds,
        },
        timeouts: {
          ...DEFAULT_CONFIG.timeouts,
          ...userConfig.timeouts,
        },
      };
    } catch (error) {
      // Config file doesn't exist or is invalid, use defaults
      console.warn('[VDT] Reasoner config not found, using defaults:', error);
      await this.saveConfig();
    }

    return this.config;
  }

  async saveConfig(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    } catch (error) {
      console.error('[VDT] Failed to save reasoner config:', error);
    }
  }

  getConfig(): ReasonerConfig {
    return this.config;
  }

  getBackend(name: string): BackendConfig | undefined {
    return this.config.backends[name];
  }

  getDefaultBackend(): string {
    return this.config.default_backend;
  }

  getFallbackBackend(): string | undefined {
    return this.config.fallback_backend;
  }

  getTimeout(task: string): number {
    switch (task) {
      case 'analyze_log':
        return this.config.timeouts.analyze_sec * 1000;
      case 'propose_patch':
      case 'review_patch':
        return this.config.timeouts.patch_sec * 1000;
      default:
        return this.config.timeouts.default_sec * 1000;
    }
  }

  getRoutingBackend(task: string): string {
    const routing = this.config.routing[task as keyof typeof this.config.routing];
    return routing || this.config.default_backend;
  }

  getAdvancedThreshold(): number {
    return this.config.thresholds.reason_score_advanced;
  }
}
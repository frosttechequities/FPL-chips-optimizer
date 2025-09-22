import { performance } from 'perf_hooks';

export type ProviderStatus = 'online' | 'degraded' | 'offline';

export interface ProviderCallMetadata {
  provider: string;
  status: ProviderStatus;
  lastSuccessAt?: Date;
  lastErrorAt?: Date;
  lastLatencyMs?: number;
  totalRequests: number;
  consecutiveFailures: number;
  circuitOpenedAt?: Date;
  dataCurrencyMinutes?: number;
  extra?: Record<string, unknown>;
}

export interface ProviderAdapterConfig {
  failureThreshold?: number;
  cooldownMs?: number;
}

export class ProviderCircuitOpenError extends Error {
  constructor(provider: string) {
    super(`Circuit breaker is open for provider: ${provider}`);
    this.name = 'ProviderCircuitOpenError';
  }
}

const DEFAULT_CONFIG: Required<ProviderAdapterConfig> = {
  failureThreshold: 3,
  cooldownMs: 60_000,
};

export abstract class BaseProviderAdapter {
  protected readonly metadata: ProviderCallMetadata;
  private readonly config: Required<ProviderAdapterConfig>;

  constructor(provider: string, config?: ProviderAdapterConfig) {
    this.metadata = {
      provider,
      status: 'online',
      totalRequests: 0,
      consecutiveFailures: 0,
    };
    this.config = {
      failureThreshold: config?.failureThreshold ?? DEFAULT_CONFIG.failureThreshold,
      cooldownMs: config?.cooldownMs ?? DEFAULT_CONFIG.cooldownMs,
    };
  }

  protected async run<T>(operation: string, handler: () => Promise<T>, options?: {
    onSuccess?: (result: T) => number | undefined;
  }): Promise<T> {
    if (this.metadata.circuitOpenedAt) {
      const elapsed = Date.now() - this.metadata.circuitOpenedAt.getTime();
      if (elapsed < this.config.cooldownMs) {
        throw new ProviderCircuitOpenError(this.metadata.provider);
      }

      // Cooldown elapsed; reset breaker
      this.metadata.circuitOpenedAt = undefined;
      this.metadata.consecutiveFailures = 0;
      this.metadata.status = 'degraded';
    }

    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      const result = await handler();
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.metadata.lastLatencyMs = Math.round(end - start);
      this.metadata.lastSuccessAt = new Date();
      this.metadata.status = 'online';
      this.metadata.consecutiveFailures = 0;
      this.metadata.totalRequests += 1;

      if (options?.onSuccess) {
        const maybeCurrency = options.onSuccess(result);
        if (typeof maybeCurrency === 'number' && Number.isFinite(maybeCurrency)) {
          this.metadata.dataCurrencyMinutes = maybeCurrency;
        }
      }

      return result;
    } catch (error) {
      const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
      this.metadata.lastLatencyMs = Math.round(end - start);
      this.metadata.lastErrorAt = new Date();
      this.metadata.totalRequests += 1;
      this.metadata.consecutiveFailures += 1;

      if (this.metadata.consecutiveFailures >= this.config.failureThreshold) {
        this.metadata.status = 'offline';
        this.metadata.circuitOpenedAt = new Date();
      } else {
        this.metadata.status = 'degraded';
      }

      throw error;
    }
  }

  protected setExtra(extra: Record<string, unknown>): void {
    this.metadata.extra = { ...(this.metadata.extra ?? {}), ...extra };
  }

  getMetadata(): ProviderCallMetadata {
    return { ...this.metadata };
  }

  resetCircuit(): void {
    this.metadata.circuitOpenedAt = undefined;
    this.metadata.consecutiveFailures = 0;
    this.metadata.status = 'online';
  }
}

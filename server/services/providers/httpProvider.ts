import { BaseProviderAdapter } from "./baseProvider";

export interface HttpProviderConfig {
  baseUrl: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

export interface HttpRequestOptions<T> extends RequestInit {
  retries?: number;
  timeoutMs?: number;
  mapDataCurrency?: (result: T) => number | undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class HttpProviderAdapter extends BaseProviderAdapter {
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly defaultTimeout: number;
  private readonly defaultRetries: number;

  constructor(provider: string, config: HttpProviderConfig) {
    super(provider);
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.defaultTimeout = config.timeoutMs ?? 15000;
    this.defaultRetries = config.retries ?? 2;
  }

  async getJson<T>(path: string, options?: HttpRequestOptions<T>): Promise<T> {
    return this.request<T>('GET', path, async response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response.json() as Promise<T>;
    }, options);
  }

  async getText(path: string, options?: HttpRequestOptions<string>): Promise<string> {
    return this.request<string>('GET', path, async response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response.text();
    }, options);
  }

  protected async request<T>(method: string, path: string, parser: (response: Response) => Promise<T>, options?: HttpRequestOptions<T>): Promise<T> {
    const url = this.resolveUrl(path);
    const retries = options?.retries ?? this.defaultRetries;
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeout;
    const headers = {
      ...this.defaultHeaders,
      ...(options?.headers ?? {}),
    } as Record<string, string>;

    return this.run(`${method.toUpperCase()} ${url}`, async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, {
            ...options,
            method,
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const result = await parser(response);
          if (options?.mapDataCurrency) {
            const minutes = options.mapDataCurrency(result);
            if (typeof minutes === 'number' && Number.isFinite(minutes)) {
              this.metadata.dataCurrencyMinutes = minutes;
            }
          }
          return result;
        } catch (error) {
          clearTimeout(timeout);
          lastError = error;
          if (attempt === retries) {
            throw error;
          }
          await delay(250 * (attempt + 1));
        }
      }
      throw lastError ?? new Error('Unknown HTTP provider error');
    });
  }

  private resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }
}

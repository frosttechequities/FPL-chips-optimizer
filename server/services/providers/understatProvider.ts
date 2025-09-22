import { HttpProviderAdapter, type HttpRequestOptions } from "./httpProvider";

export class UnderstatHttpProvider extends HttpProviderAdapter {
  constructor() {
    super('advanced-stats', {
      baseUrl: 'https://understat.com',
      timeoutMs: parseInt(process.env.UNDERSTAT_TIMEOUT_MS || '10000', 10),
      retries: parseInt(process.env.UNDERSTAT_RETRIES || '1', 10),
      defaultHeaders: {
        'User-Agent': 'Mozilla/5.0 (compatible; FPL-Strategy-Bot/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
  }

  fetchLeaguePage(path: string, options?: HttpRequestOptions<string>): Promise<string> {
    return this.getText(path, options);
  }
}

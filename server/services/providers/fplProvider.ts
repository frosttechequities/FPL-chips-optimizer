import { HttpProviderAdapter } from "./httpProvider";

export class FPLProvider extends HttpProviderAdapter {
  constructor(config?: { timeoutMs?: number; retries?: number }) {
    super('fpl-api', {
      baseUrl: 'https://fantasy.premierleague.com/api',
      timeoutMs: config?.timeoutMs ?? parseInt(process.env.FPL_FETCH_TIMEOUT_MS || '15000', 10),
      retries: config?.retries ?? parseInt(process.env.FPL_FETCH_RETRIES || '2', 10),
      defaultHeaders: {
        'User-Agent': 'FPL-Chip-Strategy-Architect/1.0',
        Accept: 'application/json',
      },
    });
  }

  getBootstrapStatic<T>(): Promise<T> {
    return this.getJson<T>('/bootstrap-static/');
  }

  getFixtures<T>(): Promise<T> {
    return this.getJson<T>('/fixtures/');
  }

  getEntry<T>(entryId: number): Promise<T> {
    return this.getJson<T>(`/entry/${entryId}/`);
  }

  getEntryHistory<T>(entryId: number): Promise<T> {
    return this.getJson<T>(`/entry/${entryId}/history/`);
  }

  getEntryPicks<T>(entryId: number, eventId: number): Promise<T> {
    return this.getJson<T>(`/entry/${entryId}/event/${eventId}/picks/`);
  }
}

import {
  type FPLPlayer,
  type FPLTeam,
  type FPLFixture,
  type FPLUserSquad
} from '@shared/schema';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { FPLProvider } from './providers';

interface FPLBootstrapResponse {
  events: any[];
  game_settings: any;
  phases: any[];
  teams: FPLTeam[];
  total_players: number;
  elements: FPLPlayer[];
  element_stats: any[];
  element_types: {
    id: number;
    plural_name: string;
    plural_name_short: string;
    singular_name: string;
    singular_name_short: string;
    squad_select: number;
    squad_min_play: number;
    squad_max_play: number;
    ui_shirt_specific: boolean;
    sub_positions_locked: any[];
    element_count: number;
  }[];
}

export class FPLApiService {
  private static instance: FPLApiService;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly cacheExpiry = 5 * 60 * 1000; // 5 minutes
  private readonly provider: FPLProvider;

  public static getInstance(): FPLApiService {
    if (!FPLApiService.instance) {
      FPLApiService.instance = new FPLApiService();
    }
    return FPLApiService.instance;
  }

  constructor() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    try {
      if (proxyUrl) {
        const agent = new ProxyAgent(proxyUrl);
        setGlobalDispatcher(agent);
        console.log(`[FPLApiService] Using proxy for outbound requests: ${proxyUrl}`);
      }
    } catch (error) {
      console.warn('[FPLApiService] Failed to initialise proxy agent:', error);
    }

    this.provider = new FPLProvider();
  }

  getProviderMetadata() {
    return this.provider.getMetadata();
  }

  private async fetchWithCache<T>(cacheKey: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.cacheExpiry) {
      return cached.data as T;
    }

    try {
      const data = await fetcher();
      this.cache.set(cacheKey, { data, timestamp: now });
      return data;
    } catch (error) {
      console.error(`[FPLApiService] Error for ${cacheKey}:`, error);
      if (cached) {
        console.warn(`[FPLApiService] Using stale cache for ${cacheKey} due to error.`);
        return cached.data as T;
      }
      throw new Error(`Failed to fetch data from FPL API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getBootstrapData(): Promise<FPLBootstrapResponse> {
    return this.fetchWithCache('bootstrap', () => this.provider.getBootstrapStatic<FPLBootstrapResponse>());
  }

  async getFixtures(): Promise<FPLFixture[]> {
    return this.fetchWithCache('fixtures', () => this.provider.getFixtures<FPLFixture[]>());
  }

  async getUserSquad(managerId: number, gameweek?: number): Promise<FPLUserSquad> {
    const currentGW = gameweek || await this.getCurrentGameweek();
    const cacheKey = `squad-${managerId}-${currentGW}`;
    return this.fetchWithCache(cacheKey, () => this.provider.getEntryPicks<FPLUserSquad>(managerId, currentGW));
  }

  async getUserHistory(managerId: number): Promise<{
    current: Array<{
      event: number;
      points: number;
      total_points: number;
      rank: number;
      overall_rank: number;
      bank: number;
      value: number;
      event_transfers: number;
      event_transfers_cost: number;
      points_on_bench: number;
    }>;
    past: any[];
    chips: Array<{
      name: string;
      time: string;
      event: number;
    }>;
  }> {
    return this.fetchWithCache(`history-${managerId}`, () => this.provider.getEntryHistory(managerId));
  }

  async getUserInfo(managerId: number): Promise<{ name: string; player_first_name: string; player_last_name: string }> {
    return this.fetchWithCache(`user-${managerId}`, () => this.provider.getEntry(managerId));
  }

  async getCurrentGameweek(): Promise<number> {
    const bootstrap = await this.getBootstrapData();
    const currentEvent = bootstrap.events.find(event => event.is_current);
    return currentEvent?.id || 1;
  }

  async getUpcomingFixtures(gameweeksAhead: number = 10): Promise<FPLFixture[]> {
    const fixtures = await this.getFixtures();
    const currentGW = await this.getCurrentGameweek();

    return fixtures.filter(fixture =>
      fixture.event >= currentGW &&
      fixture.event <= currentGW + gameweeksAhead &&
      !fixture.finished
    );
  }

  async computeFreeTransfers(managerId: number): Promise<number> {
    try {
      const history = await this.getUserHistory(managerId);
      const currentGW = await this.getCurrentGameweek();

      const currentGWData = history.current.find(gw => gw.event === currentGW);
      const previousGWData = history.current.find(gw => gw.event === currentGW - 1);

      if (!currentGWData) {
        return 1;
      }

      if (currentGWData.event_transfers_cost > 0) {
        return 0;
      }

      let freeTransfers = 1;
      if (previousGWData && previousGWData.event_transfers === 0) {
        freeTransfers = Math.min(2, freeTransfers + 1);
      }

      return freeTransfers;
    } catch (error) {
      console.warn('Could not compute free transfers, defaulting to 1:', error);
      return 1;
    }
  }

  async getPlayerExpectedPoints(playerId: number, gameweeksAhead: number = 5): Promise<number> {
    try {
      const bootstrap = await this.getBootstrapData();
      const player = bootstrap.elements.find(p => p.id === playerId);
      if (!player) return 0;

      const currentGW = await this.getCurrentGameweek();
      const approxGamesPlayed = Math.max(1, currentGW - 1);
      const basePPG = player.total_points / approxGamesPlayed;

      const fixtures = await this.getUpcomingFixtures(gameweeksAhead);
      const teamFixtures = fixtures.filter(f => f.team_h === player.team || f.team_a === player.team);

      const fdrWeight = (fdr: number) => Math.max(0.6, Math.min(1.4, 1 + (3 - fdr) * 0.15));

      const totalWeight = teamFixtures
        .slice(0, gameweeksAhead)
        .reduce((sum, f) => {
          const fdr = player.team === f.team_h ? f.team_h_difficulty : f.team_a_difficulty;
          return sum + fdrWeight(fdr);
        }, 0);

      const expected = basePPG * (totalWeight || gameweeksAhead);
      return Math.max(0, Math.round(expected * 10) / 10);
    } catch (error) {
      console.warn(`Could not calculate expected points for player ${playerId}:`, error);
      return 0;
    }
  }

  async getNextDeadline(): Promise<string> {
    try {
      const bootstrap = await this.getBootstrapData();
      const nextEvent = bootstrap.events.find(event => event.is_next);
      if (nextEvent?.deadline_time) {
        return nextEvent.deadline_time;
      }
      const upcomingEvent = bootstrap.events.find(event => !event.finished) || bootstrap.events[0];
      return upcomingEvent?.deadline_time || new Date().toISOString();
    } catch (error) {
      console.warn('Could not get next deadline:', error);
      return new Date().toISOString();
    }
  }

  async getAllPlayersWithExpectedPoints(gameweeksAhead: number = 5): Promise<Array<FPLPlayer & { expectedPoints: number }>> {
    const bootstrap = await this.getBootstrapData();
    return Promise.all(
      bootstrap.elements.map(async player => ({
        ...player,
        expectedPoints: await this.getPlayerExpectedPoints(player.id, gameweeksAhead),
      })),
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  clearCacheEntry(key: string): void {
    this.cache.delete(key);
  }
}

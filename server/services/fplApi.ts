import {
  type FPLPlayer,
  type FPLTeam,
  type FPLFixture,
  type FPLUserSquad
} from "@shared/schema";
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const FPL_BASE_URL = 'https://fantasy.premierleague.com/api';

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
  private readonly timeoutMs = parseInt(process.env.FPL_FETCH_TIMEOUT_MS || '15000', 10);
  private readonly retries = parseInt(process.env.FPL_FETCH_RETRIES || '2', 10);

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
    } catch (e) {
      console.warn('[FPLApiService] Failed to initialize proxy agent:', e);
    }
  }

  private async fetchJson(url: string, init?: RequestInit): Promise<any> {
    let lastErr: any = null;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            'User-Agent': 'FPL-Chip-Strategy-Architect/1.0',
            'Accept': 'application/json',
            ...(init?.headers || {})
          }
        } as RequestInit);
        clearTimeout(timer);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status} ${res.statusText} ${text}`);
        }
        return await res.json();
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
      }
    }
    throw lastErr || new Error('Network error');
  }

  private async fetchWithCache<T>(url: string, cacheKey: string): Promise<T> {
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.cacheExpiry) {
      return cached.data as T;
    }

    try {
      const data = await this.fetchJson(url);
      this.cache.set(cacheKey, { data, timestamp: now });
      return data as T;
    } catch (error) {
      console.error(`FPL API Error for ${url}:`, error);
      throw new Error(`Failed to fetch data from FPL API: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getBootstrapData(): Promise<FPLBootstrapResponse> {
    return this.fetchWithCache<FPLBootstrapResponse>(
      `${FPL_BASE_URL}/bootstrap-static/`,
      'bootstrap'
    );
  }

  async getFixtures(): Promise<FPLFixture[]> {
    return this.fetchWithCache<FPLFixture[]>(
      `${FPL_BASE_URL}/fixtures/`,
      'fixtures'
    );
  }

  async getUserSquad(managerId: number, gameweek?: number): Promise<FPLUserSquad> {
    const currentGW = gameweek || await this.getCurrentGameweek();
    const cacheKey = `squad-${managerId}-${currentGW}`;
    
    return this.fetchWithCache<FPLUserSquad>(
      `${FPL_BASE_URL}/entry/${managerId}/event/${currentGW}/picks/`,
      cacheKey
    );
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
    return this.fetchWithCache(
      `${FPL_BASE_URL}/entry/${managerId}/history/`,
      `history-${managerId}`
    );
  }

  async getUserInfo(managerId: number): Promise<{ name: string; player_first_name: string; player_last_name: string }> {
    return this.fetchWithCache<{ name: string; player_first_name: string; player_last_name: string }>(
      `${FPL_BASE_URL}/entry/${managerId}/`,
      `user-${managerId}`
    );
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
      
      // Find current and previous gameweek data
      const currentGWData = history.current.find(gw => gw.event === currentGW);
      const previousGWData = history.current.find(gw => gw.event === currentGW - 1);
      
      if (!currentGWData) {
        return 1; // Default to 1 free transfer if no data
      }
      
      // If transfers were made this week and cost points, then no free transfers left
      if (currentGWData.event_transfers_cost > 0) {
        return 0;
      }
      
      // Calculate free transfers: start with 1, add 1 if no transfers were made last GW
      let freeTransfers = 1;
      if (previousGWData && previousGWData.event_transfers === 0) {
        freeTransfers = Math.min(2, freeTransfers + 1); // Max 2 free transfers
      }
      
      return freeTransfers;
    } catch (error) {
      console.warn('Could not compute free transfers, defaulting to 1:', error);
      return 1; // Default fallback
    }
  }

  async getPlayerExpectedPoints(playerId: number, gameweeksAhead: number = 5): Promise<number> {
    try {
      const bootstrap = await this.getBootstrapData();
      const player = bootstrap.elements.find((p) => p.id === playerId);
      if (!player) return 0;

      // Base PPG from season-to-date. Use current GW to avoid overestimating early.
      const currentGW = await this.getCurrentGameweek();
      const approxGamesPlayed = Math.max(1, currentGW - 1);
      const basePPG = player.total_points / approxGamesPlayed;

      // Weight upcoming fixtures by FDR for the player's team.
      const fixtures = await this.getUpcomingFixtures(gameweeksAhead);
      const teamFixtures = fixtures.filter(
        (f) => f.team_h === player.team || f.team_a === player.team,
      );

      // Convert FDR (1..5) into a modest multiplier around 1.0
      // Easier fixture (1) → ~1.3x, Harder (5) → ~0.7x
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
      
      if (nextEvent && nextEvent.deadline_time) {
        return nextEvent.deadline_time;
      }
      
      // Fallback: find current or next upcoming event
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
      bootstrap.elements.map(async (player) => ({
        ...player,
        expectedPoints: await this.getPlayerExpectedPoints(player.id, gameweeksAhead)
      }))
    );
  }

  // Clear cache (useful for testing or forcing fresh data)
  clearCache(): void {
    this.cache.clear();
  }

  // Clear specific cache entry
  clearCacheEntry(key: string): void {
    this.cache.delete(key);
  }
}

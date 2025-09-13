import {
  type FPLPlayer,
  type FPLTeam,
  type FPLFixture,
  type FPLUserSquad
} from "@shared/schema";

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

  public static getInstance(): FPLApiService {
    if (!FPLApiService.instance) {
      FPLApiService.instance = new FPLApiService();
    }
    return FPLApiService.instance;
  }

  private async fetchWithCache<T>(url: string, cacheKey: string): Promise<T> {
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.cacheExpiry) {
      return cached.data as T;
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FPL-Chip-Strategy-Architect/1.0',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`FPL API returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
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
      const player = bootstrap.elements.find(p => p.id === playerId);
      
      if (!player) {
        return 0;
      }
      
      // Simple expected points calculation based on current form and total points
      const pointsPerGame = player.total_points / Math.max(1, 10); // Assume ~10 games played
      const formMultiplier = 1; // Could be enhanced with form data
      
      return pointsPerGame * gameweeksAhead * formMultiplier;
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
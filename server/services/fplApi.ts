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

  // Clear cache (useful for testing or forcing fresh data)
  clearCache(): void {
    this.cache.clear();
  }
}
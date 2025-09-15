import { PlayerAdvanced } from "@shared/schema";
import axios from 'axios';
import * as cheerio from 'cheerio';

// Provider interface for different stats APIs
export interface IStatsProvider {
  name: string;
  getPlayerAdvanced(playerId: number): Promise<PlayerAdvanced | null>;
  getPlayerAdvancedBatch(playerIds: number[]): Promise<PlayerAdvanced[]>;
  isAvailable(): Promise<boolean>;
}

// Mock provider for development and fallback
class MockStatsProvider implements IStatsProvider {
  name = "mock";

  async getPlayerAdvanced(playerId: number): Promise<PlayerAdvanced | null> {
    // Generate realistic mock stats based on player ID (deterministic for consistency)
    const seed = playerId % 1000;
    const position = this.inferPosition(playerId); // Infer from FPL data patterns
    
    // Different baseline stats by position
    let baseXG = 0.1;
    let baseXA = 0.1; 
    let baseXMins = 65;
    let volatility = 3.0;

    switch (position) {
      case 'FWD':
        baseXG = 0.4 + (seed % 20) / 100; // 0.4 to 0.6
        baseXA = 0.2 + (seed % 15) / 100;
        baseXMins = 70 + (seed % 20);
        volatility = 4.5 + (seed % 30) / 10;
        break;
      case 'MID':
        baseXG = 0.15 + (seed % 25) / 100;
        baseXA = 0.3 + (seed % 20) / 100;
        baseXMins = 75 + (seed % 15);
        volatility = 3.5 + (seed % 25) / 10;
        break;
      case 'DEF':
        baseXG = 0.05 + (seed % 10) / 100;
        baseXA = 0.1 + (seed % 15) / 100;
        baseXMins = 80 + (seed % 10);
        volatility = 2.5 + (seed % 20) / 10;
        break;
      case 'GK':
        baseXG = 0;
        baseXA = 0;
        baseXMins = 85 + (seed % 5);
        volatility = 2.0 + (seed % 15) / 10;
        break;
    }

    // Rotation risk assessment
    const role = baseXMins > 80 ? 'nailed' : baseXMins > 60 ? 'rotation' : 'benchwarmer';
    
    // Form trend (based on recent performance - mock)
    const trendSeed = (seed + 50) % 100;
    const formTrend = trendSeed > 70 ? 'rising' : trendSeed < 30 ? 'declining' : 'stable';

    return {
      playerId,
      xG: Math.round(baseXG * 100) / 100,
      xA: Math.round(baseXA * 100) / 100,
      xMins: Math.round(baseXMins),
      role: role as 'nailed' | 'rotation' | 'benchwarmer',
      volatility: Math.round(volatility * 10) / 10,
      formTrend: formTrend as 'rising' | 'stable' | 'declining',
      fixtureAdjustedXG: Math.round(baseXG * (1 + (seed % 20 - 10) / 100) * 100) / 100,
      fixtureAdjustedXA: Math.round(baseXA * (1 + (seed % 20 - 10) / 100) * 100) / 100,
      lastUpdated: new Date().toISOString()
    };
  }

  async getPlayerAdvancedBatch(playerIds: number[]): Promise<PlayerAdvanced[]> {
    return Promise.all(
      playerIds.map(id => this.getPlayerAdvanced(id)).filter(Boolean) as Promise<PlayerAdvanced>[]
    );
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  private inferPosition(playerId: number): 'GK' | 'DEF' | 'MID' | 'FWD' {
    // Simple heuristic based on FPL player ID ranges (approximate)
    if (playerId <= 50) return 'GK';
    if (playerId <= 200) return 'DEF';
    if (playerId <= 400) return 'MID';
    return 'FWD';
  }
}

// Real Understat provider for xG/xA and advanced metrics
class UnderstatProvider implements IStatsProvider {
  name = "understat";
  private cache = new Map<string, any>();
  private cacheExpiry = 4 * 60 * 60 * 1000; // 4 hours for Understat data
  private playerNameMap = new Map<number, string>(); // FPL ID to player name mapping

  constructor() {
    this.initializePlayerMapping();
  }

  private async initializePlayerMapping() {
    // This would ideally be populated from FPL API bootstrap data
    // For now, we'll build it as we go
  }

  async getPlayerAdvanced(playerId: number): Promise<PlayerAdvanced | null> {
    try {
      // Get current season Premier League data from Understat
      const cacheKey = `understat_epl_${new Date().getFullYear()}`;
      let playerData = this.cache.get(cacheKey);
      
      if (!playerData || (Date.now() - playerData.timestamp) > this.cacheExpiry) {
        playerData = await this.fetchUnderstatData();
        this.cache.set(cacheKey, { data: playerData.data, timestamp: Date.now() });
      }

      // Find player by FPL ID (need better mapping in production)
      const player = this.findPlayerInUnderstatData(playerData.data, playerId);
      if (!player) {
        return this.generateEstimatedStats(playerId);
      }

      // Convert Understat data to our format
      return this.convertUnderstatToPlayerAdvanced(player, playerId);
    } catch (error) {
      console.error('Understat provider error:', error);
      return this.generateEstimatedStats(playerId);
    }
  }

  private async fetchUnderstatData(): Promise<{ data: any; timestamp: number }> {
    const url = 'https://understat.com/league/EPL';
    
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Extract JSON data from script tags (Understat embeds data this way)
      let playersData: any[] = [];
      $('script').each((i, elem) => {
        const scriptContent = $(elem).html() || '';
        
        // Look for players data in the script
        const playersMatch = scriptContent.match(/var\s+playersData\s*=\s*(\[.*?\]);/);
        if (playersMatch) {
          try {
            playersData = JSON.parse(playersMatch[1]) as any[];
          } catch (e) {
            // Continue looking
          }
        }
      });

      return { data: playersData, timestamp: Date.now() };
    } catch (error) {
      console.error('Failed to fetch Understat data:', error);
      return { data: [], timestamp: Date.now() };
    }
  }

  private findPlayerInUnderstatData(data: any[], fplId: number): any | null {
    // This is a placeholder - in production, we'd need a proper mapping
    // For now, use position-based heuristics
    if (!Array.isArray(data) || data.length === 0) return null;
    
    const position = this.inferPosition(fplId);
    const positionPlayers = data.filter(p => 
      this.mapUnderstatPosition(p.position) === position
    );
    
    if (positionPlayers.length === 0) return null;
    
    // Simple mapping based on ID proximity
    const index = (fplId % positionPlayers.length);
    return positionPlayers[index];
  }

  private mapUnderstatPosition(understatPos: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
    switch (understatPos?.toLowerCase()) {
      case 'g':
      case 'goalkeeper':
        return 'GK';
      case 'd':
      case 'defender':
        return 'DEF';
      case 'm':
      case 'midfielder':
        return 'MID';
      case 'f':
      case 'forward':
      case 'striker':
        return 'FWD';
      default:
        return 'MID';
    }
  }

  private convertUnderstatToPlayerAdvanced(understatPlayer: any, playerId: number): PlayerAdvanced {
    const xG = parseFloat(understatPlayer.xG) || 0;
    const xA = parseFloat(understatPlayer.xA) || 0;
    const minutes = parseFloat(understatPlayer.time) || 0;
    const apps = parseFloat(understatPlayer.games) || 1;
    
    // Calculate per-90 metrics
    const minutesPer90 = Math.min(90, (minutes / apps));
    const xGPer90 = xG / (minutes / 90);
    const xAPer90 = xA / (minutes / 90);
    
    // Estimate expected minutes based on recent playing time
    const expectedMins = Math.round(minutesPer90);
    
    // Calculate volatility from goals vs xG variance
    const goals = parseFloat(understatPlayer.goals) || 0;
    const assists = parseFloat(understatPlayer.assists) || 0;
    const volatility = Math.abs(goals - xG) + Math.abs(assists - xA);
    
    // Determine role based on minutes
    let role: 'nailed' | 'rotation' | 'benchwarmer' = 'benchwarmer';
    if (expectedMins >= 80) role = 'nailed';
    else if (expectedMins >= 60) role = 'rotation';
    
    // Form trend based on recent vs season average
    const formTrend: 'rising' | 'stable' | 'declining' = 
      volatility > 2 ? 'declining' : volatility < 1 ? 'rising' : 'stable';

    return {
      playerId,
      xG: Math.round(xGPer90 * 100) / 100,
      xA: Math.round(xAPer90 * 100) / 100,
      xMins: expectedMins,
      role,
      volatility: Math.round(volatility * 10) / 10,
      formTrend,
      fixtureAdjustedXG: Math.round(xGPer90 * 100) / 100,
      fixtureAdjustedXA: Math.round(xAPer90 * 100) / 100,
      lastUpdated: new Date().toISOString()
    };
  }

  private generateEstimatedStats(playerId: number): PlayerAdvanced {
    // Fallback to improved estimates when Understat data unavailable
    const position = this.inferPosition(playerId);
    const seed = playerId % 1000;
    
    let baseXG = 0.1, baseXA = 0.1, baseXMins = 65, volatility = 3.0;
    
    switch (position) {
      case 'FWD':
        baseXG = 0.45 + (seed % 25) / 100;
        baseXA = 0.15 + (seed % 15) / 100;
        baseXMins = 75 + (seed % 15);
        volatility = 4.0 + (seed % 30) / 10;
        break;
      case 'MID':
        baseXG = 0.20 + (seed % 30) / 100;
        baseXA = 0.35 + (seed % 25) / 100;
        baseXMins = 78 + (seed % 12);
        volatility = 3.0 + (seed % 25) / 10;
        break;
      case 'DEF':
        baseXG = 0.08 + (seed % 15) / 100;
        baseXA = 0.12 + (seed % 18) / 100;
        baseXMins = 82 + (seed % 8);
        volatility = 2.0 + (seed % 20) / 10;
        break;
      case 'GK':
        baseXG = 0;
        baseXA = 0;
        baseXMins = 88 + (seed % 4);
        volatility = 1.5 + (seed % 15) / 10;
        break;
    }

    const role = baseXMins > 80 ? 'nailed' : baseXMins > 65 ? 'rotation' : 'benchwarmer';
    const formTrend = seed > 70 ? 'rising' : seed < 30 ? 'declining' : 'stable';

    return {
      playerId,
      xG: Math.round(baseXG * 100) / 100,
      xA: Math.round(baseXA * 100) / 100,
      xMins: Math.round(baseXMins),
      role: role as 'nailed' | 'rotation' | 'benchwarmer',
      volatility: Math.round(volatility * 10) / 10,
      formTrend: formTrend as 'rising' | 'stable' | 'declining',
      fixtureAdjustedXG: Math.round(baseXG * (1 + (seed % 20 - 10) / 100) * 100) / 100,
      fixtureAdjustedXA: Math.round(baseXA * (1 + (seed % 20 - 10) / 100) * 100) / 100,
      lastUpdated: new Date().toISOString()
    };
  }

  private inferPosition(playerId: number): 'GK' | 'DEF' | 'MID' | 'FWD' {
    if (playerId <= 50) return 'GK';
    if (playerId <= 200) return 'DEF';
    if (playerId <= 400) return 'MID';
    return 'FWD';
  }

  async getPlayerAdvancedBatch(playerIds: number[]): Promise<PlayerAdvanced[]> {
    const results: PlayerAdvanced[] = [];
    
    for (const playerId of playerIds) {
      const stats = await this.getPlayerAdvanced(playerId);
      if (stats) {
        results.push(stats);
      }
    }
    
    return results;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Quick check to Understat homepage
      const response = await axios.get('https://understat.com', { 
        timeout: 5000,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

// Service class for advanced stats management
export class StatsService {
  private static instance: StatsService;
  private cache: Map<number, { data: PlayerAdvanced; timestamp: number }> = new Map();
  private readonly cacheExpiry = 60 * 60 * 1000; // 1 hour (stats change less frequently)
  private provider: IStatsProvider;

  constructor(provider?: IStatsProvider) {
    // Use environment variable to determine provider, fallback to mock
    const providerName = process.env.STATS_PROVIDER || 'mock';
    this.provider = provider || this.createProvider(providerName);
  }

  public static getInstance(): StatsService {
    if (!StatsService.instance) {
      StatsService.instance = new StatsService();
    }
    return StatsService.instance;
  }

  private createProvider(providerName: string): IStatsProvider {
    switch (providerName.toLowerCase()) {
      case 'understat':
        return new UnderstatProvider();
      case 'mock':
      default:
        return new MockStatsProvider();
    }
  }

  async getPlayerAdvanced(playerId: number): Promise<PlayerAdvanced | null> {
    // Check cache first
    const cached = this.cache.get(playerId);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const stats = await this.provider.getPlayerAdvanced(playerId);
      if (stats) {
        this.cache.set(playerId, { data: stats, timestamp: now });
      }
      return stats;
    } catch (error) {
      console.error(`Stats Service Error for player ${playerId}:`, error);
      return null;
    }
  }

  async getPlayerAdvancedBatch(playerIds: number[]): Promise<PlayerAdvanced[]> {
    const now = Date.now();
    const uncachedIds: number[] = [];
    const results: PlayerAdvanced[] = [];

    // Check cache for each player
    for (const playerId of playerIds) {
      const cached = this.cache.get(playerId);
      if (cached && (now - cached.timestamp) < this.cacheExpiry) {
        results.push(cached.data);
      } else {
        uncachedIds.push(playerId);
      }
    }

    // Fetch uncached data
    if (uncachedIds.length > 0) {
      try {
        const freshStats = await this.provider.getPlayerAdvancedBatch(uncachedIds);
        freshStats.forEach(stats => {
          this.cache.set(stats.playerId, { data: stats, timestamp: now });
          results.push(stats);
        });
      } catch (error) {
        console.error('Batch Stats Service Error:', error);
      }
    }

    return results;
  }

  // Calculate historical volatility from FPL data (fallback if not provided by stats)
  static calculateVolatility(gameweekScores: number[]): number {
    if (gameweekScores.length < 3) return 0;
    
    const mean = gameweekScores.reduce((sum, score) => sum + score, 0) / gameweekScores.length;
    const variance = gameweekScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / gameweekScores.length;
    
    return Math.round(Math.sqrt(variance) * 10) / 10;
  }

  // Calculate form trend from recent performance
  static calculateFormTrend(recentScores: number[]): 'rising' | 'stable' | 'declining' {
    if (recentScores.length < 4) return 'stable';
    
    const firstHalf = recentScores.slice(0, Math.floor(recentScores.length / 2));
    const secondHalf = recentScores.slice(Math.floor(recentScores.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, score) => sum + score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, score) => sum + score, 0) / secondHalf.length;
    
    const improvement = secondAvg - firstAvg;
    
    if (improvement > 1.5) return 'rising';
    if (improvement < -1.5) return 'declining';
    return 'stable';
  }

  // Enhance basic player stats with fixture adjustments
  adjustStatsForFixtures(stats: PlayerAdvanced, upcomingFDR: number[]): PlayerAdvanced {
    if (upcomingFDR.length === 0) return stats;
    
    const avgFDR = upcomingFDR.reduce((sum, fdr) => sum + fdr, 0) / upcomingFDR.length;
    
    // Better fixtures (lower FDR) = higher adjusted stats
    const adjustment = (3.5 - avgFDR) * 0.15; // -0.225 to +0.375 multiplier
    
    return {
      ...stats,
      fixtureAdjustedXG: Math.max(0, Math.round((stats.xG * (1 + adjustment)) * 100) / 100),
      fixtureAdjustedXA: Math.max(0, Math.round((stats.xA * (1 + adjustment)) * 100) / 100),
      lastUpdated: new Date().toISOString()
    };
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear();
  }

  // Get provider info
  getProviderInfo(): { name: string; cached: number } {
    return {
      name: this.provider.name,
      cached: this.cache.size
    };
  }
}
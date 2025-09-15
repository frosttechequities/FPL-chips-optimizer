import { MatchOdds, TeamStrength } from "@shared/schema";
import TheOddsAPI from 'the-odds-api';

// Provider interface for different odds APIs
export interface IOddsProvider {
  name: string;
  getMatchOdds(fixtureId: number): Promise<MatchOdds | null>;
  getMatchOddsBatch(fixtureIds: number[]): Promise<MatchOdds[]>;
  isAvailable(): Promise<boolean>;
}

// Mock provider for development and fallback
class MockOddsProvider implements IOddsProvider {
  name = "mock";

  async getMatchOdds(fixtureId: number): Promise<MatchOdds | null> {
    // Generate realistic mock odds based on fixture ID (deterministic for consistency)
    const seed = fixtureId % 100;
    const homeStrength = 0.4 + (seed % 30) / 100; // 0.4 to 0.7
    const awayStrength = 0.4 + ((seed + 17) % 30) / 100;
    
    // Convert strength to odds (higher strength = lower odds)
    const homeWinOdds = 1 / homeStrength;
    const awayWinOdds = 1 / awayStrength;
    const drawOdds = 3.2 + (seed % 10) / 10; // 3.2 to 4.2

    return {
      fixtureId,
      homeWin: Math.round(homeWinOdds * 100) / 100,
      draw: Math.round(drawOdds * 100) / 100,
      awayWin: Math.round(awayWinOdds * 100) / 100,
      btts: 1.8 + (seed % 15) / 100, // 1.8 to 1.95
      over25Goals: 1.7 + (seed % 20) / 100,
      under25Goals: 2.1 + (seed % 15) / 100,
      homeCleanSheet: 2.5 + homeStrength * 2,
      awayCleanSheet: 2.5 + awayStrength * 2,
      homeGoalsOver15: 1.4 + homeStrength,
      awayGoalsOver15: 1.4 + awayStrength,
      lastUpdated: new Date().toISOString()
    };
  }

  async getMatchOddsBatch(fixtureIds: number[]): Promise<MatchOdds[]> {
    return Promise.all(
      fixtureIds.map(id => this.getMatchOdds(id)).filter(Boolean) as Promise<MatchOdds>[]
    );
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

// Real TheOddsAPI provider for live betting odds
class TheOddsAPIProvider implements IOddsProvider {
  name = "theoddsapi";
  private api: any;
  private cache = new Map<string, any>();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes for odds

  constructor(apiKey: string) {
    this.api = new TheOddsAPI(apiKey);
  }

  async getMatchOdds(fixtureId: number): Promise<MatchOdds | null> {
    try {
      // Get Premier League odds (cache by 10-minute buckets)
      const cacheKey = `epl_odds_${Math.floor(Date.now() / (10 * 60 * 1000))}`;
      const cached = this.cache.get(cacheKey);
      
      let oddsData;
      if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
        oddsData = cached.data;
      } else {
        const response = await this.api.getOdds({
          sport: 'soccer_epl',
          regions: 'uk',
          markets: 'h2h,totals',
          oddsFormat: 'decimal',
          dateFormat: 'iso'
        });
        oddsData = response.data || response;
        this.cache.set(cacheKey, { data: oddsData, timestamp: Date.now() });
      }

      // Find match by fixture ID (map to team names if possible)
      const match = oddsData.find((game: any) => 
        game.id && this.matchesFixture(game, fixtureId)
      );

      if (!match || !match.bookmakers || match.bookmakers.length === 0) {
        return null;
      }

      // Get best odds from available bookmakers
      const h2hMarket = match.bookmakers[0].markets.find((m: any) => m.key === 'h2h');
      const totalsMarket = match.bookmakers[0].markets.find((m: any) => m.key === 'totals');
      
      if (!h2hMarket) return null;

      const homeOdds = h2hMarket.outcomes.find((o: any) => o.name === match.home_team)?.price || 2.0;
      const awayOdds = h2hMarket.outcomes.find((o: any) => o.name === match.away_team)?.price || 2.0;
      const drawOdds = h2hMarket.outcomes.find((o: any) => o.name === 'Draw')?.price || 3.0;

      // Calculate derived odds
      const totalLine = totalsMarket?.outcomes[0]?.point || 2.5;
      const overOdds = totalsMarket?.outcomes.find((o: any) => o.name === 'Over')?.price || 1.8;
      const underOdds = totalsMarket?.outcomes.find((o: any) => o.name === 'Under')?.price || 2.0;

      return {
        fixtureId,
        homeWin: homeOdds,
        draw: drawOdds,
        awayWin: awayOdds,
        btts: 1.8, // Default - would need specialized market
        over25Goals: overOdds,
        under25Goals: underOdds,
        homeCleanSheet: this.calculateCleanSheetOdds(homeOdds, totalLine),
        awayCleanSheet: this.calculateCleanSheetOdds(awayOdds, totalLine),
        homeGoalsOver15: this.calculateTeamGoalsOdds(homeOdds),
        awayGoalsOver15: this.calculateTeamGoalsOdds(awayOdds),
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('TheOddsAPI error:', error);
      return null;
    }
  }

  private matchesFixture(game: any, fixtureId: number): boolean {
    // Simple heuristic - would need better mapping in production
    return game.id && (parseInt(game.id) % 1000) === (fixtureId % 1000);
  }

  private calculateCleanSheetOdds(winOdds: number, totalGoals: number): number {
    // Estimate clean sheet probability from win odds and total goals
    const winProb = 1 / winOdds;
    const cleanSheetProb = winProb * (totalGoals < 2.5 ? 0.4 : 0.25);
    return Math.round((1 / cleanSheetProb) * 100) / 100;
  }

  private calculateTeamGoalsOdds(winOdds: number): number {
    // Estimate team scoring probability
    const scoreProb = (1 / winOdds) * 0.7 + 0.3; // Teams usually score in 60-90% of games
    return Math.round((1 / scoreProb) * 100) / 100;
  }

  async getMatchOddsBatch(fixtureIds: number[]): Promise<MatchOdds[]> {
    const results: MatchOdds[] = [];
    
    // Get all current Premier League odds once
    for (const fixtureId of fixtureIds) {
      const odds = await this.getMatchOdds(fixtureId);
      if (odds) {
        results.push(odds);
      }
    }
    
    return results;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.api.getSports({ all: false });
      return true;
    } catch {
      return false;
    }
  }
}

// Service class for odds management
export class OddsService {
  private static instance: OddsService;
  private cache: Map<number, { data: MatchOdds; timestamp: number }> = new Map();
  private readonly cacheExpiry = 15 * 60 * 1000; // 15 minutes
  private provider: IOddsProvider;

  constructor(provider?: IOddsProvider) {
    // Use environment variable to determine provider, fallback to mock
    const providerName = process.env.ODDS_PROVIDER || 'mock';
    this.provider = provider || this.createProvider(providerName);
  }

  public static getInstance(): OddsService {
    if (!OddsService.instance) {
      OddsService.instance = new OddsService();
    }
    return OddsService.instance;
  }

  private createProvider(providerName: string): IOddsProvider {
    switch (providerName.toLowerCase()) {
      case 'theoddsapi':
        const apiKey = process.env.THEODDSAPI_KEY;
        if (!apiKey) {
          console.warn('TheOddsAPI key not found, falling back to mock provider');
          return new MockOddsProvider();
        }
        return new TheOddsAPIProvider(apiKey);
      case 'mock':
      default:
        return new MockOddsProvider();
    }
  }

  async getMatchOdds(fixtureId: number): Promise<MatchOdds | null> {
    // Check cache first
    const cached = this.cache.get(fixtureId);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < this.cacheExpiry) {
      return cached.data;
    }

    try {
      const odds = await this.provider.getMatchOdds(fixtureId);
      if (odds) {
        this.cache.set(fixtureId, { data: odds, timestamp: now });
      }
      return odds;
    } catch (error) {
      console.error(`Odds Service Error for fixture ${fixtureId}:`, error);
      return null;
    }
  }

  async getMatchOddsBatch(fixtureIds: number[]): Promise<MatchOdds[]> {
    const now = Date.now();
    const uncachedIds: number[] = [];
    const results: MatchOdds[] = [];

    // Check cache for each fixture
    for (const fixtureId of fixtureIds) {
      const cached = this.cache.get(fixtureId);
      if (cached && (now - cached.timestamp) < this.cacheExpiry) {
        results.push(cached.data);
      } else {
        uncachedIds.push(fixtureId);
      }
    }

    // Fetch uncached data
    if (uncachedIds.length > 0) {
      try {
        const freshOdds = await this.provider.getMatchOddsBatch(uncachedIds);
        freshOdds.forEach(odds => {
          this.cache.set(odds.fixtureId, { data: odds, timestamp: now });
          results.push(odds);
        });
      } catch (error) {
        console.error('Batch Odds Service Error:', error);
      }
    }

    return results;
  }

  // Convert odds to probabilities (implied probability)
  static oddsToProb(odds: number): number {
    return 1 / odds;
  }

  // Calculate implied xG from over/under odds
  static oddsToExpectedGoals(over25Odds: number, under25Odds: number): number {
    const overProb = this.oddsToProb(over25Odds);
    const underProb = this.oddsToProb(under25Odds);
    // Simple approximation: if over 2.5 is more likely, xG > 2.5, else < 2.5
    return overProb > underProb ? 2.8 : 2.2;
  }

  // Calculate clean sheet probability from odds
  static getCleanSheetProb(cleanSheetOdds: number): number {
    return Math.min(0.8, this.oddsToProb(cleanSheetOdds));
  }

  // Derive team strength from odds
  async deriveTeamStrength(teamId: number, recentFixtures: number[]): Promise<TeamStrength | null> {
    if (recentFixtures.length === 0) return null;

    const oddsData = await this.getMatchOddsBatch(recentFixtures);
    if (oddsData.length === 0) return null;

    let totalAttack = 0;
    let totalDefense = 0;
    let homeAdvantage = 1.0;

    oddsData.forEach(odds => {
      const homeWinProb = OddsService.oddsToProb(odds.homeWin);
      const drawProb = OddsService.oddsToProb(odds.draw);
      const awayWinProb = OddsService.oddsToProb(odds.awayWin);
      
      // Normalize probabilities (they don't sum to 1 due to bookmaker margin)
      const total = homeWinProb + drawProb + awayWinProb;
      const normalizedHome = homeWinProb / total;
      const normalizedAway = awayWinProb / total;
      
      // Attack strength from win probability, defense from clean sheet odds
      totalAttack += (normalizedHome + normalizedAway) * 50; // Scale to 0-100
      totalDefense += OddsService.getCleanSheetProb(odds.homeCleanSheet) * 100;
    });

    return {
      teamId,
      attack: Math.round(totalAttack / oddsData.length),
      defense: Math.round(totalDefense / oddsData.length),
      xGFor: OddsService.oddsToExpectedGoals(oddsData[0].over25Goals, oddsData[0].under25Goals),
      xGAgainst: 2.5 - OddsService.oddsToExpectedGoals(oddsData[0].over25Goals, oddsData[0].under25Goals),
      homeAdvantage,
      form: Math.min(100, (totalAttack / oddsData.length) + (totalDefense / oddsData.length)),
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
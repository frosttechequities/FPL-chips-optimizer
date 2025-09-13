/**
 * RivalAnalysisService - Phase 2 Enhancement
 * 
 * Analyzes competing FPL managers' strategies, transfers, and chip usage patterns.
 * Provides competitive intelligence for strategic decision making.
 */

import { FPLApiService } from './fplApi';
import { RivalAnalysis, CompetitiveIntelligence } from '@shared/schema';

interface RivalDataProvider {
  fetchManagerData(managerId: string): Promise<any>;
  fetchTopManagers(count: number): Promise<any[]>;
  fetchLeagueManagers(leagueId: string): Promise<any[]>;
}

class MockRivalDataProvider implements RivalDataProvider {
  async fetchManagerData(managerId: string): Promise<any> {
    // Mock rival manager data for demonstration
    const id = parseInt(managerId) || 1;
    const names = ['Alex the Ace', 'Sarah Strategist', 'Mike Master', 'Pro Player', 'FPL Legend'];
    
    return {
      id,
      name: names[id % names.length],
      overallRank: 5000 + (id % 50000),
      gameweekRank: 1000 + (id % 10000),
      totalPoints: 1850 + (id % 500),
      recentTransfers: this.generateMockTransfers(id),
      chipsUsed: this.generateMockChipUsage(id),
      squad: this.generateMockSquad(id)
    };
  }

  async fetchTopManagers(count: number = 100): Promise<any[]> {
    return Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `Top Manager ${i + 1}`,
      overallRank: i + 1,
      totalPoints: 2200 - i * 2,
      gameweekPoints: 70 - (i % 30)
    }));
  }

  async fetchLeagueManagers(leagueId: string): Promise<any[]> {
    const leagueSize = parseInt(leagueId) % 50 + 10; // 10-60 managers
    return Array.from({ length: leagueSize }, (_, i) => ({
      id: i + 1000,
      name: `League Player ${i + 1}`,
      rank: i + 1,
      totalPoints: 1950 - i * 10,
      gameweekPoints: 65 - (i % 25)
    }));
  }

  private generateMockTransfers(seed: number): any[] {
    const playerNames = [
      'Salah', 'Kane', 'De Bruyne', 'Son', 'Haaland', 'Mané', 'Sterling', 
      'Bruno', 'Vardy', 'Rashford', 'Mount', 'Grealish', 'Mahrez'
    ];
    
    const reasons = ['popular_pick', 'differential', 'fixture_swing', 'price_rise'];
    
    return Array.from({ length: (seed % 5) + 2 }, (_, i) => ({
      playersIn: [{
        playerId: (seed + i) % 1000,
        playerName: playerNames[(seed + i) % playerNames.length],
        gameweek: 15 - i,
        reason: reasons[(seed + i) % reasons.length]
      }],
      playersOut: [{
        playerId: (seed + i + 500) % 1000,
        playerName: playerNames[(seed + i + 7) % playerNames.length],
        gameweek: 15 - i,
        reason: 'fixture_swing'
      }]
    }));
  }

  private generateMockChipUsage(seed: number): any[] {
    const chips = ['wildcard', 'bench-boost', 'triple-captain', 'free-hit'];
    return chips.slice(0, (seed % 3) + 1).map((chip, i) => ({
      chip,
      gameweek: 10 + i * 3 + (seed % 5),
      success: Math.random() > 0.3,
      points: 45 + (seed % 30) + (i * 10)
    }));
  }

  private generateMockSquad(seed: number): any[] {
    return Array.from({ length: 15 }, (_, i) => ({
      playerId: seed + i,
      playerName: `Player ${seed + i}`,
      position: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD', 'GK'][i],
      price: 4.5 + Math.random() * 8,
      isStarter: i < 11
    }));
  }
}

export class RivalAnalysisService {
  private static instance: RivalAnalysisService;
  private provider: RivalDataProvider;
  private fplApiService: FPLApiService;
  private cache = new Map<string, RivalAnalysis>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  private constructor() {
    this.provider = new MockRivalDataProvider();
    this.fplApiService = FPLApiService.getInstance();
  }

  public static getInstance(): RivalAnalysisService {
    if (!RivalAnalysisService.instance) {
      RivalAnalysisService.instance = new RivalAnalysisService();
    }
    return RivalAnalysisService.instance;
  }

  /**
   * Analyze a specific rival manager
   */
  async analyzeRival(managerId: string): Promise<RivalAnalysis> {
    const cacheKey = `rival_${managerId}`;
    
    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const managerData = await this.provider.fetchManagerData(managerId);
      
      const analysis: RivalAnalysis = {
        managerId,
        managerName: managerData.name,
        overallRank: managerData.overallRank,
        gameweekRank: managerData.gameweekRank,
        totalPoints: managerData.totalPoints,
        transfers: {
          playersIn: this.flattenTransfers(managerData.recentTransfers, 'playersIn'),
          playersOut: this.flattenTransfers(managerData.recentTransfers, 'playersOut')
        },
        strategy: this.classifyStrategy(managerData),
        chipsUsed: managerData.chipsUsed,
        lastUpdated: new Date().toISOString()
      };

      // Cache the analysis
      this.cache.set(cacheKey, analysis);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION);
      
      return analysis;
    } catch (error) {
      console.error(`Failed to analyze rival ${managerId}:`, error);
      throw new Error(`Rival analysis failed for manager ${managerId}`);
    }
  }

  /**
   * Get competitive intelligence about the FPL meta
   */
  async getCompetitiveIntelligence(): Promise<CompetitiveIntelligence> {
    const cacheKey = 'competitive_intelligence';
    
    // Check cache first (longer cache for meta analysis)
    if (this.isCacheValid(cacheKey, 60 * 60 * 1000)) { // 1 hour cache
      const cached = this.cache.get(cacheKey) as any;
      if (cached && cached.metaTrends) {
        return cached as CompetitiveIntelligence;
      }
    }

    try {
      // Get top managers' data
      const topManagers = await this.provider.fetchTopManagers(100);
      const topManagerAnalyses = await Promise.all(
        topManagers.slice(0, 20).map(manager => this.analyzeRival(manager.id.toString()))
      );

      const intelligence: CompetitiveIntelligence = {
        metaTrends: await this.analyzeMetaTrends(topManagerAnalyses),
        rivalInsights: {
          topManagerMoves: topManagerAnalyses.slice(0, 10),
          commonStrategies: this.identifyCommonStrategies(topManagerAnalyses),
          chipUsagePatterns: this.analyzeChipUsagePatterns(topManagerAnalyses)
        },
        marketInefficiencies: await this.identifyMarketInefficiencies(topManagerAnalyses),
        lastUpdated: new Date().toISOString()
      };

      // Cache the intelligence
      this.cache.set(cacheKey, intelligence as any);
      this.cacheExpiry.set(cacheKey, Date.now() + 60 * 60 * 1000);
      
      return intelligence;
    } catch (error) {
      console.error('Failed to generate competitive intelligence:', error);
      throw new Error('Competitive intelligence analysis failed');
    }
  }

  /**
   * Analyze current meta trends from top managers
   */
  private async analyzeMetaTrends(analyses: RivalAnalysis[]): Promise<CompetitiveIntelligence['metaTrends']> {
    // Count popular transfers
    const transferCounts = new Map<number, { count: number; playerName: string; trend: 'rising' | 'falling' | 'stable' }>();
    
    analyses.forEach(analysis => {
      analysis.transfers.playersIn.forEach(transfer => {
        const existing = transferCounts.get(transfer.playerId) || { count: 0, playerName: transfer.playerName, trend: 'stable' as const };
        transferCounts.set(transfer.playerId, {
          ...existing,
          count: existing.count + 1,
          trend: existing.count > 3 ? 'rising' : 'stable'
        });
      });
    });

    const popularPicks = Array.from(transferCounts.entries())
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 20)
      .map(([playerId, data]) => ({
        playerId,
        playerName: data.playerName,
        ownership: 15 + (data.count * 2), // Mock ownership calculation
        trend: data.trend,
        differential: data.count < 5 // Less than 5 top managers = differential
      }));

    const emergingPlayers = Array.from(transferCounts.entries())
      .filter(([, data]) => data.count >= 3 && data.count <= 8) // Emerging but not yet mainstream
      .map(([playerId, data]) => ({
        playerId,
        playerName: data.playerName,
        ownershipGrowth: data.count * 3,
        reasons: this.inferTransferReasons(data.count)
      }));

    return {
      popularPicks,
      emergingPlayers
    };
  }

  /**
   * Identify common strategies among top managers
   */
  private identifyCommonStrategies(analyses: RivalAnalysis[]): string[] {
    const strategies = analyses.map(a => a.strategy);
    const strategyCounts = strategies.reduce((acc, strategy) => {
      acc[strategy] = (acc[strategy] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(strategyCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([strategy, count]) => `${strategy} (${count}/${analyses.length} managers)`);
  }

  /**
   * Analyze chip usage patterns
   */
  private analyzeChipUsagePatterns(analyses: RivalAnalysis[]): Array<{
    chip: string;
    optimalGameweeks: number[];
    averageReturn: number;
  }> {
    const chipData = new Map<string, { gameweeks: number[]; points: number[] }>();

    analyses.forEach(analysis => {
      analysis.chipsUsed.forEach(chipUsage => {
        const existing = chipData.get(chipUsage.chip) || { gameweeks: [], points: [] };
        existing.gameweeks.push(chipUsage.gameweek);
        existing.points.push(chipUsage.points);
        chipData.set(chipUsage.chip, existing);
      });
    });

    return Array.from(chipData.entries()).map(([chip, data]) => ({
      chip,
      optimalGameweeks: this.findOptimalGameweeks(data.gameweeks),
      averageReturn: data.points.length > 0 ? data.points.reduce((sum, p) => sum + p, 0) / data.points.length : 0
    }));
  }

  /**
   * Identify market inefficiencies
   */
  private async identifyMarketInefficiencies(analyses: RivalAnalysis[]): Promise<CompetitiveIntelligence['marketInefficiencies']> {
    // Mock implementation - in real version would compare actual vs expected ownership
    const playerFrequency = new Map<number, { name: string; count: number }>();
    
    analyses.forEach(analysis => {
      analysis.transfers.playersIn.forEach(transfer => {
        const existing = playerFrequency.get(transfer.playerId) || { name: transfer.playerName, count: 0 };
        playerFrequency.set(transfer.playerId, { ...existing, count: existing.count + 1 });
      });
    });

    return Array.from(playerFrequency.entries())
      .filter(([, data]) => data.count > 2) // Players transferred in by multiple top managers
      .map(([playerId, data]) => ({
        playerId,
        playerName: data.name,
        expectedVsActualOwnership: data.count * 2 - 10, // Mock calculation
        opportunity: data.count > 5 ? 'undervalued' as const : 'overvalued' as const,
        confidence: Math.min(90, data.count * 15)
      }));
  }

  /**
   * Classify manager strategy based on their decisions
   */
  private classifyStrategy(managerData: any): 'template' | 'differential' | 'balanced' | 'contrarian' {
    const recentTransfers = managerData.recentTransfers || [];
    const differentialMoves = recentTransfers.filter((t: any) => 
      t.playersIn.some((p: any) => p.reason === 'differential')
    ).length;

    if (differentialMoves > 2) return 'contrarian';
    if (differentialMoves > 0) return 'differential';
    if (recentTransfers.length < 3) return 'template';
    return 'balanced';
  }

  /**
   * Flatten transfer arrays for easier processing
   */
  private flattenTransfers(transfers: any[], type: 'playersIn' | 'playersOut'): any[] {
    return transfers.reduce((acc, transfer) => {
      return acc.concat(transfer[type] || []);
    }, []);
  }

  /**
   * Infer reasons for player transfers based on frequency
   */
  private inferTransferReasons(count: number): string[] {
    const reasons = [];
    if (count > 5) reasons.push('fixture run');
    if (count > 3) reasons.push('form improvement');
    if (count > 7) reasons.push('price rise expected');
    return reasons.length > 0 ? reasons : ['emerging pick'];
  }

  /**
   * Find optimal gameweeks for chip usage
   */
  private findOptimalGameweeks(gameweeks: number[]): number[] {
    // Find most common gameweeks for chip usage
    const gwCounts = gameweeks.reduce((acc, gw) => {
      acc[gw] = (acc[gw] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    return Object.entries(gwCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([gw]) => parseInt(gw));
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(key: string, customDuration?: number): boolean {
    const expiry = this.cacheExpiry.get(key);
    const duration = customDuration || this.CACHE_DURATION;
    return expiry ? Date.now() < expiry : false;
  }

  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    console.log('Rival analysis cache cleared');
  }

  /**
   * Get provider information for debugging
   */
  public getProviderInfo(): { name: string; available: boolean } {
    return {
      name: 'mock-rival-analysis',
      available: true
    };
  }
}
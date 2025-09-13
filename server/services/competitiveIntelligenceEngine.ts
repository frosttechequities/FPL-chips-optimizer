/**
 * CompetitiveIntelligenceEngine - Phase 2 Enhancement
 * 
 * Advanced competitive intelligence engine that combines rival analysis,
 * meta trends, and market inefficiencies to provide strategic recommendations.
 */

import { RivalAnalysisService } from './rivalAnalysisService';
import { MLPredictionEngine } from './mlPredictionEngine';
import { HistoricalDataService } from './historicalDataService';
import { CompetitiveIntelligence, RivalAnalysis, ProcessedPlayer } from '@shared/schema';

interface CompetitiveStrategy {
  type: 'template' | 'differential' | 'contrarian' | 'balanced';
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  expectedReturn: number;
  confidence: number;
  recommendations: string[];
}

interface MetaShift {
  trend: string;
  impact: 'major' | 'moderate' | 'minor';
  timeframe: 'immediate' | 'short-term' | 'long-term';
  affectedPlayers: Array<{
    playerId: number;
    playerName: string;
    impactType: 'positive' | 'negative';
    magnitude: number;
  }>;
}

export class CompetitiveIntelligenceEngine {
  private static instance: CompetitiveIntelligenceEngine;
  private rivalAnalysisService: RivalAnalysisService;
  private mlPredictionEngine: MLPredictionEngine;
  private historicalDataService: HistoricalDataService;
  private cache = new Map<string, any>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_DURATION = 45 * 60 * 1000; // 45 minutes

  private constructor() {
    this.rivalAnalysisService = RivalAnalysisService.getInstance();
    this.mlPredictionEngine = MLPredictionEngine.getInstance();
    this.historicalDataService = HistoricalDataService.getInstance();
  }

  public static getInstance(): CompetitiveIntelligenceEngine {
    if (!CompetitiveIntelligenceEngine.instance) {
      CompetitiveIntelligenceEngine.instance = new CompetitiveIntelligenceEngine();
    }
    return CompetitiveIntelligenceEngine.instance;
  }

  /**
   * Generate comprehensive competitive intelligence report
   */
  async generateIntelligenceReport(userSquad: ProcessedPlayer[], targetGameweeks: number = 5): Promise<{
    competitiveIntelligence: CompetitiveIntelligence;
    recommendedStrategies: CompetitiveStrategy[];
    metaShifts: MetaShift[];
    transferTargets: Array<{
      playerId: number;
      playerName: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
      confidence: number;
    }>;
  }> {
    const cacheKey = `intelligence_report_${userSquad.map(p => p.id).join(',')}_${targetGameweeks}`;
    
    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      // Gather competitive intelligence
      const competitiveIntelligence = await this.rivalAnalysisService.getCompetitiveIntelligence();
      
      // Generate strategic recommendations
      const recommendedStrategies = await this.generateStrategicRecommendations(
        competitiveIntelligence, 
        userSquad
      );
      
      // Identify meta shifts
      const metaShifts = await this.identifyMetaShifts(competitiveIntelligence);
      
      // Find optimal transfer targets
      const transferTargets = await this.findOptimalTransferTargets(
        competitiveIntelligence, 
        userSquad, 
        targetGameweeks
      );

      const report = {
        competitiveIntelligence,
        recommendedStrategies,
        metaShifts,
        transferTargets
      };

      // Cache the report
      this.cache.set(cacheKey, report);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION);
      
      return report;
    } catch (error) {
      console.error('Failed to generate intelligence report:', error);
      throw new Error('Competitive intelligence report generation failed');
    }
  }

  /**
   * Generate strategic recommendations based on competitive analysis
   */
  private async generateStrategicRecommendations(
    intelligence: CompetitiveIntelligence, 
    userSquad: ProcessedPlayer[]
  ): Promise<CompetitiveStrategy[]> {
    const strategies: CompetitiveStrategy[] = [];

    // Template Strategy - Follow the meta
    const templateStrategy: CompetitiveStrategy = {
      type: 'template',
      description: 'Follow proven template picks and popular transfers among top managers',
      riskLevel: 'low',
      expectedReturn: 75,
      confidence: 85,
      recommendations: [
        ...intelligence.metaTrends.popularPicks.slice(0, 3).map(pick => 
          `Consider ${pick.playerName} (${pick.ownership}% ownership, ${pick.trend} trend)`
        ),
        'Align with proven chip timing from top managers',
        'Focus on fixtures and form over differentials'
      ]
    };

    // Differential Strategy - Find undervalued players
    const differentialStrategy: CompetitiveStrategy = {
      type: 'differential',
      description: 'Target undervalued players before they become popular',
      riskLevel: 'medium',
      expectedReturn: 90,
      confidence: 70,
      recommendations: [
        ...intelligence.metaTrends.emergingPlayers.slice(0, 2).map(player =>
          `Early move to ${player.playerName} (${player.ownershipGrowth}% growth expected)`
        ),
        ...intelligence.marketInefficiencies.filter(m => m.opportunity === 'undervalued').slice(0, 2).map(player =>
          `${player.playerName} appears undervalued (${player.confidence}% confidence)`
        ),
        'Use chips in non-template gameweeks for maximum differential'
      ]
    };

    // Contrarian Strategy - Go against the grain
    const contrarianStrategy: CompetitiveStrategy = {
      type: 'contrarian',
      description: 'Fade popular picks and target overlooked opportunities',
      riskLevel: 'high',
      expectedReturn: 110,
      confidence: 60,
      recommendations: [
        'Avoid template players with high ownership',
        'Target players being transferred out by top managers',
        'Use unpopular chip combinations',
        'Focus on fixtures over form for contrarian picks'
      ]
    };

    // Balanced Strategy - Mix template and differential
    const balancedStrategy: CompetitiveStrategy = {
      type: 'balanced',
      description: 'Combine template security with strategic differentials',
      riskLevel: 'medium',
      expectedReturn: 82,
      confidence: 80,
      recommendations: [
        'Core of template players for security',
        '2-3 differential picks for upside',
        'Strategic chip timing based on fixture analysis',
        'Monitor emerging trends for early moves'
      ]
    };

    strategies.push(templateStrategy, differentialStrategy, contrarianStrategy, balancedStrategy);

    // Rank strategies by expected value and user's current squad composition
    return this.rankStrategiesByFit(strategies, userSquad, intelligence);
  }

  /**
   * Identify significant meta shifts in the FPL landscape
   */
  private async identifyMetaShifts(intelligence: CompetitiveIntelligence): Promise<MetaShift[]> {
    const shifts: MetaShift[] = [];

    // Analyze ownership trends for significant shifts
    const risingPlayers = intelligence.metaTrends.popularPicks.filter(p => p.trend === 'rising');
    if (risingPlayers.length > 5) {
      shifts.push({
        trend: 'Mass template convergence',
        impact: 'major',
        timeframe: 'immediate',
        affectedPlayers: risingPlayers.slice(0, 5).map(p => ({
          playerId: p.playerId,
          playerName: p.playerName,
          impactType: 'positive',
          magnitude: p.ownership
        }))
      });
    }

    // Analyze chip usage patterns
    const unusualChipPatterns = intelligence.rivalInsights.chipUsagePatterns.filter(
      pattern => pattern.optimalGameweeks.length > 0 && pattern.averageReturn > 70
    );
    if (unusualChipPatterns.length > 0) {
      shifts.push({
        trend: 'Chip timing optimization',
        impact: 'moderate',
        timeframe: 'short-term',
        affectedPlayers: [] // Affects strategy rather than specific players
      });
    }

    // Analyze market inefficiencies for trend shifts
    const undervaluedCount = intelligence.marketInefficiencies.filter(m => m.opportunity === 'undervalued').length;
    if (undervaluedCount > 8) {
      shifts.push({
        trend: 'Market inefficiency spike',
        impact: 'moderate',
        timeframe: 'short-term',
        affectedPlayers: intelligence.marketInefficiencies
          .filter(m => m.opportunity === 'undervalued')
          .slice(0, 3)
          .map(m => ({
            playerId: m.playerId,
            playerName: m.playerName,
            impactType: 'positive',
            magnitude: m.confidence
          }))
      });
    }

    return shifts;
  }

  /**
   * Find optimal transfer targets based on competitive intelligence
   */
  private async findOptimalTransferTargets(
    intelligence: CompetitiveIntelligence, 
    userSquad: ProcessedPlayer[], 
    targetGameweeks: number
  ): Promise<Array<{
    playerId: number;
    playerName: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    confidence: number;
  }>> {
    const targets: any[] = [];
    const userPlayerIds = new Set(userSquad.map(p => p.id));

    // High priority: Emerging players with strong momentum
    intelligence.metaTrends.emergingPlayers.forEach(player => {
      if (!userPlayerIds.has(player.playerId)) {
        targets.push({
          playerId: player.playerId,
          playerName: player.playerName,
          reason: `Emerging pick: ${player.reasons.join(', ')}`,
          priority: 'high' as const,
          confidence: Math.min(95, 70 + player.ownershipGrowth)
        });
      }
    });

    // Medium priority: Undervalued market inefficiencies
    intelligence.marketInefficiencies
      .filter(m => m.opportunity === 'undervalued' && !userPlayerIds.has(m.playerId))
      .forEach(player => {
        targets.push({
          playerId: player.playerId,
          playerName: player.playerName,
          reason: `Undervalued by market`,
          priority: 'medium' as const,
          confidence: player.confidence
        });
      });

    // Low priority: Template picks you're missing
    intelligence.metaTrends.popularPicks
      .filter(p => !p.differential && !userPlayerIds.has(p.playerId))
      .slice(0, 5)
      .forEach(player => {
        targets.push({
          playerId: player.playerId,
          playerName: player.playerName,
          reason: `Popular template pick (${player.ownership}% ownership)`,
          priority: 'low' as const,
          confidence: 60 + (player.ownership / 2)
        });
      });

    // Sort by priority and confidence
    return targets
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority] || 0;
        const bPriority = priorityOrder[b.priority] || 0;
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        return b.confidence - a.confidence;
      })
      .slice(0, 10); // Return top 10 targets
  }

  /**
   * Rank strategies by how well they fit the user's current situation
   */
  private rankStrategiesByFit(
    strategies: CompetitiveStrategy[], 
    userSquad: ProcessedPlayer[], 
    intelligence: CompetitiveIntelligence
  ): CompetitiveStrategy[] {
    return strategies.map(strategy => {
      // Adjust confidence based on user's current squad composition
      let fitScore = strategy.confidence;
      
      // If user already has many template players, differential strategies become more attractive
      const templatePlayerCount = userSquad.filter(player => {
        return intelligence.metaTrends.popularPicks.some(popular => 
          popular.playerId === player.id && popular.ownership > 20
        );
      }).length;
      
      if (strategy.type === 'differential' && templatePlayerCount > 8) {
        fitScore += 10;
      } else if (strategy.type === 'template' && templatePlayerCount < 6) {
        fitScore += 15;
      }

      return {
        ...strategy,
        confidence: Math.min(95, fitScore)
      };
    }).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get strategic insights for specific players
   */
  async getPlayerStrategicInsights(playerId: number): Promise<{
    competitivePosition: 'template' | 'emerging' | 'differential' | 'contrarian';
    ownershipTrend: 'rising' | 'falling' | 'stable';
    topManagerUsage: number;
    strategicValue: 'high' | 'medium' | 'low';
    recommendations: string[];
  }> {
    const intelligence = await this.rivalAnalysisService.getCompetitiveIntelligence();
    
    // Find player in various intelligence categories
    const popularPick = intelligence.metaTrends.popularPicks.find(p => p.playerId === playerId);
    const emergingPick = intelligence.metaTrends.emergingPlayers.find(p => p.playerId === playerId);
    const inefficiency = intelligence.marketInefficiencies.find(p => p.playerId === playerId);
    
    // Determine competitive position
    let competitivePosition: 'template' | 'emerging' | 'differential' | 'contrarian' = 'contrarian';
    if (popularPick && !popularPick.differential) competitivePosition = 'template';
    else if (emergingPick) competitivePosition = 'emerging';
    else if (popularPick && popularPick.differential) competitivePosition = 'differential';

    // Count top manager usage
    const topManagerUsage = intelligence.rivalInsights.topManagerMoves
      .filter(manager => 
        manager.transfers.playersIn.some(transfer => transfer.playerId === playerId)
      ).length;

    // Determine strategic value
    let strategicValue: 'high' | 'medium' | 'low' = 'low';
    if (emergingPick && emergingPick.ownershipGrowth > 15) strategicValue = 'high';
    else if (topManagerUsage > 3 || (popularPick && popularPick.trend === 'rising')) strategicValue = 'medium';

    // Generate recommendations
    const recommendations: string[] = [];
    if (competitivePosition === 'emerging') {
      recommendations.push('Early mover advantage - consider before ownership increases');
    }
    if (inefficiency && inefficiency.opportunity === 'undervalued') {
      recommendations.push(`Market inefficiency detected - ${inefficiency.confidence}% confidence`);
    }
    if (topManagerUsage > 5) {
      recommendations.push('High top manager adoption - strong template candidate');
    }

    return {
      competitivePosition,
      ownershipTrend: popularPick?.trend || emergingPick ? 'rising' : 'stable',
      topManagerUsage,
      strategicValue,
      recommendations
    };
  }

  /**
   * Check if cached data is still valid
   */
  private isCacheValid(key: string): boolean {
    const expiry = this.cacheExpiry.get(key);
    return expiry ? Date.now() < expiry : false;
  }

  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    console.log('Competitive intelligence cache cleared');
  }

  /**
   * Get engine information for debugging
   */
  public getEngineInfo(): { 
    available: boolean; 
    cacheSize: number;
    capabilities: string[];
  } {
    return {
      available: true,
      cacheSize: this.cache.size,
      capabilities: [
        'competitive-intelligence', 
        'rival-analysis', 
        'meta-trends', 
        'strategic-recommendations',
        'market-inefficiencies'
      ]
    };
  }
}
/**
 * Effective Ownership Engine - Phase 2 Implementation
 * 
 * Implements Effective Ownership (EO) modeling for rank optimization instead of pure point maximization.
 * EO considers how often your picks differ from others to maximize rank gains.
 */

import { ProcessedPlayer, PlayerAdvanced } from '@shared/schema';
import { StatsService } from './statsService';
import { MonteCarloEngine } from './monteCarloEngine';

interface EffectiveOwnershipData {
  playerId: number;
  totalOwnership: number;        // Overall ownership %
  topOwnership: number;          // Ownership in top 10k
  activeOwnership: number;       // Ownership among active players
  captaincy: number;             // Captaincy % overall
  topCaptaincy: number;          // Captaincy % in top 10k
  effectiveOwnership: number;    // EO = ownership + (captaincy * (2-1))
  topEffectiveOwnership: number; // EO in top 10k
}

interface RankOptimizationResult {
  playerId: number;
  expectedPoints: number;
  effectiveOwnership: number;
  rankGainPotential: number;     // Expected rank gain if player hauls
  rankRisk: number;              // Expected rank loss if player blanks
  riskAdjustedValue: number;     // Points per EO unit
  differential: boolean;         // Is this a good differential pick?
  strategy: 'template' | 'differential' | 'balanced';
}

interface PortfolioOptimization {
  players: RankOptimizationResult[];
  totalExpectedPoints: number;
  expectedRankGain: number;
  riskLevel: 'conservative' | 'balanced' | 'aggressive';
  differentialCount: number;
  templateCount: number;
}

export class EffectiveOwnershipEngine {
  private static instance: EffectiveOwnershipEngine;
  private statsService: StatsService;
  private monteCarloEngine: MonteCarloEngine;
  private cache = new Map<string, any>();
  private cacheExpiry = 1 * 60 * 60 * 1000; // 1 hour
  
  // Ownership thresholds for strategy classification
  private readonly OWNERSHIP_THRESHOLDS = {
    HIGH_OWNERSHIP: 20,      // 20%+ = template pick
    MEDIUM_OWNERSHIP: 8,     // 8-20% = balanced
    LOW_OWNERSHIP: 3,        // <8% = differential
    VERY_LOW_OWNERSHIP: 1    // <3% = high-risk differential
  };

  private constructor() {
    this.statsService = StatsService.getInstance();
    this.monteCarloEngine = MonteCarloEngine.getInstance();
  }

  public static getInstance(): EffectiveOwnershipEngine {
    if (!EffectiveOwnershipEngine.instance) {
      EffectiveOwnershipEngine.instance = new EffectiveOwnershipEngine();
    }
    return EffectiveOwnershipEngine.instance;
  }

  /**
   * Calculate effective ownership for a player considering captaincy
   */
  calculateEffectiveOwnership(
    ownership: number, 
    captaincy: number, 
    isTripleCaptain: boolean = false
  ): number {
    const multiplier = isTripleCaptain ? 3 : 2;
    return ownership + (captaincy * (multiplier - 1));
  }

  /**
   * Analyze rank optimization potential for a list of players
   */
  async analyzeRankOptimization(
    players: ProcessedPlayer[],
    currentRank: number = 500000,
    targetRank: number = 100000,
    gameweeks: number = 5
  ): Promise<PortfolioOptimization> {
    try {
      const playerAnalysis: RankOptimizationResult[] = [];
      
      for (const player of players) {
        const analysis = await this.analyzePlayerForRankOptimization(
          player, 
          currentRank, 
          targetRank
        );
        
        if (analysis) {
          playerAnalysis.push(analysis);
        }
      }
      
      // Sort by risk-adjusted value
      playerAnalysis.sort((a, b) => b.riskAdjustedValue - a.riskAdjustedValue);
      
      // Calculate portfolio metrics
      const portfolio = this.optimizePortfolio(playerAnalysis, currentRank, targetRank);
      
      return portfolio;
    } catch (error) {
      console.error('Rank optimization analysis error:', error);
      
      // Return minimal fallback portfolio
      return this.createFallbackPortfolio(players);
    }
  }

  /**
   * Analyze individual player for rank optimization
   */
  private async analyzePlayerForRankOptimization(
    player: ProcessedPlayer,
    currentRank: number,
    targetRank: number
  ): Promise<RankOptimizationResult | null> {
    try {
      // Get ownership data (simulated for now, in production would come from FPL API)
      const ownershipData = this.getOwnershipData(player);
      
      // Get Monte Carlo simulation for the player
      const fixtures = [{ team_h: player.teamId, team_a: 1, difficulty: 3 }];
      const monteCarloResult = await this.monteCarloEngine.simulatePlayer(player, fixtures);
      
      // Calculate rank optimization metrics
      const rankGainPotential = this.calculateRankGainPotential(
        monteCarloResult.expectedPoints,
        ownershipData.effectiveOwnership,
        monteCarloResult.haulingProbability,
        currentRank
      );
      
      const rankRisk = this.calculateRankRisk(
        monteCarloResult.expectedPoints,
        ownershipData.effectiveOwnership,
        monteCarloResult.floorProbability,
        currentRank
      );
      
      const riskAdjustedValue = this.calculateRiskAdjustedValue(
        monteCarloResult.expectedPoints,
        ownershipData.effectiveOwnership,
        monteCarloResult.standardDeviation
      );
      
      const strategy = this.determineStrategy(ownershipData.totalOwnership);
      const differential = this.isDifferential(ownershipData.totalOwnership);
      
      return {
        playerId: player.id,
        expectedPoints: monteCarloResult.expectedPoints,
        effectiveOwnership: ownershipData.effectiveOwnership,
        rankGainPotential,
        rankRisk,
        riskAdjustedValue,
        differential,
        strategy
      };
    } catch (error) {
      console.error(`Player rank analysis error for ${player.id}:`, error);
      return null;
    }
  }

  /**
   * Get ownership data for a player (simulated for now)
   */
  private getOwnershipData(player: ProcessedPlayer): EffectiveOwnershipData {
    // In production, this would fetch real ownership data from FPL API
    // For now, simulate based on player characteristics
    
    const price = (player as any).price || 50;
    const position = player.position;
    const seed = player.id % 1000;
    
    // Simulate ownership based on price and position
    let baseOwnership = 5; // Base 5% ownership
    
    // Price effect on ownership
    if (price > 80) baseOwnership += 15; // Premium players
    else if (price > 60) baseOwnership += 8; // Mid-price
    else if (price < 45) baseOwnership += 12; // Budget enablers
    
    // Position effect
    const positionMultiplier = {
      'FWD': 1.2,
      'MID': 1.1, 
      'DEF': 0.9,
      'GK': 0.7
    };
    
    baseOwnership *= positionMultiplier[position] || 1;
    
    // Add some randomness
    baseOwnership += (seed % 20 - 10) / 2;
    baseOwnership = Math.max(0.5, Math.min(50, baseOwnership));
    
    // Estimate captaincy (typically 10-20% of ownership)
    const captaincy = baseOwnership * (0.1 + (seed % 10) / 100);
    
    // Top 10k ownership typically 20-50% higher
    const topOwnership = baseOwnership * (1.2 + (seed % 30) / 100);
    const topCaptaincy = captaincy * (1.3 + (seed % 20) / 100);
    
    return {
      playerId: player.id,
      totalOwnership: Math.round(baseOwnership * 10) / 10,
      topOwnership: Math.round(topOwnership * 10) / 10,
      activeOwnership: Math.round(baseOwnership * 1.1 * 10) / 10,
      captaincy: Math.round(captaincy * 10) / 10,
      topCaptaincy: Math.round(topCaptaincy * 10) / 10,
      effectiveOwnership: this.calculateEffectiveOwnership(baseOwnership, captaincy),
      topEffectiveOwnership: this.calculateEffectiveOwnership(topOwnership, topCaptaincy)
    };
  }

  /**
   * Calculate potential rank gain if player hauls
   */
  private calculateRankGainPotential(
    expectedPoints: number,
    effectiveOwnership: number,
    haulingProbability: number,
    currentRank: number
  ): number {
    // Lower EO = higher rank gain potential when player hauls
    const baseRankGain = Math.max(0, 15 - expectedPoints) * 10000; // More gain for unexpected hauls
    const ownershipAdjustment = Math.max(0.1, 100 - effectiveOwnership) / 100;
    const haulingBonus = haulingProbability * 50000; // Bonus for likely haulers
    
    const rankGain = (baseRankGain + haulingBonus) * ownershipAdjustment;
    
    // Cap rank gain based on current rank (can't gain more ranks than you have)
    return Math.min(rankGain, currentRank * 0.1);
  }

  /**
   * Calculate potential rank loss if player blanks
   */
  private calculateRankRisk(
    expectedPoints: number,
    effectiveOwnership: number,
    floorProbability: number,
    currentRank: number
  ): number {
    // Higher EO = higher rank loss when player blanks
    const baseRankLoss = Math.max(0, expectedPoints - 2) * 5000; // More risk for expected performers
    const ownershipPenalty = effectiveOwnership / 100;
    const blankingRisk = floorProbability * 25000; // Risk of blanking
    
    const rankLoss = (baseRankLoss + blankingRisk) * ownershipPenalty;
    
    // Reasonable cap on rank loss
    return Math.min(rankLoss, 100000);
  }

  /**
   * Calculate risk-adjusted value (points per effective ownership unit)
   */
  private calculateRiskAdjustedValue(
    expectedPoints: number,
    effectiveOwnership: number,
    standardDeviation: number
  ): number {
    // Higher points per EO unit = better value
    const baseValue = expectedPoints / Math.max(1, effectiveOwnership);
    
    // Adjust for consistency (lower standard deviation = better)
    const consistencyAdjustment = Math.max(0.5, 1 - (standardDeviation / 10));
    
    return baseValue * consistencyAdjustment;
  }

  /**
   * Determine optimal strategy for player based on ownership
   */
  private determineStrategy(ownership: number): 'template' | 'differential' | 'balanced' {
    if (ownership >= this.OWNERSHIP_THRESHOLDS.HIGH_OWNERSHIP) {
      return 'template';
    } else if (ownership >= this.OWNERSHIP_THRESHOLDS.MEDIUM_OWNERSHIP) {
      return 'balanced';
    } else {
      return 'differential';
    }
  }

  /**
   * Determine if player is a good differential pick
   */
  private isDifferential(ownership: number): boolean {
    return ownership < this.OWNERSHIP_THRESHOLDS.MEDIUM_OWNERSHIP;
  }

  /**
   * Optimize portfolio based on rank goals and risk tolerance
   */
  private optimizePortfolio(
    playerAnalysis: RankOptimizationResult[],
    currentRank: number,
    targetRank: number
  ): PortfolioOptimization {
    // Determine risk level based on rank gap
    const rankGapRatio = (currentRank - targetRank) / currentRank;
    let riskLevel: 'conservative' | 'balanced' | 'aggressive';
    
    if (rankGapRatio < 0.1) {
      riskLevel = 'conservative'; // Small rank improvement needed
    } else if (rankGapRatio < 0.5) {
      riskLevel = 'balanced'; // Moderate rank improvement
    } else {
      riskLevel = 'aggressive'; // Major rank improvement needed
    }
    
    // Select players based on risk level
    const selectedPlayers = this.selectPlayersForRiskLevel(playerAnalysis, riskLevel);
    
    // Calculate portfolio metrics
    const totalExpectedPoints = selectedPlayers.reduce((sum, p) => sum + p.expectedPoints, 0);
    const expectedRankGain = selectedPlayers.reduce((sum, p) => sum + p.rankGainPotential, 0);
    const differentialCount = selectedPlayers.filter(p => p.differential).length;
    const templateCount = selectedPlayers.filter(p => p.strategy === 'template').length;
    
    return {
      players: selectedPlayers,
      totalExpectedPoints,
      expectedRankGain,
      riskLevel,
      differentialCount,
      templateCount
    };
  }

  /**
   * Select players based on risk tolerance
   */
  private selectPlayersForRiskLevel(
    players: RankOptimizationResult[],
    riskLevel: 'conservative' | 'balanced' | 'aggressive'
  ): RankOptimizationResult[] {
    const maxPlayers = 15; // Typical squad size consideration
    
    switch (riskLevel) {
      case 'conservative':
        // Prefer template picks and balanced options
        return players
          .filter(p => p.strategy !== 'differential' || p.riskAdjustedValue > 0.8)
          .slice(0, maxPlayers);
      
      case 'balanced':
        // Mix of template and differential picks
        const template = players.filter(p => p.strategy === 'template').slice(0, 8);
        const differential = players.filter(p => p.differential && p.riskAdjustedValue > 0.5).slice(0, 4);
        const balanced = players.filter(p => p.strategy === 'balanced').slice(0, 3);
        
        return [...template, ...differential, ...balanced].slice(0, maxPlayers);
      
      case 'aggressive':
        // Prefer high upside differentials
        return players
          .filter(p => p.rankGainPotential > 20000 || p.riskAdjustedValue > 0.6)
          .slice(0, maxPlayers);
      
      default:
        return players.slice(0, maxPlayers);
    }
  }

  /**
   * Create fallback portfolio when analysis fails
   */
  private createFallbackPortfolio(players: ProcessedPlayer[]): PortfolioOptimization {
    const fallbackPlayers: RankOptimizationResult[] = players.slice(0, 15).map(player => ({
      playerId: player.id,
      expectedPoints: 4.0,
      effectiveOwnership: 10.0,
      rankGainPotential: 15000,
      rankRisk: 8000,
      riskAdjustedValue: 0.4,
      differential: false,
      strategy: 'balanced' as const
    }));
    
    return {
      players: fallbackPlayers,
      totalExpectedPoints: 60.0,
      expectedRankGain: 225000,
      riskLevel: 'balanced',
      differentialCount: 0,
      templateCount: 0
    };
  }

  /**
   * Get strategy recommendations based on current rank and goals
   */
  getStrategyRecommendations(
    currentRank: number,
    targetRank: number,
    gameweeksRemaining: number
  ): any {
    const rankGap = currentRank - targetRank;
    const weeklyRankGainNeeded = rankGap / gameweeksRemaining;
    
    return {
      recommendedRiskLevel: weeklyRankGainNeeded > 50000 ? 'aggressive' : 
                           weeklyRankGainNeeded > 20000 ? 'balanced' : 'conservative',
      differentialRecommendation: weeklyRankGainNeeded > 30000,
      captaincyStrategy: weeklyRankGainNeeded > 40000 ? 'high_risk_differential' : 'safe_premium',
      weeklyRankGainTarget: weeklyRankGainNeeded,
      feasibility: weeklyRankGainNeeded < 100000 ? 'achievable' : 'challenging'
    };
  }
}
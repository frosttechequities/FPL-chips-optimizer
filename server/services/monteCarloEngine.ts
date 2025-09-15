/**
 * Monte Carlo Simulation Engine - Phase 2 Implementation
 * 
 * Provides probabilistic point forecasting by simulating matches thousands of times
 * to generate distributions of potential outcomes for each player
 */

import { ProcessedPlayer, PlayerAdvanced, MatchOdds } from '@shared/schema';
import { OpenFPLEngine } from './openFPLEngine';

interface SimulationEvent {
  type: 'goal' | 'assist' | 'clean_sheet' | 'yellow_card' | 'red_card' | 'own_goal' | 'penalty_miss' | 'penalty_save' | 'save';
  probability: number;
  points: number;
  bonusMultiplier?: number; // For bonus point calculations
}

interface PlayerSimulationSetup {
  playerId: number;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  minutesProbability: number; // Probability of starting (0-1)
  expectedMinutes: number; // If starting, expected minutes
  events: SimulationEvent[];
}

interface SimulationResult {
  playerId: number;
  simulations: number[];
  expectedPoints: number;
  median: number;
  mode: number;
  standardDeviation: number;
  percentiles: {
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
  haulingProbability: number; // P(points >= 10)
  ceilingProbability: number; // P(points >= 15)
  floorProbability: number;   // P(points <= 2)
  captainEV: number; // Expected value as captain (2x points)
  consistency: number; // Coefficient of variation inverse
}

export class MonteCarloEngine {
  private static instance: MonteCarloEngine;
  private openFPLEngine: OpenFPLEngine;
  private readonly SIMULATION_RUNS = 1000; // Reduced for performance, still statistically meaningful
  
  private constructor() {
    this.openFPLEngine = OpenFPLEngine.getInstance();
  }

  public static getInstance(): MonteCarloEngine {
    if (!MonteCarloEngine.instance) {
      MonteCarloEngine.instance = new MonteCarloEngine();
    }
    return MonteCarloEngine.instance;
  }

  async simulatePlayer(
    player: ProcessedPlayer,
    fixtures: any[],
    advancedStats?: PlayerAdvanced,
    odds?: MatchOdds[]
  ): Promise<SimulationResult> {
    try {
      // Get baseline prediction from OpenFPL
      const baselinePrediction = await this.openFPLEngine.predictPlayer(player, fixtures, advancedStats, odds);
      
      // Set up simulation parameters
      const setup = this.setupPlayerSimulation(player, baselinePrediction, advancedStats, odds);
      
      // Run Monte Carlo simulations
      const simulations = this.runSimulations(setup);
      
      // Calculate statistics
      const result = this.calculateStatistics(player.id, simulations);
      
      return result;
    } catch (error) {
      console.error(`Monte Carlo simulation error for player ${player.id}:`, error);
      
      // Fallback to deterministic result
      return this.createFallbackResult(player.id, 3.0);
    }
  }

  private setupPlayerSimulation(
    player: ProcessedPlayer,
    baseline: any,
    advancedStats?: PlayerAdvanced,
    odds?: MatchOdds[]
  ): PlayerSimulationSetup {
    const position = player.position;
    
    // Estimate starting probability and minutes
    const minutesProbability = this.calculateStartingProbability(player, advancedStats);
    const expectedMinutes = advancedStats?.xMins || this.estimateMinutes(player);
    
    // Define events based on position and baseline prediction
    const events = this.defineEvents(player, baseline, advancedStats, odds);
    
    return {
      playerId: player.id,
      position,
      minutesProbability,
      expectedMinutes,
      events
    };
  }

  private calculateStartingProbability(player: ProcessedPlayer, advancedStats?: PlayerAdvanced): number {
    // Use advanced stats if available
    if (advancedStats) {
      switch (advancedStats.role) {
        case 'nailed': return 0.9;
        case 'rotation': return 0.6;
        case 'benchwarmer': return 0.2;
        default: return 0.7;
      }
    }
    
    // Fallback based on price and position
    const price = (player as any).price || 50;
    const positionFactor = { 'GK': 0.9, 'DEF': 0.8, 'MID': 0.7, 'FWD': 0.75 };
    const priceFactor = Math.min(0.3, (price - 40) / 100); // Higher price = more likely to start
    
    return Math.min(0.95, (positionFactor[player.position] || 0.7) + priceFactor);
  }

  private estimateMinutes(player: ProcessedPlayer): number {
    const position = player.position;
    const positionMinutes = { 'GK': 90, 'DEF': 85, 'MID': 75, 'FWD': 70 };
    return positionMinutes[position] || 75;
  }

  private defineEvents(
    player: ProcessedPlayer,
    baseline: any,
    advancedStats?: PlayerAdvanced,
    odds?: MatchOdds[]
  ): SimulationEvent[] {
    const position = player.position;
    const events: SimulationEvent[] = [];
    
    // Base points for playing
    events.push({
      type: 'goal', // Using as base points
      probability: 1.0, // Always get base points if playing
      points: this.getBasePoints(position),
      bonusMultiplier: 0
    });

    // Position-specific events
    switch (position) {
      case 'GK':
        this.addGoalkeeperEvents(events, advancedStats, odds);
        break;
      case 'DEF':
        this.addDefenderEvents(events, advancedStats, odds);
        break;
      case 'MID':
        this.addMidfielderEvents(events, advancedStats, odds);
        break;
      case 'FWD':
        this.addForwardEvents(events, advancedStats, odds);
        break;
    }

    // Common events for all positions
    this.addCommonEvents(events, player, advancedStats);
    
    return events;
  }

  private getBasePoints(position: 'GK' | 'DEF' | 'MID' | 'FWD'): number {
    return { 'GK': 1, 'DEF': 1, 'MID': 1, 'FWD': 1 }[position];
  }

  private addGoalkeeperEvents(events: SimulationEvent[], stats?: PlayerAdvanced, odds?: MatchOdds[]) {
    // Clean sheet
    const cleanSheetProb = odds?.[0]?.homeCleanSheet ? (1 / odds[0].homeCleanSheet) : 0.3;
    events.push({
      type: 'clean_sheet',
      probability: cleanSheetProb,
      points: 4,
      bonusMultiplier: 1.5
    });

    // Saves (3 saves = 1 point, 6 saves = 2 points)
    events.push({
      type: 'save',
      probability: 0.7, // Most GKs make some saves
      points: 1,
      bonusMultiplier: 0.5
    });

    // Penalty save
    events.push({
      type: 'penalty_save',
      probability: 0.05,
      points: 5,
      bonusMultiplier: 2.0
    });

    // Goals (rare but high value)
    events.push({
      type: 'goal',
      probability: 0.01,
      points: 6,
      bonusMultiplier: 3.0
    });
  }

  private addDefenderEvents(events: SimulationEvent[], stats?: PlayerAdvanced, odds?: MatchOdds[]) {
    // Clean sheet
    const cleanSheetProb = odds?.[0]?.homeCleanSheet ? (1 / odds[0].homeCleanSheet) : 0.35;
    events.push({
      type: 'clean_sheet',
      probability: cleanSheetProb,
      points: 4,
      bonusMultiplier: 1.2
    });

    // Goals
    const goalProb = stats?.xG || 0.08;
    events.push({
      type: 'goal',
      probability: goalProb,
      points: 6,
      bonusMultiplier: 2.0
    });

    // Assists
    const assistProb = stats?.xA || 0.12;
    events.push({
      type: 'assist',
      probability: assistProb,
      points: 3,
      bonusMultiplier: 1.5
    });

    // Own goals (negative)
    events.push({
      type: 'own_goal',
      probability: 0.02,
      points: -2,
      bonusMultiplier: 0
    });
  }

  private addMidfielderEvents(events: SimulationEvent[], stats?: PlayerAdvanced, odds?: MatchOdds[]) {
    // Goals
    const goalProb = stats?.xG || 0.25;
    events.push({
      type: 'goal',
      probability: goalProb,
      points: 5,
      bonusMultiplier: 1.8
    });

    // Assists
    const assistProb = stats?.xA || 0.35;
    events.push({
      type: 'assist',
      probability: assistProb,
      points: 3,
      bonusMultiplier: 1.5
    });

    // Clean sheet (only if playing defensive role)
    const cleanSheetProb = (odds?.[0]?.homeCleanSheet ? (1 / odds[0].homeCleanSheet) : 0.3) * 0.3; // Reduced for mids
    events.push({
      type: 'clean_sheet',
      probability: cleanSheetProb,
      points: 1,
      bonusMultiplier: 0.5
    });
  }

  private addForwardEvents(events: SimulationEvent[], stats?: PlayerAdvanced, odds?: MatchOdds[]) {
    // Goals
    const goalProb = stats?.xG || 0.45;
    events.push({
      type: 'goal',
      probability: goalProb,
      points: 4,
      bonusMultiplier: 2.0
    });

    // Assists
    const assistProb = stats?.xA || 0.20;
    events.push({
      type: 'assist',
      probability: assistProb,
      points: 3,
      bonusMultiplier: 1.5
    });

    // Penalty miss
    events.push({
      type: 'penalty_miss',
      probability: 0.03,
      points: -2,
      bonusMultiplier: 0
    });
  }

  private addCommonEvents(events: SimulationEvent[], player: ProcessedPlayer, stats?: PlayerAdvanced) {
    // Yellow card
    events.push({
      type: 'yellow_card',
      probability: 0.15,
      points: -1,
      bonusMultiplier: 0
    });

    // Red card
    events.push({
      type: 'red_card',
      probability: 0.02,
      points: -3,
      bonusMultiplier: 0
    });
  }

  private runSimulations(setup: PlayerSimulationSetup): number[] {
    const results: number[] = [];
    
    for (let i = 0; i < this.SIMULATION_RUNS; i++) {
      results.push(this.simulateSingleMatch(setup));
    }
    
    return results;
  }

  private simulateSingleMatch(setup: PlayerSimulationSetup): number {
    // First, determine if player starts
    if (Math.random() > setup.minutesProbability) {
      return 0; // Player doesn't play
    }

    let totalPoints = 0;
    let bonusPoints = 0;

    // Simulate each event
    for (const event of setup.events) {
      if (Math.random() < event.probability) {
        totalPoints += event.points;
        
        // Calculate bonus potential
        if (event.bonusMultiplier && event.bonusMultiplier > 0) {
          bonusPoints += event.points * (event.bonusMultiplier || 0);
        }
      }
    }

    // Add bonus points (simplified bonus calculation)
    const bonusProb = Math.min(0.4, bonusPoints / 15); // Higher performance = higher bonus chance
    if (Math.random() < bonusProb) {
      const bonusValue = bonusPoints > 10 ? 3 : bonusPoints > 6 ? 2 : 1;
      totalPoints += bonusValue;
    }

    return Math.max(0, totalPoints);
  }

  private calculateStatistics(playerId: number, simulations: number[]): SimulationResult {
    // Sort simulations for percentile calculations
    const sorted = [...simulations].sort((a, b) => a - b);
    const n = sorted.length;
    
    // Basic statistics
    const sum = simulations.reduce((a, b) => a + b, 0);
    const expectedPoints = sum / n;
    const median = this.calculatePercentile(sorted, 50);
    
    // Mode (most common score)
    const mode = this.calculateMode(simulations);
    
    // Standard deviation
    const variance = simulations.reduce((acc, points) => acc + Math.pow(points - expectedPoints, 2), 0) / n;
    const standardDeviation = Math.sqrt(variance);
    
    // Percentiles
    const percentiles = {
      p10: this.calculatePercentile(sorted, 10),
      p25: this.calculatePercentile(sorted, 25),
      p75: this.calculatePercentile(sorted, 75),
      p90: this.calculatePercentile(sorted, 90)
    };
    
    // Probability calculations
    const haulingProbability = simulations.filter(p => p >= 10).length / n;
    const ceilingProbability = simulations.filter(p => p >= 15).length / n;
    const floorProbability = simulations.filter(p => p <= 2).length / n;
    
    // Captain expected value (2x points)
    const captainEV = expectedPoints * 2;
    
    // Consistency (inverse of coefficient of variation)
    const consistency = expectedPoints > 0 ? 1 / (standardDeviation / expectedPoints) : 0;
    
    return {
      playerId,
      simulations,
      expectedPoints: Math.round(expectedPoints * 100) / 100,
      median: Math.round(median * 100) / 100,
      mode,
      standardDeviation: Math.round(standardDeviation * 100) / 100,
      percentiles: {
        p10: Math.round(percentiles.p10 * 100) / 100,
        p25: Math.round(percentiles.p25 * 100) / 100,
        p75: Math.round(percentiles.p75 * 100) / 100,
        p90: Math.round(percentiles.p90 * 100) / 100
      },
      haulingProbability: Math.round(haulingProbability * 1000) / 1000,
      ceilingProbability: Math.round(ceilingProbability * 1000) / 1000,
      floorProbability: Math.round(floorProbability * 1000) / 1000,
      captainEV: Math.round(captainEV * 100) / 100,
      consistency: Math.round(consistency * 100) / 100
    };
  }

  private calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = (percentile / 100) * (sortedArray.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;
    
    if (upper >= sortedArray.length) return sortedArray[sortedArray.length - 1];
    
    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  private calculateMode(simulations: number[]): number {
    const frequency: Record<number, number> = {};
    let maxFreq = 0;
    let mode = 0;
    
    for (const points of simulations) {
      const rounded = Math.round(points);
      frequency[rounded] = (frequency[rounded] || 0) + 1;
      if (frequency[rounded] > maxFreq) {
        maxFreq = frequency[rounded];
        mode = rounded;
      }
    }
    
    return mode;
  }

  private createFallbackResult(playerId: number, expectedPoints: number): SimulationResult {
    return {
      playerId,
      simulations: Array(100).fill(expectedPoints),
      expectedPoints,
      median: expectedPoints,
      mode: Math.round(expectedPoints),
      standardDeviation: 2.0,
      percentiles: {
        p10: Math.max(0, expectedPoints - 2),
        p25: Math.max(0, expectedPoints - 1),
        p75: expectedPoints + 2,
        p90: expectedPoints + 4
      },
      haulingProbability: expectedPoints > 6 ? 0.1 : 0.05,
      ceilingProbability: 0.02,
      floorProbability: expectedPoints < 3 ? 0.3 : 0.1,
      captainEV: expectedPoints * 2,
      consistency: 0.5
    };
  }

  async simulatePlayerBatch(
    players: ProcessedPlayer[],
    fixtures: any[],
    advancedStats?: Map<number, PlayerAdvanced>,
    odds?: MatchOdds[]
  ): Promise<Map<number, SimulationResult>> {
    const results = new Map<number, SimulationResult>();
    
    // Process players in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (player) => {
        const playerStats = advancedStats?.get(player.id);
        const result = await this.simulatePlayer(player, fixtures, playerStats, odds);
        return { playerId: player.id, result };
      });
      
      const batchResults = await Promise.all(batchPromises);
      
      for (const { playerId, result } of batchResults) {
        results.set(playerId, result);
      }
    }
    
    return results;
  }

  getEngineInfo(): Record<string, any> {
    return {
      version: 'MonteCarloEngine-v1.0',
      simulationRuns: this.SIMULATION_RUNS,
      methodology: 'Event-based probabilistic simulation',
      eventTypes: ['goals', 'assists', 'clean_sheets', 'cards', 'bonus_points'],
      lastUpdated: new Date().toISOString()
    };
  }
}
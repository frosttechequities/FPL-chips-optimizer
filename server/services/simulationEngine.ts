import { PlayerSimOutcome, SimulationSummary, ProcessedPlayer, MatchOdds, PlayerAdvanced } from "@shared/schema";

export interface SimulationConfig {
  runs: number; // Number of Monte Carlo runs
  gameweeksToSimulate: number[]; // Which gameweeks to analyze
  strategy: string; // Description of strategy being simulated
  targetThreshold?: number; // Minimum points for "success" classification
  useOdds: boolean; // Whether to incorporate odds data
  useAdvancedStats: boolean; // Whether to use advanced player stats
}

export interface GameweekFixture {
  gameweek: number;
  playerId: number;
  hasFixture: boolean;
  odds?: MatchOdds;
  fdr: number;
  isHome: boolean;
}

// Individual simulation result for one run
interface SimulationRun {
  totalPoints: number;
  playerPoints: { [playerId: number]: number };
  gameweekPoints: { [gameweek: number]: number };
  haulsCount: number;
  blanksCount: number;
}

export class SimulationEngine {
  private static instance: SimulationEngine;

  public static getInstance(): SimulationEngine {
    if (!SimulationEngine.instance) {
      SimulationEngine.instance = new SimulationEngine();
    }
    return SimulationEngine.instance;
  }

  // Main simulation method for a squad of players
  async simulateSquad(
    players: ProcessedPlayer[],
    fixtures: GameweekFixture[],
    config: SimulationConfig
  ): Promise<SimulationSummary> {
    const runs: SimulationRun[] = [];

    // Run Monte Carlo simulations
    for (let i = 0; i < config.runs; i++) {
      const run = this.runSingleSimulation(players, fixtures, config);
      runs.push(run);
    }

    // Analyze results
    return this.analyzeSimulationResults(runs, config);
  }

  // Simulate individual player over specified gameweeks
  async simulatePlayer(
    player: ProcessedPlayer,
    fixtures: GameweekFixture[],
    config: SimulationConfig
  ): Promise<PlayerSimOutcome> {
    const playerFixtures = fixtures.filter(f => f.playerId === player.id);
    const runs: number[] = [];
    let haulsCount = 0;
    let blankCount = 0;
    let bestGW = 0;
    let worstGW = 999;
    let bestPoints = 0;
    let worstPoints = 999;

    // Monte Carlo runs for this player
    for (let i = 0; i < config.runs; i++) {
      const totalPoints = this.simulatePlayerPoints(player, playerFixtures, config);
      runs.push(totalPoints);

      if (totalPoints >= 10) haulsCount++;
      if (totalPoints <= 2) blankCount++;

      // Track best/worst gameweeks (simplified - assume one fixture per GW)
      playerFixtures.forEach(fixture => {
        const gwPoints = this.simulateGameweekPoints(player, fixture, config);
        if (gwPoints > bestPoints) {
          bestPoints = gwPoints;
          bestGW = fixture.gameweek;
        }
        if (gwPoints < worstPoints) {
          worstPoints = gwPoints;
          worstGW = fixture.gameweek;
        }
      });
    }

    // Calculate statistics
    runs.sort((a, b) => a - b);
    const mean = runs.reduce((sum, val) => sum + val, 0) / runs.length;
    const variance = runs.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / runs.length;
    const stdDev = Math.sqrt(variance);

    return {
      playerId: player.id,
      gameweeksSimulated: config.gameweeksToSimulate.length,
      meanPoints: Math.round(mean * 10) / 10,
      p10: runs[Math.floor(runs.length * 0.1)],
      p50: runs[Math.floor(runs.length * 0.5)],
      p90: runs[Math.floor(runs.length * 0.9)],
      standardDeviation: Math.round(stdDev * 10) / 10,
      haulsCount: Math.round(haulsCount / config.runs * 100),
      blankCount: Math.round(blankCount / config.runs * 100),
      bestGameweek: bestGW || config.gameweeksToSimulate[0],
      worstGameweek: worstGW !== 999 ? worstGW : config.gameweeksToSimulate[0],
      confidence: Math.min(100, Math.max(50, 100 - stdDev * 5)) // Lower std dev = higher confidence
    };
  }

  private runSingleSimulation(
    players: ProcessedPlayer[],
    fixtures: GameweekFixture[],
    config: SimulationConfig
  ): SimulationRun {
    let totalPoints = 0;
    const playerPoints: { [playerId: number]: number } = {};
    const gameweekPoints: { [gameweek: number]: number } = {};
    let haulsCount = 0;
    let blanksCount = 0;

    // Simulate each player
    players.forEach(player => {
      const playerFixtures = fixtures.filter(f => f.playerId === player.id);
      const points = this.simulatePlayerPoints(player, playerFixtures, config);
      
      playerPoints[player.id] = points;
      totalPoints += points;

      if (points >= 10) haulsCount++;
      if (points <= 2) blanksCount++;
    });

    // Calculate gameweek totals
    config.gameweeksToSimulate.forEach(gw => {
      gameweekPoints[gw] = players.reduce((sum, player) => {
        const playerGWFixtures = fixtures.filter(f => f.playerId === player.id && f.gameweek === gw);
        if (playerGWFixtures.length > 0) {
          return sum + this.simulateGameweekPoints(player, playerGWFixtures[0], config);
        }
        return sum;
      }, 0);
    });

    return {
      totalPoints,
      playerPoints,
      gameweekPoints,
      haulsCount,
      blanksCount
    };
  }

  private simulatePlayerPoints(
    player: ProcessedPlayer,
    fixtures: GameweekFixture[],
    config: SimulationConfig
  ): number {
    return fixtures.reduce((total, fixture) => {
      return total + this.simulateGameweekPoints(player, fixture, config);
    }, 0);
  }

  private simulateGameweekPoints(
    player: ProcessedPlayer,
    fixture: GameweekFixture,
    config: SimulationConfig
  ): number {
    if (!fixture.hasFixture) return 0;

    // Base expected points from historical data
    let basePoints = this.getHistoricalExpectedPoints(player);
    
    // Adjust for fixture difficulty
    const fdrAdjustment = this.getFDRAdjustment(fixture.fdr, fixture.isHome);
    basePoints *= fdrAdjustment;

    // Use odds data if available and enabled
    if (config.useOdds && fixture.odds) {
      basePoints *= this.getOddsAdjustment(player, fixture.odds);
    }

    // Use advanced stats if available and enabled
    if (config.useAdvancedStats && player.advancedStats) {
      basePoints *= this.getAdvancedStatsAdjustment(player, player.advancedStats);
    }

    // Add volatility using player's historical variance
    const volatility = player.volatility || this.getDefaultVolatility(player);
    const randomness = this.generateNormalRandom() * volatility;

    return Math.max(0, Math.round((basePoints + randomness) * 10) / 10);
  }

  private getHistoricalExpectedPoints(player: ProcessedPlayer): number {
    // Estimate points per gameweek from season total
    const gamesPlayed = Math.max(1, 15); // Rough estimate, could be improved
    return player.points / gamesPlayed;
  }

  private getFDRAdjustment(fdr: number, isHome: boolean): number {
    // Convert FDR to multiplier (easier fixtures = higher multiplier)
    let adjustment = 1.3 - (fdr * 0.15); // FDR 1 = 1.15x, FDR 5 = 0.55x
    
    // Home advantage
    if (isHome) {
      adjustment *= 1.1;
    }

    return Math.max(0.4, Math.min(1.8, adjustment));
  }

  private getOddsAdjustment(player: ProcessedPlayer, odds: MatchOdds): number {
    // Use clean sheet odds for defensive points, goal odds for attacking points
    let adjustment = 1.0;

    if (player.position === 'GK' || player.position === 'DEF') {
      // Defenders benefit from clean sheet probability
      const csProb = 1 / odds.homeCleanSheet; // Assuming home team
      adjustment *= (1 + csProb * 0.3);
    }

    if (player.position === 'MID' || player.position === 'FWD') {
      // Attackers benefit from goals probability
      const goalProb = 1 / odds.over25Goals; // Over 2.5 goals
      adjustment *= (1 + goalProb * 0.2);
    }

    return Math.max(0.7, Math.min(1.4, adjustment));
  }

  private getAdvancedStatsAdjustment(player: ProcessedPlayer, stats: PlayerAdvanced): number {
    let adjustment = 1.0;

    // Minutes adjustment (rotation risk)
    const minutesReliability = Math.min(1.0, stats.xMins / 90);
    adjustment *= (0.5 + 0.5 * minutesReliability);

    // Form trend adjustment
    switch (stats.formTrend) {
      case 'rising':
        adjustment *= 1.15;
        break;
      case 'declining':
        adjustment *= 0.85;
        break;
      default:
        break; // No adjustment for stable
    }

    // Role adjustment
    switch (stats.role) {
      case 'nailed':
        adjustment *= 1.1;
        break;
      case 'benchwarmer':
        adjustment *= 0.6;
        break;
      default:
        break; // No adjustment for rotation
    }

    return Math.max(0.4, Math.min(1.6, adjustment));
  }

  private getDefaultVolatility(player: ProcessedPlayer): number {
    // Default volatility based on position
    switch (player.position) {
      case 'FWD': return 4.5;
      case 'MID': return 3.5;
      case 'DEF': return 2.5;
      case 'GK': return 2.0;
      default: return 3.0;
    }
  }

  // Box-Muller transformation for normal random numbers
  private generateNormalRandom(): number {
    const u = Math.random();
    const v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  private analyzeSimulationResults(runs: SimulationRun[], config: SimulationConfig): SimulationSummary {
    // Sort runs by total points
    runs.sort((a, b) => a.totalPoints - b.totalPoints);

    const totalPoints = runs.map(r => r.totalPoints);
    const mean = totalPoints.reduce((sum, val) => sum + val, 0) / totalPoints.length;
    const variance = totalPoints.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / totalPoints.length;

    const p10Index = Math.floor(runs.length * 0.1);
    const p90Index = Math.floor(runs.length * 0.9);

    const target = config.targetThreshold || mean;
    const successCount = runs.filter(r => r.totalPoints >= target).length;
    const boomCount = runs.filter(r => r.totalPoints >= mean * 1.2).length;
    const bustCount = runs.filter(r => r.totalPoints <= mean * 0.8).length;

    const stdDev = Math.sqrt(variance);
    const confidenceInterval: [number, number] = [
      Math.round((mean - 1.28 * stdDev) * 10) / 10, // 80% CI lower
      Math.round((mean + 1.28 * stdDev) * 10) / 10  // 80% CI upper
    ];

    // Recommendation strength based on consistency and upside
    let recommendationStrength: 'strong' | 'moderate' | 'weak';
    const consistencyScore = 1 - (stdDev / mean); // Higher = more consistent
    const upsideScore = (runs[p90Index].totalPoints - mean) / mean; // Higher = more upside

    if (consistencyScore > 0.7 && upsideScore > 0.2) {
      recommendationStrength = 'strong';
    } else if (consistencyScore > 0.5 || upsideScore > 0.15) {
      recommendationStrength = 'moderate';
    } else {
      recommendationStrength = 'weak';
    }

    return {
      strategy: config.strategy,
      runs: config.runs,
      gameweeksAnalyzed: config.gameweeksToSimulate,
      
      meanTotalPoints: Math.round(mean * 10) / 10,
      p10TotalPoints: runs[p10Index].totalPoints,
      p90TotalPoints: runs[p90Index].totalPoints,
      
      successRate: Math.round((successCount / runs.length) * 100),
      boomRate: Math.round((boomCount / runs.length) * 100),
      bustRate: Math.round((bustCount / runs.length) * 100),
      
      variance: Math.round(variance * 10) / 10,
      confidenceInterval,
      recommendationStrength,
      
      lastUpdated: new Date().toISOString()
    };
  }
}
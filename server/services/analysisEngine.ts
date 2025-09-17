import {
  type ProcessedPlayer,
  type GameweekFDR,
  type ChipRecommendation,
  type AnalysisResult,
  type FPLPlayer,
  type FPLTeam,
  type FPLFixture,
  type FPLUserSquad,
  type ChipType,
  type BudgetAnalysis,
  type TransferTarget,
  type SimulationSummary,
  type PlayerSimOutcome,
  type PlayerAdvanced,
  type MatchOdds,
  type MLPrediction,
  type CompetitiveIntelligence
} from "@shared/schema";
import { FPLApiService } from './fplApi';
import { TransferEngine } from './transferEngine';
import { OddsService } from './oddsService';
import { StatsService } from './statsService';
import { SimulationEngine, type GameweekFixture, type SimulationConfig } from './simulationEngine';
import { MLPredictionEngine } from './mlPredictionEngine';
import { CompetitiveIntelligenceEngine } from './competitiveIntelligenceEngine';

const POSITION_MAP: Record<number, 'GK' | 'DEF' | 'MID' | 'FWD'> = {
  1: 'GK',
  2: 'DEF', 
  3: 'MID',
  4: 'FWD'
};

export class AnalysisEngine {
  private fplApi: FPLApiService;
  private transferEngine: TransferEngine;
  private oddsService: OddsService;
  private statsService: StatsService;
  private simulationEngine: SimulationEngine;
  private mlPredictionEngine: MLPredictionEngine;
  private competitiveIntelligenceEngine: CompetitiveIntelligenceEngine;

  constructor() {
    this.fplApi = FPLApiService.getInstance();
    this.transferEngine = new TransferEngine();
    this.oddsService = OddsService.getInstance();
    this.statsService = StatsService.getInstance();
    this.simulationEngine = SimulationEngine.getInstance();
    this.mlPredictionEngine = MLPredictionEngine.getInstance();
    this.competitiveIntelligenceEngine = CompetitiveIntelligenceEngine.getInstance();
  }

  async analyzeTeam(teamId: string): Promise<AnalysisResult> {
    try {
      const managerId = parseInt(teamId);
      
      // Fetch all required data in parallel
      const [bootstrap, userSquad, userInfo, fixtures, freeTransfers, nextDeadline] = await Promise.all([
        this.fplApi.getBootstrapData(),
        this.fplApi.getUserSquad(managerId),
        this.fplApi.getUserInfo(managerId),
        this.fplApi.getUpcomingFixtures(15),
        this.fplApi.computeFreeTransfers(managerId),
        this.fplApi.getNextDeadline()
      ]);

      // Enhanced Phase 1: Fetch odds and advanced stats
      const fixtureIds = fixtures.map(f => f.id);
      const playerIds = userSquad.picks.map(pick => pick.element);
      
      const [oddsData, playerStats] = await Promise.all([
        this.oddsService.getMatchOddsBatch(fixtureIds).catch(e => {
          console.warn('Odds service unavailable:', e.message);
          return [];
        }),
        this.statsService.getPlayerAdvancedBatch(playerIds).catch(e => {
          console.warn('Stats service unavailable:', e.message);
          return [];
        })
      ]);

      // Process players with enhanced data
      const players = await this.processPlayersEnhanced(
        userSquad, bootstrap.elements, bootstrap.teams, playerStats
      );
      
      // Calculate enhanced gameweek FDRs with odds data
      const gameweeks = this.calculateEnhancedGameweekFDRs(
        players, fixtures, bootstrap.teams, oddsData
      );
      
      // Run Monte Carlo simulations for squad analysis
      const simulationSummary = await this.runSquadSimulation(players, fixtures, oddsData);
      
      // Enhanced Phase 2: Generate ML predictions and competitive intelligence
      const [mlPredictions, competitiveIntelligence] = await Promise.all([
        this.mlPredictionEngine.predictPlayers(players, 5).catch(e => {
          console.warn('ML prediction engine unavailable:', e.message);
          return [];
        }),
        this.competitiveIntelligenceEngine.generateIntelligenceReport(players, 5).catch(e => {
          console.warn('Competitive intelligence unavailable:', e.message);
          return null;
        })
      ]);
      
      // Merge ML predictions with players data
      const playersWithML = this.mergeMLPredictions(players, mlPredictions);
      
      // Generate enhanced chip recommendations with confidence intervals and ML insights
      const recommendations = await this.generateEnhancedRecommendations(
        playersWithML, gameweeks, simulationSummary
      );
      
      // Create budget analysis
      const budget = await this.createBudgetAnalysis(
        userSquad, bootstrap.elements, bootstrap.teams, freeTransfers, nextDeadline
      );
      
      const totalValue = Math.round(userSquad.entry_history.value / 10 * 10) / 10;
      const totalPoints = userSquad.entry_history.total_points;
      
      // Determine data source and confidence (Phase 2 Enhanced)
      let expectedPointsSource: 'fdr' | 'odds' | 'advanced-stats' | 'simulation' = 'fdr';
      if (mlPredictions.length > 0 && oddsData.length > 0) {
        expectedPointsSource = 'simulation'; // ML + odds + simulation combined
      } else if (oddsData.length > 0) {
        expectedPointsSource = 'odds';
      } else if (playerStats.length > 0) {
        expectedPointsSource = 'advanced-stats';
      }
      
      const confidenceLevel = this.calculateOverallConfidence(simulationSummary, oddsData.length, playerStats.length);
      
      return {
        teamId,
        teamName: userInfo.name || `${userInfo.player_first_name} ${userInfo.player_last_name}`.trim() || 'Unknown Team',
        players: playersWithML,
        totalValue,
        totalPoints,
        gameweeks,
        recommendations,
        budget,
        lastUpdated: new Date().toISOString(),
        
        // Enhanced Phase 1 data
        simulationSummary,
        expectedPointsSource,
        confidenceLevel,
        dataFreshness: {
          odds: oddsData.length > 0 ? new Date().toISOString() : 'unavailable',
          stats: playerStats.length > 0 ? new Date().toISOString() : 'unavailable',
          fpl: new Date().toISOString(),
          ml: mlPredictions.length > 0 ? new Date().toISOString() : 'unavailable',
          competitiveIntelligence: competitiveIntelligence ? new Date().toISOString() : 'unavailable'
        },
        
        // Enhanced Phase 2: Machine Learning and Competitive Intelligence
        mlPredictions: mlPredictions.length > 0 ? mlPredictions : undefined,
        competitiveIntelligence: competitiveIntelligence?.competitiveIntelligence || undefined,
        strategicRecommendations: competitiveIntelligence?.recommendedStrategies || undefined
      };
    } catch (error) {
      console.error('Analysis Engine Error:', error);
      throw new Error(`Failed to analyze team: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async processPlayersEnhanced(
    userSquad: FPLUserSquad, 
    allPlayers: FPLPlayer[], 
    teams: FPLTeam[],
    playerStats: PlayerAdvanced[]
  ): Promise<ProcessedPlayer[]> {
    return Promise.all(userSquad.picks.map(async pick => {
      const player = allPlayers.find(p => p.id === pick.element);
      const team = teams.find(t => t.id === player?.team);
      const stats = playerStats.find(s => s.playerId === pick.element);
      
      if (!player || !team) {
        throw new Error(`Player or team data missing for element ${pick.element}`);
      }
      
      // Calculate enhanced expected points
      const expectedPoints = await this.calculateEnhancedExpectedPoints(player, stats);
      
      // Calculate historical volatility
      const volatility = stats?.volatility || this.calculateHistoricalVolatility(player);
      
      return {
        id: player.id,
        name: player.web_name,
        position: POSITION_MAP[player.element_type],
        team: team.short_name,
        price: player.now_cost / 10,
        points: player.total_points,
        teamId: player.team,
        sellPrice: (pick.selling_price || player.now_cost) / 10,
        purchasePrice: (pick.purchase_price || player.now_cost) / 10,
        isBench: pick.position > 11,
        isStarter: pick.position <= 11,
        expectedPoints,
        
        // Enhanced Phase 1 data
        volatility,
        advancedStats: stats
      };
    }));
  }

  /**
   * Merge ML predictions with player data (Phase 2 Enhancement)
   */
  private mergeMLPredictions(players: ProcessedPlayer[], mlPredictions: MLPrediction[]): ProcessedPlayer[] {
    return players.map(player => {
      const mlPrediction = mlPredictions.find(pred => pred.playerId === player.id);
      
      return {
        ...player,
        mlPrediction
      };
    });
  }

  private async createBudgetAnalysis(
    userSquad: FPLUserSquad,
    allPlayers: FPLPlayer[],
    teams: FPLTeam[],
    freeTransfers: number,
    nextDeadline: string
  ): Promise<BudgetAnalysis> {
    const bank = userSquad.entry_history.bank / 10; // Convert from tenths to millions
    const teamValue = userSquad.entry_history.value / 10; // Convert from tenths to millions
    
    // Find current squad compositions
    const currentSquad = userSquad.picks.map(pick => {
      const player = allPlayers.find(p => p.id === pick.element);
      return {
        ...pick,
        player,
        sellPrice: (pick.selling_price || player?.now_cost || 0) / 10
      };
    });

    const benchPlayers = currentSquad.filter(p => p.position > 11);
    const starterPlayers = currentSquad.filter(p => p.position <= 11);
    
    // Calculate maximum affordable player price
    const maxSellValue = Math.max(...currentSquad.map(p => p.sellPrice));
    const maxPlayerPrice = bank + maxSellValue;
    
    // Find affordable upgrades for bench
    const benchUpgrades: TransferTarget[] = [];
    for (const benchPlayer of benchPlayers.slice(0, 3)) { // Top 3 bench improvements
      if (!benchPlayer.player) continue;
      
      const position = POSITION_MAP[benchPlayer.player.element_type];
      const budget = bank + benchPlayer.sellPrice;
      
      const upgrade = allPlayers
        .filter(p => POSITION_MAP[p.element_type] === position)
        .filter(p => p.now_cost / 10 <= budget)
        .filter(p => p.id !== benchPlayer.element)
        .sort((a, b) => b.total_points - a.total_points)[0];
        
      if (upgrade) {
        benchUpgrades.push({
          playerId: upgrade.id,
          name: upgrade.web_name,
          position,
          teamId: upgrade.team,
          teamName: teams.find(t => t.id === upgrade.team)?.short_name || 'Unknown',
          price: upgrade.now_cost / 10,
          expectedPoints: upgrade.total_points / Math.max(1, 10) * 5,
          reason: `Upgrade from ${benchPlayer.player.web_name} - better fixtures ahead`
        });
      }
    }
    
    // Find affordable upgrades for starters
    const starterUpgrades: TransferTarget[] = [];
    for (const starterPlayer of starterPlayers.slice(0, 3)) { // Top 3 starter improvements
      if (!starterPlayer.player) continue;
      
      const position = POSITION_MAP[starterPlayer.player.element_type];
      const budget = bank + starterPlayer.sellPrice;
      
      const upgrade = allPlayers
        .filter(p => POSITION_MAP[p.element_type] === position)
        .filter(p => p.now_cost / 10 <= budget)
        .filter(p => p.id !== starterPlayer.element)
        .filter(p => p.total_points > starterPlayer.player!.total_points)
        .sort((a, b) => b.total_points - a.total_points)[0];
        
      if (upgrade) {
        starterUpgrades.push({
          playerId: upgrade.id,
          name: upgrade.web_name,
          position,
          teamId: upgrade.team,
          teamName: teams.find(t => t.id === upgrade.team)?.short_name || 'Unknown',
          price: upgrade.now_cost / 10,
          expectedPoints: upgrade.total_points / Math.max(1, 10) * 5,
          reason: `Significant upgrade from ${starterPlayer.player.web_name} - premium option`
        });
      }
    }

    return {
      bank,
      teamValue,
      freeTransfers,
      nextDeadline,
      canAfford: {
        maxPlayerPrice,
        benchUpgrades: benchUpgrades.slice(0, 5),
        starterUpgrades: starterUpgrades.slice(0, 5)
      }
    };
  }

  private calculateGameweekFDRs(players: ProcessedPlayer[], fixtures: FPLFixture[], teams: FPLTeam[]): GameweekFDR[] {
    const gameweekMap = new Map<number, GameweekFDR>();
    
    // Initialize gameweeks
    const currentGW = Math.min(...fixtures.map(f => f.event)) || 1;
    for (let gw = currentGW; gw <= currentGW + 9; gw++) {
      gameweekMap.set(gw, {
        gameweek: gw,
        totalFDR: 0,
        averageFDR: 0,
        difficulty: 'medium' as const,
        fixtures: []
      });
    }

    // Calculate FDR for each player in each gameweek
    players.forEach(player => {
      const playerTeamId = player.teamId;
      const playerFixtures = fixtures.filter(f => 
        f.team_h === playerTeamId || f.team_a === playerTeamId
      );

      playerFixtures.forEach(fixture => {
        const gameweek = gameweekMap.get(fixture.event);
        if (!gameweek) return;

        const isHome = fixture.team_h === playerTeamId;
        const opponentId = isHome ? fixture.team_a : fixture.team_h;
        const opponent = teams.find(t => t.id === opponentId);
        const fdr = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;

        if (opponent) {
          gameweek.fixtures.push({
            playerId: player.id,
            playerName: player.name,
            opponent: opponent.short_name,
            isHome,
            fdr
          });
          
          gameweek.totalFDR += fdr;
        }
      });
    });

    // Calculate averages and difficulty ratings
    const gameweeks = Array.from(gameweekMap.values()).map(gw => {
      const fixtureCount = gw.fixtures.length;
      gw.averageFDR = fixtureCount > 0 ? gw.totalFDR / fixtureCount : 3;
      
      // Classify difficulty
      if (gw.averageFDR <= 2.2) {
        gw.difficulty = 'easy';
      } else if (gw.averageFDR >= 3.2) {
        gw.difficulty = 'hard';
      } else {
        gw.difficulty = 'medium';
      }
      
      return gw;
    });

    return gameweeks.sort((a, b) => a.gameweek - b.gameweek);
  }

  private generateRecommendations(players: ProcessedPlayer[], gameweeks: GameweekFDR[]): ChipRecommendation[] {
    const recommendations: ChipRecommendation[] = [];
    
    // Bench Boost recommendation
    const benchBoostGW = this.findOptimalBenchBoost(gameweeks);
    if (benchBoostGW) {
      recommendations.push(benchBoostGW);
    }
    
    // Triple Captain recommendation  
    const tripleCaptainGW = this.findOptimalTripleCaptain(players, gameweeks);
    if (tripleCaptainGW) {
      recommendations.push(tripleCaptainGW);
    }
    
    // Wildcard recommendation
    const wildcardGW = this.findOptimalWildcard(gameweeks);
    if (wildcardGW) {
      recommendations.push(wildcardGW);
    }
    
    // Free Hit recommendation
    const freeHitGW = this.findOptimalFreeHit(gameweeks);
    if (freeHitGW) {
      recommendations.push(freeHitGW);
    }
    
    return recommendations.sort((a, b) => {
      // Sort by priority first, then by gameweek
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      return priorityDiff !== 0 ? priorityDiff : a.gameweek - b.gameweek;
    });
  }

  // Public for testing purposes due to difficulties with mocking in the test environment.
  public findOptimalBenchBoost(gameweeks: GameweekFDR[]): ChipRecommendation | null {
    if (!gameweeks || gameweeks.length === 0) {
      return null;
    }
    // Find gameweek with lowest total FDR (best fixtures for full squad)
    const bestGW = gameweeks.reduce((best, current) => 
      current.totalFDR < best.totalFDR ? current : best
    );
    
    if (bestGW.averageFDR > 2.5) return null; // Don't recommend if fixtures aren't good enough
    
    const confidence = Math.max(60, Math.min(95, Math.round((3.5 - bestGW.averageFDR) * 30)));
    
    return {
      chipType: 'bench-boost',
      gameweek: bestGW.gameweek,
      priority: bestGW.averageFDR <= 2.0 ? 'high' : 'medium',
      title: 'Optimal Bench Boost Window',
      description: `Your entire squad faces favorable fixtures with an average FDR of ${bestGW.averageFDR.toFixed(1)}, maximizing your bench potential.`,
      reasoning: [
        `Average FDR of ${bestGW.averageFDR.toFixed(1)} across all 15 players`,
        `Total squad difficulty rating: ${bestGW.totalFDR}`,
        bestGW.fixtures.length === 15 ? 'All players have fixtures this gameweek' : 'Most players have favorable fixtures',
        'Strong opportunity for bench players to contribute points'
      ],
      confidence
    };
  }

  private findOptimalTripleCaptain(players: ProcessedPlayer[], gameweeks: GameweekFDR[]): ChipRecommendation | null {
    // Find premium players (high points) with best individual fixtures
    const premiumPlayers = players
      .filter(p => p.points > 100 && (p.position === 'FWD' || p.position === 'MID'))
      .sort((a, b) => b.points - a.points)
      .slice(0, 3); // Top 3 premium players
    
    if (premiumPlayers.length === 0) return null;
    
    type BestOpportunity = { player: ProcessedPlayer; gameweek: number; fdr: number; opponent: string; isHome: boolean };
    let bestOpportunity: BestOpportunity | null = null;
    
    premiumPlayers.forEach(player => {
      gameweeks.forEach(gw => {
        const playerFixture = gw.fixtures.find(f => f.playerId === player.id);
        if (playerFixture && playerFixture.fdr <= 2) {
          if (!bestOpportunity || playerFixture.fdr < bestOpportunity.fdr ||
              (playerFixture.fdr === bestOpportunity.fdr && player.points > bestOpportunity.player.points)) {
            bestOpportunity = {
              player,
              gameweek: gw.gameweek,
              fdr: playerFixture.fdr,
              opponent: playerFixture.opponent,
              isHome: playerFixture.isHome
            };
          }
        }
      });
    });
    
    if (!bestOpportunity) return null;
    const bo = bestOpportunity as BestOpportunity;
    const confidence = Math.max(70, Math.min(95, Math.round((3 - bo.fdr) * 25 + (bo.player.points / 10))));
    return {
      chipType: 'triple-captain',
      gameweek: bo.gameweek,
      priority: bo.fdr === 1 ? 'high' : 'medium',
      title: 'Premium Captain Opportunity',
      description: `${bo.player.name} faces ${bo.opponent} ${bo.isHome ? 'at home' : 'away'} - an excellent captaincy opportunity.`,
      reasoning: [
        `${bo.player.name} has ${bo.player.points} points this season`,
        `Fixture difficulty rating of only ${bo.fdr} vs ${bo.opponent}`,
        bo.isHome ? 'Playing at home provides additional advantage' : 'Away fixture but very favorable opponent',
        `${bo.player.position} is in excellent form`
      ],
      confidence
    };
  }

  // Public for testing purposes due to difficulties with mocking in the test environment.
  public findOptimalWildcard(gameweeks: GameweekFDR[]): ChipRecommendation | null {
    if (!gameweeks || gameweeks.length === 0) {
      return null;
    }
    // Look for difficult periods followed by easier fixtures
    const sortedByDifficulty = [...gameweeks].sort((a, b) => b.averageFDR - a.averageFDR);
    const hardestGW = sortedByDifficulty[0];
    
    if (hardestGW.averageFDR < 2.8) return null; // Not difficult enough to warrant wildcard
    
    // Find if there's a good period after the difficult one
    const futureEasyGW = gameweeks.find(gw => gw.gameweek > hardestGW.gameweek && gw.averageFDR <= 2.2);
    
    const wildcardGW = Math.max(1, hardestGW.gameweek - 1); // Recommend before the difficult period
    const confidence = futureEasyGW ? Math.min(85, 60 + (hardestGW.averageFDR - 2.5) * 20) : 65;
    
    return {
      chipType: 'wildcard',
      gameweek: wildcardGW,
      priority: hardestGW.averageFDR >= 3.2 ? 'high' : 'medium',
      title: 'Strategic Wildcard Window',
      description: `Your current squad faces difficult fixtures around GW${hardestGW.gameweek}. Consider wildcarding before this tough period.`,
      reasoning: [
        `Difficult period starting GW${hardestGW.gameweek} with average FDR of ${hardestGW.averageFDR.toFixed(1)}`,
        futureEasyGW ? `Easier fixtures available from GW${futureEasyGW.gameweek} onwards` : 'Opportunity to pivot to better fixture runs',
        'Wildcard before tough period allows optimal team restructuring',
        gameweeks[0]?.gameweek <= 19 ? 'Must use one chip before GW19 deadline' : 'Strategic timing for maximum impact'
      ],
      confidence
    };
  }

  // Enhanced Phase 1 Methods

  private async calculateEnhancedExpectedPoints(player: FPLPlayer, stats?: PlayerAdvanced): Promise<number> {
    // Use advanced stats if available, otherwise fallback to FPL data
    if (stats && stats.fixtureAdjustedXG > 0) {
      // Points from xG (goals) and xA (assists), adjusted for position
      const goalPoints = stats.fixtureAdjustedXG * this.getGoalPoints(POSITION_MAP[player.element_type]);
      const assistPoints = stats.fixtureAdjustedXA * 3; // 3 points per assist
      const minutesPoints = (stats.xMins / 90) * 2; // 2 points for 60+ mins
      
      return Math.max(0, Math.round((goalPoints + assistPoints + minutesPoints) * 10) / 10);
    }

    // Fallback to existing FPL-based calculation
    const currentGW = 15; // Rough estimate
    const approxGamesPlayed = Math.max(1, currentGW - 1);
    const basePPG = player.total_points / approxGamesPlayed;
    
    return Math.max(0, Math.round(basePPG * 5 * 10) / 10); // 5 gameweeks
  }

  private getGoalPoints(position: 'GK' | 'DEF' | 'MID' | 'FWD'): number {
    switch (position) {
      case 'GK':
      case 'DEF': return 6;
      case 'MID': return 5;
      case 'FWD': return 4;
      default: return 4;
    }
  }

  private calculateHistoricalVolatility(player: FPLPlayer): number {
    // Mock volatility based on position and points (real implementation would use gameweek history)
    const pointsPerGame = player.total_points / Math.max(1, 15);
    const baseVolatility = {
      'GK': 2.0,
      'DEF': 2.5,
      'MID': 3.5,
      'FWD': 4.5
    };
    
    const position = POSITION_MAP[player.element_type];
    const positionVolatility = baseVolatility[position] || 3.0;
    
    // Higher scoring players tend to have higher volatility
    const scoreAdjustment = Math.min(2.0, pointsPerGame * 0.1);
    
    return Math.round((positionVolatility + scoreAdjustment) * 10) / 10;
  }

  private calculateEnhancedGameweekFDRs(
    players: ProcessedPlayer[], 
    fixtures: FPLFixture[], 
    teams: FPLTeam[],
    oddsData: MatchOdds[]
  ): GameweekFDR[] {
    const gameweekMap = new Map<number, GameweekFDR>();
    
    // Initialize gameweeks
    const currentGW = Math.min(...fixtures.map(f => f.event)) || 1;
    for (let gw = currentGW; gw <= currentGW + 9; gw++) {
      gameweekMap.set(gw, {
        gameweek: gw,
        totalFDR: 0,
        averageFDR: 0,
        difficulty: 'medium' as const,
        fixtures: []
      });
    }

    // Calculate FDR for each player in each gameweek
    players.forEach(player => {
      const playerTeamId = player.teamId;
      const playerFixtures = fixtures.filter(f => 
        f.team_h === playerTeamId || f.team_a === playerTeamId
      );

      playerFixtures.forEach(fixture => {
        const gameweek = gameweekMap.get(fixture.event);
        if (!gameweek) return;

        const isHome = fixture.team_h === playerTeamId;
        const opponentId = isHome ? fixture.team_a : fixture.team_h;
        const opponent = teams.find(t => t.id === opponentId);
        let fdr = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;

        // Enhance FDR with odds data if available
        const odds = oddsData.find(o => o.fixtureId === fixture.id);
        if (odds) {
          fdr = this.calculateOddsBasedFDR(odds, isHome);
        }

        if (opponent) {
          gameweek.fixtures.push({
            playerId: player.id,
            playerName: player.name,
            opponent: opponent.short_name,
            isHome,
            fdr
          });
          
          gameweek.totalFDR += fdr;
        }
      });
    });

    // Calculate averages and difficulty ratings
    const gameweeks = Array.from(gameweekMap.values()).map(gw => {
      const fixtureCount = gw.fixtures.length;
      gw.averageFDR = fixtureCount > 0 ? gw.totalFDR / fixtureCount : 3;
      
      // Classify difficulty
      if (gw.averageFDR <= 2.2) {
        gw.difficulty = 'easy';
      } else if (gw.averageFDR >= 3.2) {
        gw.difficulty = 'hard';
      } else {
        gw.difficulty = 'medium';
      }
      
      return gw;
    });

    return gameweeks.sort((a, b) => a.gameweek - b.gameweek);
  }

  private calculateOddsBasedFDR(odds: MatchOdds, isHome: boolean): number {
    // Convert odds to win probability
    const homeWinProb = 1 / odds.homeWin;
    const drawProb = 1 / odds.draw;
    const awayWinProb = 1 / odds.awayWin;
    
    // Normalize (remove bookmaker margin)
    const total = homeWinProb + drawProb + awayWinProb;
    const normalizedHomeWin = homeWinProb / total;
    const normalizedAwayWin = awayWinProb / total;
    
    // Convert to FPL-style difficulty rating (1-5 scale)
    const winProb = isHome ? normalizedHomeWin : normalizedAwayWin;
    
    // Higher win probability = lower difficulty
    if (winProb > 0.6) return 1.5; // Very easy
    if (winProb > 0.45) return 2.5; // Easy
    if (winProb > 0.35) return 3.0; // Medium
    if (winProb > 0.25) return 4.0; // Hard
    return 4.5; // Very hard
  }

  private async runSquadSimulation(
    players: ProcessedPlayer[], 
    fixtures: FPLFixture[], 
    oddsData: MatchOdds[]
  ): Promise<SimulationSummary> {
    // Prepare fixtures for simulation
    const gameweekFixtures: GameweekFixture[] = [];
    
    fixtures.forEach(fixture => {
      players.forEach(player => {
        if (fixture.team_h === player.teamId || fixture.team_a === player.teamId) {
          const isHome = fixture.team_h === player.teamId;
          const odds = oddsData.find(o => o.fixtureId === fixture.id);
          const fdr = isHome ? fixture.team_h_difficulty : fixture.team_a_difficulty;
          
          gameweekFixtures.push({
            gameweek: fixture.event,
            playerId: player.id,
            hasFixture: true,
            odds,
            fdr,
            isHome
          });
        }
      });
    });

    const config: SimulationConfig = {
      runs: 1000, // Run 1000 simulations for good statistical power
      gameweeksToSimulate: Array.from(new Set(fixtures.map(f => f.event))).slice(0, 6), // Next 6 GWs
      strategy: 'current-squad',
      targetThreshold: players.reduce((sum, p) => sum + (p.expectedPoints || 0), 0), // Target = sum of expected points
      useOdds: oddsData.length > 0,
      useAdvancedStats: players.some(p => p.advancedStats)
    };

    return await this.simulationEngine.simulateSquad(players, gameweekFixtures, config);
  }

  private async generateEnhancedRecommendations(
    players: ProcessedPlayer[], 
    gameweeks: GameweekFDR[], 
    simulationSummary: SimulationSummary
  ): Promise<ChipRecommendation[]> {
    const recommendations: ChipRecommendation[] = [];
    
    // Enhanced Bench Boost with simulation data
    const benchBoostGW = await this.findOptimalEnhancedBenchBoost(players, gameweeks, simulationSummary);
    if (benchBoostGW) recommendations.push(benchBoostGW);
    
    // Enhanced Triple Captain with volatility consideration
    const tripleCaptainGW = await this.findOptimalEnhancedTripleCaptain(players, gameweeks, simulationSummary);
    if (tripleCaptainGW) recommendations.push(tripleCaptainGW);
    
    // Other chips with enhanced analysis
    const wildcardGW = this.findOptimalWildcard(gameweeks);
    if (wildcardGW) recommendations.push(wildcardGW);
    
    const freeHitGW = this.findOptimalFreeHit(gameweeks);
    if (freeHitGW) recommendations.push(freeHitGW);
    
    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      return priorityDiff !== 0 ? priorityDiff : a.gameweek - b.gameweek;
    });
  }

  private async findOptimalEnhancedBenchBoost(
    players: ProcessedPlayer[], 
    gameweeks: GameweekFDR[], 
    simulationSummary: SimulationSummary
  ): Promise<ChipRecommendation | null> {
    const bestGW = gameweeks.reduce((best, current) => 
      current.totalFDR < best.totalFDR ? current : best
    );
    
    if (bestGW.averageFDR > 2.5) return null;
    
    // Enhanced confidence using simulation variance
    const baseConfidence = Math.max(60, Math.min(95, Math.round((3.5 - bestGW.averageFDR) * 30)));
    const varianceAdjustment = Math.max(-20, Math.min(10, (10 - simulationSummary.variance)));
    const confidence = Math.max(50, Math.min(100, baseConfidence + varianceAdjustment));
    
    // Calculate expected points range from simulation
    const benchPlayers = players.filter(p => p.isBench);
    const benchExpectedPoints = benchPlayers.reduce((sum, p) => sum + (p.expectedPoints || 0), 0);
    const expectedRange: [number, number] = [
      Math.round(benchExpectedPoints * 0.8),
      Math.round(benchExpectedPoints * 1.3)
    ];
    
    return {
      chipType: 'bench-boost',
      gameweek: bestGW.gameweek,
      priority: bestGW.averageFDR <= 2.0 ? 'high' : 'medium',
      title: 'Optimal Bench Boost Window (Enhanced)',
      description: `Squad simulation shows ${simulationSummary.successRate}% success rate. Average FDR: ${bestGW.averageFDR.toFixed(1)}`,
      reasoning: [
        `Monte Carlo analysis: ${simulationSummary.runs} simulations run`,
        `Expected bench points: ${expectedRange[0]}-${expectedRange[1]}`,
        `Success probability: ${simulationSummary.successRate}%`,
        `Squad variance: ${simulationSummary.variance.toFixed(1)} (${simulationSummary.recommendationStrength} recommendation)`
      ],
      confidence,
      expectedPointsRange: expectedRange,
      successProbability: simulationSummary.successRate,
      alternativeWindows: gameweeks.filter(gw => gw.averageFDR <= 2.8 && gw.gameweek !== bestGW.gameweek).map(gw => gw.gameweek).slice(0, 2)
    };
  }

  private async findOptimalEnhancedTripleCaptain(
    players: ProcessedPlayer[], 
    gameweeks: GameweekFDR[], 
    simulationSummary: SimulationSummary
  ): Promise<ChipRecommendation | null> {
    // Find premium players with high volatility (explosive potential)
    const premiumPlayers = players
      .filter(p => p.points > 100 && (p.position === 'FWD' || p.position === 'MID'))
      .filter(p => (p.volatility || 0) > 3.0) // High volatility for explosive hauls
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);
    
    if (premiumPlayers.length === 0) return null;
    
    type BestOpportunity = { player: ProcessedPlayer; gameweek: number; fdr: number; opponent: string; isHome: boolean };
    let bestOpportunity: BestOpportunity | null = null;
    
    premiumPlayers.forEach(player => {
      gameweeks.forEach(gw => {
        const playerFixture = gw.fixtures.find(f => f.playerId === player.id);
        if (playerFixture && playerFixture.fdr <= 2.5) {
          if (!bestOpportunity || playerFixture.fdr < bestOpportunity.fdr ||
              (playerFixture.fdr === bestOpportunity.fdr && (player.volatility || 0) > (bestOpportunity.player.volatility || 0))) {
            bestOpportunity = {
              player,
              gameweek: gw.gameweek,
              fdr: playerFixture.fdr,
              opponent: playerFixture.opponent,
              isHome: playerFixture.isHome
            };
          }
        }
      });
    });
    
    if (!bestOpportunity) return null;
    const bo = bestOpportunity as BestOpportunity;
    
    const baseConfidence = Math.max(70, Math.min(95, Math.round((3 - bo.fdr) * 25 + (bo.player.points / 10))));
    const volatilityBonus = Math.min(10, (bo.player.volatility || 0) * 2); // Reward high volatility
    const confidence = Math.min(100, baseConfidence + volatilityBonus);
    
    const expectedRange: [number, number] = [
      Math.round((bo.player.expectedPoints || 0) * 2.5), // Conservative TC return
      Math.round((bo.player.expectedPoints || 0) * 4.5)  // Explosive TC return
    ];
    
    return {
      chipType: 'triple-captain',
      gameweek: bo.gameweek,
      priority: bo.fdr <= 1.5 && (bo.player.volatility || 0) > 4.0 ? 'high' : 'medium',
      title: 'Premium Captain Opportunity (Enhanced)',
      description: `${bo.player.name}: ${bo.player.volatility?.toFixed(1)} volatility, ${(bo.player.expectedPoints || 0).toFixed(1)} xP vs ${bo.opponent}`,
      reasoning: [
        `High volatility (${bo.player.volatility?.toFixed(1)}) suggests explosive potential`,
        `Favorable fixture (FDR: ${bo.fdr}) vs ${bo.opponent}`,
        `Season total: ${bo.player.points} points`,
        `Advanced stats: ${bo.player.advancedStats ? 'Available' : 'Using FPL data'}`
      ],
      confidence,
      expectedPointsRange: expectedRange,
      successProbability: Math.round(confidence * 0.8), // Success rate slightly lower than confidence
      alternativeWindows: gameweeks.filter(gw => 
        gw.fixtures.some(f => premiumPlayers.some(p => p.id === f.playerId && f.fdr <= 2.8))
      ).map(gw => gw.gameweek).slice(0, 2)
    };
  }

  private calculateOverallConfidence(
    simulationSummary: SimulationSummary, 
    oddsAvailable: number, 
    statsAvailable: number
  ): number {
    let baseConfidence = 60; // Base confidence without enhanced data
    
    // Boost confidence based on data availability
    if (oddsAvailable > 0) baseConfidence += 15;
    if (statsAvailable > 0) baseConfidence += 10;
    
    // Boost confidence based on simulation consistency
    if (simulationSummary.recommendationStrength === 'strong') baseConfidence += 15;
    else if (simulationSummary.recommendationStrength === 'moderate') baseConfidence += 5;
    
    // Adjust based on simulation variance (lower variance = higher confidence)
    const varianceAdjustment = Math.max(-10, Math.min(10, (8 - simulationSummary.variance)));
    
    return Math.max(50, Math.min(100, Math.round(baseConfidence + varianceAdjustment)));
  }

  private findOptimalFreeHit(gameweeks: GameweekFDR[]): ChipRecommendation | null {
    // Look for gameweeks with few fixtures (blank gameweeks) or differential opportunities
    const lightFixtureGWs = gameweeks.filter(gw => gw.fixtures.length < 10); // Less than 10 player fixtures
    
    if (lightFixtureGWs.length === 0) {
      // No blank gameweeks, suggest holding
      const midSeasonGW = gameweeks[Math.floor(gameweeks.length / 2)];
      return {
        chipType: 'free-hit',
        gameweek: midSeasonGW?.gameweek || 15,
        priority: 'low',
        title: 'Consider Holding Free Hit',
        description: 'No obvious blank gameweeks detected. Consider saving Free Hit for a better opportunity later in the season.',
        reasoning: [
          'No significant blank gameweeks in the analyzed period',
          'Current squad has reasonable fixture coverage',
          'Free Hit is most valuable during blank/double gameweeks',
          'Can reassess when fixtures become clearer'
        ],
        confidence: 60
      };
    }
    
    const bestBlankGW = lightFixtureGWs[0];
    const confidence = Math.max(50, Math.min(75, 90 - bestBlankGW.fixtures.length * 5));
    
    return {
      chipType: 'free-hit',
      gameweek: bestBlankGW.gameweek,
      priority: bestBlankGW.fixtures.length < 8 ? 'medium' : 'low',
      title: 'Potential Free Hit Opportunity',
      description: `Limited fixtures in GW${bestBlankGW.gameweek} with only ${bestBlankGW.fixtures.length} of your players having games. Consider Free Hit strategy.`,
      reasoning: [
        `Only ${bestBlankGW.fixtures.length} players have fixtures this gameweek`,
        'Free Hit allows access to players from well-fixtured teams',
        'Opportunity for differential captain choices',
        bestBlankGW.fixtures.length < 8 ? 'Significant blank gameweek' : 'Moderate fixture reduction'
      ],
      confidence
    };
  }
}

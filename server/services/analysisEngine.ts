import {
  type ProcessedPlayer,
  type GameweekFDR,
  type ChipRecommendation,
  type AnalysisResult,
  type FPLPlayer,
  type FPLTeam,
  type FPLFixture,
  type FPLUserSquad,
  type ChipType
} from "@shared/schema";
import { FPLApiService } from './fplApi';

const POSITION_MAP: Record<number, 'GK' | 'DEF' | 'MID' | 'FWD'> = {
  1: 'GK',
  2: 'DEF', 
  3: 'MID',
  4: 'FWD'
};

export class AnalysisEngine {
  private fplApi: FPLApiService;

  constructor() {
    this.fplApi = FPLApiService.getInstance();
  }

  async analyzeTeam(teamId: string): Promise<AnalysisResult> {
    try {
      const managerId = parseInt(teamId);
      
      // Fetch all required data in parallel
      const [bootstrap, userSquad, userInfo, fixtures] = await Promise.all([
        this.fplApi.getBootstrapData(),
        this.fplApi.getUserSquad(managerId),
        this.fplApi.getUserInfo(managerId),
        this.fplApi.getUpcomingFixtures(15)
      ]);

      // Process players
      const players = this.processPlayers(userSquad, bootstrap.elements, bootstrap.teams);
      
      // Calculate gameweek FDRs
      const gameweeks = this.calculateGameweekFDRs(players, fixtures, bootstrap.teams);
      
      // Generate chip recommendations
      const recommendations = this.generateRecommendations(players, gameweeks);
      
      const totalValue = players.reduce((sum, player) => sum + player.price, 0);
      const totalPoints = userSquad.entry_history.total_points; // Use team's actual total points
      
      return {
        teamId,
        teamName: userInfo.name || `${userInfo.player_first_name} ${userInfo.player_last_name}`.trim() || 'Unknown Team',
        players,
        totalValue: Math.round(totalValue * 10) / 10, // Round to 1 decimal
        totalPoints,
        gameweeks,
        recommendations,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Analysis Engine Error:', error);
      throw new Error(`Failed to analyze team: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private processPlayers(userSquad: FPLUserSquad, allPlayers: FPLPlayer[], teams: FPLTeam[]): ProcessedPlayer[] {
    return userSquad.picks.map(pick => {
      const player = allPlayers.find(p => p.id === pick.element);
      const team = teams.find(t => t.id === player?.team);
      
      if (!player || !team) {
        throw new Error(`Player or team data missing for element ${pick.element}`);
      }
      
      return {
        id: player.id,
        name: player.web_name,
        position: POSITION_MAP[player.element_type],
        team: team.short_name,
        price: player.now_cost / 10, // Convert from tenths to actual millions
        points: player.total_points,
        teamId: player.team
      };
    });
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

  private findOptimalBenchBoost(gameweeks: GameweekFDR[]): ChipRecommendation | null {
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
    
    const confidence = Math.max(70, Math.min(95, Math.round((3 - bestOpportunity.fdr) * 25 + (bestOpportunity.player.points / 10))));
    
    return {
      chipType: 'triple-captain',
      gameweek: bestOpportunity.gameweek,
      priority: bestOpportunity.fdr === 1 ? 'high' : 'medium',
      title: 'Premium Captain Opportunity',
      description: `${bestOpportunity.player.name} faces ${bestOpportunity.opponent} ${bestOpportunity.isHome ? 'at home' : 'away'} - an excellent captaincy opportunity.`,
      reasoning: [
        `${bestOpportunity.player.name} has ${bestOpportunity.player.points} points this season`,
        `Fixture difficulty rating of only ${bestOpportunity.fdr} vs ${bestOpportunity.opponent}`,
        bestOpportunity.isHome ? 'Playing at home provides additional advantage' : 'Away fixture but very favorable opponent',
        `${bestOpportunity.player.position} is in excellent form`
      ],
      confidence
    };
  }

  private findOptimalWildcard(gameweeks: GameweekFDR[]): ChipRecommendation | null {
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
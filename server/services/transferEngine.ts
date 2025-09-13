import {
  type FPLPlayer,
  type FPLTeam,
  type ProcessedPlayer,
  type TransferTarget,
  type TransferMove,
  type TransferPlan,
  type ChipType,
  type GameweekFDR
} from "@shared/schema";
import { FPLApiService } from "./fplApi";

interface SquadConstraints {
  maxPlayersPerTeam: number;
  formation: { GK: number; DEF: number; MID: number; FWD: number };
  maxBudget: number;
  freeTransfers: number;
}

interface TransferContext {
  targetGameweek: number;
  chipType?: ChipType;
  maxHits: number;
  includeRiskyMoves: boolean;
  gameweeks: GameweekFDR[];
}

export class TransferEngine {
  private fplApi: FPLApiService;

  constructor() {
    this.fplApi = FPLApiService.getInstance();
  }

  async generateTransferPlans(
    currentSquad: ProcessedPlayer[],
    budget: number,
    freeTransfers: number,
    context: TransferContext
  ): Promise<TransferPlan[]> {
    try {
      console.log('Generating transfer plans for budget:', budget, 'FT:', freeTransfers);
      
      const plans: TransferPlan[] = [];
      const constraints = this.buildConstraints(currentSquad, budget, freeTransfers);
      
      // Get all available players with expected points
      const allPlayers = await this.fplApi.getAllPlayersWithExpectedPoints(5);
      const candidatePool = this.buildCandidatePool(allPlayers, currentSquad, constraints);
      
      // Generate different types of plans
      const conservativePlan = await this.generateConservativePlan(
        currentSquad, candidatePool, constraints, context
      );
      
      const aggressivePlan = await this.generateAggressivePlan(
        currentSquad, candidatePool, constraints, context
      );
      
      const chipOptimizedPlan = context.chipType
        ? await this.generateChipOptimizedPlan(
            currentSquad, candidatePool, constraints, context
          )
        : null;

      if (conservativePlan) plans.push(conservativePlan);
      if (aggressivePlan) plans.push(aggressivePlan);
      if (chipOptimizedPlan) plans.push(chipOptimizedPlan);

      // Sort plans by projected gain vs cost ratio
      return plans
        .filter(plan => plan.feasible)
        .sort((a, b) => {
          const aRatio = a.projectedGain / Math.max(1, a.totalCost + 1);
          const bRatio = b.projectedGain / Math.max(1, b.totalCost + 1);
          return bRatio - aRatio;
        })
        .slice(0, 3); // Return top 3 plans
    } catch (error) {
      console.error('Error generating transfer plans:', error);
      return [];
    }
  }

  private buildConstraints(
    currentSquad: ProcessedPlayer[],
    budget: number,
    freeTransfers: number
  ): SquadConstraints {
    const positionCounts = {
      GK: currentSquad.filter(p => p.position === 'GK').length,
      DEF: currentSquad.filter(p => p.position === 'DEF').length,
      MID: currentSquad.filter(p => p.position === 'MID').length,
      FWD: currentSquad.filter(p => p.position === 'FWD').length
    };

    return {
      maxPlayersPerTeam: 3,
      formation: positionCounts,
      maxBudget: budget,
      freeTransfers
    };
  }

  private buildCandidatePool(
    allPlayers: Array<FPLPlayer & { expectedPoints: number }>,
    currentSquad: ProcessedPlayer[],
    constraints: SquadConstraints
  ): TransferTarget[] {
    const currentPlayerIds = new Set(currentSquad.map(p => p.id));
    
    return allPlayers
      .filter(player => !currentPlayerIds.has(player.id))
      .filter(player => player.now_cost / 10 <= constraints.maxBudget + 5) // Allow some flexibility
      .map(player => ({
        playerId: player.id,
        name: player.web_name,
        position: this.getPositionName(player.element_type),
        teamId: player.team,
        teamName: '', // Will be filled from team data
        price: player.now_cost / 10,
        expectedPoints: player.expectedPoints,
        reason: this.generateTransferReason(player, currentSquad)
      }))
      .sort((a, b) => b.expectedPoints - a.expectedPoints)
      .slice(0, 50); // Top 50 candidates per position
  }

  private generateConservativePlan(
    currentSquad: ProcessedPlayer[],
    candidates: TransferTarget[],
    constraints: SquadConstraints,
    context: TransferContext
  ): TransferPlan {
    const moves: TransferMove[] = [];
    const transfersToMake = Math.min(constraints.freeTransfers, 2);
    
    if (transfersToMake === 0) {
      return {
        gameweek: context.targetGameweek,
        moves: [],
        totalHits: 0,
        totalCost: 0,
        budgetAfter: constraints.maxBudget,
        projectedGain: 0,
        confidence: 95,
        notes: ['No free transfers available - hold transfers for next gameweek'],
        feasible: true
      };
    }

    // Find the worst performing players to replace
    const worstPlayers = currentSquad
      .filter(p => !p.isBench) // Focus on starting players
      .sort((a, b) => (a.points || 0) - (b.points || 0))
      .slice(0, transfersToMake);

    for (const playerOut of worstPlayers) {
      const replacement = this.findBestReplacement(
        playerOut, candidates, constraints, moves
      );
      
      if (replacement && this.isTransferFeasible(playerOut, replacement, constraints, moves)) {
        moves.push({
          outPlayerId: playerOut.id,
          outPlayerName: playerOut.name,
          inPlayerId: replacement.playerId,
          inPlayerName: replacement.name,
          cost: 0, // Free transfer
          netCost: replacement.price - (playerOut.sellPrice || playerOut.price),
          expectedGain: replacement.expectedPoints - (playerOut.expectedPoints || 0)
        });
      }
    }

    const totalNetCost = moves.reduce((sum, move) => sum + move.netCost, 0);
    const totalGain = moves.reduce((sum, move) => sum + move.expectedGain, 0);

    return {
      gameweek: context.targetGameweek,
      moves,
      totalHits: 0,
      totalCost: 0,
      budgetAfter: constraints.maxBudget - totalNetCost,
      projectedGain: totalGain,
      confidence: 85,
      notes: [
        `Using ${moves.length} free transfer${moves.length !== 1 ? 's' : ''}`,
        'Conservative approach focusing on proven performers',
        `Net spend: £${totalNetCost.toFixed(1)}m`
      ],
      feasible: totalNetCost <= constraints.maxBudget
    };
  }

  private generateAggressivePlan(
    currentSquad: ProcessedPlayer[],
    candidates: TransferTarget[],
    constraints: SquadConstraints,
    context: TransferContext
  ): TransferPlan {
    if (context.maxHits === 0) return this.generateConservativePlan(currentSquad, candidates, constraints, context);

    const moves: TransferMove[] = [];
    const maxTransfers = constraints.freeTransfers + context.maxHits;
    
    // Target highest expected point gains even if it requires hits
    const improvementTargets = currentSquad
      .sort((a, b) => (a.expectedPoints || 0) - (b.expectedPoints || 0))
      .slice(0, maxTransfers);

    let hitsUsed = 0;
    
    for (const playerOut of improvementTargets) {
      const replacement = this.findBestReplacement(
        playerOut, candidates, constraints, moves
      );
      
      if (replacement) {
        const expectedGain = replacement.expectedPoints - (playerOut.expectedPoints || 0);
        const isHit = moves.length >= constraints.freeTransfers;
        const hitCost = isHit ? 4 : 0;
        
        // Only take hit if expected gain exceeds cost threshold
        if (!isHit || (expectedGain > 6 && hitsUsed < context.maxHits)) {
          moves.push({
            outPlayerId: playerOut.id,
            outPlayerName: playerOut.name,
            inPlayerId: replacement.playerId,
            inPlayerName: replacement.name,
            cost: hitCost,
            netCost: replacement.price - (playerOut.sellPrice || playerOut.price),
            expectedGain
          });
          
          if (isHit) hitsUsed++;
        }
      }
    }

    const totalNetCost = moves.reduce((sum, move) => sum + move.netCost, 0);
    const totalGain = moves.reduce((sum, move) => sum + move.expectedGain, 0);
    const totalHitCost = moves.reduce((sum, move) => sum + move.cost, 0);

    return {
      gameweek: context.targetGameweek,
      moves,
      totalHits: hitsUsed,
      totalCost: totalHitCost,
      budgetAfter: constraints.maxBudget - totalNetCost,
      projectedGain: totalGain - totalHitCost,
      confidence: Math.max(50, 80 - hitsUsed * 15),
      notes: [
        `Aggressive strategy with ${hitsUsed} hit${hitsUsed !== 1 ? 's' : ''}`,
        'Higher risk but potentially higher reward',
        `Net points gain after hits: ${(totalGain - totalHitCost).toFixed(1)}`
      ],
      feasible: totalNetCost <= constraints.maxBudget && totalHitCost <= hitsUsed * 4
    };
  }

  private generateChipOptimizedPlan(
    currentSquad: ProcessedPlayer[],
    candidates: TransferTarget[],
    constraints: SquadConstraints,
    context: TransferContext
  ): TransferPlan {
    const moves: TransferMove[] = [];
    let strategy = '';
    
    switch (context.chipType) {
      case 'bench-boost':
        // Focus on upgrading bench players
        strategy = 'Bench Boost optimization - upgrading bench strength';
        const benchPlayers = currentSquad.filter(p => p.isBench);
        for (const benchPlayer of benchPlayers.slice(0, 2)) {
          const upgrade = this.findBestReplacement(benchPlayer, candidates, constraints, moves);
          if (upgrade) {
            moves.push({
              outPlayerId: benchPlayer.id,
              outPlayerName: benchPlayer.name,
              inPlayerId: upgrade.playerId,
              inPlayerName: upgrade.name,
              cost: moves.length >= constraints.freeTransfers ? 4 : 0,
              netCost: upgrade.price - (benchPlayer.sellPrice || benchPlayer.price),
              expectedGain: upgrade.expectedPoints - (benchPlayer.expectedPoints || 0)
            });
          }
        }
        break;
        
      case 'triple-captain':
        // Focus on getting the best captain option
        strategy = 'Triple Captain setup - targeting premium captain options';
        const currentPremiums = currentSquad.filter(p => (p.price || 0) > 10);
        if (currentPremiums.length < 2) {
          const premiumTarget = candidates
            .filter(c => c.price > 10)
            .sort((a, b) => b.expectedPoints - a.expectedPoints)[0];
          
          if (premiumTarget) {
            const worstStarter = currentSquad
              .filter(p => !p.isBench)
              .sort((a, b) => (a.expectedPoints || 0) - (b.expectedPoints || 0))[0];
              
            moves.push({
              outPlayerId: worstStarter.id,
              outPlayerName: worstStarter.name,
              inPlayerId: premiumTarget.playerId,
              inPlayerName: premiumTarget.name,
              cost: 0,
              netCost: premiumTarget.price - (worstStarter.sellPrice || worstStarter.price),
              expectedGain: premiumTarget.expectedPoints - (worstStarter.expectedPoints || 0)
            });
          }
        }
        break;
        
      case 'free-hit':
        strategy = 'Free Hit preparation - optimal team for single gameweek';
        // For Free Hit, focus on players with best single gameweek fixtures
        const gameweekFixtures = context.gameweeks.find(gw => gw.gameweek === context.targetGameweek);
        if (gameweekFixtures) {
          // This would require more complex logic to build optimal Free Hit team
          moves.push(); // Placeholder - would implement Free Hit logic
        }
        break;
    }

    const totalNetCost = moves.reduce((sum, move) => sum + move.netCost, 0);
    const totalGain = moves.reduce((sum, move) => sum + move.expectedGain, 0);
    const totalHitCost = moves.reduce((sum, move) => sum + move.cost, 0);

    return {
      gameweek: context.targetGameweek,
      chipContext: context.chipType,
      moves,
      totalHits: moves.filter(m => m.cost > 0).length,
      totalCost: totalHitCost,
      budgetAfter: constraints.maxBudget - totalNetCost,
      projectedGain: totalGain - totalHitCost,
      confidence: 75,
      notes: [
        strategy,
        `Optimized for ${context.chipType} chip usage`,
        `Expected chip boost: +${Math.floor(totalGain * 0.3)} points`
      ],
      feasible: totalNetCost <= constraints.maxBudget
    };
  }

  private findBestReplacement(
    playerOut: ProcessedPlayer,
    candidates: TransferTarget[],
    constraints: SquadConstraints,
    existingMoves: TransferMove[]
  ): TransferTarget | null {
    const position = playerOut.position;
    const maxPrice = (playerOut.sellPrice || playerOut.price) + constraints.maxBudget;
    const usedPlayerIds = new Set(existingMoves.map(m => m.inPlayerId));
    
    return candidates
      .filter(c => c.position === position)
      .filter(c => c.price <= maxPrice)
      .filter(c => !usedPlayerIds.has(c.playerId))
      .sort((a, b) => b.expectedPoints - a.expectedPoints)[0] || null;
  }

  private isTransferFeasible(
    playerOut: ProcessedPlayer,
    playerIn: TransferTarget,
    constraints: SquadConstraints,
    existingMoves: TransferMove[]
  ): boolean {
    const netCost = playerIn.price - (playerOut.sellPrice || playerOut.price);
    const totalNetCost = existingMoves.reduce((sum, move) => sum + move.netCost, 0) + netCost;
    
    return totalNetCost <= constraints.maxBudget;
  }

  private getPositionName(elementType: number): 'GK' | 'DEF' | 'MID' | 'FWD' {
    switch (elementType) {
      case 1: return 'GK';
      case 2: return 'DEF';
      case 3: return 'MID';
      case 4: return 'FWD';
      default: return 'MID';
    }
  }

  private generateTransferReason(
    player: FPLPlayer & { expectedPoints: number },
    currentSquad: ProcessedPlayer[]
  ): string {
    if (player.expectedPoints > 25) return 'Premium option with excellent fixtures';
    if (player.expectedPoints > 15) return 'Great value with strong upcoming fixtures';
    if (player.now_cost < 50) return 'Budget-friendly option to free up funds';
    return 'Solid performer with decent fixtures ahead';
  }
}
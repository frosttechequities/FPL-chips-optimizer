#!/usr/bin/env tsx
import process from "node:process";
import { DataRepository } from "../server/services/repositories/dataRepository";
import { SimulationService } from "../server/services/simulationService";
import { shutdownDatabase } from "../server/db/client";
import type { ProcessedPlayer, FPLFixture, FPLTeam, FPLPlayer } from "@shared/schema";

function mapPosition(elementType: number): 'GK' | 'DEF' | 'MID' | 'FWD' {
  switch (elementType) {
    case 1: return 'GK';
    case 2: return 'DEF';
    case 3: return 'MID';
    default: return 'FWD';
  }
}

function buildProcessedPlayer(player: FPLPlayer, team: FPLTeam | undefined): ProcessedPlayer {
  return {
    id: player.id,
    name: player.web_name,
    position: mapPosition(player.element_type),
    team: team?.short_name ?? 'UNK',
    price: player.now_cost / 10,
    points: player.total_points,
    teamId: player.team,
  };
}

function buildFixturesForPlayer(player: FPLPlayer, fixtures: FPLFixture[]): any[] {
  const teamFixtures = fixtures
    .filter(f => f.team_h === player.team || f.team_a === player.team)
    .sort((a, b) => (a.event ?? 0) - (b.event ?? 0))
    .slice(0, 3);

  if (teamFixtures.length === 0) {
    return [{ playerId: player.id, gameweek: 0, hasFixture: false, fdr: 3, isHome: true }];
  }

  return teamFixtures.map(fixture => ({
    playerId: player.id,
    gameweek: fixture.event ?? 0,
    hasFixture: true,
    fdr: player.team === fixture.team_h ? fixture.team_h_difficulty : fixture.team_a_difficulty,
    isHome: player.team === fixture.team_h,
  }));
}

async function main() {
  const repository = DataRepository.getInstance();
  const simulationService = SimulationService.getInstance();

  const [players, teams, fixtures] = await Promise.all([
    repository.getFplPlayers(),
    repository.getFplTeams(),
    repository.getFplFixtures(),
  ]);

  if (players.length === 0 || fixtures.length === 0) {
    console.warn('[simulations] No data available. Run npm run data:refresh first.');
    return;
  }

  const teamMap = new Map<number, FPLTeam>();
  teams.forEach(team => teamMap.set(team.id, team));

  const limit = parseInt(process.env.SIMULATION_LIMIT || '50', 10);
  const slice = players.slice(0, limit);

  console.log(`[simulations] Running Monte Carlo summaries for ${slice.length} players...`);

  for (const player of slice) {
    const processed = buildProcessedPlayer(player, teamMap.get(player.team));
    const playerFixtures = buildFixturesForPlayer(player, fixtures);
    await simulationService.simulateAndPersist(processed, playerFixtures);
  }

  console.log('[simulations] Completed.');
}

main()
  .catch(error => {
    console.error('[simulations] Failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void shutdownDatabase();
  });

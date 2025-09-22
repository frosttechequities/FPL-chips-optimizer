import { describe, expect, it, vi } from "vitest";
import type { FPLFixture, FPLPlayer, FPLTeam, PlayerAdvanced } from "@shared/schema";
import { DataPipeline } from "./dataPipeline";
import { FPLApiService } from "./fplApi";
import { StatsService } from "./statsService";
import type { DataRepository } from "./repositories/dataRepository";

type RepositoryStub = {
  upsertFplPlayers: ReturnType<typeof vi.fn>;
  upsertFplTeams: ReturnType<typeof vi.fn>;
  upsertFplFixtures: ReturnType<typeof vi.fn>;
  upsertUnderstatPlayers: ReturnType<typeof vi.fn>;
  upsertPlayerFeatureSnapshots: ReturnType<typeof vi.fn>;
  upsertPlayerSimulation: ReturnType<typeof vi.fn>;
  upsertProviderStatus: ReturnType<typeof vi.fn>;
  getLatestFetchTimestamps: ReturnType<typeof vi.fn>;
};

function createRepositoryStub(): RepositoryStub & DataRepository {
  const stub = {
    upsertFplPlayers: vi.fn(() => Promise.resolve()),
    upsertFplTeams: vi.fn(() => Promise.resolve()),
    upsertFplFixtures: vi.fn(() => Promise.resolve()),
    upsertUnderstatPlayers: vi.fn(() => Promise.resolve()),
    upsertPlayerFeatureSnapshots: vi.fn(() => Promise.resolve()),
    upsertPlayerSimulation: vi.fn(() => Promise.resolve()),
    upsertProviderStatus: vi.fn(() => Promise.resolve()),
    getLatestFetchTimestamps: vi.fn(async () => ({
      players: null,
      teams: null,
      fixtures: null,
      advancedStats: null,
    })),
  } satisfies RepositoryStub;

  return stub as unknown as RepositoryStub & DataRepository;
}

describe("DataPipeline", () => {
  const samplePlayers: FPLPlayer[] = [
    {
      id: 1,
      web_name: "Sample Mid",
      element_type: 3,
      team: 1,
      now_cost: 75,
      total_points: 120,
      first_name: "Sample",
      second_name: "Mid",
    },
  ];

  const sampleTeams: FPLTeam[] = [
    {
      id: 1,
      name: "Sample FC",
      short_name: "SFC",
      strength: 3,
      strength_overall_home: 3,
      strength_overall_away: 3,
      strength_attack_home: 3,
      strength_attack_away: 3,
      strength_defence_home: 3,
      strength_defence_away: 3,
    },
    {
      id: 2,
      name: "Opposition",
      short_name: "OPP",
      strength: 3,
      strength_overall_home: 3,
      strength_overall_away: 3,
      strength_attack_home: 3,
      strength_attack_away: 3,
      strength_defence_home: 3,
      strength_defence_away: 3,
    },
  ];

  const sampleFixtures: FPLFixture[] = [
    {
      id: 101,
      event: 1,
      team_h: 1,
      team_a: 2,
      team_h_difficulty: 2,
      team_a_difficulty: 3,
      finished: false,
      started: false,
    },
  ];

  const sampleAdvanced: PlayerAdvanced[] = [
    {
      playerId: 1,
      xG: 0.4,
      xA: 0.3,
      xMins: 82,
      role: "nailed",
      volatility: 3.1,
      formTrend: "rising",
      fixtureAdjustedXG: 0.45,
      fixtureAdjustedXA: 0.34,
      lastUpdated: new Date().toISOString(),
    },
  ];

  const bootstrapMock = {
    elements: samplePlayers,
    teams: sampleTeams,
  };

  const fplApiMock = {
    getBootstrapData: vi.fn(async () => bootstrapMock),
    getFixtures: vi.fn(async () => sampleFixtures),
    getUpcomingFixtures: vi.fn(async () => sampleFixtures),
    getProviderMetadata: vi.fn(() => ({
      provider: 'fpl-api',
      status: 'online',
      totalRequests: 1,
      consecutiveFailures: 0,
      lastLatencyMs: 10,
      lastSuccessAt: new Date(),
    })),
    getUserSquad: vi.fn(async () => ({
      picks: [
        {
          element: 1,
          position: 1,
          multiplier: 1,
          is_captain: false,
          is_vice_captain: false,
          purchase_price: 75,
          selling_price: 75,
        },
      ],
      entry_history: {
        event: 1,
        points: 0,
        total_points: 100,
        rank: 1,
        overall_rank: 1,
        bank: 0,
        value: 1000,
        event_transfers: 0,
        event_transfers_cost: 0,
        points_on_bench: 0,
      },
      automatic_subs: [],
    })),
    getUserInfo: vi.fn(async () => ({
      name: "Test Manager",
      player_first_name: "Test",
      player_last_name: "Manager",
    })),
    computeFreeTransfers: vi.fn(async () => 1),
    getNextDeadline: vi.fn(async () => new Date().toISOString()),
    getCurrentGameweek: vi.fn(async () => 1),
  } as unknown as FPLApiService;

  const statsServiceMock = {
    getPlayerAdvancedBatch: vi.fn(async () => sampleAdvanced),
    getProviderMetadata: vi.fn(() => ({
      provider: 'advanced-stats',
      status: 'online',
      totalRequests: 1,
      consecutiveFailures: 0,
      lastLatencyMs: 12,
      lastSuccessAt: new Date(),
    })),
  } as unknown as StatsService;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(FPLApiService, "getInstance").mockReturnValue(fplApiMock);
    vi.spyOn(StatsService, "getInstance").mockReturnValue(statsServiceMock);
  });

  it("ingests bootstrap and advanced stats data", async () => {
    const repository = createRepositoryStub();
    const pipeline = DataPipeline.create(repository);

    const result = await pipeline.runFullRefresh("manual");

    expect(result.status).toBe("success");
    expect(repository.upsertFplPlayers).toHaveBeenCalledWith(samplePlayers, expect.any(Date));
    expect(repository.upsertFplTeams).toHaveBeenCalledWith(sampleTeams, expect.any(Date));
    expect(repository.upsertFplFixtures).toHaveBeenCalledWith(sampleFixtures, expect.any(Date));
    expect(repository.upsertUnderstatPlayers).toHaveBeenCalled();
    expect(repository.upsertProviderStatus).toHaveBeenCalledWith(
      "fpl-api",
      expect.objectContaining({ status: "online" })
    );
  });

  it("forces freshness updates when cache is stale", async () => {
    const repository = createRepositoryStub();
    repository.getLatestFetchTimestamps.mockResolvedValue({
      players: null,
      teams: null,
      fixtures: null,
      advancedStats: null,
    });

    const pipeline = DataPipeline.create(repository);
    await pipeline.ensureFreshData();

    expect(repository.upsertFplPlayers).toHaveBeenCalled();
    expect(repository.upsertProviderStatus).toHaveBeenCalledWith(
      "advanced-stats",
      expect.objectContaining({ status: "online" })
    );
  });
});

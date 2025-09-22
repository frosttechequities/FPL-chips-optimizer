import {
  type AnalysisResult,
  type FPLFixture,
  type FPLPlayer,
  type FPLTeam
} from "@shared/schema";
import { DataRepository } from "./services/repositories/dataRepository";

export interface IStorage {
  getAnalysisResult(teamId: string): Promise<AnalysisResult | undefined>;
  setAnalysisResult(teamId: string, result: AnalysisResult): Promise<void>;

  getFPLPlayers(): Promise<FPLPlayer[] | undefined>;
  setFPLPlayers(players: FPLPlayer[]): Promise<void>;

  getFPLTeams(): Promise<FPLTeam[] | undefined>;
  setFPLTeams(teams: FPLTeam[]): Promise<void>;

  getFPLFixtures(): Promise<FPLFixture[] | undefined>;
  setFPLFixtures(fixtures: FPLFixture[]): Promise<void>;

  getCacheTimestamp(key: string): Promise<number | undefined>;
  setCacheTimestamp(key: string, timestamp: number): Promise<void>;
}

class DatabaseStorage implements IStorage {
  constructor(private readonly repository: DataRepository) {}

  async getAnalysisResult(teamId: string): Promise<AnalysisResult | undefined> {
    const payload = await this.repository.getAnalysisResult(teamId);
    return payload ? (payload as unknown as AnalysisResult) : undefined;
  }

  async setAnalysisResult(teamId: string, result: AnalysisResult): Promise<void> {
    await this.repository.upsertAnalysisResult(teamId, result as unknown as Record<string, unknown>);
    await this.repository.upsertCacheEntry(this.getTimestampKey(teamId), { timestamp: Date.now() });
  }

  async getFPLPlayers(): Promise<FPLPlayer[] | undefined> {
    const players = await this.repository.getFplPlayers();
    return players.length ? players : undefined;
  }

  async setFPLPlayers(players: FPLPlayer[]): Promise<void> {
    await this.repository.upsertFplPlayers(players);
    await this.repository.upsertCacheEntry(this.getTimestampKey("bootstrap:players"), { timestamp: Date.now() });
  }

  async getFPLTeams(): Promise<FPLTeam[] | undefined> {
    const teams = await this.repository.getFplTeams();
    return teams.length ? teams : undefined;
  }

  async setFPLTeams(teams: FPLTeam[]): Promise<void> {
    await this.repository.upsertFplTeams(teams);
    await this.repository.upsertCacheEntry(this.getTimestampKey("bootstrap:teams"), { timestamp: Date.now() });
  }

  async getFPLFixtures(): Promise<FPLFixture[] | undefined> {
    const fixtures = await this.repository.getFplFixtures();
    return fixtures.length ? fixtures : undefined;
  }

  async setFPLFixtures(fixtures: FPLFixture[]): Promise<void> {
    await this.repository.upsertFplFixtures(fixtures);
    await this.repository.upsertCacheEntry(this.getTimestampKey("bootstrap:fixtures"), { timestamp: Date.now() });
  }

  async getCacheTimestamp(key: string): Promise<number | undefined> {
    const entry = await this.repository.getCacheEntry(this.getTimestampKey(key));
    if (!entry) return undefined;
    const payloadTimestamp = typeof entry.payload?.timestamp === "number" ? entry.payload.timestamp : undefined;
    return payloadTimestamp ?? entry.updatedAt.getTime();
  }

  async setCacheTimestamp(key: string, timestamp: number): Promise<void> {
    await this.repository.upsertCacheEntry(this.getTimestampKey(key), { timestamp });
  }

  private getTimestampKey(key: string): string {
    return `timestamp:${key}`;
  }
}

class MemStorage implements IStorage {
  private analysisCache = new Map<string, AnalysisResult>();
  private fplPlayers: FPLPlayer[] | undefined;
  private fplTeams: FPLTeam[] | undefined;
  private fplFixtures: FPLFixture[] | undefined;
  private cacheTimestamps = new Map<string, number>();

  async getAnalysisResult(teamId: string): Promise<AnalysisResult | undefined> {
    return this.analysisCache.get(teamId);
  }

  async setAnalysisResult(teamId: string, result: AnalysisResult): Promise<void> {
    this.analysisCache.set(teamId, result);
    this.cacheTimestamps.set(this.getTimestampKey(teamId), Date.now());
  }

  async getFPLPlayers(): Promise<FPLPlayer[] | undefined> {
    return this.fplPlayers;
  }

  async setFPLPlayers(players: FPLPlayer[]): Promise<void> {
    this.fplPlayers = players;
    this.cacheTimestamps.set(this.getTimestampKey("bootstrap:players"), Date.now());
  }

  async getFPLTeams(): Promise<FPLTeam[] | undefined> {
    return this.fplTeams;
  }

  async setFPLTeams(teams: FPLTeam[]): Promise<void> {
    this.fplTeams = teams;
    this.cacheTimestamps.set(this.getTimestampKey("bootstrap:teams"), Date.now());
  }

  async getFPLFixtures(): Promise<FPLFixture[] | undefined> {
    return this.fplFixtures;
  }

  async setFPLFixtures(fixtures: FPLFixture[]): Promise<void> {
    this.fplFixtures = fixtures;
    this.cacheTimestamps.set(this.getTimestampKey("bootstrap:fixtures"), Date.now());
  }

  async getCacheTimestamp(key: string): Promise<number | undefined> {
    return this.cacheTimestamps.get(this.getTimestampKey(key));
  }

  async setCacheTimestamp(key: string, timestamp: number): Promise<void> {
    this.cacheTimestamps.set(this.getTimestampKey(key), timestamp);
  }

  private getTimestampKey(key: string): string {
    return `timestamp:${key}`;
  }
}

let storageInstance: IStorage;

try {
  const repository = DataRepository.getInstance();
  storageInstance = new DatabaseStorage(repository);
  console.log("[storage] Using database-backed storage");
} catch (error) {
  console.warn("[storage] Falling back to in-memory storage:", error instanceof Error ? error.message : error);
  storageInstance = new MemStorage();
}

export { storageInstance as storage, DatabaseStorage, MemStorage };

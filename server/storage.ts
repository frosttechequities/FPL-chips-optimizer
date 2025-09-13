import { 
  type AnalysisResult,
  type FPLPlayer,
  type FPLTeam,
  type FPLFixture
} from "@shared/schema";

// FPL API Cache interface
export interface IStorage {
  // Analysis results cache
  getAnalysisResult(teamId: string): Promise<AnalysisResult | undefined>;
  setAnalysisResult(teamId: string, result: AnalysisResult): Promise<void>;
  
  // FPL API data cache
  getFPLPlayers(): Promise<FPLPlayer[] | undefined>;
  setFPLPlayers(players: FPLPlayer[]): Promise<void>;
  
  getFPLTeams(): Promise<FPLTeam[] | undefined>;
  setFPLTeams(teams: FPLTeam[]): Promise<void>;
  
  getFPLFixtures(): Promise<FPLFixture[] | undefined>;
  setFPLFixtures(fixtures: FPLFixture[]): Promise<void>;
  
  // Cache management
  getCacheTimestamp(key: string): Promise<number | undefined>;
  setCacheTimestamp(key: string, timestamp: number): Promise<void>;
}

export class MemStorage implements IStorage {
  private analysisCache: Map<string, AnalysisResult>;
  private fplPlayers: FPLPlayer[] | undefined;
  private fplTeams: FPLTeam[] | undefined;
  private fplFixtures: FPLFixture[] | undefined;
  private cacheTimestamps: Map<string, number>;

  constructor() {
    this.analysisCache = new Map();
    this.cacheTimestamps = new Map();
  }

  async getAnalysisResult(teamId: string): Promise<AnalysisResult | undefined> {
    return this.analysisCache.get(teamId);
  }

  async setAnalysisResult(teamId: string, result: AnalysisResult): Promise<void> {
    this.analysisCache.set(teamId, result);
  }

  async getFPLPlayers(): Promise<FPLPlayer[] | undefined> {
    return this.fplPlayers;
  }

  async setFPLPlayers(players: FPLPlayer[]): Promise<void> {
    this.fplPlayers = players;
  }

  async getFPLTeams(): Promise<FPLTeam[] | undefined> {
    return this.fplTeams;
  }

  async setFPLTeams(teams: FPLTeam[]): Promise<void> {
    this.fplTeams = teams;
  }

  async getFPLFixtures(): Promise<FPLFixture[] | undefined> {
    return this.fplFixtures;
  }

  async setFPLFixtures(fixtures: FPLFixture[]): Promise<void> {
    this.fplFixtures = fixtures;
  }

  async getCacheTimestamp(key: string): Promise<number | undefined> {
    return this.cacheTimestamps.get(key);
  }

  async setCacheTimestamp(key: string, timestamp: number): Promise<void> {
    this.cacheTimestamps.set(key, timestamp);
  }
}

export const storage = new MemStorage();

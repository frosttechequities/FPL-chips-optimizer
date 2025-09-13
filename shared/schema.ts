import { z } from "zod";

// FPL API Response Types
export interface FPLPlayer {
  id: number;
  web_name: string;
  element_type: number; // 1=GK, 2=DEF, 3=MID, 4=FWD
  team: number;
  now_cost: number; // Price in tenths of millions
  total_points: number;
  first_name: string;
  second_name: string;
}

export interface FPLTeam {
  id: number;
  name: string;
  short_name: string;
  strength: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export interface FPLFixture {
  id: number;
  event: number; // gameweek
  team_h: number; // home team id
  team_a: number; // away team id
  team_h_difficulty: number;
  team_a_difficulty: number;
  finished: boolean;
  started: boolean;
}

export interface FPLUserPick {
  element: number; // player id
  position: number; // 1-11 starting, 12-15 bench
  multiplier: number; // captain multiplier
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface FPLUserSquad {
  active_chip?: string;
  automatic_subs: any[];
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    rank: number;
    overall_rank: number;
    bank: number;
    value: number;
    event_transfers: number;
    event_transfers_cost: number;
    points_on_bench: number;
  };
  picks: FPLUserPick[];
}

// Analysis Types
export interface ProcessedPlayer {
  id: number;
  name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  team: string;
  price: number; // in millions
  points: number;
  teamId: number;
}

export interface GameweekFDR {
  gameweek: number;
  totalFDR: number;
  averageFDR: number;
  difficulty: 'easy' | 'medium' | 'hard';
  fixtures: {
    playerId: number;
    playerName: string;
    opponent: string;
    isHome: boolean;
    fdr: number;
  }[];
}

export type ChipType = 'wildcard' | 'bench-boost' | 'triple-captain' | 'free-hit';

export interface ChipRecommendation {
  chipType: ChipType;
  gameweek: number;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  reasoning: string[];
  confidence: number;
}

export interface AnalysisResult {
  teamId: string;
  teamName: string;
  players: ProcessedPlayer[];
  totalValue: number;
  totalPoints: number;
  gameweeks: GameweekFDR[];
  recommendations: ChipRecommendation[];
  lastUpdated: string;
}

// Request/Response Schemas
export const analyzeTeamRequestSchema = z.object({
  teamId: z.string().regex(/^\d+$/, "Team ID must be a number")
    .transform(val => parseInt(val))
    .refine(val => val > 0 && val <= 99999999, "Invalid team ID range")
});

export type AnalyzeTeamRequest = z.infer<typeof analyzeTeamRequestSchema>;

export const analyzeTeamResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    teamId: z.string(),
    teamName: z.string(),
    players: z.array(z.object({
      id: z.number(),
      name: z.string(),
      position: z.enum(['GK', 'DEF', 'MID', 'FWD']),
      team: z.string(),
      price: z.number(),
      points: z.number(),
      teamId: z.number()
    })),
    totalValue: z.number(),
    totalPoints: z.number(),
    gameweeks: z.array(z.object({
      gameweek: z.number(),
      totalFDR: z.number(),
      averageFDR: z.number(),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      fixtures: z.array(z.object({
        playerId: z.number(),
        playerName: z.string(),
        opponent: z.string(),
        isHome: z.boolean(),
        fdr: z.number()
      }))
    })),
    recommendations: z.array(z.object({
      chipType: z.enum(['wildcard', 'bench-boost', 'triple-captain', 'free-hit']),
      gameweek: z.number(),
      priority: z.enum(['high', 'medium', 'low']),
      title: z.string(),
      description: z.string(),
      reasoning: z.array(z.string()),
      confidence: z.number()
    })),
    lastUpdated: z.string()
  }).optional(),
  error: z.string().optional()
});

export type AnalyzeTeamResponse = z.infer<typeof analyzeTeamResponseSchema>;

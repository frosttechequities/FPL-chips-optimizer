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
  purchase_price: number; // Price bought at in tenths of millions
  selling_price: number; // Current selling price in tenths of millions
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

// Enhanced Phase 1 Types for Advanced Analytics

// Bookmaker odds for fixtures
export interface MatchOdds {
  fixtureId: number;
  homeWin: number; // decimal odds
  draw: number;
  awayWin: number;
  btts: number; // both teams to score
  over25Goals: number; // over 2.5 goals
  under25Goals: number; // under 2.5 goals
  homeCleanSheet: number; // home team clean sheet
  awayCleanSheet: number; // away team clean sheet
  homeGoalsOver15: number; // home team over 1.5 goals
  awayGoalsOver15: number; // away team over 1.5 goals
  lastUpdated: string;
}

// Team strength metrics derived from odds and advanced stats
export interface TeamStrength {
  teamId: number;
  attack: number; // attacking strength (0-100)
  defense: number; // defensive strength (0-100)
  xGFor: number; // expected goals for (per game)
  xGAgainst: number; // expected goals against (per game)
  homeAdvantage: number; // home advantage factor (0.8-1.2)
  form: number; // recent form (0-100)
  lastUpdated: string;
}

// Advanced player statistics
export interface PlayerAdvanced {
  playerId: number;
  xG: number; // expected goals
  xA: number; // expected assists
  xMins: number; // expected minutes (proxy for rotation risk)
  role: 'nailed' | 'rotation' | 'benchwarmer'; // playing time confidence
  volatility: number; // points standard deviation 
  formTrend: 'rising' | 'stable' | 'declining'; // recent performance trend
  fixtureAdjustedXG: number; // xG adjusted for upcoming fixtures
  fixtureAdjustedXA: number; // xA adjusted for upcoming fixtures
  lastUpdated: string;
}

// Monte Carlo simulation results for individual players
export interface PlayerSimOutcome {
  playerId: number;
  gameweeksSimulated: number;
  meanPoints: number;
  p10: number; // 10th percentile outcome
  p50: number; // median outcome
  p90: number; // 90th percentile outcome
  standardDeviation: number;
  haulsCount: number; // number of >10pt hauls in simulation
  blankCount: number; // number of 0-2pt blanks in simulation
  bestGameweek: number; // gameweek with highest expected return
  worstGameweek: number; // gameweek with lowest expected return
  confidence: number; // confidence in prediction (0-100)
  // Phase 2 probabilistic metadata
  p25?: number; // 25th percentile outcome
  p75?: number; // 75th percentile outcome
  ceilingProbability?: number; // Probability of exceeding high-upside threshold
  floorProbability?: number; // Probability of blanking
  haulProbability?: number; // Probability of 10+ haul
  captainEV?: number; // Expected value when captained
  coefficientOfVariation?: number; // Risk metric (std dev / mean)
}

export interface PlayerSimulation {
  playerId: number;
  generatedAt: string;
  runs: number;
  meanPoints: number;
  medianPoints: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  standardDeviation: number;
  haulProbability: number;
  floorProbability: number;
  ceilingProbability: number;
  captainEV: number;
  coefficientOfVariation?: number;
}

export type PlayerArchetype = 'template' | 'balanced' | 'differential' | 'boom-bust';

export interface EffectiveOwnershipSnapshot {
  playerId: number;
  totalOwnership: number;
  topOwnership: number;
  activeOwnership: number;
  captaincy: number;
  topCaptaincy: number;
  effectiveOwnership: number;
  topEffectiveOwnership: number;
  ownershipTier: 'template' | 'balanced' | 'differential';
  riskTier: 'steady' | 'volatile';
}


// Simulation summary for the entire squad or chip strategy
export interface SimulationSummary {
  strategy: string; // e.g., "bench-boost-gw8", "current-squad"
  runs: number; // number of simulation runs
  gameweeksAnalyzed: number[];
  
  // Overall outcomes
  meanTotalPoints: number;
  p10TotalPoints: number; // conservative outcome
  p90TotalPoints: number; // optimistic outcome
  
  // Chip-specific metrics
  successRate: number; // % of simulations above target
  boomRate: number; // % of simulations with exceptional returns (>20% above mean)
  bustRate: number; // % of simulations below disappointing threshold
  
  // Risk assessment
  variance: number;
  confidenceInterval: [number, number]; // 80% confidence interval
  recommendationStrength: 'strong' | 'moderate' | 'weak';
  
  lastUpdated: string;
}

// Enhanced Phase 2: Machine Learning and Competitive Intelligence Types

// Machine learning prediction for individual players
export interface MLPrediction {
  playerId: number;
  predictedPoints: number;
  confidence: number; // 0-100 confidence in prediction
  floor: number; // 10th percentile prediction
  ceiling: number; // 90th percentile prediction
  modelVersion: string;
  features: {
    form: number; // recent form factor
    fixtures: number; // fixture difficulty weighting
    price: number; // price performance factor
    ownership: number; // ownership impact
    historical: number; // historical performance factor
  };
  riskFactors?: {
    injuryRisk: number; // 0-1 probability of injury
    rotationRisk: number; // 0-1 probability of rotation
    priceDrop: number; // 0-1 probability of price decline
  };
  lastUpdated: string;
}

// Analysis of rival manager strategies
export interface RivalAnalysis {
  managerId: string;
  managerName: string;
  overallRank: number;
  gameweekRank: number;
  totalPoints: number;
  transfers: {
    playersIn: Array<{
      playerId: number;
      playerName: string;
      gameweek: number;
      reason: 'popular_pick' | 'differential' | 'fixture_swing' | 'price_rise';
    }>;
    playersOut: Array<{
      playerId: number;
      playerName: string;
      gameweek: number;
      reason: 'injury' | 'rotation' | 'fixture_swing' | 'price_drop';
    }>;
  };
  strategy: 'template' | 'differential' | 'balanced' | 'contrarian';
  chipsUsed: Array<{
    chip: 'wildcard' | 'bench-boost' | 'triple-captain' | 'free-hit';
    gameweek: number;
    success: boolean;
    points: number;
  }>;
  lastUpdated: string;
}

// Competitive intelligence data about meta trends
export interface CompetitiveIntelligence {
  metaTrends: {
    popularPicks: Array<{
      playerId: number;
      playerName: string;
      ownership: number;
      trend: 'rising' | 'falling' | 'stable';
      differential: boolean;
    }>;
    emergingPlayers: Array<{
      playerId: number;
      playerName: string;
      ownershipGrowth: number;
      reasons: string[];
    }>;
  };
  rivalInsights: {
    topManagerMoves: RivalAnalysis[];
    commonStrategies: string[];
    chipUsagePatterns: Array<{
      chip: string;
      optimalGameweeks: number[];
      averageReturn: number;
    }>;
  };
  marketInefficiencies: Array<{
    playerId: number;
    playerName: string;
    expectedVsActualOwnership: number;
    opportunity: 'undervalued' | 'overvalued';
    confidence: number;
  }>;
  lastUpdated: string;
}

// ML model performance tracking
export interface MLModelPerformance {
  modelId: string;
  modelType: 'regression' | 'classification' | 'ensemble';
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  lastTrained: string;
  trainingDataSize: number;
  features: string[];
  validationResults: {
    meanAbsoluteError: number;
    rootMeanSquareError: number;
    r2Score: number;
  };
}

// Historical player performance data for ML training
export interface HistoricalPlayerData {
  playerId: number;
  playerName: string;
  season: string;
  gameweeks: Array<{
    gameweek: number;
    points: number;
    minutes: number;
    goals: number;
    assists: number;
    cleanSheets: number;
    saves: number;
    penalties: number;
    yellowCards: number;
    redCards: number;
    ownGoals: number;
    price: number;
    ownership: number;
    captaincy: number;
    fixture: {
      opponent: string;
      isHome: boolean;
      difficulty: number;
    };
  }>;
  aggregatedStats: {
    totalPoints: number;
    avgPointsPerGame: number;
    pointsPerMillion: number;
    volatility: number;
    consistency: number;
  };
}

// Enhanced Phase 3: AI Co-pilot and Natural Language Processing Types

// Natural language query and response for AI co-pilot
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    queryType?: 'analysis' | 'strategy' | 'transfers' | 'general';
    confidence?: number;
    processingTime?: number;
    analysisData?: any; // References to analysis results if applicable
  };
}

// Conversation context for maintaining chat history and user preferences
export interface ConversationContext {
  sessionId: string;
  userId?: string;
  teamId?: string;
  messages: ChatMessage[];
  userPreferences: {
    riskTolerance: 'conservative' | 'balanced' | 'aggressive';
    strategyType: 'template' | 'differential' | 'balanced' | 'contrarian';
    priorityChips: string[];
    budget?: number;
  };
  currentAnalysis?: {
    teamId?: string;
    teamData?: any;
    lastAnalyzed?: string;
    activeChips?: string[];
  };
  lastUpdated: string;
}

// Structured intent recognition from natural language queries
export interface QueryIntent {
  type: 'squad_analysis' | 'chip_strategy' | 'transfer_suggestions' | 'player_comparison' | 'fixture_analysis' | 'player_advice' | 'general_advice';
  entities: {
    players?: string[];
    teams?: string[];
    gameweeks?: number[];
    chips?: string[];
    positions?: string[];
    budget?: number;
  };
  confidence: number;
  originalQuery: string;
  processedQuery: string;
}

// AI-generated strategic insights and recommendations
export interface AIInsight {
  type: 'recommendation' | 'warning' | 'opportunity' | 'explanation';
  title: string;
  content: string;
  priority: 'high' | 'medium' | 'low';
  confidence: number;
  reasoning: string[];
  actionItems?: string[];
  relatedData?: {
    players?: number[];
    gameweeks?: number[];
    expectedPoints?: number;
    riskLevel?: 'low' | 'medium' | 'high';
  };

  lastUpdated: string;
}
export interface FeatureContribution {
  feature: string;
  value: number;
  baseline: number;
  contribution: number;
  weight: number;
  impact: 'positive' | 'negative';
  description: string;
}

export interface AIExplanation {
  title: string;
  summary: string;
  confidence: number;
  policyVersion?: string;
  provenance?: {
    modelId?: string;
    algorithm?: string;
    trainedAt?: string;
    validationScore?: number;
    rewardMean?: number;
    checksum?: string;
  };
  guardrails?: {
    fallbackUsed: boolean;
    reason?: string;
  };
  reasoningTrace?: Array<{
    step: string;
    detail: string;
    impact?: 'positive' | 'negative';
  }>;
  factors: FeatureContribution[];
  confidenceIntervals?: {
    lower: number;
    upper: number;
  };
  alternatives?: string[];
}


// Comprehensive AI co-pilot response
export interface AICopilotResponse {
  message: string;
  insights: AIInsight[];
  suggestions: string[];
  followUpQuestions: string[];
  analysisPerformed?: {
    type: string;
    confidence: number;
    dataUsed: string[];
  };
  explanations?: AIExplanation[];
  conversationContext: {
    intent: QueryIntent;
    responseTime: number;
    modelVersion: string;
    requestId?: string;
    nlpMs?: number;
    llmMs?: number;
  };
}

// FPL knowledge base entry for AI understanding
export interface FPLConcept {
  term: string;
  category: 'rule' | 'strategy' | 'statistic' | 'terminology';
  definition: string;
  examples: string[];
  relatedTerms: string[];
  strategicImportance: number; // 1-10 scale
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
  sellPrice?: number; // Selling price in millions if owned
  purchasePrice?: number; // Purchase price in millions if owned
  isBench?: boolean; // Whether player is on bench
  isStarter?: boolean; // Whether player is in starting XI
  expectedPoints?: number; // Expected points over analysis window
  
  // Enhanced Phase 1 data
  volatility?: number; // Standard deviation of points (explosiveness metric)
  advancedStats?: PlayerAdvanced; // Advanced statistics
  simOutcome?: PlayerSimOutcome; // Monte Carlo simulation results
  coefficientOfVariation?: number; // Risk metric derived from simulations
  archetype?: PlayerArchetype; // Player risk/ownership profile
  riskTier?: 'steady' | 'volatile'; // Volatility classification
  effectiveOwnership?: EffectiveOwnershipSnapshot; // Ownership intelligence
  rankUpsideScore?: number; // Expected rank gain potential metric
  
  // Enhanced Phase 2: Machine Learning data
  mlPrediction?: MLPrediction; // ML prediction for this player
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
  
  // Enhanced Phase 1 data
  expectedPointsRange?: [number, number]; // [min, max] expected points from simulation
  successProbability?: number; // Probability of achieving target outcome
  alternativeWindows?: number[]; // Other viable gameweeks for this chip
}

// Transfer Planning Types
export interface TransferTarget {
  playerId: number;
  name: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  teamId: number;
  teamName: string;
  price: number; // in millions
  expectedPoints: number;
  reason: string;
}

export interface TransferMove {
  outPlayerId: number;
  outPlayerName: string;
  inPlayerId: number;
  inPlayerName: string;
  cost: number; // Transfer cost (0 for free, 4 for hit)
  netCost: number; // Net spend after selling player
  expectedGain: number; // Expected point gain
}

export interface TransferPlan {
  gameweek: number;
  chipContext?: ChipType;
  moves: TransferMove[];
  totalHits: number;
  totalCost: number; // Total points cost from hits
  budgetAfter: number; // Remaining budget after transfers
  projectedGain: number; // Total expected points gain
  confidence: number; // Confidence score 0-100
  notes: string[];
  feasible: boolean; // Whether plan is within budget/transfer constraints
}

export interface BudgetAnalysis {
  bank: number; // Money in bank (millions)
  teamValue: number; // Total team value (millions)
  freeTransfers: number; // Available free transfers
  nextDeadline: string; // Next transfer deadline
  canAfford: {
    maxPlayerPrice: number; // Most expensive player affordable
    benchUpgrades: TransferTarget[]; // Affordable bench improvements
    starterUpgrades: TransferTarget[]; // Affordable starting XI improvements
  };
}

export interface AnalysisResult {
  teamId: string;
  teamName: string;
  players: ProcessedPlayer[];
  totalValue: number;
  totalPoints: number;
  gameweeks: GameweekFDR[];
  recommendations: ChipRecommendation[];
  budget: BudgetAnalysis;
  transferPlans?: TransferPlan[];
  lastUpdated: string;
  
  // Enhanced Phase 1 data
  simulationSummary?: SimulationSummary; // Overall squad simulation results
  expectedPointsSource?: 'fdr' | 'odds' | 'advanced-stats' | 'simulation'; // Data source for EP calculations
  confidenceLevel?: number; // Overall confidence in analysis (0-100)
  dataFreshness?: {
    odds: string; // timestamp of last odds update
    stats: string; // timestamp of last stats update
    fpl: string; // timestamp of last FPL data update
    ml?: string; // timestamp of last ML predictions update (Phase 2)
    competitiveIntelligence?: string; // timestamp of last competitive intelligence update (Phase 2)
  };
  
  // Enhanced Phase 2: Machine Learning and Competitive Intelligence
  mlPredictions?: MLPrediction[]; // ML predictions for each player
  competitiveIntelligence?: CompetitiveIntelligence; // Market trends and rival insights
  strategicRecommendations?: Array<{
    type: 'template' | 'differential' | 'contrarian' | 'balanced';
    description: string;
    confidence: number;
    recommendations: string[];
  }>;
}

// Request/Response Schemas
export const analyzeTeamRequestSchema = z.object({
  teamId: z.string().regex(/^\d+$/, "Team ID must be a number")
    .transform(val => parseInt(val))
    .refine(val => val > 0 && val <= 99999999, "Invalid team ID range")
});

export type AnalyzeTeamRequest = z.infer<typeof analyzeTeamRequestSchema>;

// Transfer Planning Request/Response Schemas
export const planTransfersRequestSchema = z.object({
  teamId: z.string().regex(/^\d+$/, "Team ID must be a number")
    .transform(val => parseInt(val))
    .refine(val => val > 0 && val <= 99999999, "Invalid team ID range"),
  targetGameweek: z.number().optional(),
  chipType: z.enum(['wildcard', 'bench-boost', 'triple-captain', 'free-hit']).optional(),
  maxHits: z.number().min(0).max(10).default(2),
  includeRiskyMoves: z.boolean().default(false)
});

export type PlanTransfersRequest = z.infer<typeof planTransfersRequestSchema>;

// Enhanced Phase 3: AI Co-pilot API schemas
export const chatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().optional(),
  teamId: z.string().optional(),
  userId: z.string().optional()
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const planTransfersResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    plans: z.array(z.object({
      gameweek: z.number(),
      chipContext: z.enum(['wildcard', 'bench-boost', 'triple-captain', 'free-hit']).optional(),
      moves: z.array(z.object({
        outPlayerId: z.number(),
        outPlayerName: z.string(),
        inPlayerId: z.number(),
        inPlayerName: z.string(),
        cost: z.number(),
        netCost: z.number(),
        expectedGain: z.number()
      })),
      totalHits: z.number(),
      totalCost: z.number(),
      budgetAfter: z.number(),
      projectedGain: z.number(),
      confidence: z.number(),
      notes: z.array(z.string()),
      feasible: z.boolean()
    }))
  }).optional(),
  error: z.string().optional()
});

export type PlanTransfersResponse = z.infer<typeof planTransfersResponseSchema>;

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
      teamId: z.number(),
      sellPrice: z.number().optional(),
      purchasePrice: z.number().optional(),
      isBench: z.boolean().optional(),
      isStarter: z.boolean().optional(),
      expectedPoints: z.number().optional(),
      
      // Enhanced Phase 1 data
      volatility: z.number().optional(),
      advancedStats: z.object({
        playerId: z.number(),
        xG: z.number(),
        xA: z.number(),
        xMins: z.number(),
        role: z.enum(['nailed', 'rotation', 'benchwarmer']),
        volatility: z.number(),
        formTrend: z.enum(['rising', 'stable', 'declining']),
        fixtureAdjustedXG: z.number(),
        fixtureAdjustedXA: z.number(),
        lastUpdated: z.string()
      }).optional(),
      simOutcome: z.object({
        playerId: z.number(),
        gameweeksSimulated: z.number(),
        meanPoints: z.number(),
        p10: z.number(),
        p50: z.number(),
        p90: z.number(),
        standardDeviation: z.number(),
        haulsCount: z.number(),
        blankCount: z.number(),
        bestGameweek: z.number(),
        worstGameweek: z.number(),
        confidence: z.number(),
        p25: z.number().optional(),
        p75: z.number().optional(),
        ceilingProbability: z.number().optional(),
        floorProbability: z.number().optional(),
        haulProbability: z.number().optional(),
        captainEV: z.number().optional(),
        coefficientOfVariation: z.number().optional()
      }).optional(),
      coefficientOfVariation: z.number().optional(),
      archetype: z.enum(['template', 'balanced', 'differential', 'boom-bust']).optional(),
      riskTier: z.enum(['steady', 'volatile']).optional(),
      effectiveOwnership: z.object({
        playerId: z.number(),
        totalOwnership: z.number(),
        topOwnership: z.number(),
        activeOwnership: z.number(),
        captaincy: z.number(),
        topCaptaincy: z.number(),
        effectiveOwnership: z.number(),
        topEffectiveOwnership: z.number(),
        ownershipTier: z.enum(['template', 'balanced', 'differential']),
        riskTier: z.enum(['steady', 'volatile'])
      }).optional(),
      rankUpsideScore: z.number().optional(),
      
      // Enhanced Phase 2: Machine Learning data
      mlPrediction: z.object({
        playerId: z.number(),
        predictedPoints: z.number(),
        confidence: z.number(),
        floor: z.number(),
        ceiling: z.number(),
        modelVersion: z.string(),
        features: z.object({
          form: z.number(),
          fixtures: z.number(),
          price: z.number(),
          ownership: z.number(),
          historical: z.number()
        }),
        riskFactors: z.object({
      
    injuryRisk: z.number(),
          rotationRisk: z.number(),
          priceDrop: z.number()
        }).optional(),
        lastUpdated: z.string()
      }).optional()
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
      confidence: z.number(),
      
      // Enhanced Phase 1 data
      expectedPointsRange: z.tuple([z.number(), z.number()]).optional(),
      successProbability: z.number().optional(),
      alternativeWindows: z.array(z.number()).optional()
    })),
    budget: z.object({
      bank: z.number(),
      teamValue: z.number(),
      freeTransfers: z.number(),
      nextDeadline: z.string(),
      canAfford: z.object({
        maxPlayerPrice: z.number(),
        benchUpgrades: z.array(z.object({
          playerId: z.number(),
          name: z.string(),
          position: z.enum(['GK', 'DEF', 'MID', 'FWD']),
          teamId: z.number(),
          teamName: z.string(),
          price: z.number(),
          expectedPoints: z.number(),
          reason: z.string()
        })),
        starterUpgrades: z.array(z.object({
          playerId: z.number(),
          name: z.string(),
          position: z.enum(['GK', 'DEF', 'MID', 'FWD']),
          teamId: z.number(),
          teamName: z.string(),
          price: z.number(),
          expectedPoints: z.number(),
          reason: z.string()
        }))
      })
    }),
    transferPlans: z.array(z.object({
      gameweek: z.number(),
      chipContext: z.enum(['wildcard', 'bench-boost', 'triple-captain', 'free-hit']).optional(),
      moves: z.array(z.object({
        outPlayerId: z.number(),
        outPlayerName: z.string(),
        inPlayerId: z.number(),
        inPlayerName: z.string(),
        cost: z.number(),
        netCost: z.number(),
        expectedGain: z.number()
      })),
      totalHits: z.number(),
      totalCost: z.number(),
      budgetAfter: z.number(),
      projectedGain: z.number(),
      confidence: z.number(),
      notes: z.array(z.string()),
      feasible: z.boolean()
    })).optional(),
    lastUpdated: z.string(),
    
    // Enhanced Phase 1 data
    simulationSummary: z.object({
      strategy: z.string(),
      runs: z.number(),
      gameweeksAnalyzed: z.array(z.number()),
      meanTotalPoints: z.number(),
      p10TotalPoints: z.number(),
      p90TotalPoints: z.number(),
      successRate: z.number(),
      boomRate: z.number(),
      bustRate: z.number(),
      variance: z.number(),
      confidenceInterval: z.tuple([z.number(), z.number()]),
      recommendationStrength: z.enum(['strong', 'moderate', 'weak']),
      lastUpdated: z.string()
    }).optional(),
    expectedPointsSource: z.enum(['fdr', 'odds', 'advanced-stats', 'simulation']).optional(),
    confidenceLevel: z.number().optional(),
    dataFreshness: z.object({
      odds: z.string(),
      stats: z.string(),
      fpl: z.string(),
      fixtures: z.string().optional(),
      ml: z.string().optional(),
      competitiveIntelligence: z.string().optional()
    }).optional()
  }).optional(),
  error: z.string().optional()
});

export type AnalyzeTeamResponse = z.infer<typeof analyzeTeamResponseSchema>;


export interface CausalInsight {
  insightId: string;
  experimentKey: string;
  hypothesis: string;
  population?: Record<string, unknown> | null;
  timeWindowStart: string;
  timeWindowEnd: string;
  exposure: Record<string, unknown>;
  outcome: Record<string, unknown>;
  confounders?: Array<Record<string, unknown>>;
  effectEstimate?: Record<string, number>;
  tags?: string[];
  status: 'draft' | 'ready' | 'published';
  createdAt: string;
  updatedAt: string;
}

export const causalInsightSchema = z.object({
  insightId: z.string(),
  experimentKey: z.string(),
  hypothesis: z.string(),
  population: z.record(z.unknown()).nullable().optional(),
  timeWindowStart: z.string(),
  timeWindowEnd: z.string(),
  exposure: z.record(z.unknown()),
  outcome: z.record(z.unknown()),
  confounders: z.array(z.record(z.unknown())).optional(),
  effectEstimate: z.record(z.number()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['draft', 'ready', 'published']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const causalInsightsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(causalInsightSchema).optional(),
  error: z.string().optional(),
});

export type CausalInsightsResponse = z.infer<typeof causalInsightsResponseSchema>;

export interface StrategyModelSummary {
  modelId: string;
  version: string;
  status: 'active' | 'staging' | 'archived';
  algorithm: string;
  checksum: string;
  rewardMean: number;
  rewardStd?: number;
  validationScore?: number;
  trainingEpisodes: number;
  createdAt: string;
  updatedAt: string;
  featureNames: string[];
  featureImportance?: Array<{ feature: string; weight: number }>;
  evaluationSeasons?: string[];
  driftIndicator?: number;
  notes?: string;
}

export interface StrategyPolicyMetadata extends StrategyModelSummary {
  featureMeans: Record<string, number>;
  featureStd?: Record<string, number>;
  hyperparameters?: Record<string, number | string>;
  evaluation?: {
    validationScore?: number;
    heuristicBaseline?: number;
    uplift?: number;
  };
}

export interface StrategyPolicyPayload {
  featureWeights: Record<string, number>;
  bias: number;
  temperature: number;
}

export const strategyModelSummarySchema = z.object({
  modelId: z.string(),
  version: z.string(),
  status: z.enum(['active', 'staging', 'archived']),
  algorithm: z.string(),
  checksum: z.string(),
  rewardMean: z.number(),
  rewardStd: z.number().optional(),
  validationScore: z.number().optional(),
  trainingEpisodes: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  featureNames: z.array(z.string()),
  featureImportance: z.array(z.object({
    feature: z.string(),
    weight: z.number(),
  })).optional(),
  evaluationSeasons: z.array(z.string()).optional(),
  driftIndicator: z.number().optional(),
  notes: z.string().optional(),
});

export const strategyModelsResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(strategyModelSummarySchema).optional(),
  error: z.string().optional(),
});

export type StrategyModelsResponse = z.infer<typeof strategyModelsResponseSchema>;


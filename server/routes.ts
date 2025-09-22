import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  analyzeTeamRequestSchema,
  planTransfersRequestSchema,
  chatRequestSchema,
  type AnalyzeTeamResponse,
  type PlanTransfersResponse,
  type AICopilotResponse,
  type StrategyModelsResponse,
  StrategyModelSummary
} from "@shared/schema";
import { AnalysisEngine } from "./services/analysisEngine";
import { TransferEngine } from "./services/transferEngine";
import { AICopilotService } from "./services/aiCopilotService";
import { ProviderStatusService } from "./services/providerStatusService";
import { StrategyModelRegistry } from "./services/strategyModelRegistry";
import { EffectiveOwnershipEngine } from "./services/effectiveOwnershipEngine";
import { DataRepository } from "./services/repositories/dataRepository";

const analysisEngine = new AnalysisEngine();
const transferEngine = new TransferEngine();
const aiCopilotService = AICopilotService.getInstance();
const providerStatusService = ProviderStatusService.getInstance();
const strategyRegistry = StrategyModelRegistry.getInstance();
const effectiveOwnershipEngine = EffectiveOwnershipEngine.getInstance();
const repository = DataRepository.getInstance();

const STRATEGY_STATUSES: StrategyModelSummary['status'][] = ['active', 'staging', 'archived'];

function parseStrategyStatus(input: unknown): StrategyModelSummary['status'][] | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }
  const candidates = input.split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const statuses = candidates.filter((value): value is StrategyModelSummary['status'] => (STRATEGY_STATUSES as string[]).includes(value));
  return statuses.length ? Array.from(new Set(statuses)) : undefined;
}



export async function registerRoutes(app: Express): Promise<Server> {
  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Analyze team route
  app.post("/api/analyze", async (req, res) => {
    let teamId: string | undefined;
    try {
      // Validate request
      const validatedData = analyzeTeamRequestSchema.parse(req.body);
      const parsedTeamId = validatedData.teamId.toString();
      teamId = parsedTeamId;

      // Check cache first (15 minutes cache)
      const cacheTimestamp = await storage.getCacheTimestamp(parsedTeamId);
      const now = Date.now();
      const cacheExpiry = 15 * 60 * 1000; // 15 minutes

      if (cacheTimestamp && (now - cacheTimestamp) < cacheExpiry) {
        const cachedResult = await storage.getAnalysisResult(parsedTeamId);
        if (cachedResult) {
          console.log(`Returning cached analysis for team ${parsedTeamId}`);
          const response: AnalyzeTeamResponse = {
            success: true,
            data: cachedResult
          };
          return res.json(response);
        }
      }

      // Perform fresh analysis
      console.log(`Analyzing team ${parsedTeamId}...`);
      const analysisResult = await analysisEngine.analyzeTeam(parsedTeamId);
      
      // Cache the result
      await storage.setAnalysisResult(parsedTeamId, analysisResult);
      await storage.setCacheTimestamp(parsedTeamId, now);
      
      console.log(`Analysis complete for team ${parsedTeamId}`);
      
      const response: AnalyzeTeamResponse = {
        success: true,
        data: analysisResult
      };
      
      res.json(response);
    } catch (error) {
      console.error('Analysis Error:', error);
      
      let errorMessage = 'Failed to analyze team';
      
      if (error instanceof Error) {
        // Handle specific error types
        if (error.message.includes('404') || error.message.includes('not found')) {
          errorMessage = 'Team ID not found. Please check your FPL Team ID and try again.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Unable to connect to FPL servers. Please try again later.';
        } else if (error.message.includes('validation')) {
          errorMessage = 'Invalid team ID format. Please enter a valid FPL Team ID.';
        } else {
          errorMessage = error.message;
        }
      }
      
      const cachedAnalysis = teamId ? await storage.getAnalysisResult(teamId) : null;
      if (cachedAnalysis && teamId) {
        console.warn(`[analysis] Serving cached analysis for ${teamId} due to upstream error.`);
        const response: AnalyzeTeamResponse = {
          success: true,
          data: cachedAnalysis
        };
        return res.json(response);
      }

      const errorResponse: AnalyzeTeamResponse = {
        success: false,
        error: errorMessage
      };

      res.status(400).json(errorResponse);
    }
  });

  // Transfer planning route
  app.post("/api/transfer-plan", async (req, res) => {
    try {
      // Validate request
      const validatedData = planTransfersRequestSchema.parse(req.body);
      const teamId = validatedData.teamId.toString();
      
      console.log(`Planning transfers for team ${teamId}...`);
      
      // Get current analysis result (need it for squad and budget info)
      const analysisResult = await analysisEngine.analyzeTeam(teamId);
      
      if (!analysisResult) {
        throw new Error('Could not analyze team for transfer planning');
      }
      
      // Generate transfer plans
      const plans = await transferEngine.generateTransferPlans(
        analysisResult.players,
        analysisResult.budget.bank,
        analysisResult.budget.freeTransfers,
        {
          targetGameweek: validatedData.targetGameweek || analysisResult.gameweeks[1]?.gameweek || 1,
          chipType: validatedData.chipType,
          maxHits: validatedData.maxHits,
          includeRiskyMoves: validatedData.includeRiskyMoves,
          gameweeks: analysisResult.gameweeks
        }
      );
      
      console.log(`Generated ${plans.length} transfer plans for team ${teamId}`);
      
      const response: PlanTransfersResponse = {
        success: true,
        data: { plans }
      };
      
      res.json(response);
    } catch (error) {
      console.error('Transfer planning error:', error);
      
      let errorMessage = 'Failed to generate transfer plans';
      
      if (error instanceof Error) {
        if (error.message.includes('404') || error.message.includes('not found')) {
          errorMessage = 'Team ID not found. Please check your FPL Team ID and try again.';
        } else if (error.message.includes('validation')) {
          errorMessage = 'Invalid request format. Please check your parameters.';
        } else {
          errorMessage = error.message;
        }
      }
      
      const errorResponse: PlanTransfersResponse = {
        success: false,
        error: errorMessage
      };
      
      res.status(400).json(errorResponse);
    }
  });

  // Clear cache route (for development/testing)
  app.post("/api/cache/clear", async (req, res) => {
    try {
      // Clear all service caches
      const fplApi = await import('./services/fplApi');
      const oddsService = await import('./services/oddsService');
      const statsService = await import('./services/statsService');
      
      const apiService = fplApi.FPLApiService.getInstance();
      const odds = oddsService.OddsService.getInstance();
      const stats = statsService.StatsService.getInstance();
      
      apiService.clearCache();
      odds.clearCache();
      stats.clearCache();
      
      res.json({ success: true, message: 'All caches cleared successfully' });
    } catch (error) {
      console.error('Cache clear error:', error);
      res.status(500).json({ success: false, error: 'Failed to clear cache' });
    }
  });

  // Phase 3: Strategy model catalogue
  app.get("/api/strategy/models", async (req, res) => {
    try {
      const statuses = parseStrategyStatus(req.query.status);
      const models = await strategyRegistry.listModels(statuses);
      const response: StrategyModelsResponse = { success: true, data: models };
      res.json(response);
    } catch (error) {
      console.error('Strategy model listing error:', error);
      const message = error instanceof Error ? error.message : 'Failed to load strategy models';
      const response: StrategyModelsResponse = { success: false, error: message };
      res.status(500).json(response);
    }
  });

  // Enhanced Phase 1: Data provider status endpoint
  app.get("/api/providers/status", async (_req, res) => {
    try {
      const overview = await providerStatusService.getOverview();
      res.json({ success: true, data: overview });
    } catch (error) {
      console.error("Provider status error:", error);
      const message = error instanceof Error ? error.message : "Failed to get provider status";
      res.status(500).json({ success: false, error: message });
    }
  });
  // Enhanced Phase 2: Effective ownership snapshot
  app.get("/api/effective-ownership", async (req, res) => {
    try {
      const teamId = req.query.teamId;
      if (!teamId) {
        return res.status(400).json({ success: false, error: 'teamId query parameter is required' });
      }

      const analysis = await analysisEngine.analyzeTeam(String(teamId));
      const players = analysis.players ?? [];
      const snapshots = players.map(player => ({
        playerId: player.id,
        name: player.name,
        position: player.position,
        ownership: effectiveOwnershipEngine.getOwnershipSnapshot(player),
      }));

      res.json({ success: true, data: snapshots, generatedAt: new Date().toISOString() });
    } catch (error) {
      console.error('Effective ownership endpoint error:', error);
      const message = error instanceof Error ? error.message : 'Failed to compute effective ownership';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Enhanced Phase 1: Simulation configuration endpoint
  app.get("/api/simulation/config", (req, res) => {
    const config = {
      defaultRuns: 1000,
      maxRuns: 5000,
      gameweeksAnalyzed: 6,
      useOdds: process.env.ODDS_PROVIDER !== 'mock',
      useAdvancedStats: process.env.STATS_PROVIDER !== 'mock',
      providers: {
        odds: process.env.ODDS_PROVIDER || 'mock',
        stats: process.env.STATS_PROVIDER || 'mock'
      }
    };
    
    res.json({ success: true, data: config });
  });

  // Enhanced Phase 2: Player simulation summary
  app.get("/api/simulations/player/:playerId", async (req, res) => {
    try {
      const playerId = Number(req.params.playerId);
      if (!Number.isFinite(playerId)) {
        return res.status(400).json({ success: false, error: 'playerId must be a number' });
      }

      const simulation = await repository.getPlayerSimulation(playerId);
      if (!simulation) {
        return res.status(404).json({ success: false, error: 'Simulation not found' });
      }

      res.json({ success: true, data: simulation });
    } catch (error) {
      console.error('Simulation summary error:', error);
      const message = error instanceof Error ? error.message : 'Failed to load simulation summary';
      res.status(500).json({ success: false, error: message });
    }
  });

  // Enhanced Phase 3: AI Co-pilot chat endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      // Validate request
      const validatedData = chatRequestSchema.parse(req.body);
      
      // Generate session ID if not provided
      const sessionId = validatedData.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      console.log(`Processing chat message for session ${sessionId}...`);
      
      // Process the chat message
      const response = await aiCopilotService.processChatMessage(
        validatedData.message,
        sessionId,
        validatedData.teamId,
        validatedData.userId,
        requestId
      );
      
      console.log(`Chat response generated (${response.conversationContext.responseTime}ms)`);
      
      res.json({
        success: true,
        data: {
          ...response,
          sessionId, // Include session ID in response
          requestId
        }
      });
      
    } catch (error) {
      console.error('Chat processing error:', error);
      
      let errorMessage = 'Failed to process chat message';
      
      if (error instanceof Error) {
        if (error.message.includes('validation')) {
          errorMessage = 'Invalid chat message format.';
        } else {
          errorMessage = error.message;
        }
      }
      
      res.status(400).json({
        success: false,
        error: errorMessage
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

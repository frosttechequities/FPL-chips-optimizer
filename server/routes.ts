import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  analyzeTeamRequestSchema, 
  planTransfersRequestSchema,
  chatRequestSchema,
  type AnalyzeTeamResponse,
  type PlanTransfersResponse,
  type AICopilotResponse 
} from "@shared/schema";
import { AnalysisEngine } from "./services/analysisEngine";
import { TransferEngine } from "./services/transferEngine";
import { AICopilotService } from "./services/aiCopilotService";

const analysisEngine = new AnalysisEngine();
const transferEngine = new TransferEngine();
const aiCopilotService = AICopilotService.getInstance();

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Analyze team route
  app.post("/api/analyze", async (req, res) => {
    try {
      // Validate request
      const validatedData = analyzeTeamRequestSchema.parse(req.body);
      const teamId = validatedData.teamId.toString();

      // Check cache first (15 minutes cache)
      const cacheTimestamp = await storage.getCacheTimestamp(teamId);
      const now = Date.now();
      const cacheExpiry = 15 * 60 * 1000; // 15 minutes

      if (cacheTimestamp && (now - cacheTimestamp) < cacheExpiry) {
        const cachedResult = await storage.getAnalysisResult(teamId);
        if (cachedResult) {
          console.log(`Returning cached analysis for team ${teamId}`);
          const response: AnalyzeTeamResponse = {
            success: true,
            data: cachedResult
          };
          return res.json(response);
        }
      }

      // Perform fresh analysis
      console.log(`Analyzing team ${teamId}...`);
      const analysisResult = await analysisEngine.analyzeTeam(teamId);
      
      // Cache the result
      await storage.setAnalysisResult(teamId, analysisResult);
      await storage.setCacheTimestamp(teamId, now);
      
      console.log(`Analysis complete for team ${teamId}`);
      
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

  // Enhanced Phase 1: Data provider status endpoint
  app.get("/api/providers/status", async (req, res) => {
    try {
      const oddsService = await import('./services/oddsService');
      const statsService = await import('./services/statsService');
      
      const odds = oddsService.OddsService.getInstance();
      const stats = statsService.StatsService.getInstance();
      
      const status = {
        odds: odds.getProviderInfo(),
        stats: stats.getProviderInfo(),
        simulation: {
          name: 'monte-carlo',
          available: true,
          defaultRuns: 1000
        },
        lastUpdated: new Date().toISOString()
      };
      
      res.json({ success: true, data: status });
    } catch (error) {
      console.error('Provider status error:', error);
      res.status(500).json({ success: false, error: 'Failed to get provider status' });
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

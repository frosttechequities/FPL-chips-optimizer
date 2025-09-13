import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { 
  analyzeTeamRequestSchema, 
  planTransfersRequestSchema,
  type AnalyzeTeamResponse,
  type PlanTransfersResponse 
} from "@shared/schema";
import { AnalysisEngine } from "./services/analysisEngine";
import { TransferEngine } from "./services/transferEngine";

const analysisEngine = new AnalysisEngine();
const transferEngine = new TransferEngine();

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
      // Clear analysis cache and FPL API cache
      const fplApi = await import('./services/fplApi');
      const apiService = fplApi.FPLApiService.getInstance();
      apiService.clearCache();
      
      res.json({ success: true, message: 'Cache cleared successfully' });
    } catch (error) {
      console.error('Cache clear error:', error);
      res.status(500).json({ success: false, error: 'Failed to clear cache' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

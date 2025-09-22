/**
 * AICopilotService - Phase 3 Enhancement
 * 
 * Main AI co-pilot service that orchestrates natural language processing,
 * analysis coordination, and intelligent response generation for FPL strategy.
 */

import { NaturalLanguageProcessor } from './naturalLanguageProcessor';
import { AnalysisEngine } from './analysisEngine';
import { MLPredictionEngine } from './mlPredictionEngine';
import { TransferEngine } from './transferEngine';
import { CompetitiveIntelligenceEngine } from './competitiveIntelligenceEngine';
import { StrategyAgent } from './strategyAgent';
import { OpenRouterService } from './openRouterService';
import { 
  ChatMessage, 
  ConversationContext, 
  QueryIntent, 
  AICopilotResponse, 
  AIInsight,
  ProcessedPlayer 
} from '@shared/schema';

interface ConversationSession {
  context: ConversationContext;
  lastActivity: Date;
}

export class AICopilotService {
  private static instance: AICopilotService;
  private nlProcessor: NaturalLanguageProcessor;
  private analysisEngine: AnalysisEngine;
  private mlEngine: MLPredictionEngine;
  private competitiveEngine: CompetitiveIntelligenceEngine;
  private strategyAgent: StrategyAgent;
  private llmService: OpenRouterService;
  private transferEngine: TransferEngine;
  private sessions = new Map<string, ConversationSession>();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly ANALYSIS_CACHE_TTL_MS = 5 * 60 * 1000; // reuse fresh analysis within 5 minutes

  private constructor() {
    this.nlProcessor = NaturalLanguageProcessor.getInstance();
    this.analysisEngine = new AnalysisEngine();
    this.mlEngine = MLPredictionEngine.getInstance();
    this.competitiveEngine = CompetitiveIntelligenceEngine.getInstance();
    this.strategyAgent = StrategyAgent.getInstance();
    this.llmService = OpenRouterService.getInstance();
    this.transferEngine = new TransferEngine();
    
    // Clean up expired sessions periodically
    setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000); // Every 5 minutes
  }

  public static getInstance(): AICopilotService {
    if (!AICopilotService.instance) {
      AICopilotService.instance = new AICopilotService();
    }
    return AICopilotService.instance;
  }

  /**
   * Process a natural language chat message and generate intelligent response
   */
  async processChatMessage(
    message: string, 
    sessionId: string, 
    teamId?: string,
    userId?: string,
    requestId?: string
  ): Promise<AICopilotResponse> {
    const startTime = Date.now();
    
    try {
      // Get or create conversation context
      const context = await this.getOrCreateContext(sessionId, teamId, userId);
      
      // Process the natural language query
      const nlpStart = Date.now();
      const intent = await this.nlProcessor.processQuery(message);
      const nlpMs = Date.now() - nlpStart;
      
      // Check confidence threshold for clarification (per-intent thresholds)
      const getConfidenceThreshold = (intentType: string): number => {
        switch (intentType) {
          case 'squad_analysis': return 35;
          case 'player_advice': return 40; // Lower threshold for specific player questions
          case 'chip_strategy':
          case 'player_comparison':
          case 'transfer_suggestions':
          case 'fixture_analysis': return 45;
          case 'general_advice': return 50;
          default: return 40;
        }
      };
      
      const threshold = getConfidenceThreshold(intent.type);
      if (intent.confidence < threshold) {
        const clarificationMessage = this.nlProcessor.generateClarificationQuestion(message, intent.entities);
        
        return {
          message: clarificationMessage,
          insights: [],
          suggestions: [
            "Try being more specific about what you're asking",
            "Mention specific players, gameweeks, or chips if relevant",
            "Ask about a particular aspect like transfers, analysis, or strategy"
          ],
          followUpQuestions: [
            "What specific FPL help do you need?",
            "Are you looking for squad analysis, transfer advice, or chip timing?",
            "Do you have a Team ID for personalized advice?"
          ],
          conversationContext: {
            intent,
            responseTime: Date.now() - startTime,
            modelVersion: 'ai-copilot-v3.0'
          }
        };
      }
      
      // Add user message to conversation history
      const userMessage: ChatMessage = {
        id: this.generateMessageId(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        metadata: {
          queryType: this.mapIntentToQueryType(intent.type),
          confidence: intent.confidence
        }
      };
      context.messages.push(userMessage);
      
      // Generate response based on intent
      const llmStart = Date.now();
      const response = await this.generateResponse(intent, context);
      const llmMs = Date.now() - llmStart;
      
      // Add assistant response to conversation history
      const assistantMessage: ChatMessage = {
        id: this.generateMessageId(),
        role: 'assistant',
        content: response.message,
        timestamp: new Date().toISOString(),
        metadata: {
          processingTime: Date.now() - startTime,
          confidence: response.analysisPerformed?.confidence || intent.confidence
        }
      };
      context.messages.push(assistantMessage);
      
      // Update session
      context.lastUpdated = new Date().toISOString();
      this.updateSession(sessionId, context);
      
      return {
        ...response,
          conversationContext: {
            intent,
            responseTime: Date.now() - startTime,
            modelVersion: 'ai-copilot-v3.0',
            requestId,
            nlpMs,
            llmMs
          }
        };
      
    } catch (error) {
      console.error('AI Copilot processing error:', error);
      
      return {
        message: "I apologize, but I'm having trouble processing your request right now. Could you try rephrasing your question about your FPL strategy?",
        insights: [],
        suggestions: [
          "Try asking about specific players or transfers",
          "Ask for chip strategy advice",
          "Request a squad analysis"
        ],
        followUpQuestions: [
          "Would you like me to analyze your current squad?",
          "Are you looking for transfer suggestions?",
          "Do you need help with chip timing?"
        ],
        conversationContext: {
          intent: {
            type: 'general_advice',
            entities: {},
            confidence: 20,
            originalQuery: message,
            processedQuery: message
          },
          responseTime: Date.now() - startTime,
          modelVersion: 'ai-copilot-v3.0-fallback'
        }
      };
    }
  }

  /**
   * Generate intelligent response based on query intent
   */
  private async generateResponse(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    // Try to generate LLM-enhanced response first
    if (this.llmService.isConfigured()) {
      try {
        return await this.generateLLMEnhancedResponse(intent, context);
      } catch (error) {
        console.warn('LLM generation failed, falling back to static responses:', error);
        // Fall through to static responses
      }
    }

    // Fallback to static responses
    switch (intent.type) {
      case 'squad_analysis':
        return this.handleSquadAnalysis(intent, context);
      
      case 'player_advice':
        return this.handlePlayerAdvice(intent, context);
      
      case 'chip_strategy':
        return this.handleChipStrategy(intent, context);
      
      case 'transfer_suggestions':
        return this.handleTransferSuggestions(intent, context);
      
      case 'player_comparison':
        return this.handlePlayerComparison(intent, context);
      
      case 'fixture_analysis':
        return this.handleFixtureAnalysis(intent, context);
      
      case 'general_advice':
      default:
        return this.handleGeneralAdvice(intent, context);
    }
  }

  /**
   * Generate LLM-enhanced response with live FPL data (RAG Architecture)
   */
  private async generateLLMEnhancedResponse(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    // Fetch LIVE FPL data for accurate responses (RAG approach)
    let analysisData: any = null;
    let squadData: any = null;
    let recommendations: any[] = [];
    let liveFPLData: any = null;

    try {
      // Always get fresh analysis data to prevent hallucinations
      if (context.teamId) {
        const now = Date.now();
        const cache = context.currentAnalysis;
        if (cache && cache.teamId === context.teamId && cache.teamData) {
          const last = cache.lastAnalyzed ? Date.parse(cache.lastAnalyzed) : 0;
          if (last && now - last < this.ANALYSIS_CACHE_TTL_MS) {
            analysisData = cache.teamData;
          }
        }

        if (!analysisData) {
          analysisData = await this.analysisEngine.analyzeTeam(context.teamId);
          context.currentAnalysis = {
            ...(cache || {}),
            teamId: context.teamId,
            teamData: analysisData,
            lastAnalyzed: new Date(now).toISOString()
          };
        }

        if (context.currentAnalysis) {
          this.updateSession(context.sessionId, context);
        }

        squadData = {
          teamValue: analysisData.budget?.teamValue || 100,
          bank: analysisData.budget?.bank || 0,
          freeTransfers: analysisData.budget?.freeTransfers || 1,
          teamName: analysisData.teamName || 'Your team'
        };
        recommendations = analysisData.recommendations || [];

        // Extract live player data for context with enhanced details
        liveFPLData = {
          players: analysisData.players?.slice(0, 15).map((p: any) => ({
            name: p.name,
            position: p.position,
            team: p.team,
            price: p.price,
            points: p.points,
            expectedPoints: p.expectedPoints,
            form: p.volatility || 0,
            isStarter: p.isStarter,
            isBench: p.isBench,
            // Enhanced stats for better AI context
            totalPoints: p.totalPoints || p.points,
            goals: p.goals || 0,
            assists: p.assists || 0,
            cleanSheets: p.cleanSheets || 0,
            bonusPoints: p.bonusPoints || 0,
            priceChange: p.priceChange || 0,
            ownership: p.ownership || 0,
            // Recent form data
            recentForm: p.recentForm || [],
            // Fixture difficulty for next 3 gameweeks
            upcomingFDR: p.upcomingFDR || [],
            // Value metrics
            valueScore: p.valueScore || 0,
            pointsPerMillion: p.pointsPerMillion || 0
          })) || [],
          nextFixtures: analysisData.gameweeks?.slice(0, 3).map((gw: any) => ({
            gameweek: gw.gameweek,
            difficulty: gw.difficulty,
            averageFDR: gw.averageFDR,
            keyFixtures: gw.fixtures?.slice(0, 5).map((f: any) => ({
              player: f.playerName,
              opponent: f.opponent,
              isHome: f.isHome,
              fdr: f.fdr,
              gameweek: gw.gameweek
            })) || [],
            // Additional fixture context
            totalFixtures: gw.fixtures?.length || 0,
            homeFixtures: gw.fixtures?.filter((f: any) => f.isHome).length || 0,
            awayFixtures: gw.fixtures?.filter((f: any) => !f.isHome).length || 0
          })) || [],
          chipRecommendations: recommendations.slice(0, 3).map((r: any) => ({
            chip: r.chipType,
            gameweek: r.gameweek,
            priority: r.priority,
            reasoning: r.reasoning?.slice(0, 2) || [],
            confidence: r.confidence || 0
          })),
          // Additional context for better AI responses
          currentGameweek: analysisData.currentGameweek || 1,
          seasonProgress: analysisData.seasonProgress || 0,
          teamRank: analysisData.teamRank || 0,
          overallRank: analysisData.overallRank || 0,
          // Transfer budget context
          transferBudget: analysisData.budget?.bank || 0,
          freeTransfers: analysisData.budget?.freeTransfers || 1,
          // Key insights for AI
          keyInsights: analysisData.insights?.slice(0, 5) || [],
          // Recent performance trends
          recentPerformance: analysisData.recentPerformance || {}
        };
      } else {
        // No Team ID available - return data request message instead of proceeding
        return {
          message: "I'd love to help with your FPL strategy! To give you accurate, personalized advice about players like Watkins, I need to analyze your actual squad first. Could you please provide your Team ID so I can see your current players, their prices, and upcoming fixtures?",
          insights: [],
          suggestions: [
            "Share your FPL Team ID for personalized analysis",
            "You can find your Team ID in the FPL app/website URL",
            "Once I have your squad data, I can give specific advice about your players"
          ],
          followUpQuestions: [
            "What's your FPL Team ID?",
            "Would you like help finding your Team ID?",
            "Are you looking for general FPL advice instead?"
          ]
        };
      }
    } catch (error) {
      console.warn('Failed to get live FPL data for AI context:', error);
      // Return data unavailable message instead of proceeding without data
      return {
        message: "I'm having trouble accessing your FPL data right now. To give you accurate advice about specific players, I need access to current squad and fixture information. Please try again in a moment, or provide your Team ID if you haven't already.",
        insights: [],
        suggestions: [
          "Try your question again in a moment",
          "Double-check your Team ID if provided",
          "Ask a general FPL strategy question instead"
        ],
        followUpQuestions: [
          "Would you like to try again?",
          "Do you have a different Team ID to try?",
          "Can I help with general FPL strategy instead?"
        ]
      };
    }

    // Build conversation history for context
    const conversationHistory = context.messages
      .slice(-6) // Last 6 messages for context
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

    // Get the user's current query
    const currentQuery = context.messages[context.messages.length - 1]?.content || intent.originalQuery;

    // Try structured response first (preferred for accuracy) - be more aggressive about using it
    const structuredStart = Date.now();
    let structured: any = null;
    let finalMessage: string = '';
    const dataUsed: string[] = ['fpl_data'];

    try {
      structured = await this.llmService.generateFPLStructuredResponse(
        currentQuery,
        { intent: intent.type, entities: intent.entities, squadData, analysisData, recommendations, liveFPLData },
        conversationHistory
      );
    } catch (error) {
      console.warn('Structured response generation failed:', error);
    }

    const structuredMs = Date.now() - structuredStart;

    // Use structured response if we have ANY valid data - be more aggressive
    if (structured && structured.recommendation && structured.recommendation.trim().length > 5) {
      console.log(`[AI Copilot] Using structured response (${structuredMs}ms)`);
      dataUsed.push('llm_structured');
      finalMessage = this.llmService.formatStructuredToText(
        structured,
        { intent: intent.type, entities: intent.entities, squadData, analysisData, recommendations, liveFPLData }
      );

      // Use structured response even if it's short, as long as it's valid
      if (finalMessage && finalMessage.length > 10) {
        console.log(`[AI Copilot] Structured response successful (${finalMessage.length} chars)`);
      } else {
        console.log(`[AI Copilot] Structured response too short, trying free-form`);
        structured = null; // Force fallback only if too short
      }
    } else {
      console.log(`[AI Copilot] No valid structured response, using free-form`);
    }

    // Only fallback to free-form if structured completely failed
    if (!structured || !finalMessage || finalMessage.length < 20) {
      console.log(`[AI Copilot] Structured failed or too short, using free-form (${structuredMs}ms)`);
      const freeformStart = Date.now();
      try {
        finalMessage = await this.llmService.generateFPLResponse(
          currentQuery,
          { intent: intent.type, entities: intent.entities, squadData, analysisData, recommendations, liveFPLData },
          conversationHistory
        );
        const freeformMs = Date.now() - freeformStart;
        console.log(`[AI Copilot] Free-form response generated (${freeformMs}ms, ${finalMessage.length} chars)`);
        dataUsed.push('llm_text');
      } catch (error) {
        console.warn('Free-form LLM generation failed, using rule-based fallback:', error);
        finalMessage = this.generateRuleBasedSummary({ analysisData, squadData }) || 'I apologize, but I\'m having trouble generating a response right now. Please try again.';
      }
    }
    // Final message is already set above
    // No additional processing needed here

    // Generate insights based on analysis data
    const insights: AIInsight[] = [];
    if (analysisData?.insights) {
      insights.push(...analysisData.insights);
    }

    // Generate dynamic suggestions based on intent
    const suggestions = this.generateDynamicSuggestions(intent, analysisData);
    
    // Generate dynamic follow-up questions
    const followUpQuestions = this.generateDynamicFollowUps(intent, context);

    return {
      message: finalMessage,
      insights,
      suggestions,
      followUpQuestions,
      analysisPerformed: analysisData ? {
        type: intent.type as any,
        confidence: Math.min(95, intent.confidence + 15), // Boost confidence for LLM responses
        dataUsed: Array.from(new Set(dataUsed))
      } : undefined
    };
  }

  /**
   * Generate dynamic suggestions based on intent and analysis
   */
  private generateDynamicSuggestions(intent: QueryIntent, analysisData: any): string[] {
    const suggestions: string[] = [];

    switch (intent.type) {
      case 'squad_analysis':
        if (analysisData?.recommendations) {
          suggestions.push(...analysisData.recommendations.slice(0, 3).map((r: any) => r.content || r.title));
        }
        suggestions.push("Consider upcoming fixture difficulty", "Look for differential picks");
        break;
      
      case 'player_advice':
        suggestions.push("Check player's underlying stats and form trends", "Consider upcoming fixture difficulty for this player", "Look at similar-priced alternatives if needed");
        break;
      
      case 'chip_strategy':
        suggestions.push("Consider fixture swings for optimal timing", "Plan around double gameweeks", "Coordinate with transfer strategy");
        break;
      
      case 'transfer_suggestions':
        suggestions.push("Check player price trends", "Consider fixture difficulty", "Look at ownership percentages");
        break;
      
      case 'player_comparison':
        suggestions.push("Compare expected points and form", "Check upcoming fixtures", "Consider value for money");
        break;
      
      case 'fixture_analysis':
        suggestions.push("Identify fixture swings", "Plan transfer timing", "Consider captaincy rotation");
        break;
      
      default:
        suggestions.push("Try asking about specific players or strategies", "Share your Team ID for personalized advice");
    }

    return suggestions.slice(0, 4); // Limit to 4 suggestions
  }

  /**
   * Generate dynamic follow-up questions based on context
   */
  private generateDynamicFollowUps(intent: QueryIntent, context: ConversationContext): string[] {
    const questions: string[] = [];

    switch (intent.type) {
      case 'squad_analysis':
        questions.push("Would you like specific transfer recommendations?", "Should I analyze your chip timing strategy?", "Want to see how your players compare to popular picks?");
        break;
      
      case 'player_advice':
        questions.push("Should I analyze alternatives to this player?", "Want me to check transfer timing for this move?", "Would you like captaincy advice for upcoming fixtures?");
        break;
      
      case 'chip_strategy':
        questions.push("Want details about a specific chip recommendation?", "Should I analyze the best captaincy options?", "Need help planning transfers before using chips?");
        break;
      
      case 'transfer_suggestions':
        questions.push("Want me to analyze specific transfer options?", "Should I check if any transfers would improve your fixtures?", "Need help timing transfers around price changes?");
        break;
      
      case 'player_comparison':
        questions.push("Which specific aspect should I focus on - form, fixtures, or value?", "Want me to include more players in the comparison?", "Should I consider your current squad context?");
        break;
      
      case 'fixture_analysis':
        questions.push("Want to see specific team fixture runs?", "Should I identify the best chip timing based on fixtures?", "Need help with captaincy based on fixtures?");
        break;
      
      default:
        if (!context.teamId) {
          questions.push("What's your FPL Team ID for personalized advice?");
        }
        questions.push("What specific FPL challenge are you facing?", "Are you planning for this gameweek or longer term?");
    }

    return questions.slice(0, 3); // Limit to 3 questions
  }

  /**
   * Handle squad analysis requests
   */
  private async handleSquadAnalysis(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    if (!context.teamId) {
      return {
        message: "I'd love to analyze your squad! Could you please provide your FPL Team ID so I can access your current players and give you personalized insights?",
        insights: [],
        suggestions: [
          "You can find your Team ID in the FPL app or website",
          "Once I have your Team ID, I can provide detailed analysis",
          "I'll analyze your players, fixtures, and suggest improvements"
        ],
        followUpQuestions: [
          "What's your FPL Team ID?",
          "Are you looking for any specific type of analysis?"
        ]
      };
    }

    try {
      // Perform comprehensive analysis
      const analysis = await this.analysisEngine.analyzeTeam(context.teamId);
      
      // Generate insights based on analysis
      const insights = await this.generateSquadInsights(analysis);
      
      // Create response message
      const message = this.formatSquadAnalysisMessage(analysis, insights);
      
      return {
        message,
        insights,
        suggestions: this.generateSquadSuggestions(analysis),
        followUpQuestions: [
          "Would you like specific transfer recommendations?",
          "Should I analyze your chip timing strategy?",
          "Want to see how your players compare to popular picks?"
        ],
        analysisPerformed: {
          type: 'squad_analysis',
          confidence: analysis.confidenceLevel || 75,
          dataUsed: ['fpl_data', 'simulation', 'ml_predictions', 'competitive_intelligence']
        }
      };
      
    } catch (error) {
      console.error('Squad analysis error:', error);
      return {
        message: "I couldn't analyze your squad right now. Please check your Team ID and try again.",
        insights: [],
        suggestions: ["Verify your Team ID is correct", "Try again in a moment"],
        followUpQuestions: ["What's your correct Team ID?"]
      };
    }
  }

  /**
   * Handle player-specific advice requests
   */
  private async handlePlayerAdvice(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    const playerMentioned = intent.entities.players?.[0];
    
    if (!playerMentioned) {
      return {
        message: "I can help with specific player advice! Could you mention which player you're asking about?",
        insights: [],
        suggestions: [
          "Mention a specific player name for personalized analysis",
          "Ask about keeping, selling, or starting a particular player",
          "Share your Team ID for more accurate advice"
        ],
        followUpQuestions: [
          "Which player do you need advice about?",
          "Are you considering selling or keeping a specific player?",
          "What's your FPL Team ID for detailed analysis?"
        ]
      };
    }

    if (!context.teamId) {
      return {
        message: `I'd love to give you specific advice about ${playerMentioned}! For the most accurate recommendation, I need your Team ID to see if you own them, their purchase price, and how they fit in your overall squad strategy.`,
        insights: [],
        suggestions: [
          "Share your Team ID for personalized player analysis",
          "I can analyze form, fixtures, and value with your squad context",
          "Get specific advice on whether to keep, sell, or start the player"
        ],
        followUpQuestions: [
          "What's your FPL Team ID?",
          `Are you currently considering selling ${playerMentioned}?`,
          `Do you want general advice about ${playerMentioned}'s upcoming fixtures?`
        ]
      };
    }

    try {
      // Get squad analysis to find the specific player
      const analysis = await this.analysisEngine.analyzeTeam(context.teamId);
      const targetPlayer = analysis.players.find(p => 
        p.name.toLowerCase().includes(playerMentioned.toLowerCase()) || 
        playerMentioned.toLowerCase().includes(p.name.toLowerCase())
      );

      if (!targetPlayer) {
        return {
          message: `I couldn't find ${playerMentioned} in your current squad. Would you like advice about bringing them in, or did you mean a different player?`,
          insights: [],
          suggestions: [
            `Consider adding ${playerMentioned} to your transfer list`,
            "Double-check the player name spelling",
            "Ask about a different player in your squad"
          ],
          followUpQuestions: [
            `Should I analyze bringing ${playerMentioned} into your squad?`,
            "Which player in your current squad are you asking about?",
            "Would you like transfer suggestions instead?"
          ]
        };
      }

      // Enhanced player analysis using advanced engines
      const playerAnalysis = await this.analyzePlayerWithAdvancedEngines(targetPlayer, analysis);
      
      // Generate targeted insights for this specific player
      const insights = await this.generatePlayerSpecificInsights(targetPlayer, playerAnalysis);
      
      // Create comprehensive advice message
      const message = this.formatPlayerAdviceMessage(targetPlayer, playerAnalysis, intent.originalQuery);
      
      return {
        message,
        insights,
        suggestions: this.generatePlayerSpecificSuggestions(targetPlayer, playerAnalysis),
        followUpQuestions: [
          `Should I analyze alternative players to ${targetPlayer.name}?`,
          "Do you want transfer timing advice for this player?",
          "Would you like to see their fixture analysis?"
        ],
        analysisPerformed: {
          type: 'player_advice',
          confidence: Math.min(95, intent.confidence + 20), // High confidence for specific player advice
          dataUsed: ['fpl_data', 'openFPL_engine', 'monte_carlo_sim', 'effective_ownership', 'ml_predictions']
        }
      };
      
    } catch (error) {
      console.error('Player advice error:', error);
      return {
        message: `I'm having trouble analyzing ${playerMentioned} right now. Please try again in a moment, or ask about a different aspect of your FPL strategy.`,
        insights: [],
        suggestions: [
          "Try your question again in a moment", 
          "Ask about your overall squad analysis instead",
          "Check a different player in your squad"
        ],
        followUpQuestions: [
          "Would you like general squad advice instead?",
          "Should I analyze a different player?",
          "Do you want chip timing recommendations?"
        ]
      };
    }
  }

  /**
   * Handle chip strategy questions
   */
  private async handleChipStrategy(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    const chipRequested = intent.entities.chips?.[0];
    const gameweekRequested = intent.entities.gameweeks?.[0];
    
    if (chipRequested) {
      return this.generateChipSpecificAdvice(chipRequested, gameweekRequested, context);
    }
    
    if (!context.teamId) {
      return {
        message: "For personalized chip strategy, I'll need your Team ID to analyze your squad and fixtures. In general, here's my chip timing advice:",
        insights: this.generateGeneralChipInsights(),
        suggestions: [
          "Wildcard: Use during fixture swings or international breaks",
          "Bench Boost: Target gameweeks with good bench player fixtures",
          "Triple Captain: Pick explosive players with great home fixtures",
          "Free Hit: Save for blank/double gameweeks"
        ],
        followUpQuestions: [
          "What's your Team ID for personalized chip advice?",
          "Which specific chip are you considering?",
          "Do you want to know about double gameweeks?"
        ]
      };
    }

    try {
      const analysis = await this.analysisEngine.analyzeTeam(context.teamId);
      const chipRecommendations = analysis.recommendations;
      
      const message = this.formatChipStrategyMessage(chipRecommendations);
      const insights = this.generateChipInsights(chipRecommendations);
      
      return {
        message,
        insights,
        suggestions: chipRecommendations.map(rec => `${rec.chipType} in GW${rec.gameweek}: ${rec.reasoning.join(', ')}`),
        followUpQuestions: [
          "Want details about a specific chip recommendation?",
          "Should I analyze the best captaincy options?",
          "Need help planning transfers before using chips?"
        ]
      };
      
    } catch (error) {
      console.error('Chip strategy error:', error);
      return {
        message: "I couldn't analyze your chip strategy right now. Here's some general advice:",
        insights: this.generateGeneralChipInsights(),
        suggestions: ["Check your Team ID", "Consider fixture congestion periods"],
        followUpQuestions: ["Which chip are you most interested in?"]
      };
    }
  }

  /**
   * Handle transfer suggestion requests
   */

  private async handleTransferSuggestions(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    if (!context.teamId) {
      return {
        message: "I'd love to suggest transfers! Please provide your Team ID so I can see your current squad and recommend the best moves.",
        insights: [],
        suggestions: [
          "I'll analyze your squad value and free transfers",
          "Consider player form, fixtures, and ownership",
          "Look for injury updates and rotation risks"
        ],
        followUpQuestions: [
          "What's your FPL Team ID?",
          "Do you have any budget constraints?",
          "Any specific players you're considering?"
        ]
      };
    }

    const latestText = (context.messages[context.messages.length - 1]?.content || '').toLowerCase();
    const focusDef = latestText.includes('defence') || latestText.includes('defence') || latestText.includes('def');

    try {
      const analysis = await this.analysisEngine.analyzeTeam(context.teamId);
      const rosterById = new Map<number, any>((analysis.players || []).map((p: any) => [p.id, p]));
      const ownedIds = new Set<number>((analysis.players || []).map((p: any) => p.id));
      const budget = analysis.budget?.bank ?? 0;
      const freeTransfers = analysis.budget?.freeTransfers ?? 1;
      const gameweeks = analysis.gameweeks ?? [];

      const plans = await this.transferEngine.generateTransferPlans(
        analysis.players,
        budget,
        freeTransfers,
        { targetGameweek: gameweeks[0]?.gameweek ?? 1, chipType: undefined, maxHits: 0, includeRiskyMoves: false, gameweeks }
      );

      let planMessage: string | null = null;
      if (plans.length > 0) {
        let topPlan = plans.find(p => p.moves.length > 0) ?? null;
        if (topPlan) {
          let cleanMoves = topPlan.moves.filter(m => !ownedIds.has(m.inPlayerId));
          if (focusDef) {
            cleanMoves = cleanMoves.filter(m => (rosterById.get(m.outPlayerId)?.position) === 'DEF');
          }
          if (cleanMoves.length === 0) {
            const alt = plans.slice(1).find(p => p.moves.some(m => !ownedIds.has(m.inPlayerId)));
            if (alt) {
              topPlan = alt;
              cleanMoves = topPlan.moves.filter(m => !ownedIds.has(m.inPlayerId) && (!focusDef || (rosterById.get(m.outPlayerId)?.position) === 'DEF'));
            }
          }
          if (cleanMoves.length > 0) {
            const lines = cleanMoves.slice(0, 3).map(move => {
              const outName = rosterById.get(move.outPlayerId)?.name || 'Player';
              const inName = rosterById.get(move.inPlayerId)?.name || 'Player';
              return `Out: ${outName} -> In: ${inName} (+${(move.expectedGain || 0).toFixed(1)} pts)`;
            });
            planMessage = [
              focusDef ? 'Top defense upgrades without hits:' : `Top upgrades without hits (budget ${budget.toFixed(1)}m, ${freeTransfers} FT):`,
              ...lines,
              `Projected net gain: ${((topPlan as any).totalExpectedGain || 0).toFixed(1)} pts`
            ].join('\n');
          }
        }
      }

      const competitiveReport = await this.competitiveEngine.generateIntelligenceReport(analysis.players || [], 5).catch(() => null);
      const transferTargets = competitiveReport?.transferTargets || [];
      const insights = this.generateTransferInsights(analysis, transferTargets);
      const baseMessage = this.formatTransferSuggestionsMessage(analysis, transferTargets);

      const strategyPlan = await this.strategyAgent.recommendTransfers({
        analysis,
        focus: focusDef ? 'defence' : 'balanced',
        intentType: intent.type,
      });

      const composedMessageParts: string[] = [baseMessage];
      if (planMessage) composedMessageParts.push('', planMessage);
      if (strategyPlan) composedMessageParts.push('', ...strategyPlan.narrative);
      const message = composedMessageParts.join('\n').trim();

      const suggestions = [
        ...transferTargets.slice(0, 5).map(target => `${target.playerName}: ${target.reason} (${target.priority} priority)`),
      ];
      if (planMessage) {
        suggestions.push('Prioritise upgrades that deliver positive expected gain');
      }
      if (strategyPlan) {
        suggestions.push('Leverage differentials highlighted by the policy agent');
      }

      const followUps: string[] = [
        'Want me to analyze specific transfer options?',
        'Should I check if any transfers would improve your fixtures?',
        'Need help timing transfers around price changes?'
      ];
      if (strategyPlan) {
        followUps.push(...strategyPlan.followUps);
      }

      return {
        message,
        insights,
        suggestions: Array.from(new Set(suggestions)).slice(0, 6),
        followUpQuestions: Array.from(new Set(followUps)).slice(0, 6),
        explanations: strategyPlan ? [strategyPlan.explanation] : undefined,
        analysisPerformed: {
          type: 'transfer_suggestions',
          confidence: strategyPlan?.explanation.confidence ?? 70,
          dataUsed: [
            'transfer_engine',
            'strategy_agent',
            'competitive_intelligence'
          ]
        }
      };

    } catch (error) {
      console.error('Transfer suggestions error:', error);
      return {
        message: "I'm having trouble accessing transfer data right now. Here's some general transfer advice:",
        insights: [],
        suggestions: [
          "Check player form over the last 5 gameweeks",
          "Consider upcoming fixture difficulty",
          "Monitor injury news and rotation risks"
        ],
        followUpQuestions: ["Which position needs strengthening?"],
        explanations: [
          {
            title: 'Why no personalised plan?',
            summary: 'The policy agent could not access up-to-date squad data, so only generic guidance is provided.',
            confidence: 40,
            factors: [
              {
                feature: 'data_availability',
                value: 0,
                baseline: 1,
                contribution: -1,
                weight: 1,
                impact: 'negative',
                description: 'Squad analysis unavailable or failed.'
              }
            ]
          }
        ]
      };
    }
  }

  /**
   * Handle other intent types (simplified for now)
   */
  private async handlePlayerComparison(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    const players = intent.entities.players || [];
    
    return {
      message: players.length >= 2 
        ? `Let me compare ${players.join(' vs ')} for you. I'll analyze their form, fixtures, value, and ML predictions.`
        : "I can help you compare players! Which specific players are you trying to choose between?",
      insights: [],
      suggestions: [
        "Consider current form and fixture difficulty",
        "Check ownership levels and differential potential",
        "Compare value for money and price trends"
      ],
      followUpQuestions: [
        "Which players do you want to compare?",
        "Are you looking at a specific position?",
        "What's your budget for this position?"
      ]
    };
  }

  private async handleFixtureAnalysis(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    const teams = intent.entities.teams || [];
    const gameweeks = intent.entities.gameweeks || [];
    
    return {
      message: "I'll analyze the upcoming fixtures and their difficulty ratings. This helps with transfer timing and chip strategy.",
      insights: [],
      suggestions: [
        "Look for fixture swings (hard to easy or vice versa)",
        "Identify good periods for chip usage",
        "Plan transfers around fixture congestion"
      ],
      followUpQuestions: [
        "Want to see specific team fixture runs?",
        "Should I identify the best chip timing based on fixtures?",
        "Need help with captaincy based on fixtures?"
      ]
    };
  }

  private async handleGeneralAdvice(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    return {
      message: "I'm your AI FPL assistant! I can help with squad analysis, chip strategy, transfer suggestions, and more. What would you like to know?",
      insights: [],
      suggestions: [
        "Ask me to analyze your squad",
        "Get personalized chip timing advice", 
        "Request transfer recommendations",
        "Compare different players"
      ],
      followUpQuestions: [
        "What's your current FPL rank?",
        "Which aspect of FPL do you struggle with most?",
        "Do you have your Team ID ready?"
      ]
    };
  }

  // Helper methods for generating insights and formatting responses would go here
  // (Implementation details for brevity - these would format the data appropriately)

  private generateSquadInsights(analysis: any): AIInsight[] {
    const insights: AIInsight[] = [];
    
    if (analysis.budget && analysis.budget.freeTransfers >= 2) {
      insights.push({
        type: 'opportunity',
        title: 'Transfer Opportunity',
        content: `You have ${analysis.budget.freeTransfers} free transfers available - perfect for squad optimization!`,
        priority: 'high',
        confidence: 85,
        reasoning: ['Multiple free transfers reduce point deductions', 'Good time for strategic squad changes'],
        actionItems: ['Consider upgrading underperforming players', 'Look for fixture-favorable transfers'],
        lastUpdated: new Date().toISOString()
      });
    }
    
    if (analysis.players && analysis.players.length > 0) {
      const topPlayer = analysis.players
        .filter((p: any) => p.expectedPoints)
        .sort((a: any, b: any) => (b.expectedPoints || 0) - (a.expectedPoints || 0))[0];
      
      if (topPlayer) {
        insights.push({
          type: 'recommendation',
          title: 'Top Performer',
          content: `${topPlayer.name} is your highest expected points scorer with ${topPlayer.expectedPoints?.toFixed(1)} projected points.`,
          priority: 'medium',
          confidence: 75,
          reasoning: ['Based on form, fixtures, and statistical analysis'],
          relatedData: { players: [topPlayer.id], expectedPoints: topPlayer.expectedPoints },
          lastUpdated: new Date().toISOString()
        });
      }
    }
    
    return insights;
  }

  private formatSquadAnalysisMessage(analysis: any, insights: AIInsight[]): string {
    const playerCount = analysis.players?.length || 15;
    const totalValue = analysis.budget?.teamValue || 100;
    const bankAmount = analysis.budget?.bank || 0;
    const freeTransfers = analysis.budget?.freeTransfers || 1;

    let message = `Your squad analysis is complete! I've analyzed your ${playerCount} players using advanced simulation and ML models.\n\n`;

    message += `**Squad Overview:**\n`;
    message += `- Team Value: £${totalValue.toFixed(1)}m\n`;
    message += `- Bank: £${bankAmount.toFixed(1)}m\n`;
    message += `- Free Transfers: ${freeTransfers}\n\n`;

    if (insights.length > 0) {
      message += `**Key Insights:**\n`;
      insights.slice(0, 2).forEach(insight => {
        message += `- ${insight.title}: ${insight.content}\n`;
      });
      message += `\n`;
    }

    if (analysis.recommendations && analysis.recommendations.length > 0) {
      const topChip = analysis.recommendations[0];
      message += `**Top Recommendation:** ${topChip.chipType} in GW${topChip.gameweek} (${topChip.confidence}% confidence)`;
    }

    return message;
  }

  private generateSquadSuggestions(analysis: any): string[] {
    const suggestions = [];
    
    if (analysis.budget?.freeTransfers >= 2) {
      suggestions.push(`Use ${analysis.budget.freeTransfers} free transfers to optimize your squad`);
    }
    
    if (analysis.budget?.bank >= 2) {
      suggestions.push(`Upgrade a player with your £${analysis.budget.bank.toFixed(1)}m bank`);
    }
    
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      const nextChip = analysis.recommendations[0];
      suggestions.push(`Consider ${nextChip.chipType} in GW${nextChip.gameweek}`);
    }
    
    if (analysis.gameweeks && analysis.gameweeks.length > 0) {
      const difficultGW = analysis.gameweeks.find((gw: any) => gw.averageFDR > 3.5);
      if (difficultGW) {
        suggestions.push(`Plan transfers before GW${difficultGW.gameweek} (difficult fixtures)`);
      }
    }
    
    // Add some fallback suggestions if none of the above apply
    if (suggestions.length === 0) {
      suggestions.push("Monitor player form and injury news", "Consider fixture difficulty for transfers", "Plan your chip strategy");
    }
    
    return suggestions;
  }

  private async generateChipSpecificAdvice(chip: string, gameweek?: number, context?: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    const chipName = chip.toLowerCase().replace(/[^a-z]/g, '');
    
    const chipAdvice: Record<string, any> = {
      'wildcard': {
        message: 'Wildcard is perfect for major squad overhauls! Use it during fixture swings (around GW8-12 or GW16-20) when many teams have tough fixtures changing to easy ones.',
        suggestions: [
          'Target fixture swings for maximum impact',
          'Use during international breaks for planning time',
          'Consider player price rises before activating',
          'Plan 8-10 transfers for optimal value'
        ]
      },
      'benchboost': {
        message: 'Bench Boost works best in double gameweeks when your bench players have fixtures. Look for GWs where 4+ teams have doubles.',
        suggestions: [
          'Target double gameweeks with good bench fixtures',
          'Ensure all 15 players have games',
          'Use 1-2 transfers to optimize bench beforehand',
          'Consider defensive players for reliable points'
        ]
      },
      'triplecaptain': {
        message: 'Triple Captain multiplies your captain by 3x instead of 2x. Save it for explosive players with great home fixtures or double gameweeks.',
        suggestions: [
          'Target premium forwards/midfielders at home',
          'Use in double gameweeks for extra games',
          'Consider opponents defensive weaknesses',
          'Avoid using on defenders or goalkeepers'
        ]
      },
      'freehit': {
        message: 'Free Hit gives you a completely different team for one gameweek. Perfect for blank gameweeks or specific fixture optimization.',
        suggestions: [
          'Save for blank gameweeks (few teams play)',
          'Use when your players have terrible fixtures',
          'Target double gameweek players',
          'Plan the gameweek before to optimize your real team'
        ]
      }
    };
    
    const advice = chipAdvice[chipName] || chipAdvice['wildcard'];
    
    let message = advice.message;
    if (gameweek) {
      message += ` For GW${gameweek} specifically, I'd need to analyze the fixtures to give you targeted advice.`;
    }
    
    return {
      message,
      insights: [],
      suggestions: advice.suggestions,
      followUpQuestions: [
        gameweek ? `Is GW${gameweek} the right time for ${chip}?` : `Which gameweek are you considering for ${chip}?`,
        'Want me to analyze your squad to see if this chip fits your strategy?',
        'Should I check upcoming fixtures for optimal timing?'
      ]
    };
  }

  private generateGeneralChipInsights(): AIInsight[] {
    return [
      {
        type: 'recommendation',
        title: 'Chip Timing Strategy',
        content: 'Plan your chips around fixture difficulty swings and double gameweeks for maximum impact.',
        priority: 'medium',
        confidence: 80,
        reasoning: ['Historical data shows 15-20% better returns with strategic timing'],
        actionItems: ['Monitor fixture releases', 'Track double gameweek announcements'],
        lastUpdated: new Date().toISOString()
      },
      {
        type: 'warning',
        title: 'Early Chip Usage',
        content: 'Avoid using chips too early in the season. Wait for fixture swings and double gameweeks.',
        priority: 'medium', 
        confidence: 85,
        reasoning: ['More information available later in season', 'Better fixture predictability'],
        lastUpdated: new Date().toISOString()
      }
    ];
  }

  private formatChipStrategyMessage(recommendations: any[]): string {
    if (!recommendations || recommendations.length === 0) {
      return "I don't see any immediate chip recommendations for your squad. This could mean your current team is well-optimized for upcoming fixtures!";
    }
    
    const topRec = recommendations[0];
    let message = `Based on your squad and upcoming fixtures, here's my chip strategy recommendation:\n\n`;
    
    message += `🎯 **${topRec.chipType.toUpperCase()} in Gameweek ${topRec.gameweek}** (${topRec.confidence}% confidence)\n\n`;
    
    if (topRec.reasoning && topRec.reasoning.length > 0) {
      message += `**Why this works:**\n`;
      topRec.reasoning.slice(0, 3).forEach((reason: string) => {
        message += `• ${reason}\n`;
      });
    }
    
    if (topRec.expectedPoints) {
      message += `\n**Expected Impact:** ${topRec.expectedPoints.toFixed(1)} extra points`;
    }
    
    if (recommendations.length > 1) {
      message += `\n\n**Alternative:** ${recommendations[1].chipType} in GW${recommendations[1].gameweek} (${recommendations[1].confidence}% confidence)`;
    }
    
    return message;
  }

  private generateChipInsights(recommendations: any[]): AIInsight[] {
    return [];
  }

  private formatTransferSuggestionsMessage(analysis: any, targets: any[]): string {
    return "Here are my top transfer recommendations based on your squad analysis:";
  }

  private generateTransferInsights(analysis: any, targets: any[]): AIInsight[] {
    return [];
  }

  /**
   * Analyze specific player using advanced engines
   */
  private async analyzePlayerWithAdvancedEngines(player: ProcessedPlayer, analysis: any): Promise<any> {
    try {
      // Get OpenFPL prediction for the player
      const openFPLEngine = (await import('./openFPLEngine')).OpenFPLEngine.getInstance();
      const openFPLPrediction = await openFPLEngine.predictPlayer(player, analysis.gameweeks || [], player.advancedStats);
      console.info(`[TRACE][AI-Copilot] OpenFPL prediction used for player ${player.name || player.id}`);

      // Get Monte Carlo simulation results
      const monteCarloEngine = (await import('./monteCarloEngine')).MonteCarloEngine.getInstance();
      const monteCarloResult = await monteCarloEngine.simulatePlayer(player, analysis.gameweeks || [], player.advancedStats);
      console.info(`[TRACE][AI-Copilot] MonteCarloEngine.simulatePlayer used for player ${player.name || player.id}`);

      // Get Effective Ownership analysis
      const { EffectiveOwnershipEngine } = await import('./effectiveOwnershipEngine');
      const effectiveOwnershipEngine = EffectiveOwnershipEngine.getInstance();
      const ownershipData = effectiveOwnershipEngine.getOwnershipSnapshot(player);
      console.info(`[TRACE][AI-Copilot] EffectiveOwnershipEngine.getOwnershipSnapshot used for player ${player.name || player.id}`);

      return {
        openFPL: openFPLPrediction,
        monteCarlo: monteCarloResult,
        effectiveOwnership: ownershipData,
        fixtureAnalysis: this.analyzePlayerFixtures(player, analysis.gameweeks || []),
        recommendation: this.generatePlayerRecommendation(player, openFPLPrediction, monteCarloResult, ownershipData)
      };
    } catch (error) {
      console.warn('Advanced engine analysis failed, using fallback:', error);
      return {
        recommendation: 'hold',
        confidence: 60,
        reasoning: ['Unable to access full analysis engines', 'Based on basic fixture and form analysis']
      };
    }
  }

  /**
   * Generate LLM-enhanced response with live FPL data (RAG Architecture)
   */
  private async generateLLMEnhancedResponse(intent: QueryIntent, context: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    const startTime = Date.now();

    // Fetch LIVE FPL data for accurate responses (RAG approach)
    let analysisData: any = null;
    let squadData: any = null;
    let recommendations: any[] = [];
    let liveFPLData: any = null;

    try {
      // Always get fresh analysis data to prevent hallucinations
      if (context.teamId) {
        const now = Date.now();
        const cache = context.currentAnalysis;
        if (cache && cache.teamId === context.teamId && cache.teamData) {
          const last = cache.lastAnalyzed ? Date.parse(cache.lastAnalyzed) : 0;
          if (last && now - last < this.ANALYSIS_CACHE_TTL_MS) {
            analysisData = cache.teamData;
          }
        }

        if (!analysisData) {
          analysisData = await this.analysisEngine.analyzeTeam(context.teamId);
          context.currentAnalysis = {
            ...(cache || {}),
            teamId: context.teamId,
            teamData: analysisData,
            lastAnalyzed: new Date(now).toISOString()
          };
        }

        if (context.currentAnalysis) {
          this.updateSession(context.sessionId, context);
        }

        squadData = {
          teamValue: analysisData.budget?.teamValue || 100,
          bank: analysisData.budget?.bank || 0,
          freeTransfers: analysisData.budget?.freeTransfers || 1,
          teamName: analysisData.teamName || 'Your team'
        };
        recommendations = analysisData.recommendations || [];

        // Extract live player data for context
        liveFPLData = {
          players: analysisData.players?.slice(0, 15).map((p: any) => ({
            name: p.name,
            position: p.position,
            team: p.team,
            price: p.price,
            points: p.points,
            expectedPoints: p.expectedPoints,
            form: p.volatility || 0,
            isStarter: p.isStarter,
            isBench: p.isBench
          })) || [],
          nextFixtures: analysisData.gameweeks?.slice(0, 3).map((gw: any) => ({
            gameweek: gw.gameweek,
            difficulty: gw.difficulty,
            averageFDR: gw.averageFDR,
            keyFixtures: gw.fixtures?.slice(0, 5).map((f: any) =>
              `${f.playerName} vs ${f.opponent} (${f.isHome ? 'H' : 'A'}, FDR: ${f.fdr})`
            ) || []
          })) || [],
          chipRecommendations: recommendations.slice(0, 3).map((r: any) => ({
            chip: r.chipType,
            gameweek: r.gameweek,
            priority: r.priority,
            reasoning: r.reasoning?.slice(0, 2) || [],
            confidence: r.confidence || 0
          }))
        };
      } else {
        // No Team ID available - return data request message instead of proceeding
        return {
          message: "I'd love to help with your FPL strategy! To give you accurate, personalized advice about players like Watkins, I need to analyze your actual squad first. Could you please provide your Team ID so I can see your current players, their prices, and upcoming fixtures?",
          insights: [],
          suggestions: [
            "Share your FPL Team ID for personalized analysis",
            "You can find your Team ID in the FPL app/website URL",
            "Once I have your squad data, I can give specific advice about your players"
          ],
          followUpQuestions: [
            "What's your FPL Team ID?",
            "Would you like help finding your Team ID?",
            "Are you looking for general FPL advice instead?"
          ]
        };
      }
    } catch (error) {
      console.warn('Failed to get live FPL data for AI context:', error);
      // Return data unavailable message instead of proceeding without data
      return {
        message: "I'm having trouble accessing your FPL data right now. To give you accurate advice about specific players, I need access to current squad and fixture information. Please try again in a moment, or provide your Team ID if you haven't already.",
        insights: [],
        suggestions: [
          "Try your question again in a moment",
          "Double-check your Team ID if provided",
          "Ask a general FPL strategy question instead"
        ],
        followUpQuestions: [
          "Would you like to try again?",
          "Do you have a different Team ID to try?",
          "Can I help with general FPL strategy instead?"
        ]
      };
    }

    // Build conversation history for context
    const conversationHistory = context.messages
      .slice(-6) // Last 6 messages for context
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

    // Get the user's current query
    const currentQuery = context.messages[context.messages.length - 1]?.content || intent.originalQuery;

    // Check if we have valid analysis data before proceeding with LLM calls
    if (!analysisData || !liveFPLData || !squadData) {
      console.warn('Missing analysis data, falling back to rule-based summary');
      const ruleBased = this.generateRuleBasedSummary({ analysisData, squadData });
      if (ruleBased) {
        return {
          message: ruleBased,
          insights: [],
          suggestions: this.generateDynamicSuggestions(intent, analysisData),
          followUpQuestions: this.generateDynamicFollowUps(intent, context),
          analysisPerformed: {
            type: intent.type as any,
            confidence: 70,
            dataUsed: ['fpl_data']
          }
        };
      }
    }

    // Structured path first (preferred) - only if we have valid data
    let structured: any = null;
    let finalMessage: string = '';

    try {
      structured = await this.llmService.generateFPLStructuredResponse(
        currentQuery,
        { intent: intent.type, entities: intent.entities, squadData, analysisData, recommendations, liveFPLData },
        conversationHistory
      );
    } catch (error) {
      console.warn('Structured response generation failed:', error);
    }

    // Build allowed validation sets
    const allowedNames: string[] = (liveFPLData?.players || []).map((p: any) => (p.name as string)).filter(Boolean);
    const allowedNameSet = new Set(allowedNames.map(n => n.toLowerCase()));
    const allowedFixturesSet = new Set<string>();
    try {
      for (const gw of (analysisData?.gameweeks || [])) {
        for (const f of (gw.fixtures || [])) {
          const key = `${gw.gameweek}|${(f.playerName||'').toLowerCase()}|${(f.opponent||'').toLowerCase()}|${f.isHome?'H':'A'}|${Math.round(f.fdr||0)}`;
          allowedFixturesSet.add(key);
        }
      }
    } catch {}

    if (structured && allowedNames.length > 0) {
      // Validate structured content
      structured.playersUsed = (structured.playersUsed || []).filter((n: any) => typeof n === 'string' && allowedNameSet.has(n.toLowerCase()));
      structured.fixturesUsed = (structured.fixturesUsed || []).filter((fx: any) => {
        if (!fx || typeof fx.player !== 'string' || typeof fx.opponent !== 'string') return false;
        const key = `${Math.round(fx.gameweek||0)}|${fx.player.toLowerCase()}|${fx.opponent.toLowerCase()}|${fx.isHome?'H':'A'}|${Math.round(fx.fdr||0)}`;
        return allowedFixturesSet.has(key);
      });

      finalMessage = this.llmService.formatStructuredToText(
        structured,
        { intent: intent.type, entities: intent.entities, squadData, analysisData, recommendations, liveFPLData }
      );

      // Only use structured response if it contains meaningful content
      if (finalMessage && finalMessage.length > 50 && !finalMessage.includes('could not generate')) {
        console.log(`Using structured response for ${intent.type} (${Date.now() - startTime}ms)`);
      } else {
        structured = null; // Force fallback
      }
    }

    // Fallback to free-form LLM only if structured failed or returned poor content
    if (!structured || !finalMessage || finalMessage.length < 50) {
      try {
        console.log(`Falling back to free-form LLM for ${intent.type} (${Date.now() - startTime}ms)`);
        let llmResponse = await this.llmService.generateFPLResponse(
          currentQuery,
          { intent: intent.type, entities: intent.entities, squadData, analysisData, recommendations, liveFPLData },
          conversationHistory
        );

        // Apply player name validation and rewriting
        if (allowedNames.length > 0) {
          const rewriteSystem = `Rewrite the following answer so that it ONLY mentions players from this allowed list: ${allowedNames.join(', ')}.\nIf a player not on the list is referenced, change it to a generic role (e.g., 'your starting forward'). Keep under 200 words. Do not add new players.`;
          const rewritten = await this.llmService.generateCompletionSafe([
            { role: 'system', content: rewriteSystem },
            { role: 'user', content: llmResponse }
          ], { maxTokens: 400, timeoutMs: 6000 }); // Further reduced for performance
          if (rewritten && rewritten.trim().length > 0) {
            llmResponse = rewritten;
          }
        }

        // If LLM returned generic fallback or too short, build rule-based answer instead
        const isGenericFallback = typeof llmResponse === 'string' && llmResponse.includes("I couldn't form a complete answer right now");
        if (isGenericFallback || (llmResponse || '').trim().length < 60) {
          const rule = this.generateRuleBasedSummary({ analysisData, squadData })
            || this.generateRuleBasedSummary({ analysisData })
            || 'Here is a quick, data-grounded view: focus your captaincy and transfers on nailed starters with favorable FDR and form; avoid low-minutes risks.';
          finalMessage = rule;
        } else {
          finalMessage = llmResponse;
        }
      } catch (error) {
        console.warn('Free-form LLM generation failed, using rule-based fallback:', error);
        finalMessage = this.generateRuleBasedSummary({ analysisData, squadData }) || 'I apologize, but I\'m having trouble generating a response right now. Please try again.';
      }
    }

    // Generate insights based on analysis data
    const insights: AIInsight[] = [];
    if (analysisData?.insights) {
      insights.push(...analysisData.insights);
    }

    // Generate dynamic suggestions based on intent
    const suggestions = this.generateDynamicSuggestions(intent, analysisData);

    // Generate dynamic follow-up questions
    const followUpQuestions = this.generateDynamicFollowUps(intent, context);

    return {
      message: finalMessage,
      insights,
      suggestions,
      followUpQuestions,
      analysisPerformed: analysisData ? {
        type: intent.type as any,
        confidence: structured ? Math.min(95, intent.confidence + 15) : Math.min(85, intent.confidence + 10),
        dataUsed: ['fpl_data', 'llm_analysis', 'simulation', 'ml_predictions', 'competitive_intelligence']
      } : undefined
    };
  }

  /**
   * Generate player recommendation based on analysis
   */
  private generatePlayerRecommendation(player: any, openFPL: any, monteCarlo: any, ownership: any): string {
    let score = 0;
    const reasoning: string[] = [];

    // OpenFPL factors
    if (openFPL) {
      if (openFPL.expectedPoints > 6) {
        score += 2;
        reasoning.push('Strong expected points');
      } else if (openFPL.expectedPoints > 4) {
        score += 1;
        reasoning.push('Good expected points');
      }
    }

    // Monte Carlo factors
    if (monteCarlo) {
      if (monteCarlo.consistency > 7) {
        score += 1;
        reasoning.push('High consistency rating');
      } else if (monteCarlo.consistency < 4) {
        score -= 1;
        reasoning.push('Inconsistent performance pattern');
      }
    }

    // Ownership factors
    if (ownership) {
      if (ownership.isDifferential && ownership.expectedPoints > 4) {
        score += 1;
        reasoning.push('Differential pick with good potential');
      }
    }

    // Price and value factors
    if (player.expectedPoints && player.price) {
      const valueRatio = player.expectedPoints / player.price;
      if (valueRatio > 0.8) {
        score += 1;
        reasoning.push('Good value for money');
      } else if (valueRatio < 0.4) {
        score -= 1;
        reasoning.push('Expensive for expected returns');
      }
    }

    // Generate recommendation based on score
    let recommendation: string;
    if (score >= 3) {
      recommendation = 'captain';
    } else if (score >= 1) {
      recommendation = 'hold';
    } else if (score <= -2) {
      recommendation = 'sell';
    } else {
      recommendation = 'monitor';
    }

    return recommendation;
  }

  private mapIntentToQueryType(intent: QueryIntent['type']): 'analysis' | 'strategy' | 'transfers' | 'general' {
    const mapping: Record<QueryIntent['type'], 'analysis' | 'strategy' | 'transfers' | 'general'> = {
      'squad_analysis': 'analysis',
      'player_advice': 'analysis',
      'chip_strategy': 'strategy',
      'transfer_suggestions': 'transfers',
      'player_comparison': 'analysis',
      'fixture_analysis': 'analysis',
      'general_advice': 'general'
    };
    return mapping[intent] || 'general';
  }

  private getOrCreateContext(sessionId: string, teamId?: string, userId?: string): ConversationContext {
    const existing = this.sessions.get(sessionId);
    
    if (existing) {
      existing.lastActivity = new Date();
      if (teamId && !existing.context.teamId) {
        existing.context.teamId = teamId;
      }
      return existing.context;
    }

    const newContext: ConversationContext = {
      sessionId,
      userId,
      teamId,
      messages: [],
      userPreferences: {
        riskTolerance: 'balanced',
        strategyType: 'balanced',
        priorityChips: []
      },
      currentAnalysis: {},
      lastUpdated: new Date().toISOString()
    };

    this.sessions.set(sessionId, {
      context: newContext,
      lastActivity: new Date()
    });

    return newContext;
  }

  private updateSession(sessionId: string, context: ConversationContext): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.context = context;
      session.lastActivity = new Date();
    }
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      if (now - session.lastActivity.getTime() > this.SESSION_TIMEOUT) {
        this.sessions.delete(sessionId);
      }
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service information for debugging
   */
  public getServiceInfo(): {
    activeSessions: number;
    version: string;
    capabilities: string[];
  } {
    return {
      activeSessions: this.sessions.size,
      version: 'ai-copilot-v3.0',
      capabilities: [
        'natural-language-processing',
        'squad-analysis',
        'chip-strategy', 
        'transfer-suggestions',
        'conversation-memory',
        'contextual-responses'
      ]
    };
  }
}

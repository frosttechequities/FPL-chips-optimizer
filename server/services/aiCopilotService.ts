/**
 * AICopilotService - Phase 3 Enhancement
 * 
 * Main AI co-pilot service that orchestrates natural language processing,
 * analysis coordination, and intelligent response generation for FPL strategy.
 */

import { NaturalLanguageProcessor } from './naturalLanguageProcessor';
import { AnalysisEngine } from './analysisEngine';
import { MLPredictionEngine } from './mlPredictionEngine';
import { CompetitiveIntelligenceEngine } from './competitiveIntelligenceEngine';
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
  private sessions = new Map<string, ConversationSession>();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  private constructor() {
    this.nlProcessor = NaturalLanguageProcessor.getInstance();
    this.analysisEngine = new AnalysisEngine();
    this.mlEngine = MLPredictionEngine.getInstance();
    this.competitiveEngine = CompetitiveIntelligenceEngine.getInstance();
    
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
    userId?: string
  ): Promise<AICopilotResponse> {
    const startTime = Date.now();
    
    try {
      // Get or create conversation context
      const context = await this.getOrCreateContext(sessionId, teamId, userId);
      
      // Process the natural language query
      const intent = await this.nlProcessor.processQuery(message);
      
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
      const response = await this.generateResponse(intent, context);
      
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
          modelVersion: 'ai-copilot-v3.0'
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
    switch (intent.type) {
      case 'squad_analysis':
        return this.handleSquadAnalysis(intent, context);
      
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

    try {
      // Get current analysis and competitive intelligence
      const [analysis, competitiveReport] = await Promise.all([
        this.analysisEngine.analyzeTeam(context.teamId),
        this.competitiveEngine.generateIntelligenceReport([], 5).catch(() => null)
      ]);

      const transferTargets = competitiveReport?.transferTargets || [];
      const insights = this.generateTransferInsights(analysis, transferTargets);
      
      const message = this.formatTransferSuggestionsMessage(analysis, transferTargets);
      
      return {
        message,
        insights,
        suggestions: transferTargets.slice(0, 5).map(target => 
          `${target.playerName}: ${target.reason} (${target.priority} priority)`
        ),
        followUpQuestions: [
          "Want me to analyze specific transfer options?",
          "Should I check if any transfers would improve your fixtures?",
          "Need help timing transfers around price changes?"
        ]
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
        followUpQuestions: ["Which position needs strengthening?"]
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
    // Convert analysis data into structured insights
    return [];
  }

  private formatSquadAnalysisMessage(analysis: any, insights: AIInsight[]): string {
    return `Your squad analysis is complete! I've analyzed your ${analysis.players?.length || 15} players using advanced simulation and ML models.`;
  }

  private generateSquadSuggestions(analysis: any): string[] {
    return ["Consider your upcoming fixture difficulty", "Check for injury-prone players"];
  }

  private generateChipSpecificAdvice(chip: string, gameweek?: number, context?: ConversationContext): Promise<Omit<AICopilotResponse, 'conversationContext'>> {
    return Promise.resolve({
      message: `Great question about ${chip}! This chip is best used when...`,
      insights: [],
      suggestions: [`Optimal ${chip} timing`, `Players to target for ${chip}`],
      followUpQuestions: [`When are you planning to use your ${chip}?`]
    });
  }

  private generateGeneralChipInsights(): AIInsight[] {
    return [];
  }

  private formatChipStrategyMessage(recommendations: any[]): string {
    return "Based on your squad and upcoming fixtures, here's my chip strategy recommendation:";
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

  private mapIntentToQueryType(intent: QueryIntent['type']): 'analysis' | 'strategy' | 'transfers' | 'general' {
    const mapping: Record<QueryIntent['type'], 'analysis' | 'strategy' | 'transfers' | 'general'> = {
      'squad_analysis': 'analysis',
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
/**
 * OpenRouter Service for LLM Integration
 * Provides access to Qwen3 Coder and other models via OpenRouter API
 */

interface OpenRouterResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenRouterService {
  private static instance: OpenRouterService;
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private defaultModel = 'qwen/qwen-2.5-coder-32b-instruct:free'; // Free Qwen3 Coder model

  private constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY!;
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
  }

  public static getInstance(): OpenRouterService {
    if (!OpenRouterService.instance) {
      OpenRouterService.instance = new OpenRouterService();
    }
    return OpenRouterService.instance;
  }

  /**
   * Generate a completion using the specified model
   */
  async generateCompletion(
    messages: LLMMessage[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      stream?: boolean;
    } = {}
  ): Promise<string> {
    const {
      model = this.defaultModel,
      maxTokens = 1000,
      temperature = 0.7,
      stream = false
    } = options;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://fpl-chip-strategy-architect.repl.co',
          'X-Title': 'FPL Chip Strategy Architect'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
          stream
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('OpenRouter API Error:', response.status, errorData);
        throw new Error(`OpenRouter API error: ${response.status} - ${errorData}`);
      }

      const data: OpenRouterResponse = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response choices returned from OpenRouter API');
      }

      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling OpenRouter API:', error);
      throw new Error(`Failed to generate LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate an FPL-specific response with enhanced context
   */
  async generateFPLResponse(
    userQuery: string,
    fplContext: {
      intent: string;
      entities: any;
      squadData?: any;
      analysisData?: any;
      recommendations?: any[];
    },
    conversationHistory: LLMMessage[] = []
  ): Promise<string> {
    // Build a comprehensive system prompt for FPL expertise
    const systemPrompt = this.buildFPLSystemPrompt(fplContext);
    
    // Construct messages with conversation history
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6), // Keep last 6 messages for context
      { role: 'user', content: userQuery }
    ];

    return await this.generateCompletion(messages, {
      temperature: 0.8, // Slightly higher for more creative FPL insights
      maxTokens: 800   // Generous token limit for detailed responses
    });
  }

  /**
   * Build a comprehensive system prompt for FPL expertise
   */
  private buildFPLSystemPrompt(fplContext: any): string {
    const { intent, entities, squadData, analysisData, recommendations } = fplContext;

    let systemPrompt = `You are an expert Fantasy Premier League (FPL) strategist and AI assistant. You provide intelligent, data-driven advice to help managers optimize their FPL teams.

## Your Expertise:
- Deep knowledge of FPL rules, mechanics, and strategy
- Understanding of fixture difficulty, player form, and value trends
- Expertise in chip timing (wildcard, bench boost, triple captain, free hit)
- Transfer strategy and team optimization
- Player comparison and differential picks

## Current Context:
- User Intent: ${intent}
- Detected Entities: ${JSON.stringify(entities)}`;

    // Add squad-specific context if available
    if (squadData) {
      systemPrompt += `
- User's Team Value: £${squadData.teamValue}m
- Bank: £${squadData.bank}m  
- Free Transfers: ${squadData.freeTransfers}`;
    }

    // Add analysis data if available
    if (analysisData?.insights) {
      systemPrompt += `
- Key Squad Insights: ${analysisData.insights.map((i: any) => i.content).join(', ')}`;
    }

    // Add recommendations if available
    if (recommendations && recommendations.length > 0) {
      systemPrompt += `
- Top Recommendations: ${recommendations.map((r: any) => `${r.title}: ${r.content}`).join(', ')}`;
    }

    systemPrompt += `

## Response Guidelines:
- Be conversational and engaging, not robotic
- Provide specific, actionable advice based on the user's situation
- Use data and analysis to support your recommendations
- Explain your reasoning clearly
- Ask follow-up questions when helpful
- Use FPL terminology naturally (GW, FDR, differential, etc.)
- Keep responses focused and avoid unnecessary repetition
- If you don't have specific data, acknowledge limitations but still provide helpful general advice

## Response Style:
- Professional but friendly tone
- Use relevant emojis sparingly for emphasis
- Structure longer responses with clear sections
- Always end with helpful follow-up suggestions when appropriate

Respond to the user's query with expertise, insight, and personality.`;

    return systemPrompt;
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get available models (for future expansion)
   */
  getAvailableModels(): string[] {
    return [
      'qwen/qwen-2.5-coder-32b-instruct', // Free Qwen3 Coder
      'microsoft/phi-3-mini-128k-instruct', // Free alternative
      'meta-llama/llama-3.1-8b-instruct' // Free Llama alternative
    ];
  }
}
/**
 * OpenRouter Service for LLM Integration
 * Provides access to Qwen3 Coder and other models via OpenRouter API
 */

interface OpenRouterMessage {
  role: string;
  content: string | null;
  reasoning?: string | { content: string } | null;
}

interface OpenRouterChoice {
  message: OpenRouterMessage;
  finish_reason: string;
  reasoning?: string | { content: string } | null;
}

interface OpenRouterResponse {
  id: string;
  choices: OpenRouterChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: any;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenRouterService {
  private static instance: OpenRouterService;
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private defaultModel = 'qwen/qwen3-235b-a22b:free'; // Free Qwen3 235B A22B model

  private constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    // Note: Service can operate without API key - will be detected by isConfigured()
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

      let content = data.choices[0].message.content || '';
      
      // Qwen3 235B A22B sometimes puts reasoning in reasoning field and leaves content empty
      // If content is empty but reasoning exists, extract final recommendation from reasoning
      if (content.trim().length === 0) {
        const reasoningText = this.getReasoningText(data.choices[0]);
        if (reasoningText) {
          content = this.extractFinalRecommendationFromReasoning(reasoningText);
        }
      }
      
      if (!content || content.trim().length === 0) {
        throw new Error('OpenRouter returned empty content and reasoning');
      }

      return content;
    } catch (error) {
      console.error('Error calling OpenRouter API:', error);
      throw new Error(`Failed to generate LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Safe completion with timeout + lite fallback messages
   */
  async generateCompletionSafe(
    messages: LLMMessage[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      stream?: boolean;
      timeoutMs?: number;
      liteFallbackMessages?: LLMMessage[];
    } = {}
  ): Promise<string> {
    const {
      model = undefined,
      maxTokens = 1000,
      temperature = 0.7,
      stream = false,
      timeoutMs = 20000,
      liteFallbackMessages,
    } = options;

    const callOnce = async (msgs: LLMMessage[]) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await this.generateCompletion(msgs, { model, maxTokens, temperature, stream });
      } catch (_err) {
        return '';
      } finally {
        clearTimeout(timer);
      }
    };

    let content = await callOnce(messages);
    if (!content && liteFallbackMessages?.length) {
      content = await callOnce(liteFallbackMessages);
    }
    if (!content) {
      return "I couldn't form a complete answer right now. I can analyze your squad, suggest transfers, or chip timing. Try rephrasing or mention specific players/chips/gameweeks.";
    }
    return content;
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
      liveFPLData?: any;
    },
    conversationHistory: LLMMessage[] = []
  ): Promise<string> {
    // Build a comprehensive system prompt for FPL expertise
    const systemPrompt = this.buildFPLSystemPrompt(fplContext);
    const litePrompt = this.toLitePrompt(systemPrompt);
    
    // Construct messages with conversation history
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6), // Keep last 6 messages for context
      { role: 'user', content: userQuery }
    ];

    const __answer = await this.generateCompletionSafe(messages, {
      temperature: 0.8, // Slightly higher for more creative FPL insights
      maxTokens: 1200,   // Increased limit to prevent truncation
      timeoutMs: 20000,
      liteFallbackMessages: [
        { role: 'system', content: litePrompt },
        ...conversationHistory.slice(-2),
        { role: 'user', content: userQuery }
      ]
    });
    return this.sanitizeFinalContent(__answer);
  }

  /**
   * Build a comprehensive system prompt for FPL expertise with real data
   */
  private buildFPLSystemPrompt(fplContext: any): string {
    const { intent, entities, squadData, analysisData, recommendations, liveFPLData } = fplContext;

    let systemPrompt = `You are an expert Fantasy Premier League (FPL) strategist and AI assistant. You provide intelligent, data-driven advice based on REAL, CURRENT FPL data to help managers optimize their teams.

## Your Expertise:
- Deep knowledge of FPL rules, mechanics, and strategy
- Analysis of current fixtures, player form, and value trends
- Expertise in chip timing (wildcard, bench boost, triple captain, free hit)
- Transfer strategy and team optimization based on real data
- Player comparison using actual stats and performance

## Current FPL Context:
- Season: 2024/25 Premier League
- User Intent: ${intent}
- Detected Entities: ${JSON.stringify(entities)}`;

    // Add current gameweek information
    const currentDate = new Date();
    const seasonStart = new Date('2024-08-16'); // Approximate start of 24/25 season
    const weeksSinceStart = Math.floor((currentDate.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const estimatedGameweek = Math.min(Math.max(weeksSinceStart + 1, 1), 38);
    
    systemPrompt += `
- Current Estimated Gameweek: ${estimatedGameweek}
- Analysis Date: ${currentDate.toDateString()}`;

    // Add squad-specific context if available
    if (squadData) {
      systemPrompt += `

## User's Current Squad:
- Team Value: £${squadData.teamValue}m
- Bank: £${squadData.bank}m  
- Free Transfers: ${squadData.freeTransfers}`;
    }

    // Add LIVE player data for accuracy (RAG approach)
    if (liveFPLData?.players && liveFPLData.players.length > 0) {
      const starters = liveFPLData.players.filter((p: any) => p.isStarter);
      const bench = liveFPLData.players.filter((p: any) => p.isBench);
      
      systemPrompt += `

## LIVE Squad Data (Use This for All Player References):
### Starting XI:
${starters.map((p: any) => 
  `- ${p.name} (${p.position}, ${p.team}): £${p.price}m, ${p.points} pts total, ${p.expectedPoints?.toFixed(1) || 'N/A'} exp pts`
).join('\n')}

### Bench:
${bench.map((p: any) => 
  `- ${p.name} (${p.position}, ${p.team}): £${p.price}m, ${p.points} pts total`
).join('\n')}`;
    }

    // Add LIVE fixture data
    if (liveFPLData?.nextFixtures && liveFPLData.nextFixtures.length > 0) {
      systemPrompt += `

## LIVE Upcoming Fixtures (Next 3 Gameweeks):`;
      
      liveFPLData.nextFixtures.forEach((gw: any) => {
        systemPrompt += `
### GW${gw.gameweek} (Difficulty: ${gw.difficulty}, Avg FDR: ${gw.averageFDR?.toFixed(1)}):
${gw.keyFixtures.join('\n')}`;
      });
    }

    // Add analysis insights if available
    if (analysisData?.insights) {
      systemPrompt += `

## Current Analysis Insights:
${analysisData.insights.map((i: any) => `- ${i.content}`).join('\n')}`;
    }

    // Add LIVE chip recommendations
    if (liveFPLData?.chipRecommendations && liveFPLData.chipRecommendations.length > 0) {
      systemPrompt += `

## LIVE Chip Strategy Analysis:
${liveFPLData.chipRecommendations.map((r: any) => 
  `- ${r.chip.toUpperCase()} in GW${r.gameweek} (${r.priority} priority, ${r.confidence}% confidence): ${r.reasoning.join(', ')}`
).join('\n')}`;
    }

    systemPrompt += `

## CRITICAL: Anti-Hallucination Protocol (100% Compliance Required)

### ABSOLUTE RULES - NO EXCEPTIONS:
1. **ONLY reference players listed in the LIVE Squad Data above**
2. **ONLY use prices, points, and stats from the live data sections**
3. **ONLY mention fixtures from the LIVE Upcoming Fixtures section**
4. **NEVER use training data knowledge about current FPL season**
5. **NEVER invent or assume any statistics, prices, or fixture information**

### MANDATORY RESPONSE VALIDATION:
Before each response, verify:
- ✅ All player names mentioned are in the live squad data
- ✅ All prices quoted match the live data exactly
- ✅ All fixture references come from the live fixture data
- ✅ All statistics cited are from the provided analysis

### REQUIRED RESPONSE FORMAT:
- **START**: "Looking at your current squad data..." or "Based on your live analysis..."
- **PRICES**: Always quote exact prices from live data: "Your Watkins (£8.4m)..."
- **CONTEXT**: Specify squad position: "In your starting XI" or "On your bench"
- **FIXTURES**: Reference actual upcoming fixtures: "With GW15 vs Chelsea (FDR: 4)..."
- **CERTAINTY**: Use confident language only for live data, uncertain for missing data

### WHEN DATA IS MISSING - MANDATORY RESPONSES:
- Player not in squad: "I don't see [player] in your current squad analysis"
- Missing fixture: "I don't have fixture data for [specific period/opponent]"
- Missing stat: "Your current analysis doesn't include [specific statistic]"
- No squad data: "I need your squad analysis to give accurate advice about specific players"

### FORBIDDEN BEHAVIORS:
❌ Making up player prices or statistics
❌ Referencing players not in the live squad data
❌ Using general FPL knowledge about current season without live data
❌ Speculating about fixtures not in the live data
❌ Providing advice without citing specific live data sources

**COMPLIANCE CHECK**: Every response must pass this test: "Can I verify every fact in this response against the live data provided above?" If NO, rewrite the response.

**FINAL INSTRUCTION**: After your reasoning, provide a clear, actionable FPL recommendation. Start your final answer with your recommendation and support it with specific data from above. Be concise but comprehensive - aim for 2-3 paragraphs maximum.`;

    return systemPrompt;
  }

  /**
   * Create a lite version of the system prompt by trimming long sections and normalizing currency symbols
   */
  private toLitePrompt(prompt: string): string {
    let p = prompt.replace(/\u00A3|A�/g, '£');
    // Trim starting XI list to first 6 lines under the section
    p = p.replace(/(### Starting XI:\n)([\s\S]*?)(\n\n### Bench:)/, (m: string, a: string, b: string, c: string) => {
      const lines = b.trim().split('\n').slice(0, 6).join('\n');
      return `${a}${lines}${c}`;
    });
    // Trim GW fixtures per GW to 3 lines
    p = p.replace(/(### GW\d+[^\n]*:\n)([\s\S]*?)(?=(\n### GW|\n\n##|$))/g, (m: string, header: string, body: string, next: string) => {
      const lines = body.trim().split('\n').slice(0, 3).join('\n');
      return `${header}${lines}${next || ''}`;
    });
    // Trim chip recommendations to first one
    p = p.replace(/(## LIVE Chip Strategy Analysis:\n)([\s\S]*?)(?=\n\n##|$)/, (m: string, hdr: string, body: string) => {
      const first = body.trim().split('\n').slice(0, 1).join('\n');
      return `${hdr}${first}`;
    });
    return p;
  }

  /**
   * Safely extract reasoning text from OpenRouter choice
   */
  private getReasoningText(choice: OpenRouterChoice): string | null {
    // Try choice.message.reasoning first
    if (choice.message.reasoning) {
      if (typeof choice.message.reasoning === 'string') {
        return choice.message.reasoning;
      }
      if (typeof choice.message.reasoning === 'object' && choice.message.reasoning.content) {
        return choice.message.reasoning.content;
      }
    }
    
    // Fallback to choice.reasoning
    if (choice.reasoning) {
      if (typeof choice.reasoning === 'string') {
        return choice.reasoning;
      }
      if (typeof choice.reasoning === 'object' && choice.reasoning.content) {
        return choice.reasoning.content;
      }
    }
    
    return null;
  }

  /**
   * Extract final FPL recommendation from reasoning field
   */
  private extractFinalRecommendationFromReasoning(reasoning: string): string {
    // Look for conclusion patterns in the reasoning
    const conclusionMarkers = [
      'recommendation:',
      'conclusion:',
      'my advice:',
      'final answer:',
      'verdict:',
      'bottom line:',
      'in summary:',
      'decision:'
    ];
    
    let finalSection = reasoning;
    
    // Try to find a conclusion section
    for (const marker of conclusionMarkers) {
      const markerIndex = reasoning.toLowerCase().lastIndexOf(marker);
      if (markerIndex !== -1) {
        finalSection = reasoning.substring(markerIndex + marker.length).trim();
        break;
      }
    }
    
    // If no clear conclusion found, extract the last coherent paragraph
    if (finalSection === reasoning) {
      const paragraphs = reasoning.split('\n\n').filter(p => p.trim().length > 50);
      if (paragraphs.length > 0) {
        finalSection = paragraphs[paragraphs.length - 1];
      }
    }
    
    // Clean up the extracted content
    finalSection = finalSection
      .replace(/^(okay,?|so,?|well,?|now,?)/i, '') // Remove filler words
      .replace(/\.\.\.\s*$/g, '') // Remove trailing ellipsis
      .trim();
    
    // If still too long (likely still contains reasoning), create a clean summary
    if (finalSection.length > 800 || finalSection.includes('wait,') || finalSection.includes('let me')) {
      return this.createCleanFPLSummary(reasoning);
    }
    
    return finalSection || 'I need to analyze your squad data first. Please make sure your team analysis is available.';
  }

  /**
   * Create a clean FPL summary from reasoning text
   */
  private createCleanFPLSummary(reasoning: string): string {
    // Extract key facts about the player in question using fixed regex patterns
    const playerMatch = reasoning.match(/Watkins[^\n.]*£\s?\d+(?:\.\d+)?m[^\n.]*\b(?:points|pts)\b[^.]*\./i);
    const fixtureMatches = reasoning.match(/GW\d+[^.]*?\bvs\.?\s+[A-Z]{2,3}[^.]*\./gi);
    const comparisonMatches = reasoning.match(/(Jo(?:[ãa]o )?Pedro|Wood|bench)[^.]*?\b\d+(?:\.\d+)?\s*(?:points|pts)[^.]*\./gi);
    
    let summary = "Based on your squad analysis:\n\n";
    
    if (playerMatch) {
      summary += `${playerMatch[0]}\n\n`;
    }
    
    if (fixtureMatches && fixtureMatches.length > 0) {
      summary += `Upcoming fixtures: ${fixtureMatches.slice(0, 2).join(' ')}\n\n`;
    }
    
    if (comparisonMatches && comparisonMatches.length > 0) {
      summary += `Squad comparison: ${comparisonMatches[0]}\n\n`;
    }
    
    // Add a generic recommendation if we extracted good data
    if (playerMatch || fixtureMatches) {
      summary += "**Recommendation**: Consider your transfer priorities based on expected points, fixture difficulty, and chip strategy timing.";
    } else {
      summary = "I need more complete squad data to give you specific advice about player transfers. Please ensure your team analysis includes current prices, points, and fixture information.";
    }
    
    return summary;
  }

  /**
   * Light content sanitizer to enforce currency symbol and remove obvious filler
   */
  private sanitizeFinalContent(text: string): string {
    let out = (text || '').replace(/A�/g, '£');
    // Remove leading filler words that sometimes leak from models
    out = out.replace(/\b(?:wait,?\s*|let me[,\s]+|okay,?\s*|well,?\s*)/gi, '');
    // Normalize any FDR decimal mentions to integer form if pattern appears
    out = out.replace(/FDR\s*[:]?\s*([1-5])(?:\.[0-9]+)?/gi, (_m, a) => `FDR: ${a}`);
    return out.trim();
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
      'qwen/qwen3-235b-a22b:free', // Free Qwen3 235B A22B (235B params, 22B active)
      'qwen/qwen3-30b-a3b:free', // Free Qwen3-30B-A3B (MoE, 30.5B params)
      'qwen/qwen3-coder:free', // Free Qwen3-Coder (specialized for coding)
      'qwen/qwq-32b:free' // Free QwQ-32B (advanced reasoning)
    ];
  }
}

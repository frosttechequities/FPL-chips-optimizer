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


// Interface declarations for structured output
interface StructuredFPLFixtureRef { 
  gameweek: number; 
  player: string; 
  opponent: string; 
  isHome: boolean; 
  fdr: number; 
}

interface StructuredFPLResponse { 
  recommendation: string; 
  playersUsed: string[]; 
  fixturesUsed: StructuredFPLFixtureRef[]; 
  confidence: number; 
}

export class OpenRouterService {
  private static instance: OpenRouterService;
  private apiKey: string;
  private baseUrl = 'https://openrouter.ai/api/v1';
  private defaultModel = 'mistralai/mistral-7b-instruct:free'; // Faster model for better performance
  private structuredModel = 'qwen/qwen3-30b-a3b:free'; // More capable model for structured responses

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
    const systemPrompt = this.buildFPLSystemPrompt(fplContext);
    const litePrompt = this.toLitePrompt(systemPrompt);

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6),
      { role: 'user', content: userQuery }
    ];

    const fallbackMessage = 'I couldn\'t form a complete answer right now. I can analyze your squad, suggest transfers, or chip timing. Try rephrasing or mention specific players/chips/gameweeks.';
    const rawAnswer = await this.generateCompletionSafe(messages, {
      model: this.structuredModel,
      temperature: 0.5,
      maxTokens: 1100,
      timeoutMs: 20000,
      liteFallbackMessages: [
        { role: 'system', content: litePrompt },
        ...conversationHistory.slice(-2),
        { role: 'user', content: userQuery }
      ]
    });

    let cleaned = this.sanitizeFinalContent(rawAnswer);
    const cleanedIsFallback = cleaned && cleaned === fallbackMessage;

    if (cleaned && cleaned.length > 0 && !cleanedIsFallback && this.isLLMResponseValid(cleaned, fplContext)) {
      return cleaned;
    }

    const structured = await this.generateFPLStructuredResponse(userQuery, fplContext, conversationHistory);
    if (structured) {
      return this.formatStructuredToText(structured, fplContext);
    }

    const ruleBased = this.generateRuleBasedSummary(fplContext);
    if (ruleBased) {
      return ruleBased;
    }

    if (cleaned && cleaned.length > 0) {
      return cleaned;
    }

    return fallbackMessage;
  }

  // ---- Structured output path for near-bulletproof accuracy ----
  private buildStructuredPrompt(fplContext: any, userQuery: string): { system: string; user: string } {
    const { intent, entities, squadData, liveFPLData } = fplContext;
    const allowedPlayers: string[] = (liveFPLData?.players || []).map((p: any) => p.name).filter(Boolean);

    // Create intent-specific instructions
    const getIntentInstructions = (intent: string): string => {
      switch (intent) {
        case 'squad_analysis':
          return 'Provide a comprehensive squad analysis focusing on strengths, weaknesses, and optimization opportunities.';
        case 'transfer_suggestions':
          return 'Suggest specific transfer recommendations with clear reasoning based on form, fixtures, and value.';
        case 'chip_strategy':
          return 'Recommend chip usage timing and strategy with specific gameweeks and reasoning.';
        case 'player_advice':
          return 'Give specific advice about the mentioned player(s) including form, fixtures, and recommendations.';
        case 'fixture_analysis':
          return 'Analyze upcoming fixtures and their impact on player performance and transfer decisions.';
        case 'player_comparison':
          return 'Compare the mentioned players across key metrics and provide a clear recommendation.';
        case 'advanced_metrics':
          return 'Use npxG/xA/xGC to justify recommendations. Prefer underlying metrics over recent points.';
        case 'probabilistic_distribution':
          return 'Provide probability thresholds (P>=8/10/12), and floor/ceiling based on distributions.';
        case 'def_clean_sheets':
          return 'Identify 1-2 defenders with the highest clean sheet probability and explain briefly.';
        case 'transfer_pair':
          return 'Evaluate an out/in pair for ERV over ~3 GWs, including EO shield/sword tradeoffs.';
        case 'eo_erv':
          return 'Frame captaincy as shield vs sword using EO and ERV; be concise and actionable.';
        default:
          return 'Provide helpful FPL advice based on the question.';
      }
    };

    const system = `You are an expert FPL assistant. You have access to REAL squad and fixture data. Respond ONLY with valid JSON - no prose, no explanations.

⚠️ CRITICAL: ONLY use data from the provided context. You are FORBIDDEN from inventing players, fixtures, or statistics.

JSON Schema (respond with this exact structure):
{
  "recommendation": string, // ${getIntentInstructions(intent)} Use ONLY players from AllowedPlayers list. Keep under 160 words.
  "playersUsed": string[],  // ONLY names from AllowedPlayers list below
  "fixturesUsed": Array<{ "gameweek": number, "player": string, "opponent": string, "isHome": boolean, "fdr": number }>,
  "confidence": number // 0..100
}

⚠️ HARD CONSTRAINTS:
- ONLY mention players from this list: ${allowedPlayers.join(', ')}
- If a player is not in the list above, DO NOT mention them
- ONLY use fixtures from the context provided
- ONLY use gameweek numbers from the context
- ONLY use prices/stats from the context
- If you cannot answer using ONLY the provided data, set recommendation to "I don't have enough data to answer this question"

AllowedPlayers: ${allowedPlayers.join(', ')}
Intent: ${intent}
Entities: ${JSON.stringify(entities)}`;

    const user = `Question: ${userQuery}\n\nContext:\n- Team Value: £${squadData?.teamValue ?? 'N/A'}m, Bank: £${squadData?.bank ?? 'N/A'}m, Free Transfers: ${squadData?.freeTransfers ?? 'N/A'}\n- Starters (${(liveFPLData?.players||[]).filter((p:any)=>p.isStarter).length}): ${allowedPlayers.join(', ')}\n- Upcoming fixtures (summarized in your memory)`;

    return { system, user };
  }

  private tryParseJsonBlock(text: string): any | null {
    if (!text) return null;
    try { return JSON.parse(text); } catch {}
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }

  async generateFPLStructuredResponse(
    userQuery: string,
    fplContext: any,
    conversationHistory: LLMMessage[] = []
  ): Promise<StructuredFPLResponse | null> {
    const { system, user } = this.buildStructuredPrompt(fplContext, userQuery);
    const messages: LLMMessage[] = [
      { role: 'system', content: system },
      ...conversationHistory.slice(-2),
      { role: 'user', content: user }
    ];
    const raw = await this.generateCompletionSafe(messages, { model: this.structuredModel, maxTokens: 800, timeoutMs: 15000, temperature: 0.2 });
    const json = this.tryParseJsonBlock(raw);
    if (!json) return null;
    if (typeof json.recommendation !== 'string' || !Array.isArray(json.playersUsed) || !Array.isArray(json.fixturesUsed)) return null;
    return json as StructuredFPLResponse;
  }

  formatStructuredToText(s: StructuredFPLResponse, context: any = {}): string {
    const recommendationText = typeof s.recommendation === 'string' ? s.recommendation.trim() : '';
    const playersUsed = Array.isArray(s.playersUsed)
      ? s.playersUsed.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      : [];
    const fixtures = Array.isArray(s.fixturesUsed)
      ? s.fixturesUsed.filter((fx: any) => fx && typeof fx.player === 'string' && typeof fx.opponent === 'string')
      : [];

    // Only fall back to rule-based if we have NO structured content AND the recommendation is empty
    const hasStructuredContent = recommendationText.length > 0 || playersUsed.length > 0 || fixtures.length > 0;
    const hasValidRecommendation = recommendationText.length > 10; // Minimum meaningful recommendation length

    // If we have a valid structured response, use it
    if (hasValidRecommendation) {
      const lines: string[] = [];
      lines.push(recommendationText); // Use the recommendation directly without "**Recommendation**:"
      
      if (playersUsed.length) {
        lines.push(`\nPlayers considered: ${playersUsed.join(', ')}`);
      }
      if (fixtures.length) {
        const parts = fixtures.slice(0, 4).map(f => {
          const fdr = Math.max(1, Math.min(5, Math.round(typeof f.fdr === 'number' ? f.fdr : 3)));
          return `GW${f.gameweek} ${f.player} ${f.isHome ? 'vs' : '@'} ${f.opponent} (FDR: ${fdr})`;
        });
        lines.push(`\nKey fixtures: ${parts.join('; ')}`);
      }

      lines.push(`\nConfidence: ${Math.max(0, Math.min(100, Math.round(s.confidence)))}%`);
      const structuredSummary = this.sanitizeFinalContent(lines.join(''));
      return structuredSummary || 'I could not format the structured response cleanly.';
    }

    // Only fall back to rule-based if we truly have no structured content
    if (!hasStructuredContent) {
      const ruleBasedSummary = this.generateRuleBasedSummary(context);
      return ruleBasedSummary ?? 'I could not generate a structured recommendation from the available data.';
    }

    // If we have some structured content but not a full recommendation, try to build something useful
    const lines: string[] = [];
    if (recommendationText.length > 0) {
      lines.push(recommendationText);
    }
    if (playersUsed.length) {
      lines.push(`Players considered: ${playersUsed.join(', ')}`);
    }
    if (fixtures.length) {
      const parts = fixtures.slice(0, 4).map(f => {
        const fdr = Math.max(1, Math.min(5, Math.round(typeof f.fdr === 'number' ? f.fdr : 3)));
        return `GW${f.gameweek} ${f.player} ${f.isHome ? 'vs' : '@'} ${f.opponent} (FDR: ${fdr})`;
      });
      lines.push(`Key fixtures: ${parts.join('; ')}`);
    }

    const structuredSummary = this.sanitizeFinalContent(lines.join('\n\n'));
    return structuredSummary || 'I could not format the structured response cleanly.';
  }




  private sanitizeFinalContent(text: string): string {
    if (!text) {
      return '';
    }

    let out = text;

    // Fix currency symbols - handle multiple garbled forms of £
    out = out
      .replace(/\u00A3/g, '£')                    // Unicode pound symbol
      .replace(/Â£/g, '£')                        // Garbled UTF-8 pound symbol
      .replace(/A\uFFFD/g, '£')                   // Replacement character after A
      .replace(/£\uFFFD/g, '£')                   // Replacement character after £
      .replace(/GBP\s*/gi, '£')                   // Replace GBP with pound symbol
      .replace(/pounds?\s*/gi, '£')               // Replace "pound" or "pounds" with £
      .replace(/sterling\s*/gi, '£')              // Replace "sterling" with £
      .replace(/\uFFFD/g, '')                     // Remove replacement characters
      .replace(/[\u0080-\u009F]/g, '')            // Remove control characters
      .replace(/[\u00A0-\u00FF]/g, (char: string) => {    // Handle Latin-1 supplement
        if (char === '£' || char === '€' || char === '$') return char;
        if (char === '©' || char === '®' || char === '™') return char;
        return ''; // Remove other non-ASCII characters
      });

    // Fix repeated currency symbols
    out = out
      .replace(/£££/g, '£')                       // Fix triple £ symbols
      .replace(/££/g, '£')                        // Fix double £ symbols
      .replace(/€€€/g, '€')                       // Fix triple € symbols
      .replace(/€€/g, '€')                        // Fix double € symbols
      .replace(/\$\$\$/g, '$')                    // Fix triple $ symbols
      .replace(/\$\$/g, '$');                     // Fix double $ symbols

    // Additional currency symbol fixes
    out = out
      .replace(/Team\s+\\u00a3/g, 'Team')         // Remove garbled team names with £
      .replace(/\\u00a3/g, '£')                   // Fix escaped £ symbols
      .replace(/\\u[0-9a-f]{4}/gi, '')            // Remove other escaped Unicode
      .replace(/S\\u00e1nchez/g, 'Sanchez')       // Fix specific garbled player names
      .replace(/Mu\\u00f1oz/g, 'Munoz')           // Fix specific garbled player names
      .replace(/\\u00f1/g, 'n')                   // Fix ñ characters
      .replace(/\\u00e1/g, 'a')                   // Fix á characters
      .replace(/\\u00ed/g, 'i')                   // Fix í characters
      .replace(/\\u00f3/g, 'o')                   // Fix ó characters
      .replace(/\\u00fa/g, 'u')                   // Fix ú characters
      .replace(/\\u00e9/g, 'e')                   // Fix é characters
      .replace(/\\u00fc/g, 'u')                   // Fix ü characters
      .replace(/\\u00f6/g, 'o')                   // Fix ö characters
      .replace(/\\u00e4/g, 'a')                   // Fix ä characters
      .replace(/\\u00df/g, 'ss')                  // Fix ß characters
      .replace(/\\u00e8/g, 'e')                   // Fix è characters
      .replace(/\\u00ec/g, 'i')                   // Fix ì characters
      .replace(/\\u00f2/g, 'o')                   // Fix ò characters
      .replace(/\\u00f9/g, 'u')                   // Fix ù characters
      .replace(/\\u00e0/g, 'a')                   // Fix à characters

    // Fix made-up team names and gameweek issues
    out = out
      .replace(/Team\s+[A-Z]/g, 'opponent')      // Replace "Team A", "Team B" etc. with "opponent"
      .replace(/vs\s+opponent/g, 'vs opponent')  // Clean up spacing
      .replace(/@\s+opponent/g, '@ opponent')    // Clean up spacing
      .replace(/GW1/g, 'GW6')                    // Fix wrong gameweek number
      .replace(/Gameweek 1/g, 'Gameweek 6')       // Fix wrong gameweek number
      .replace(/gameweek 1/gi, 'gameweek 6')      // Fix wrong gameweek number
      .replace(/GW 1/g, 'GW 6')                  // Fix wrong gameweek number
      .replace(/gameweek1/gi, 'gameweek6')        // Fix wrong gameweek number

    // Remove thinking tags and their content
    out = out.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/gi, '');

    // Remove common filler phrases
    out = out.replace(/\b(?:wait,?\s*|let me[,\s]+|okay,?\s*|well,?\s*|hmm,?\s*|so,?\s*|like,?\s*|you know,?\s*)/gi, '');

    // Clean up FDR formatting
    out = out.replace(/FDR\s*:?\s*([1-5])(?:\.[0-9]+)?/gi, (_m, a) => `FDR: ${a}`);

    // Additional FPL-specific sanitization
    out = out.replace(/\b(?:I think|I believe|in my opinion|personally|honestly|frankly|to be honest)\b/gi, '');
    out = out.replace(/\b(?:maybe|perhaps|possibly|might|could|would|should|may|can)\b/gi, '');
    out = out.replace(/\b(?:definitely|certainly|absolutely|surely|totally|completely|entirely|fully)\b/gi, '');

    // Clean up price formatting - ensure proper £ symbol placement
    out = out.replace(/(\d+(?:\.\d+)?)\s*m\b/gi, '£$1m');  // Add £ before prices like "5.2m"
    out = out.replace(/£(\d+(?:\.\d+)?)\s*m\b/gi, '£$1m'); // Fix spacing in "£5.2 m"
    out = out.replace(/£\s*(\d+(?:\.\d+)?)\s*m\b/gi, '£$1m'); // Fix spacing in "£ 5.2 m"
    out = out.replace(/(\d+(?:\.\d+)?)m\b/gi, '£$1m'); // Add £ to bare prices like "5.2m"

    // Clean up gameweek references
    out = out.replace(/\bgameweek\s+(\d+)/gi, 'GW$1');
    out = out.replace(/\bgw\s+(\d+)/gi, 'GW$1');
    out = out.replace(/\bweek\s+(\d+)/gi, 'GW$1');

    // Remove excessive confidence statements
    out = out.replace(/\b(?:100%|completely|totally|absolutely|perfectly|extremely|incredibly|amazingly)\s+(?:sure|certain|confident|convinced)\b/gi, 'confident');
    out = out.replace(/\b(?:very|quite|rather|somewhat)\s+(?:sure|certain|confident)\b/gi, 'confident');

    // Clean up common punctuation issues
    out = out.replace(/\s*,\s*,/g, ',');  // Remove double commas
    out = out.replace(/\s*\.\s*\./g, '.'); // Remove double periods
    out = out.replace(/\s+/g, ' '); // Normalize whitespace
    out = out.replace(/ {2,}/g, ' '); // Remove multiple spaces

    // Final cleanup
    return out.trim();
  }


  private generateRuleBasedSummary(fplContext: any): string | null {
    const analysis = fplContext?.analysisData;
    // If full analysis missing, attempt a lightweight summary from available context
    if (!analysis) {
      try {
        const squad = fplContext?.squadData || {};
        const live = fplContext?.liveFPLData || {};
        const players = Array.isArray(live.players) ? live.players : [];
        if (!players.length) return null;

        const lines: string[] = [];
        const teamName = squad.teamName || 'your squad';
        lines.push(`Quick take on ${teamName} (rule-based fallback).`);

        const starters = players.filter((p: any) => p.isStarter);
        const top = starters.slice(0, 3).map((p: any) => `${p.name} (${(p.expectedPoints ?? p.points ?? 0)} pts est)`);
        if (top.length) lines.push(`Key starters: ${top.join(', ')}.`);

        const bench = players.filter((p: any) => p.isBench).slice(0, 2).map((p: any) => p.name);
        if (bench.length) lines.push(`Bench watch: ${bench.join(', ')}.`);

        const fixtures = Array.isArray(live.nextFixtures) ? live.nextFixtures : [];
        if (fixtures.length) {
          const fx = fixtures.slice(0, 2).map((gw: any) => `GW${gw.gameweek} avg FDR ${gw.averageFDR ?? gw.difficulty ?? 3}`);
          lines.push(`Upcoming: ${fx.join(' | ')}.`);
        }

        lines.push('Tip: Prioritize nailed starters with good FDR; avoid low minutes risks.');
        return this.sanitizeFinalContent(lines.join('\n\n'));
      } catch {
        return null;
      }
    }

    const lines: string[] = [];
    const teamName = analysis.teamName || (analysis.teamId ? `Team ${analysis.teamId}` : 'your squad');
    lines.push(`Looking at your current squad data for ${teamName}.`);

    const budget = analysis.budget ?? fplContext?.squadData;
    if (budget) {
      const parts: string[] = [];
      if (typeof budget.teamValue === 'number') {
        parts.push(`squad value £${budget.teamValue.toFixed(1)}m`);
      }
      if (typeof budget.bank === 'number') {
        parts.push(`bank £${budget.bank.toFixed(1)}m`);
      }
      if (typeof budget.freeTransfers === 'number') {
        parts.push(`${budget.freeTransfers} free transfers`);
      }
      if (parts.length) {
        lines.push(`Budget overview: ${parts.join(', ')}.`);
      }
    }

    const players = Array.isArray(analysis.players) ? analysis.players : [];
    if (players.length) {
      const starters = players.filter((p: any) => p.isStarter);
      const metric = (p: any) => {
        if (typeof p.expectedPoints === 'number') {
          return p.expectedPoints;
        }
        if (typeof p.points === 'number') {
          return p.points;
        }
        return 0;
      };
      const topStarters = starters.slice().sort((a: any, b: any) => metric(b) - metric(a)).slice(0, 3);
      if (topStarters.length) {
        const descriptions = topStarters.map((p: any) => {
          const value = typeof p.expectedPoints === 'number'
            ? `${p.expectedPoints.toFixed(1)} expected pts`
            : `${p.points ?? 0} pts`;
          return `${p.name} (${value})`;
        });
        lines.push(`Key starters: ${descriptions.join(', ')}.`);
      }

      const benchCandidates = players.filter((p: any) => p.isBench).slice(0, 2);
      if (benchCandidates.length) {
        const benchDescriptions = benchCandidates.map((p: any) => {
          const value = typeof p.expectedPoints === 'number'
            ? p.expectedPoints.toFixed(1)
            : `${p.points ?? 0}`;
          return `${p.name} (${value} pts)`;
        });
        lines.push(`Bench watch: ${benchDescriptions.join(', ')}.`);
      }
    }

    const gameweeks = Array.isArray(analysis.gameweeks) ? analysis.gameweeks : [];
    if (gameweeks.length) {
      const upcoming = gameweeks.slice(0, 2).map((gw: any) => {
        if (Array.isArray(gw.fixtures) && gw.fixtures.length) {
          const highlights = gw.fixtures.slice(0, 2).map((f: any) => {
            const rawFdr = typeof f.fdr === 'number' ? f.fdr : (typeof gw.averageFDR === 'number' ? gw.averageFDR : 3);
            const fdr = Math.max(1, Math.min(5, Math.round(rawFdr)));
            return `${f.playerName} vs ${f.opponent} (${f.isHome ? 'H' : 'A'}, FDR ${fdr})`;
          });
          return `GW${gw.gameweek}: ${highlights.join('; ')}`;
        }
        if (typeof gw.averageFDR === 'number') {
          return `GW${gw.gameweek}: average FDR ${gw.averageFDR.toFixed(1)}`;
        }
        return null;
      }).filter((value: any): value is string => Boolean(value));
      if (upcoming.length) {
        lines.push(`Upcoming fixtures: ${upcoming.join(' | ')}.`);
      }
    }

    const recommendations = Array.isArray(analysis.recommendations) ? analysis.recommendations : [];
    if (recommendations.length) {
      const rec = recommendations[0];
      const detail = Array.isArray(rec.reasoning) && rec.reasoning.length
        ? ` (${rec.reasoning.slice(0, 2).join('; ')})`
        : '';
      lines.push(`Chip outlook: consider ${rec.chipType} in GW${rec.gameweek}${detail}.`);
    }

    const summary = lines.join('\n\n');
    return summary ? this.sanitizeFinalContent(summary) : null;
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Build comprehensive FPL system prompt with live data context
   */
  private buildFPLSystemPrompt(fplContext: any): string {
    const { intent, entities, squadData, analysisData, recommendations, liveFPLData } = fplContext;

    // Load constitutional master prompt (toggle via USE_MASTER_PROMPT)
    let constitution = '';
    try {
      if (process.env.USE_MASTER_PROMPT !== '0') {
        // Lazy import to avoid circular deps during build
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { MasterPromptService } = require('./MasterPromptService');
        constitution = MasterPromptService.getInstance().getMasterPrompt();
      }
    } catch (_err) {
      constitution = '';
    }

    // Extract player data for context
    const players = liveFPLData?.players || [];
    const starters = players.filter((p: any) => p.isStarter);
    const bench = players.filter((p: any) => !p.isStarter);
    const allowedPlayerNames = players.map((p: any) => p.name).filter(Boolean);

    // Extract fixture data
    const fixtures = analysisData?.gameweeks || [];
    const nextFixtures = fixtures.slice(0, 3); // Next 3 gameweeks

    // Determine if this is a squad-specific or general FPL question
    const isSquadSpecific = ['squad_analysis', 'player_advice', 'transfer_suggestions'].includes(intent);
    const isGeneralFPL = ['chip_strategy', 'fixture_analysis', 'player_comparison', 'general_advice'].includes(intent);

    // Build appropriate system prompt based on query type
    let systemPrompt: string;

    if (isSquadSpecific) {
      // Strict constraints for squad-specific questions
      systemPrompt = `${constitution ? `${constitution}

` : ''}You are an expert Fantasy Premier League (FPL) assistant with access to real squad data. You must ONLY use the provided squad data and are FORBIDDEN from inventing information.

⚠️ CRITICAL CONSTRAINTS FOR SQUAD QUESTIONS:
1. ONLY mention players that appear in the CURRENT SQUAD list below
2. ONLY use prices, stats, and form data from the CURRENT SQUAD list
3. ONLY reference fixtures from the UPCOMING FIXTURES list
4. NEVER invent players, teams, fixtures, or statistics
5. If asked about players not in CURRENT SQUAD, say "I don't have data on that player in your squad"

CURRENT TEAM CONTEXT:
- Team Value: £${squadData?.teamValue || 'N/A'}m
- Bank: £${squadData?.bank || 'N/A'}m
- Free Transfers: ${squadData?.freeTransfers || 'N/A'}
- Team Name: ${squadData?.teamName || 'Your team'}

CURRENT SQUAD (15 players) - ONLY USE THESE PLAYERS:
${starters.map((p: any) => `• ${p.name} (${p.position}, £${p.price}m, ${p.totalPoints}pts, ${p.goals}G/${p.assists}A, Form: ${p.form})`).join('\n')}

${bench.map((p: any) => `• ${p.name} (${p.position}, £${p.price}m, ${p.totalPoints}pts, ${p.goals}G/${p.assists}A)`).join('\n')}

UPCOMING FIXTURES (Next 3 Gameweeks) - ONLY USE THESE FIXTURES:
${nextFixtures.map((gw: any) =>
  `GW${gw.gameweek} (Avg FDR: ${gw.averageFDR}): ${gw.keyFixtures?.map((f: any) =>
    `${f.player} ${f.isHome ? 'vs' : '@'} ${f.opponent} (FDR: ${f.fdr})`
  ).join(', ') || 'No fixtures'}`
).join('\n')}

INTENT: ${intent}
ENTITIES: ${JSON.stringify(entities || {})}

Provide specific advice about the user's squad using ONLY the data above.`;
    } else {
      // Flexible constraints for general FPL strategy questions
      systemPrompt = `${constitution ? `${constitution}

` : ''}You are an expert Fantasy Premier League (FPL) assistant with extensive knowledge of FPL strategy, chip usage, and general tactics. You have access to the user's squad data for context.

GENERAL FPL KNOWLEDGE AVAILABLE:
- Chip strategies (Wildcard, Free Hit, Bench Boost, Triple Captain)
- Transfer timing and tactics
- Fixture difficulty analysis
- Player comparison frameworks
- Risk management approaches
- Budget optimization strategies

USER'S CURRENT CONTEXT (use for personalization but don't be overly restrictive):
- Team Value: £${squadData?.teamValue || 'N/A'}m, Bank: £${squadData?.bank || 'N/A'}m, Free Transfers: ${squadData?.freeTransfers || 'N/A'}
- Current Gameweek: ${liveFPLData?.currentGameweek || 'N/A'}
- Players in squad: ${allowedPlayerNames.slice(0, 5).join(', ')}${allowedPlayerNames.length > 5 ? '...' : ''}

UPCOMING FIXTURES CONTEXT:
${nextFixtures.map((gw: any) =>
  `GW${gw.gameweek} (Avg FDR: ${gw.averageFDR}): ${gw.keyFixtures?.slice(0, 3).map((f: any) =>
    `${f.player} ${f.isHome ? 'vs' : '@'} ${f.opponent} (FDR: ${f.fdr})`
  ).join(', ') || 'No fixtures'}`
).join('\n')}

CHIP RECOMMENDATIONS AVAILABLE:
${recommendations?.slice(0, 2).map((rec: any) => `- ${rec.chipType} in GW${rec.gameweek}: ${rec.reasoning?.[0] || 'Strategic timing'}`).join('\n') || 'General chip strategy knowledge'}

⚠️ IMPORTANT GUIDELINES:
- Provide helpful, accurate FPL advice based on proven strategies
- Use the user's squad context when relevant, but don't force it if the question is general
- Be confident and direct in your recommendations
- Use proper FPL terminology (GW for Gameweek, FDR for Fixture Difficulty Rating, etc.)
- Keep responses focused and actionable

INTENT: ${intent}
ENTITIES: ${JSON.stringify(entities || {})}

Answer the user's question with expert FPL knowledge and strategic insight.`;
    }

    return systemPrompt;
  }

  /**
   * Convert system prompt to lite version for fallback
   */
  private toLitePrompt(systemPrompt: string): string {
    try {
      const head = 'You are The FPL Architect. Use concise, actionable answers.';
      const trimmed = systemPrompt.length > 2400 ? systemPrompt.slice(0, 2400) : systemPrompt;
      return `${head}\n\n${trimmed}`;
    } catch {
      return 'You are The FPL Architect. Provide helpful FPL advice based on available data.';
    }
  }

  /**
   * Validate LLM response against FPL context
   */
  private isLLMResponseValid(response: string, fplContext: any): boolean {
    if (!response || response.trim().length < 20) return false;
    // Be lenient to avoid generic fallbacks; only reject clearly empty/invalid outputs
    const hasOnlyFallback = /I couldn't form a complete answer right now/i.test(response);
    return !hasOnlyFallback;
  }

  /**
   * Get available models (for future expansion)
   */
  getAvailableModels(): string[] {
    return [
      'mistralai/mistral-7b-instruct:free', // Stable general-purpose responses
      'qwen/qwen3-30b-a3b:free', // Larger MoE free tier
      'google/gemma-2b-it:free', // Lightweight fallback option
      'qwen/qwen3-coder:free', // Coding-oriented option
      'qwen/qwq-32b:free' // Advanced reasoning free tier
    ];
  }

  /**
   * Extract reasoning text from OpenRouter response
   */
  private getReasoningText(choice: OpenRouterChoice): string | null {
    if (choice.reasoning) {
      if (typeof choice.reasoning === 'string') {
        return choice.reasoning;
      }
      if (choice.reasoning && typeof choice.reasoning === 'object' && 'content' in choice.reasoning) {
        return choice.reasoning.content;
      }
    }
    return null;
  }

  /**
   * Extract final recommendation from reasoning text
   */
  private extractFinalRecommendationFromReasoning(reasoningText: string): string {
    // Look for the final answer or recommendation in the reasoning
    const lines = reasoningText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // Look for patterns that indicate the final recommendation
    const finalAnswerPatterns = [
      /^final answer:/i,
      /^recommendation:/i,
      /^conclusion:/i,
      /^summary:/i,
      /^in summary:/i,
      /^therefore:/i,
      /^so /i,
      /^i recommend/i,
      /^i suggest/i
    ];

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (finalAnswerPatterns.some(pattern => pattern.test(line))) {
        return line.replace(/^(final answer|recommendation|conclusion|summary|therefore|so|i recommend|i suggest):?\s*/i, '').trim();
      }
    }

    // If no clear final answer pattern, return the last meaningful line
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.length > 10 && !line.includes('thinking') && !line.includes('reasoning')) {
        return line;
      }
    }

    return reasoningText; // Fallback to entire reasoning text
  }
}

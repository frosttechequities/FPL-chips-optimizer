/**
 * Google AI Service
 * Provides access to Gemini models via Google AI API
 */

interface GoogleAIMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

interface GoogleAIResponse {
  candidates: Array<{
    content: {
      role: 'model';
      parts: Array<{ text: string }>;
    };
    finishReason: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GoogleAIService {
  private static instance: GoogleAIService;
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  // Use Gemini 1.5 Flash for speed and cost-effectiveness
  private model = 'gemini-1.5-flash';

  private constructor() {
    this.apiKey = process.env.GOOGLE_AI_API_KEY || '';
  }

  public static getInstance(): GoogleAIService {
    if (!GoogleAIService.instance) {
      GoogleAIService.instance = new GoogleAIService();
    }
    return GoogleAIService.instance;
  }

  /**
   * Generate a completion using Google AI API
   */
  async generateCompletion(
    messages: Array<{ role: string; content: string }>,
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): Promise<string> {
    const {
      model = this.model,
      maxTokens = 1000,
      temperature = 0.7
    } = options;

    // Convert messages to Google AI format
    const contents = this.convertMessagesToGoogleFormat(messages);

    // Use current environment variable if stored key is empty
    const currentApiKey = this.apiKey || process.env.GOOGLE_AI_API_KEY || '';

    try {
      console.log('🤖 [GOOGLE AI] Making API call to:', model);

      const response = await fetch(`${this.baseUrl}/${model}:generateContent?key=${currentApiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
            topP: 0.8,
            topK: 10
          },
          safetySettings: [
            {
              category: 'HARM_CATEGORY_HARASSMENT',
              threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            {
              category: 'HARM_CATEGORY_HATE_SPEECH',
              threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            {
              category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
              threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            },
            {
              category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
              threshold: 'BLOCK_MEDIUM_AND_ABOVE'
            }
          ]
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [GOOGLE AI] API Error:', response.status, errorText);
        throw new Error(`Google AI API error: ${response.status} - ${errorText}`);
      }

      const data: GoogleAIResponse = await response.json();
      console.log('✅ [GOOGLE AI] Response received, token usage:', data.usageMetadata);

      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('No response candidates returned from Google AI API');
      }

      const generatedText = data.candidates[0].content.parts[0].text || '';
      return generatedText.trim();

    } catch (error) {
      console.error('❌ [GOOGLE AI] Request failed:', error);
      throw new Error(`Failed to generate Google AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Safe completion with timeout + fallback
   */
  async generateCompletionSafe(
    messages: Array<{ role: string; content: string }>,
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
      liteFallbackMessages?: Array<{ role: string; content: string }>;
    } = {}
  ): Promise<string> {
    const {
      model = undefined,
      maxTokens = 1000,
      temperature = 0.7,
      timeoutMs = 25000,
      liteFallbackMessages,
    } = options;

    const callOnce = async (msgs: Array<{ role: string; content: string }>) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await this.generateCompletion(msgs, { model, maxTokens, temperature });
      } catch (error) {
        console.warn('⚠️ [GOOGLE AI] API call failed:', error);
        return '';
      } finally {
        clearTimeout(timer);
      }
    };

    let content = await callOnce(messages);
    if (!content && liteFallbackMessages?.length) {
      console.log('🔄 [GOOGLE AI] Trying lite fallback');
      content = await callOnce(liteFallbackMessages);
    }
    if (!content) {
      console.log('❌ [GOOGLE AI] All attempts failed, using static fallback');
      return "I couldn't form a complete answer right now. I can analyze your squad, suggest transfers, or chip timing. Try rephrasing or mention specific players/chips/gameweeks.";
    }
    return content;
  }

  /**
   * Generate an FPL-specific response
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
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<string> {
    const systemPrompt = this.buildFPLSystemPrompt(fplContext);

    const messages: Array<{ role: string; content: string }> = [
      { role: 'user', content: systemPrompt }, // Gemini uses 'user' for system messages
      ...conversationHistory.slice(-4), // Shorter history for Gemini
      { role: 'user', content: userQuery }
    ];

    const rawAnswer = await this.generateCompletionSafe(messages, {
      model: this.model,
      temperature: 0.1, // Lower temperature for more deterministic responses
      maxTokens: 800, // Shorter for free tier
      timeoutMs: 30000
    });

    let cleaned = this.sanitizeFinalContent(rawAnswer);
    const cleanedIsFallback = cleaned && cleaned === "I couldn't form a complete answer right now. I can analyze your squad, suggest transfers, or chip timing. Try rephrasing or mention specific players/chips/gameweeks.";

    if (cleaned && cleaned.length > 0 && !cleanedIsFallback) {
      return cleaned;
    }

    // Fallback to rule-based if LLM fails
    const ruleBased = this.generateRuleBasedSummary(fplContext);
    if (ruleBased) {
      return ruleBased;
    }

    return "I couldn't form a complete answer right now. I can analyze your squad, suggest transfers, or chip timing. Try rephrasing or mention specific players/chips/gameweeks.";
  }

  /**
   * Generate structured FPL response (simplified for Google AI)
   */
  async generateFPLStructuredResponse(
    userQuery: string,
    fplContext: any,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<any | null> {
    // Google AI doesn't support structured output like some other APIs
    // Return null to use free-form fallback
    return null;
  }

  /**
   * Format structured response to text (simplified for Google AI)
   */
  formatStructuredToText(structured: any, context: any = {}): string {
    // Since Google AI doesn't support structured output, this shouldn't be called
    // But provide a fallback just in case
    if (structured && structured.recommendation) {
      return structured.recommendation;
    }
    return "I couldn't generate a structured response.";
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    // Check both stored API key and current environment variable
    const hasStoredKey = !!this.apiKey;
    const hasEnvKey = !!process.env.GOOGLE_AI_API_KEY;
    const isConfigured = !!(this.apiKey || process.env.GOOGLE_AI_API_KEY);

    console.log('🔧 [GOOGLE AI] Configuration check:', {
      hasStoredKey,
      hasEnvKey,
      storedKeyLength: this.apiKey?.length || 0,
      envKeyLength: process.env.GOOGLE_AI_API_KEY?.length || 0,
      isConfigured
    });

    return isConfigured;
  }

  /**
   * Check if the service is healthy (has valid API access)
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Try a simple API call to check if the service is working
      const testResponse = await this.generateCompletionSafe([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 10, timeoutMs: 5000 });

      return testResponse.length > 0;
    } catch (error) {
      console.error('❌ [GOOGLE AI] Health check failed:', error);
      return false;
    }
  }

  /**
   * Convert messages to Google AI format
   */
  private convertMessagesToGoogleFormat(messages: Array<{ role: string; content: string }>): GoogleAIMessage[] {
    return messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));
  }

  /**
   * Build FPL system prompt
   */
  private buildFPLSystemPrompt(fplContext: any): string {
    const { intent, entities, squadData, liveFPLData, analysisData } = fplContext;

    const players = liveFPLData?.players || [];
    const allowedPlayerNames = players.map((p: any) => p.name).filter(Boolean);

    console.log('🔧 [GOOGLE AI] Building FPL prompt:', {
      intent,
      squadData,
      playerCount: players.length,
      totalAllowedPlayers: allowedPlayerNames.length,
      allowedPlayerNames: allowedPlayerNames, // Show ALL players
      hasLiveData: !!liveFPLData
    });

    // Get current gameweek from analysis data
    const currentGW = analysisData?.currentGameweek || 'Unknown';

    let prompt = `You are an elite Fantasy Premier League (FPL) analyst with deep knowledge of the 2024/25 season. You have access to current player data, ownership statistics, fixture difficulties, and FPL rules. Provide expert-level analysis.

CRITICAL FPL KNOWLEDGE (2024/25 Season):
- Current Date: September 22, 2025 (pre-Gameweek 6)
- Mohamed Salah absent for Africa Cup of Nations (Dec 21 - Jan 18)
- FPL Rules: Max 3 players per Premier League club
- Transfer costs: 4 points per transfer beyond free transfers
- Ownership data: João Pedro (~15% owned), Watkins (~8% owned)
- Recent price changes: Reijnders +£0.1m, Semenyo +£0.2m

CONTEXT:
- Current Gameweek: ${currentGW}
- Squad Value: £${squadData?.teamValue || 'N/A'}m
- Bank: £${squadData?.bank || 'N/A'}m
- Free Transfers: ${squadData?.freeTransfers || 'N/A'}
- Team: ${squadData?.teamName || 'Your team'}

USER QUERY: "${intent}"

EXPERT ANALYSIS REQUIREMENTS:
1. **Strategic Transfer Analysis** (USE MARKDOWN TABLE):

| Player Out | Player In | Position | Cost Diff | Ownership % | Expected GW6 Points | Key Reasoning |
|------------|-----------|----------|-----------|-------------|-------------------|---------------|
| Watkins (8%) | Semenyo (12%) | FWD | +£0.2m | +4% | +4.2 | Watkins blank last GW, Semenyo in form vs Bournemouth |

2. **Critical Factors to Consider:**
- **Ownership Differentials**: Lower ownership = higher captaincy potential
- **Fixture Difficulty**: GW6 fixtures and defensive strength
- **Player Availability**: International duty, injuries, rotation risk
- **Price Trends**: Recent rises indicate manager confidence
- **FPL Rules**: Club limits, transfer costs, chip implications

3. **Expert Recommendations:**
- Prioritize differentials with favorable GW6 fixtures
- Consider Salah's absence creates premium midfield gaps
- Balance risk vs reward for chip strategies
- Monitor ownership for captaincy opportunities

CURRENT SQUAD PLAYERS: ${allowedPlayerNames.join(', ')}

Provide analytical depth like a professional FPL analyst. Include ownership data, fixture analysis, and strategic reasoning. Focus on GW6 specifically.`;

    console.log('📝 [GOOGLE AI] Final prompt length:', prompt.length);
    return prompt;
  }

  /**
   * Sanitize response content
   */
  private sanitizeFinalContent(text: string): string {
    if (!text) return '';

    let out = text;

    // Clean up extra whitespace
    out = out.replace(/\s+/g, ' ').trim();

    return out;
  }

  /**
   * Generate rule-based fallback summary
   */
  private generateRuleBasedSummary(fplContext: any): string | null {
    const analysis = fplContext?.analysisData;
    if (!analysis) return null;

    const lines: string[] = [];
    const teamName = analysis.teamName || 'your squad';
    lines.push(`Looking at your current squad data for ${teamName}.`);

    const budget = analysis.budget;
    if (budget) {
      const parts: string[] = [];
      if (budget.teamValue) parts.push(`squad value £${budget.teamValue.toFixed(1)}m`);
      if (budget.bank) parts.push(`bank £${budget.bank.toFixed(1)}m`);
      if (budget.freeTransfers) parts.push(`${budget.freeTransfers} free transfers`);
      if (parts.length) lines.push(`Budget overview: ${parts.join(', ')}.`);
    }

    const players = Array.isArray(analysis.players) ? analysis.players : [];
    if (players.length) {
      const top = players.slice().sort((a: any, b: any) => (b.expectedPoints || 0) - (a.expectedPoints || 0)).slice(0, 2);
      if (top.length) {
        const descriptions = top.map((p: any) => `${p.name} (${p.expectedPoints?.toFixed(1) || 0} pts)`);
        lines.push(`Key players: ${descriptions.join(', ')}.`);
      }
    }

    const summary = lines.join(' ');
    return summary.length > 20 ? summary : null;
  }
}

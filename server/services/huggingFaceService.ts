/**
 * HuggingFace Inference API Service
 * Provides access to free-tier AI models via HuggingFace Inference API
 */

interface HuggingFaceMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface HuggingFaceResponse {
  generated_text: string;
  details?: any;
}

export class HuggingFaceService {
  private static instance: HuggingFaceService;
  private apiKey: string;
  private baseUrl = 'https://api-inference.huggingface.co/models';

  // Free tier compatible model - using a model that exists in HF Inference API
  private model = 'google/flan-t5-base';

  private constructor() {
    this.apiKey = process.env.HUGGINGFACE_API_KEY || '';
  }

  public static getInstance(): HuggingFaceService {
    if (!HuggingFaceService.instance) {
      HuggingFaceService.instance = new HuggingFaceService();
    }
    return HuggingFaceService.instance;
  }

  /**
   * Generate a completion using HuggingFace Inference API
   */
  async generateCompletion(
    messages: HuggingFaceMessage[],
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

    // Format messages into a single prompt
    const prompt = this.formatMessagesToPrompt(messages);

    // Use current environment variable if stored key is empty
    const currentApiKey = this.apiKey || process.env.HUGGINGFACE_API_KEY || '';

    try {
      console.log('🤖 [HUGGINGFACE] Making API call to:', model);

      const response = await fetch(`${this.baseUrl}/${model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: maxTokens,
            temperature: temperature,
            return_full_text: false,
            do_sample: true
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [HUGGINGFACE] API Error:', response.status, errorText);
        throw new Error(`HuggingFace API error: ${response.status} - ${errorText}`);
      }

      const data: HuggingFaceResponse[] = await response.json();
      console.log('✅ [HUGGINGFACE] Response received, length:', data[0]?.generated_text?.length || 0);

      const generatedText = data[0]?.generated_text || '';
      return generatedText.trim();

    } catch (error) {
      console.error('❌ [HUGGINGFACE] Request failed:', error);
      throw new Error(`Failed to generate HuggingFace response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Safe completion with timeout + fallback
   */
  async generateCompletionSafe(
    messages: HuggingFaceMessage[],
    options: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      timeoutMs?: number;
      liteFallbackMessages?: HuggingFaceMessage[];
    } = {}
  ): Promise<string> {
    const {
      model = undefined,
      maxTokens = 1000,
      temperature = 0.7,
      timeoutMs = 25000, // HuggingFace can be slower
      liteFallbackMessages,
    } = options;

    const callOnce = async (msgs: HuggingFaceMessage[]) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await this.generateCompletion(msgs, { model, maxTokens, temperature });
      } catch (error) {
        console.warn('⚠️ [HUGGINGFACE] API call failed:', error);
        return '';
      } finally {
        clearTimeout(timer);
      }
    };

    let content = await callOnce(messages);
    if (!content && liteFallbackMessages?.length) {
      console.log('🔄 [HUGGINGFACE] Trying lite fallback');
      content = await callOnce(liteFallbackMessages);
    }
    if (!content) {
      console.log('❌ [HUGGINGFACE] All attempts failed, using static fallback');
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
    conversationHistory: HuggingFaceMessage[] = []
  ): Promise<string> {
    const systemPrompt = this.buildFPLSystemPrompt(fplContext);

    const messages: HuggingFaceMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-4), // Shorter history for HF
      { role: 'user', content: userQuery }
    ];

    const rawAnswer = await this.generateCompletionSafe(messages, {
      model: this.model,
      temperature: 0.6,
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
   * Generate structured FPL response (simplified for HF)
   */
  async generateFPLStructuredResponse(
    userQuery: string,
    fplContext: any,
    conversationHistory: HuggingFaceMessage[] = []
  ): Promise<any | null> {
    // HuggingFace doesn't support structured output like OpenRouter
    // Return null to use free-form fallback
    return null;
  }

  /**
   * Format structured response to text (simplified for HF)
   */
  formatStructuredToText(structured: any, context: any = {}): string {
    // Since HF doesn't support structured output, this shouldn't be called
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
    const hasEnvKey = !!process.env.HUGGINGFACE_API_KEY;
    const isConfigured = !!(this.apiKey || process.env.HUGGINGFACE_API_KEY);

    console.log('🔧 [HUGGINGFACE] Configuration check:', {
      hasStoredKey,
      hasEnvKey,
      storedKeyLength: this.apiKey?.length || 0,
      envKeyLength: process.env.HUGGINGFACE_API_KEY?.length || 0,
      isConfigured
    });

    return isConfigured;
  }

  /**
   * Format messages into a single prompt for HuggingFace
   */
  private formatMessagesToPrompt(messages: HuggingFaceMessage[]): string {
    const formatted = messages.map(msg => {
      switch (msg.role) {
        case 'system':
          return `<s>[INST] <<SYS>>\n${msg.content}\n<</SYS>>\n\n`;
        case 'user':
          return `${msg.content} [/INST] `;
        case 'assistant':
          return `${msg.content}</s><s>[INST] `;
        default:
          return msg.content;
      }
    }).join('');

    // Clean up the formatting
    return formatted.replace(/<\/s><s>\[INST\]\s*$/, ' [/INST] ');
  }

  /**
   * Build FPL system prompt
   */
  private buildFPLSystemPrompt(fplContext: any): string {
    const { intent, entities, squadData, liveFPLData } = fplContext;

    const players = liveFPLData?.players || [];
    const allowedPlayerNames = players.map((p: any) => p.name).filter(Boolean);

    let prompt = `You are an expert Fantasy Premier League (FPL) assistant. `;

    if (squadData) {
      prompt += `You have access to a squad with £${squadData.teamValue}m value, £${squadData.bank}m bank, and ${squadData.freeTransfers} free transfers. `;
    }

    prompt += `The user is asking about: ${intent}. `;

    if (allowedPlayerNames.length > 0) {
      prompt += `ONLY mention these players from their squad: ${allowedPlayerNames.join(', ')}. `;
    }

    prompt += `Provide helpful, specific FPL advice. Keep responses under 200 words. Be direct and actionable.`;

    return prompt;
  }

  /**
   * Sanitize response content
   */
  private sanitizeFinalContent(text: string): string {
    if (!text) return '';

    let out = text;

    // Remove common artifacts
    out = out.replace(/<\/s>/g, '').replace(/<s>/g, '');
    out = out.replace(/\[INST\]/g, '').replace(/\[\/INST\]/g, '');
    out = out.replace(/<<SYS>>/g, '').replace(/<<\/SYS>>/g, '');

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

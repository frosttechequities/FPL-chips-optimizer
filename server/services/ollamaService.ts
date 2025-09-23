import { BaseAIService } from './baseAIService';

export interface OllamaConfig {
  model: string;
  baseUrl: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface OllamaRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
    top_k?: number;
  };
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

export class OllamaService extends BaseAIService {
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    super();
    this.config = {
      temperature: 0.7,
      maxTokens: 2048,
      timeout: 60000,
      ...config
    };
  }

  async generateCompletion(prompt: string, options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    try {
      const messages: OllamaMessage[] = [
        {
          role: 'user',
          content: prompt
        }
      ];

      const request: OllamaRequest = {
        model: this.config.model,
        messages,
        stream: false,
        options: {
          temperature: options.temperature ?? this.config.temperature,
          num_predict: options.maxTokens ?? this.config.maxTokens,
          top_p: 0.9,
          top_k: 40
        }
      };

      console.log(`🤖 [OLLAMA] Making API call to ${this.config.model}...`);

      const response = await this.makeRequest(request);
      const result = response.message.content;

      console.log(`✅ [OLLAMA] Response received (${result.length} chars)`);

      return result;
    } catch (error) {
      console.error('❌ [OLLAMA] Request failed:', error);
      throw new Error(`Ollama API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateFPLResponse(
    userQuery: string,
    fplContext: any,
    conversationHistory: Array<{ role: string; content: string }> = []
  ): Promise<string> {
    try {
      // Build system prompt from FPL context
      const systemPrompt = this.buildFPLSystemPrompt(fplContext);

      const messages: OllamaMessage[] = [
        {
          role: 'system',
          content: systemPrompt
        },
        ...conversationHistory.slice(-4).map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user' as 'user' | 'assistant' | 'system',
          content: msg.content
        })),
        {
          role: 'user',
          content: userQuery
        }
      ];

      const request: OllamaRequest = {
        model: this.config.model,
        messages,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
          top_p: 0.9,
          top_k: 40
        }
      };

      console.log(`🤖 [OLLAMA] Making FPL API call to ${this.config.model}...`);

      const response = await this.makeRequest(request);
      const result = response.message.content;

      console.log(`✅ [OLLAMA] FPL Response received (${result.length} chars)`);

      return result;
    } catch (error) {
      console.error('❌ [OLLAMA] FPL request failed:', error);
      throw new Error(`Ollama FPL API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async makeRequest(request: OllamaRequest): Promise<OllamaResponse> {
    const url = `${this.config.baseUrl}/api/chat`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.timeout!)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${errorText}`);
    }

    const data: OllamaResponse = await response.json();
    return data;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      console.error('❌ [OLLAMA] Health check failed:', error);
      return false;
    }
  }

  isConfigured(): boolean {
    return true; // Ollama is configured if the service is running
  }

  async generateCompletionSafe(messages: Array<{ role: string; content: string }>, options?: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; liteFallbackMessages?: Array<{ role: string; content: string }> }): Promise<string> {
    try {
      return await this.generateCompletion(messages.map(m => m.content).join('\n'), options);
    } catch (error) {
      console.error('❌ [OLLAMA] Safe completion failed:', error);
      return "I couldn't generate a response right now. Please try again.";
    }
  }

  async generateFPLStructuredResponse(userQuery: string, fplContext: any, conversationHistory?: Array<{ role: string; content: string }>): Promise<any> {
    // Ollama doesn't support structured output like some APIs
    // Return null to use free-form fallback
    return null;
  }

  formatStructuredToText(structured: any, context?: any): string {
    // Since Ollama doesn't support structured output, this shouldn't be called
    // But provide a fallback just in case
    if (structured && structured.recommendation) {
      return structured.recommendation;
    }
    return "I couldn't generate a structured response.";
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = await response.json();
      return data.models?.map((model: any) => model.name) || [];
    } catch (error) {
      console.error('❌ [OLLAMA] Failed to list models:', error);
      return [];
    }
  }

  static getInstance(): OllamaService {
    if (!OllamaService.instance) {
      const config: OllamaConfig = {
        model: process.env.OLLAMA_MODEL || 'llama3:latest',
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
        maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '2048'),
        timeout: parseInt(process.env.OLLAMA_TIMEOUT || '60000')
      };

      OllamaService.instance = new OllamaService(config);
    }
    return OllamaService.instance;
  }

  private static instance: OllamaService;

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
}

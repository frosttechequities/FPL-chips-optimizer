/**
 * Base AI Service Interface
 * Provides common interface for all AI services
 */

export abstract class BaseAIService {
  abstract generateCompletion(prompt: string | Array<{ role: string; content: string }>, options?: { temperature?: number; maxTokens?: number }): Promise<string>;
  abstract generateFPLResponse(userQuery: string, fplContext: any, conversationHistory?: Array<{ role: string; content: string }>): Promise<string>;
  abstract isHealthy(): Promise<boolean>;
  abstract isConfigured(): boolean;
  generateCompletionSafe?(messages: Array<{ role: string; content: string }>, options?: { model?: string; maxTokens?: number; temperature?: number; timeoutMs?: number; liteFallbackMessages?: Array<{ role: string; content: string }> }): Promise<string>;
  generateFPLStructuredResponse?(userQuery: string, fplContext: any, conversationHistory?: Array<{ role: string; content: string }>): Promise<any>;
  formatStructuredToText?(structured: any, context?: any): string;
}

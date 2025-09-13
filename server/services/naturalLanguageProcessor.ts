/**
 * NaturalLanguageProcessor - Phase 3 Enhancement
 * 
 * Processes natural language queries about FPL strategy and converts them into
 * structured intents for analysis and response generation.
 */

import { QueryIntent, FPLConcept } from '@shared/schema';

// Simple keyword-based NLP for demonstration (would use proper NLP library in production)
interface KeywordPattern {
  keywords: string[];
  intent: QueryIntent['type'];
  confidence: number;
  entityExtractors?: {
    players?: RegExp;
    teams?: RegExp;
    gameweeks?: RegExp;
    chips?: RegExp;
    positions?: RegExp;
    budget?: RegExp;
  };
}

export class NaturalLanguageProcessor {
  private static instance: NaturalLanguageProcessor;
  private patterns: KeywordPattern[] = [];
  private fplTerms: Map<string, string> = new Map();

  private constructor() {
    this.initializePatterns();
    this.initializeFPLTerms();
  }

  public static getInstance(): NaturalLanguageProcessor {
    if (!NaturalLanguageProcessor.instance) {
      NaturalLanguageProcessor.instance = new NaturalLanguageProcessor();
    }
    return NaturalLanguageProcessor.instance;
  }

  /**
   * Process natural language query into structured intent
   */
  async processQuery(query: string): Promise<QueryIntent> {
    const normalizedQuery = this.normalizeQuery(query);
    
    // Intent classification
    const intent = this.classifyIntent(normalizedQuery);
    
    // Entity extraction
    const entities = this.extractEntities(normalizedQuery, intent);
    
    // Confidence calculation
    const confidence = this.calculateConfidence(normalizedQuery, intent, entities);

    return {
      type: intent,
      entities,
      confidence,
      originalQuery: query,
      processedQuery: normalizedQuery
    };
  }

  /**
   * Normalize query text for processing
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Classify the intent of the query
   */
  private classifyIntent(query: string): QueryIntent['type'] {
    let bestMatch = this.patterns[0];
    let maxScore = 0;

    for (const pattern of this.patterns) {
      const score = this.calculatePatternScore(query, pattern);
      if (score > maxScore) {
        maxScore = score;
        bestMatch = pattern;
      }
    }

    return bestMatch.intent;
  }

  /**
   * Calculate pattern matching score
   */
  private calculatePatternScore(query: string, pattern: KeywordPattern): number {
    const words = query.split(' ');
    let matches = 0;

    for (const keyword of pattern.keywords) {
      if (words.includes(keyword) || query.includes(keyword)) {
        matches++;
      }
    }

    return (matches / pattern.keywords.length) * pattern.confidence;
  }

  /**
   * Extract entities from the query
   */
  private extractEntities(query: string, intent: QueryIntent['type']): QueryIntent['entities'] {
    const entities: QueryIntent['entities'] = {};

    // Extract player names (simplified - would use NER in production)
    const playerMatches = query.match(/(?:salah|kane|haaland|son|bruno|de bruyne|mane|sterling|vardy|rashford|mount|grealish|mahrez|foden)/gi);
    if (playerMatches) {
      entities.players = Array.from(new Set(playerMatches.map(p => p.toLowerCase())));
    }

    // Extract team names
    const teamMatches = query.match(/(?:arsenal|chelsea|liverpool|city|united|spurs|brighton|newcastle|villa|west ham)/gi);
    if (teamMatches) {
      entities.teams = Array.from(new Set(teamMatches.map(t => t.toLowerCase())));
    }

    // Extract gameweeks
    const gameweekMatches = query.match(/(?:gameweek|gw)\s*(\d+)/gi);
    if (gameweekMatches) {
      entities.gameweeks = gameweekMatches.map(match => {
        const num = match.match(/\d+/);
        return num ? parseInt(num[0]) : 0;
      }).filter(n => n > 0);
    }

    // Extract chips
    const chipMatches = query.match(/(?:wildcard|bench boost|triple captain|free hit|wc|bb|tc|fh)/gi);
    if (chipMatches) {
      entities.chips = Array.from(new Set(chipMatches.map(c => this.normalizeChipName(c))));
    }

    // Extract positions
    const positionMatches = query.match(/(?:goalkeeper|defender|midfielder|forward|gk|def|mid|fwd)/gi);
    if (positionMatches) {
      entities.positions = Array.from(new Set(positionMatches.map(p => this.normalizePosition(p))));
    }

    // Extract budget
    const budgetMatches = query.match(/(?:£|budget|money|cost)\s*(\d+(?:\.\d+)?)/gi);
    if (budgetMatches) {
      const amounts = budgetMatches.map(match => {
        const num = match.match(/\d+(?:\.\d+)?/);
        return num ? parseFloat(num[0]) : 0;
      });
      entities.budget = Math.max(...amounts);
    }

    return entities;
  }

  /**
   * Calculate confidence score for the interpretation
   */
  private calculateConfidence(query: string, intent: QueryIntent['type'], entities: QueryIntent['entities']): number {
    let confidence = 50; // Base confidence

    // Boost confidence based on entity extraction
    const entityCount = Object.values(entities).filter(v => v && (Array.isArray(v) ? v.length > 0 : v > 0)).length;
    confidence += entityCount * 10;

    // Boost confidence for FPL-specific terms
    const fplTermCount = Array.from(this.fplTerms.keys()).filter(term => query.includes(term)).length;
    confidence += fplTermCount * 5;

    // Reduce confidence for very short or very long queries
    const words = query.split(' ').length;
    if (words < 3) confidence -= 20;
    if (words > 20) confidence -= 10;

    return Math.max(10, Math.min(95, confidence));
  }

  /**
   * Normalize chip names to standard format
   */
  private normalizeChipName(chip: string): string {
    const normalized = chip.toLowerCase();
    if (normalized.includes('wildcard') || normalized === 'wc') return 'wildcard';
    if (normalized.includes('bench') || normalized === 'bb') return 'bench-boost';
    if (normalized.includes('triple') || normalized === 'tc') return 'triple-captain';
    if (normalized.includes('free') || normalized === 'fh') return 'free-hit';
    return normalized;
  }

  /**
   * Normalize position names to standard format
   */
  private normalizePosition(position: string): string {
    const normalized = position.toLowerCase();
    if (normalized.includes('goal') || normalized === 'gk') return 'GK';
    if (normalized.includes('def') || normalized === 'def') return 'DEF';
    if (normalized.includes('mid') || normalized === 'mid') return 'MID';
    if (normalized.includes('for') || normalized === 'fwd') return 'FWD';
    return normalized.toUpperCase();
  }

  /**
   * Initialize intent classification patterns
   */
  private initializePatterns(): void {
    this.patterns = [
      {
        keywords: ['analyze', 'squad', 'team', 'analysis', 'review', 'check', 'evaluate'],
        intent: 'squad_analysis',
        confidence: 0.9
      },
      {
        keywords: ['chip', 'wildcard', 'bench boost', 'triple captain', 'free hit', 'when', 'use'],
        intent: 'chip_strategy',
        confidence: 0.85
      },
      {
        keywords: ['transfer', 'buy', 'sell', 'in', 'out', 'replace', 'swap', 'change'],
        intent: 'transfer_suggestions',
        confidence: 0.8
      },
      {
        keywords: ['compare', 'vs', 'versus', 'better', 'choose', 'pick', 'between'],
        intent: 'player_comparison',
        confidence: 0.75
      },
      {
        keywords: ['fixture', 'gameweek', 'difficulty', 'upcoming', 'schedule', 'gw'],
        intent: 'fixture_analysis',
        confidence: 0.7
      },
      {
        keywords: ['help', 'advice', 'suggest', 'recommend', 'what', 'how', 'should'],
        intent: 'general_advice',
        confidence: 0.6
      }
    ];
  }

  /**
   * Initialize FPL terminology dictionary
   */
  private initializeFPLTerms(): void {
    this.fplTerms = new Map([
      ['fpl', 'Fantasy Premier League'],
      ['gw', 'gameweek'],
      ['fdr', 'fixture difficulty rating'],
      ['wc', 'wildcard'],
      ['bb', 'bench boost'],
      ['tc', 'triple captain'],
      ['fh', 'free hit'],
      ['xg', 'expected goals'],
      ['xa', 'expected assists'],
      ['bps', 'bonus points system'],
      ['ownership', 'percentage of teams that own a player'],
      ['captaincy', 'percentage of teams that captain a player'],
      ['differential', 'low ownership player'],
      ['template', 'popular player choice'],
      ['haul', 'high scoring gameweek'],
      ['blank', 'low scoring gameweek'],
      ['rotation', 'player not guaranteed to start'],
      ['nailed', 'player guaranteed to start'],
      ['punt', 'risky player choice'],
      ['fodder', 'cheap bench player']
    ]);
  }

  /**
   * Get explanation for FPL term
   */
  public explainTerm(term: string): string | null {
    return this.fplTerms.get(term.toLowerCase()) || null;
  }

  /**
   * Check if query contains FPL-specific terminology
   */
  public containsFPLTerms(query: string): boolean {
    const normalized = query.toLowerCase();
    return Array.from(this.fplTerms.keys()).some(term => normalized.includes(term));
  }

  /**
   * Get processor information for debugging
   */
  public getProcessorInfo(): {
    patternCount: number;
    termCount: number;
    version: string;
  } {
    return {
      patternCount: this.patterns.length,
      termCount: this.fplTerms.size,
      version: 'v3.0-nlp'
    };
  }
}
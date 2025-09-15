/**
 * NaturalLanguageProcessor - Phase 3 Enhancement
 * 
 * Processes natural language queries about FPL strategy and converts them into
 * structured intents for analysis and response generation.
 */

import { QueryIntent, FPLConcept, FPLPlayer, FPLTeam } from '@shared/schema';
import { FPLApiService } from './fplApi';

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
  private playerDictionary: Map<string, FPLPlayer> = new Map();
  private teamDictionary: Map<string, FPLTeam> = new Map();
  private isLoaded: boolean = false;
  private readyPromise: Promise<void>;

  private constructor() {
    this.initializePatterns();
    this.initializeFPLTerms();
    this.readyPromise = this.loadDictionaries(); // Load real FPL data on startup
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
    // Ensure dictionaries are loaded before processing
    await this.readyPromise;
    
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
   * Classify the intent using rule-based approach with precedence
   */
  private classifyIntent(query: string): QueryIntent['type'] {
    const words = query.split(' ');
    
    // Pre-extract entities for rule evaluation
    const tempEntities = this.extractEntitiesForRules(query);
    
    // Rule 1: Chips present -> chip_strategy
    if (tempEntities.chips && tempEntities.chips.length > 0) {
      return 'chip_strategy';
    }
    
    // Rule 2: Player comparison - requires high-confidence player matches AND explicit comparison keywords
    if (tempEntities.players && tempEntities.players.length >= 2 && this.hasComparisonKeywords(query)) {
      return 'player_comparison';
    }
    
    // Rule 3: Player-specific questions - single player with specific question patterns
    if (tempEntities.players && tempEntities.players.length === 1) {
      if (this.hasPlayerSpecificKeywords(query)) {
        return 'player_advice';
      }
      // Also detect questions about what to do with a specific player
      if (this.hasPlayerActionKeywords(query)) {
        return 'player_advice';
      }
    }
    
    // Rule 4: Transfer suggestions - transfer verbs OR budget + player/position
    if (this.hasTransferKeywords(query) ||
        (tempEntities.budget && (tempEntities.players?.length || tempEntities.positions?.length))) {
      return 'transfer_suggestions';
    }
    
    // Rule 5: Fixture analysis - fixture-related keywords
    if (this.hasFixtureKeywords(query)) {
      return 'fixture_analysis';
    }
    
    // Rule 6: Multiple players without comparison -> squad analysis
    if (tempEntities.players && tempEntities.players.length > 1 && !this.hasComparisonKeywords(query)) {
      return 'squad_analysis';
    }
    
    // Rule 7: Squad analysis - analyze/review squad/team keywords
    if (this.hasSquadAnalysisKeywords(query)) {
      return 'squad_analysis';
    }
    
    // Rule 8: Default to general advice only when no specific entities detected
    return 'general_advice';
  }

  /**
   * Extract entities for rule evaluation (simplified version)
   */
  private extractEntitiesForRules(query: string): Partial<QueryIntent['entities']> {
    const entities: Partial<QueryIntent['entities']> = {};
    
    // Quick chip detection (include generic "chip" keyword)
    const chipMatches = query.match(/(?:wildcard|bench boost|triple captain|free hit|wc|bb|tc|fh|chip)/gi);
    if (chipMatches) {
      entities.chips = chipMatches.map(c => this.normalizeChipName(c));
    }
    
    // Enhanced player detection with better handling of multiple players and special characters
    if (this.isLoaded) {
      const players: string[] = [];
      // Normalize query for better matching (handle special characters)
      const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      
      Array.from(this.playerDictionary.entries()).forEach(([playerName, player]) => {
        const normalizedPlayerName = playerName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Check for exact match with word boundaries
        const escapedName = normalizedPlayerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escapedName}\\b`, 'i').test(normalizedQuery)) {
          players.push(player.web_name);
        }
        
        // Also check original query for exact matches (in case normalization affects real names)
        const originalEscapedName = playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${originalEscapedName}\\b`, 'i').test(query)) {
          players.push(player.web_name);
        }
      });
      
      if (players.length > 0) {
        entities.players = Array.from(new Set(players));
      }
    }
    
    // Quick budget detection
    const budgetMatches = query.match(/(?:£|budget|money|cost)\s*(\d+(?:\.\d+)?)/gi);
    if (budgetMatches) {
      const amounts = budgetMatches.map(match => {
        const num = match.match(/\d+(?:\.\d+)?/);
        return num ? parseFloat(num[0]) : 0;
      });
      entities.budget = Math.max(...amounts);
    }
    
    // Quick position detection
    const positionMatches = query.match(/(?:goalkeeper|defender|midfielder|forward|gk|def|mid|fwd)/gi);
    if (positionMatches) {
      entities.positions = positionMatches.map(p => this.normalizePosition(p));
    }
    
    return entities;
  }

  /**
   * Check for comparison keywords (stricter)
   */
  private hasComparisonKeywords(query: string): boolean {
    return /(\bvs\b|\bversus\b|\bcompare\b|\bpick\b|\bchoose\b|\bbetween\b)/i.test(query);
  }

  /**
   * Check for multiple noun-like tokens (rough heuristic)
   */
  private hasMultipleNounLikeTokens(words: string[]): boolean {
    const nounLike = words.filter(word => 
      word.length > 2 && 
      !['the', 'and', 'or', 'is', 'are', 'can', 'should', 'will', 'would'].includes(word.toLowerCase())
    );
    return nounLike.length >= 2;
  }

  /**
   * Check for transfer-related keywords
   */
  private hasTransferKeywords(query: string): boolean {
    return /(?:transfer|buy|sell|bring\s+in|bring\s+out|replace|swap|change|worth\s+a?\s+hit)\b/i.test(query);
  }

  /**
   * Check for fixture-related keywords (improved)
   */
  private hasFixtureKeywords(query: string): boolean {
    return /(fixtures?|fdr|difficulty|upcoming|schedule|gameweek|gw(?:\s+\d+)?)\b/i.test(query);
  }

  /**
   * Check for squad analysis keywords
   */
  private hasSquadAnalysisKeywords(query: string): boolean {
    return /(?:analyze|analysis|review|check|evaluate)\s*(?:my|squad|team)\b/i.test(query) ||
           /(?:squad|team)\s*(?:analyze|analysis|review|check|evaluate)\b/i.test(query) ||
           /(?:what|how)\s+(?:do\s+you\s+)?(?:think|feel)\s+about\s+.+?\s+in\s+my\s+(team|squad)/i.test(query) ||
           /(?:is|should)\s+.+?\s+(?:good|worth|worthwhile|worth\s+keeping)\s+(?:in|for)\s+my\s+(team|squad)/i.test(query) ||
           /(?:my\s+team|my\s+squad).*\w+/i.test(query);
  }

  /**
   * Check for player-specific advisory keywords
   */
  private hasPlayerSpecificKeywords(query: string): boolean {
    return /(?:what|should|do|about|worth|advice|opinion|thoughts?|recommendation)\b/i.test(query) &&
           /(?:keeping|holding|selling|starting|benching|captaining|transferring|dropping)\b/i.test(query);
  }

  /**
   * Check for player action keywords indicating user wants advice on specific player
   */
  private hasPlayerActionKeywords(query: string): boolean {
    return /(?:what\s+(?:should\s+)?(?:i|do)\s+(?:do\s+)?(?:with|about))\b/i.test(query) ||
           /(?:should\s+i\s+(?:keep|sell|start|bench|captain|transfer|drop))\b/i.test(query) ||
           /(?:is\s+.+?\s+worth\s+(?:keeping|holding|starting))\b/i.test(query) ||
           /(?:advice\s+(?:on|about|for))\b/i.test(query) ||
           /(?:thoughts?\s+(?:on|about))\b/i.test(query) ||
           /(?:blanking|performing|disappointing|underperforming)\b/i.test(query);
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
   * Load player and team dictionaries from FPL API
   */
  private async loadDictionaries(): Promise<void> {
    try {
      const fplApi = FPLApiService.getInstance();
      const bootstrap = await fplApi.getBootstrapData();
      
      // Build player dictionary with multiple name variations
      for (const player of bootstrap.elements) {
        const variations = [
          player.web_name.toLowerCase(),
          player.first_name.toLowerCase(),
          player.second_name.toLowerCase(),
          `${player.first_name} ${player.second_name}`.toLowerCase()
        ];
        
        for (const variation of variations) {
          if (variation.length > 1) { // Avoid single character names
            this.playerDictionary.set(variation, player);
          }
        }
      }
      
      // Build team dictionary with multiple name variations
      for (const team of bootstrap.teams) {
        const variations = [
          team.name.toLowerCase(),
          team.short_name.toLowerCase(),
          team.name.toLowerCase().replace(/\s+/g, ''), // Remove spaces for compound names
        ];
        
        for (const variation of variations) {
          this.teamDictionary.set(variation, team);
        }
      }
      
      this.isLoaded = true;
    } catch (error) {
      console.warn('Failed to load FPL dictionaries, using fallback:', error);
      this.isLoaded = false;
    }
  }

  /**
   * Stopwords to exclude from entity matching
   */
  private readonly stopwords = new Set([
    'what', 'the', 'are', 'for', 'like', 'about', 'which', 'who', 'when', 'where', 'how',
    'fixtures', 'gameweek', 'gw', 'should', 'will', 'would', 'can', 'could', 'my', 'your',
    'and', 'or', 'but', 'is', 'was', 'be', 'have', 'has', 'do', 'does', 'did', 'get', 'got'
  ]);

  /**
   * Simple fuzzy string matching for entity recognition
   */
  private fuzzyMatch(query: string, target: string, maxDistance: number = 1): boolean {
    if (query === target) return true;
    if (query.length < 4 || target.length < 4) return false; // Require minimum length for fuzzy
    if (Math.abs(query.length - target.length) > maxDistance) return false;
    
    // Simple Levenshtein distance calculation
    const matrix: number[][] = [];
    for (let i = 0; i <= query.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= target.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= query.length; i++) {
      for (let j = 1; j <= target.length; j++) {
        const cost = query[i - 1] === target[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    return matrix[query.length][target.length] <= maxDistance;
  }

  /**
   * Extract entities from the query using dynamic dictionaries with improved precision
   */
  private extractEntities(query: string, intent: QueryIntent['type']): QueryIntent['entities'] {
    const entities: QueryIntent['entities'] = {};
    const words = query.split(' ').map(w => w.toLowerCase());
    const filteredWords = words.filter(word => !this.stopwords.has(word) && word.length >= 3);

    // Enhanced player extraction with better handling of multiple players and special characters
    const players: string[] = [];
    
    // Normalize query for better matching (handle special characters like Mbappé)
    const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    
    Array.from(this.playerDictionary.entries()).forEach(([playerName, player]) => {
      const nameParts = playerName.split(' ');
      const normalizedPlayerName = playerName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      // Exact word boundary match (case insensitive) on both original and normalized
      const escapedOriginal = playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedNormalized = normalizedPlayerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      if (new RegExp(`\\b${escapedOriginal}\\b`, 'i').test(query) || 
          new RegExp(`\\b${escapedNormalized}\\b`, 'i').test(normalizedQuery)) {
        players.push(player.web_name);
      }
      // Multi-token fuzzy match only if both parts match approximately
      else if (nameParts.length > 1) {
        const matchingParts = nameParts.filter(part => 
          part.length >= 4 && 
          filteredWords.some(word => word.length >= 4 && this.fuzzyMatch(word, part))
        );
        if (matchingParts.length >= 2) {
          players.push(player.web_name);
        }
      }
    });
    
    if (players.length > 0) {
      entities.players = Array.from(new Set(players));
    }

    // Extract team names using exact matching only (no fuzzy for teams)
    const teams: string[] = [];
    Array.from(this.teamDictionary.entries()).forEach(([teamName, team]) => {
      // Only exact word boundary matches for teams
      if (new RegExp(`\\b${teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(query)) {
        teams.push(team.short_name);
      }
    });
    if (teams.length > 0) {
      entities.teams = Array.from(new Set(teams));
    }

    // Extract gameweeks
    const gameweekMatches = query.match(/(?:gameweek|gw)\s*(\d+)/gi);
    if (gameweekMatches) {
      entities.gameweeks = gameweekMatches.map(match => {
        const num = match.match(/\d+/);
        return num ? parseInt(num[0]) : 0;
      }).filter(n => n > 0);
    }

    // Extract chips with better synonyms (include generic "chip" for consistency)
    const chipMatches = query.match(/(?:wildcard|bench boost|triple captain|free hit|wc|bb|tc|fh|chip)/gi);
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
   * Calculate entity-based confidence score
   */
  private calculateEntityConfidence(entities: QueryIntent['entities']): number {
    let totalConfidence = 0;
    let entityCount = 0;

    // Players: exact matches = 1.0, fuzzy = 0.8
    if (entities.players && entities.players.length > 0) {
      totalConfidence += entities.players.length * 0.9; // Assume most are good matches after filtering
      entityCount += entities.players.length;
    }

    // Teams: exact matches only = 1.0
    if (entities.teams && entities.teams.length > 0) {
      totalConfidence += entities.teams.length * 1.0;
      entityCount += entities.teams.length;
    }

    // Other entities
    if (entities.chips && entities.chips.length > 0) {
      totalConfidence += entities.chips.length * 1.0;
      entityCount += entities.chips.length;
    }

    if (entities.gameweeks && entities.gameweeks.length > 0) {
      totalConfidence += entities.gameweeks.length * 1.0;
      entityCount += entities.gameweeks.length;
    }

    if (entities.positions && entities.positions.length > 0) {
      totalConfidence += entities.positions.length * 0.9;
      entityCount += entities.positions.length;
    }

    if (entities.budget) {
      totalConfidence += 1.0;
      entityCount += 1;
    }

    return entityCount > 0 ? (totalConfidence / entityCount) * 100 : 0;
  }

  /**
   * Calculate intent-specific confidence score
   */
  private calculateIntentConfidence(query: string, intent: QueryIntent['type']): number {
    const words = query.split(' ');
    let confidence = 30; // Base confidence

    // Intent-specific confidence boosts
    switch (intent) {
      case 'chip_strategy':
        if (this.hasExplicitChipKeywords(query)) confidence += 40;
        break;
      case 'player_comparison':
        if (this.hasComparisonKeywords(query)) confidence += 30;
        break;
      case 'player_advice':
        if (this.hasPlayerSpecificKeywords(query) || this.hasPlayerActionKeywords(query)) confidence += 45;
        break;
      case 'transfer_suggestions':
        if (this.hasTransferKeywords(query)) confidence += 35;
        break;
      case 'fixture_analysis':
        if (this.hasFixtureKeywords(query)) confidence += 35;
        break;
      case 'squad_analysis':
        if (this.hasSquadAnalysisKeywords(query)) confidence += 40;
        break;
      case 'general_advice':
        confidence += 10; // Lower confidence for general catch-all
        break;
    }

    // Boost for FPL-specific terms
    const fplTermCount = Array.from(this.fplTerms.keys()).filter(term => query.includes(term)).length;
    confidence += fplTermCount * 8;

    // Penalize very short or very long queries
    if (words.length < 3) confidence -= 15;
    if (words.length > 25) confidence -= 10;

    return Math.max(20, Math.min(95, confidence));
  }

  /**
   * Check for explicit chip keywords
   */
  private hasExplicitChipKeywords(query: string): boolean {
    return /(?:wildcard|bench boost|triple captain|free hit|chip)\b/i.test(query);
  }

  /**
   * Calculate overall confidence score for the interpretation with dynamic weighting
   */
  private calculateConfidence(query: string, intent: QueryIntent['type'], entities: QueryIntent['entities']): number {
    const entityConfidence = this.calculateEntityConfidence(entities);
    const intentConfidence = this.calculateIntentConfidence(query, intent);
    
    // Dynamic weighting: if no entities but clear intent keywords, prioritize intent
    const entityCount = Object.values(entities).filter(v => v && (Array.isArray(v) ? v.length > 0 : v > 0)).length;
    const hasExplicitIntentKeywords = this.hasExplicitIntentKeywords(query, intent);
    
    let intentWeight = 0.6;
    let entityWeight = 0.4;
    
    if (entityCount === 0 && hasExplicitIntentKeywords) {
      intentWeight = 0.8;
      entityWeight = 0.2;
    }
    
    const overallConfidence = (intentConfidence * intentWeight) + (entityConfidence * entityWeight);
    
    return Math.round(Math.max(20, Math.min(95, overallConfidence)));
  }

  /**
   * Check if query has explicit intent keywords for the given intent type
   */
  private hasExplicitIntentKeywords(query: string, intent: QueryIntent['type']): boolean {
    switch (intent) {
      case 'squad_analysis': return this.hasSquadAnalysisKeywords(query);
      case 'chip_strategy': return this.hasExplicitChipKeywords(query);
      case 'player_comparison': return this.hasComparisonKeywords(query);
      case 'player_advice': return this.hasPlayerSpecificKeywords(query) || this.hasPlayerActionKeywords(query);
      case 'transfer_suggestions': return this.hasTransferKeywords(query);
      case 'fixture_analysis': return this.hasFixtureKeywords(query);
      default: return false;
    }
  }

  /**
   * Generate clarification question for low-confidence queries
   */
  public generateClarificationQuestion(query: string, entities: QueryIntent['entities']): string {
    const hasPlayers = entities.players && entities.players.length > 0;
    const hasChips = entities.chips && entities.chips.length > 0;
    const hasGameweeks = entities.gameweeks && entities.gameweeks.length > 0;

    if (hasPlayers && hasChips) {
      return "I can help with both player analysis and chip strategy. Which would you like me to focus on?";
    }

    if (hasPlayers) {
      return "I see you mentioned some players. Are you looking to compare them, get transfer advice, or analyze their fixtures?";
    }

    if (hasChips) {
      return "I can help with your chip strategy! Are you asking about when to use it, or do you want me to analyze if now is the right time?";
    }

    if (hasGameweeks) {
      return "I can help with gameweek analysis! Are you asking about fixtures, transfers, or chip timing for that gameweek?";
    }

    return "I'd love to help! Could you be more specific? I can analyze your squad, suggest transfers, help with chip timing, or compare players.";
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
    if (normalized === 'chip') return 'chip'; // Generic chip reference
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
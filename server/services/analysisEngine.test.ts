import { describe, it, expect } from 'vitest';
import { AnalysisEngine } from './analysisEngine';

describe('AnalysisEngine', () => {
  const analysisEngine = new AnalysisEngine();

  describe('findOptimalBenchBoost', () => {
    it('should return null when gameweeks array is empty', () => {
      const emptyGameweeks: any[] = [];
      const result = analysisEngine.findOptimalBenchBoost(emptyGameweeks);
      expect(result).toBeNull();
    });
  });

  describe('findOptimalWildcard', () => {
    it('should return null when gameweeks array is empty', () => {
      const emptyGameweeks: any[] = [];
      const result = analysisEngine.findOptimalWildcard(emptyGameweeks);
      expect(result).toBeNull();
    });
  });
});

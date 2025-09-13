import FixtureDifficultyChart from '../FixtureDifficultyChart';

// todo: remove mock data when integrating with real FPL API
const mockGameweeks = [
  { gameweek: 5, totalFDR: 32, averageFDR: 2.1, difficulty: 'easy' as const },
  { gameweek: 6, totalFDR: 38, averageFDR: 2.5, difficulty: 'medium' as const },
  { gameweek: 7, totalFDR: 28, averageFDR: 1.9, difficulty: 'easy' as const },
  { gameweek: 8, totalFDR: 26, averageFDR: 1.7, difficulty: 'easy' as const },
  { gameweek: 9, totalFDR: 45, averageFDR: 3.0, difficulty: 'hard' as const },
  { gameweek: 10, totalFDR: 42, averageFDR: 2.8, difficulty: 'hard' as const },
  { gameweek: 11, totalFDR: 35, averageFDR: 2.3, difficulty: 'medium' as const },
  { gameweek: 12, totalFDR: 30, averageFDR: 2.0, difficulty: 'easy' as const },
  { gameweek: 13, totalFDR: 41, averageFDR: 2.7, difficulty: 'hard' as const },
  { gameweek: 14, totalFDR: 33, averageFDR: 2.2, difficulty: 'easy' as const }
];

export default function FixtureDifficultyChartExample() {
  return (
    <FixtureDifficultyChart 
      gameweeks={mockGameweeks}
      highlightedGameweeks={[8, 12]} // Highlight optimal gameweeks
    />
  );
}
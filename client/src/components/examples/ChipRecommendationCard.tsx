import ChipRecommendationCard from '../ChipRecommendationCard';

// todo: remove mock data when integrating with real API
const mockRecommendation = {
  chipType: 'bench-boost' as const,
  gameweek: 8,
  priority: 'high' as const,
  title: 'Optimal Bench Boost Window',
  description: 'Your entire squad faces favorable fixtures with an average FDR of 2.1, maximizing your bench potential.',
  reasoning: [
    'All 15 players have FDR of 2 or below',
    'Strong bench options against weak defenses',
    'No injury concerns in your squad',
    'Historically high-scoring gameweek'
  ],
  confidence: 87
};

export default function ChipRecommendationCardExample() {
  return (
    <ChipRecommendationCard 
      recommendation={mockRecommendation}
      onViewDetails={(chipType, gw) => console.log('Details for', chipType, 'GW', gw)}
    />
  );
}
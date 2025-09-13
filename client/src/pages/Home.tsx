import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import TeamIdInput from "@/components/TeamIdInput";
import ChipRecommendationCard from "@/components/ChipRecommendationCard";
import SquadOverview from "@/components/SquadOverview";
import FixtureDifficultyChart from "@/components/FixtureDifficultyChart";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

// todo: remove mock data when integrating with real FPL API
const mockRecommendations = [
  {
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
  },
  {
    chipType: 'triple-captain' as const,
    gameweek: 12,
    priority: 'high' as const,
    title: 'Premium Captain Opportunity',
    description: 'Haaland faces Norwich at home - historically the highest-scoring fixture type for premium assets.',
    reasoning: [
      'Haaland averages 12.4 points vs newly promoted sides',
      'Man City historically score 3+ goals at home vs Norwich',
      'No other premiums have comparable fixtures',
      'Perfect timing before difficult fixture swing'
    ],
    confidence: 92
  },
  {
    chipType: 'wildcard' as const,
    gameweek: 15,
    priority: 'medium' as const,
    title: 'Strategic Wildcard Window',
    description: 'Your current squad faces a difficult run from GW16-19. Pivot to teams with favorable fixtures.',
    reasoning: [
      'Current squad averages 3.2 FDR in upcoming weeks',
      'Liverpool and Arsenal enter excellent fixture runs',
      'International break provides planning time',
      'Must use before GW19 deadline'
    ],
    confidence: 78
  },
  {
    chipType: 'free-hit' as const,
    gameweek: 18,
    priority: 'low' as const,
    title: 'Potential Free Hit Opportunity',
    description: 'Blank gameweek with only 6 fixtures scheduled. Consider one-week punt strategy.',
    reasoning: [
      'Only 12 teams have fixtures this gameweek',
      'Heavy template players unlikely to start',
      'Differential captain options available',
      'Can be saved for better opportunity later'
    ],
    confidence: 64
  }
];

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

const mockPlayers = [
  { id: 1, name: 'Alisson', position: 'GK', team: 'LIV', price: 5.5, points: 45 },
  { id: 2, name: 'Pickford', position: 'GK', team: 'EVE', price: 4.9, points: 32 },
  { id: 3, name: 'Alexander-Arnold', position: 'DEF', team: 'LIV', price: 7.2, points: 78 },
  { id: 4, name: 'Robertson', position: 'DEF', team: 'LIV', price: 6.8, points: 65 },
  { id: 5, name: 'Walker', position: 'DEF', team: 'MCI', price: 5.4, points: 52 },
  { id: 6, name: 'White', position: 'DEF', team: 'ARS', price: 4.7, points: 43 },
  { id: 7, name: 'Mitchell', position: 'DEF', team: 'CRY', price: 4.2, points: 28 },
  { id: 8, name: 'Salah', position: 'MID', team: 'LIV', price: 12.9, points: 156 },
  { id: 9, name: 'Palmer', position: 'MID', team: 'CHE', price: 10.8, points: 134 },
  { id: 10, name: 'Saka', position: 'MID', team: 'ARS', price: 10.1, points: 98 },
  { id: 11, name: 'Luis Diaz', position: 'MID', team: 'LIV', price: 8.2, points: 76 },
  { id: 12, name: 'Gordon', position: 'MID', team: 'NEW', price: 6.1, points: 54 },
  { id: 13, name: 'Haaland', position: 'FWD', team: 'MCI', price: 14.7, points: 198 },
  { id: 14, name: 'Isak', position: 'FWD', team: 'NEW', price: 8.4, points: 87 },
  { id: 15, name: 'Havertz', position: 'FWD', team: 'ARS', price: 8.1, points: 72 }
];

type AppState = 'input' | 'loading' | 'results';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('input');
  const [teamId, setTeamId] = useState('');

  const handleAnalyze = (id: string) => {
    setTeamId(id);
    setAppState('loading');
    console.log('Starting analysis for team:', id);
    
    // todo: replace with real API call
    setTimeout(() => {
      setAppState('results');
      console.log('Analysis complete');
    }, 2000);
  };

  const handleReset = () => {
    setAppState('input');
    setTeamId('');
    console.log('Reset to input state');
  };

  const totalValue = mockPlayers.reduce((sum, player) => sum + player.price, 0);
  const totalPoints = mockPlayers.reduce((sum, player) => sum + player.points, 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-8">
        {appState === 'input' && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-foreground">
                Optimize Your Chip Strategy
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                Get data-driven recommendations for when to use your Wildcard, Bench Boost, 
                Triple Captain, and Free Hit chips based on your unique 15-man squad.
              </p>
            </div>
            
            <TeamIdInput onAnalyze={handleAnalyze} />

            <Card className="p-6">
              <div className="grid md:grid-cols-2 gap-6 text-sm text-muted-foreground">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">How it works:</h3>
                  <ul className="space-y-1">
                    <li>• Analyzes your current 15-player squad</li>
                    <li>• Calculates fixture difficulty ratings</li>
                    <li>• Identifies optimal chip timing windows</li>
                    <li>• Provides confidence-rated recommendations</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Key features:</h3>
                  <ul className="space-y-1">
                    <li>• Squad-specific analysis (not generic advice)</li>
                    <li>• Season-long strategic planning</li>
                    <li>• Fixture difficulty visualization</li>
                    <li>• Confidence scoring for each recommendation</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        )}

        {appState === 'loading' && (
          <div className="max-w-md mx-auto">
            <Card className="p-8">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <h2 className="text-xl font-semibold text-foreground">
                  Analyzing Your Squad
                </h2>
                <p className="text-muted-foreground">
                  Fetching squad data and calculating fixture difficulty ratings for Team ID: {teamId}
                </p>
              </div>
            </Card>
          </div>
        )}

        {appState === 'results' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground" data-testid="text-results-title">
                  Chip Strategy Recommendations
                </h2>
                <p className="text-muted-foreground">
                  Based on analysis of Team ID: {teamId}
                </p>
              </div>
              <Button 
                variant="outline" 
                onClick={handleReset}
                data-testid="button-analyze-new"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Analyze New Team
              </Button>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {/* Squad Overview */}
              <div className="lg:col-span-1">
                <SquadOverview 
                  players={mockPlayers}
                  totalValue={totalValue}
                  totalPoints={totalPoints}
                  teamName="The Chip Masters"
                />
              </div>

              {/* Fixture Difficulty Chart */}
              <div className="lg:col-span-2">
                <FixtureDifficultyChart 
                  gameweeks={mockGameweeks}
                  highlightedGameweeks={[8, 12, 15]} // Highlighted optimal gameweeks
                />
              </div>
            </div>

            {/* Chip Recommendations */}
            <div>
              <h3 className="text-xl font-semibold text-foreground mb-4">
                Recommended Chip Strategy
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                {mockRecommendations.map((recommendation, index) => (
                  <ChipRecommendationCard 
                    key={`${recommendation.chipType}-${index}`}
                    recommendation={recommendation}
                    onViewDetails={(chipType, gw) => 
                      console.log('View details for', chipType, 'GW', gw)
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
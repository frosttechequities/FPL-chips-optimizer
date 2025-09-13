import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Calendar, 
  Star, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  Users,
  Shield,
  Zap,
  RotateCcw
} from "lucide-react";
import { type ChipRecommendation, type GameweekFDR, type ProcessedPlayer } from "@shared/schema";

interface ChipDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  recommendation: ChipRecommendation | null;
  gameweeks: GameweekFDR[];
  players: ProcessedPlayer[];
}

const chipConfig = {
  'wildcard': { icon: RotateCcw, color: 'bg-chart-4', label: 'Wildcard' },
  'bench-boost': { icon: TrendingUp, color: 'bg-chart-1', label: 'Bench Boost' },
  'triple-captain': { icon: Star, color: 'bg-chart-2', label: 'Triple Captain' },
  'free-hit': { icon: Zap, color: 'bg-chart-3', label: 'Free Hit' }
};

const getDifficultyColor = (fdr: number) => {
  if (fdr <= 2) return 'text-green-600 bg-green-50';
  if (fdr >= 4) return 'text-red-600 bg-red-50';
  return 'text-yellow-600 bg-yellow-50';
};

export default function ChipDetailModal({
  isOpen,
  onClose,
  recommendation,
  gameweeks,
  players
}: ChipDetailModalProps) {
  if (!recommendation) return null;

  const chipInfo = chipConfig[recommendation.chipType];
  const ChipIcon = chipInfo.icon;
  
  const targetGameweek = gameweeks.find(gw => gw.gameweek === recommendation.gameweek);
  const surroundingGameweeks = gameweeks.filter(gw => 
    gw.gameweek >= recommendation.gameweek - 1 && 
    gw.gameweek <= recommendation.gameweek + 2
  );

  const getTopPlayersForGameweek = (gameweek: number) => {
    const gw = gameweeks.find(g => g.gameweek === gameweek);
    if (!gw) return [];
    
    return gw.fixtures
      .map(fixture => ({
        ...fixture,
        player: players.find(p => p.id === fixture.playerId)
      }))
      .filter(f => f.player)
      .sort((a, b) => (b.player?.points || 0) - (a.player?.points || 0))
      .slice(0, 5);
  };

  const getChipSpecificAdvice = () => {
    switch (recommendation.chipType) {
      case 'bench-boost':
        const benchPlayers = players.slice(11); // Assuming last 4 are bench
        return {
          title: 'Bench Players Analysis',
          content: (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-3">
                Your bench players for this gameweek:
              </p>
              {benchPlayers.map(player => (
                <div key={player.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                  <div>
                    <span className="font-medium">{player.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">({player.team})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {player.position}
                    </Badge>
                    <span className="text-sm font-medium">{player.points} pts</span>
                  </div>
                </div>
              ))}
            </div>
          )
        };
      
      case 'triple-captain':
        const topScorer = players.sort((a, b) => b.points - a.points)[0];
        return {
          title: 'Captain Choice Analysis',
          content: (
            <div className="space-y-3">
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-primary" />
                  <div>
                    <h4 className="font-semibold">{topScorer.name} ({topScorer.team})</h4>
                    <p className="text-sm text-muted-foreground">
                      {topScorer.points} total points | £{topScorer.price}m
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Based on form, fixtures, and historical performance against similar opponents.
              </p>
            </div>
          )
        };
      
      case 'wildcard':
        return {
          title: 'Transfer Strategy',
          content: (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Consider targeting teams with favorable upcoming fixtures:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Array.from(new Set(players.map(p => p.team))).slice(0, 6).map(team => (
                  <Badge key={team} variant="outline" className="justify-center">
                    {team}
                  </Badge>
                ))}
              </div>
            </div>
          )
        };
      
      case 'free-hit':
        return {
          title: 'One-Week Strategy',
          content: (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Perfect opportunity to target players from teams with the best fixtures this week only.
              </p>
              <div className="p-2 bg-muted/50 rounded">
                <p className="text-sm font-medium">Differential Targets:</p>
                <p className="text-xs text-muted-foreground">
                  Focus on players with {"<"}3% ownership facing weak defenses
                </p>
              </div>
            </div>
          )
        };
      
      default:
        return null;
    }
  };

  const chipAdvice = getChipSpecificAdvice();
  const topFixtures = getTopPlayersForGameweek(recommendation.gameweek);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="modal-chip-details">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className={`inline-flex items-center justify-center w-10 h-10 ${chipInfo.color} rounded-lg`}>
              <ChipIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl">{recommendation.title}</span>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline">GW {recommendation.gameweek}</Badge>
                <Badge variant="secondary">{recommendation.confidence}% confidence</Badge>
              </div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 mt-6">
          {/* Strategic Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Strategic Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">{recommendation.description}</p>
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Key Reasoning:</h4>
                <ul className="space-y-2">
                  {recommendation.reasoning.map((reason, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <TrendingUp className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
                      {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Gameweek Fixture Analysis */}
            {targetGameweek && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    GW {targetGameweek.gameweek} Fixture Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <span className="text-sm">Average FDR</span>
                      <Badge className={getDifficultyColor(targetGameweek.averageFDR)}>
                        {targetGameweek.averageFDR.toFixed(1)}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium">Key Fixtures:</h4>
                      {topFixtures.slice(0, 4).map(fixture => (
                        <div key={`${fixture.playerId}-${recommendation.gameweek}`} 
                             className="flex items-center justify-between text-sm p-2 border rounded">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{fixture.playerName}</span>
                            <span className="text-muted-foreground">
                              {fixture.isHome ? 'vs' : '@'} {fixture.opponent}
                            </span>
                          </div>
                          <Badge size="sm" className={getDifficultyColor(fixture.fdr)}>
                            {fixture.fdr}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Chip-Specific Analysis */}
            {chipAdvice && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ChipIcon className="w-5 h-5" />
                    {chipAdvice.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {chipAdvice.content}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Fixture Context */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Fixture Context (GW {recommendation.gameweek - 1} - {recommendation.gameweek + 2})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {surroundingGameweeks.map(gw => (
                  <div key={gw.gameweek} className="text-center p-3 border rounded-lg">
                    <div className="text-lg font-bold">GW {gw.gameweek}</div>
                    <div className={`text-sm font-medium ${
                      gw.gameweek === recommendation.gameweek ? 'text-primary' : 'text-muted-foreground'
                    }`}>
                      FDR: {gw.averageFDR.toFixed(1)}
                    </div>
                    <Badge 
                      size="sm" 
                      variant={gw.gameweek === recommendation.gameweek ? 'default' : 'outline'}
                      className="mt-1"
                    >
                      {gw.difficulty}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Action Button */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} data-testid="button-close-modal">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
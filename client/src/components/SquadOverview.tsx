import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, DollarSign, TrendingUp, Award, Target, Star, BarChart3 } from "lucide-react";

interface Player {
  id: number;
  name: string;
  position: string;
  team: string;
  price: number;
  points: number;
}

interface SquadOverviewProps {
  players: Player[];
  totalValue: number;
  totalPoints: number;
  teamName: string;
}

export default function SquadOverview({ 
  players, 
  totalValue, 
  totalPoints, 
  teamName 
}: SquadOverviewProps) {
  const groupedPlayers = {
    GK: players.filter(p => p.position === 'GK'),
    DEF: players.filter(p => p.position === 'DEF'),
    MID: players.filter(p => p.position === 'MID'),
    FWD: players.filter(p => p.position === 'FWD')
  };

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'GK': return 'bg-chart-2';
      case 'DEF': return 'bg-chart-1';
      case 'MID': return 'bg-chart-4';
      case 'FWD': return 'bg-chart-3';
      default: return 'bg-muted';
    }
  };

  // Analytics calculations
  const topScorer = players.reduce((top, player) => player.points > top.points ? player : top, players[0]);
  const averagePoints = totalPoints / players.length;
  const valueEfficiency = totalPoints / totalValue; // Points per million
  const benchPlayers = players.slice(11); // Assuming last 4 are bench
  const benchPoints = benchPlayers.reduce((sum, p) => sum + p.points, 0);

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2" data-testid="text-team-name">
          <Users className="w-5 h-5 text-primary" />
          {teamName}
        </CardTitle>
        
        {/* Key Stats */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Squad Value</span>
            </div>
            <div className="text-lg font-bold text-foreground" data-testid="text-total-value">
              £{totalValue.toFixed(1)}m
            </div>
          </div>
          
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Points</span>
            </div>
            <div className="text-lg font-bold text-foreground" data-testid="text-total-points">
              {totalPoints} pts
            </div>
          </div>
        </div>

        {/* Squad Analytics */}
        <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">Squad Analytics</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Avg Points/Player:</span>
              <span className="ml-1 font-medium">{averagePoints.toFixed(1)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Points/£m:</span>
              <span className="ml-1 font-medium">{valueEfficiency.toFixed(1)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Bench Points:</span>
              <span className="ml-1 font-medium">{benchPoints}</span>
            </div>
            <div className="flex items-center gap-1">
              <Star className="w-3 h-3 text-chart-1" />
              <span className="font-medium truncate">{topScorer?.name}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {Object.entries(groupedPlayers).map(([position, positionPlayers]) => (
            <div key={position} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={`${getPositionColor(position)} text-white text-xs`}>
                    {position}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {positionPlayers.length} player{positionPlayers.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {positionPlayers.reduce((sum, p) => sum + p.points, 0)} pts total
                </div>
              </div>
              
              <div className="grid gap-2">
                {positionPlayers.map((player) => {
                  const isTopInPosition = player === positionPlayers.reduce((top, p) => p.points > top.points ? p : top);
                  return (
                    <div 
                      key={player.id} 
                      className={`flex items-center justify-between p-3 rounded-lg border transition-all hover-elevate ${
                        isTopInPosition ? 'border-chart-1/30 bg-chart-1/5' : 'border-border bg-muted/30'
                      }`}
                      data-testid={`player-${player.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm text-foreground truncate">
                            {player.name}
                          </div>
                          {isTopInPosition && (
                            <Award className="w-3 h-3 text-chart-1 flex-shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {player.team}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-sm font-medium text-foreground">
                          {player.points} pts
                        </div>
                        <div className="text-xs text-muted-foreground">
                          £{player.price}m
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
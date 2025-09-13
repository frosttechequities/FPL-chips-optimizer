import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, DollarSign, TrendingUp } from "lucide-react";

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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2" data-testid="text-team-name">
          <Users className="w-5 h-5 text-primary" />
          {teamName}
        </CardTitle>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <DollarSign className="w-4 h-4" />
            <span data-testid="text-total-value">£{totalValue.toFixed(1)}m</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            <span data-testid="text-total-points">{totalPoints} pts</span>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {Object.entries(groupedPlayers).map(([position, positionPlayers]) => (
            <div key={position} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={`${getPositionColor(position)} text-white`}>
                  {position}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {positionPlayers.length} player{positionPlayers.length !== 1 ? 's' : ''}
                </span>
              </div>
              
              <div className="grid gap-2">
                {positionPlayers.map((player) => (
                  <div 
                    key={player.id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-md hover-elevate"
                    data-testid={`player-${player.id}`}
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm text-foreground">
                        {player.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {player.team}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-foreground">
                        {player.points} pts
                      </div>
                      <div className="text-xs text-muted-foreground">
                        £{player.price}m
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
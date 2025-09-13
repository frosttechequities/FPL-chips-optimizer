import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, DollarSign, TrendingUp, Award, Target, Star, BarChart3, Zap, Activity } from "lucide-react";

interface Player {
  id: number;
  name: string;
  position: string;
  team: string;
  price: number;
  points: number;
  
  // Enhanced Phase 1 data
  expectedPoints?: number;
  volatility?: number;
  advancedStats?: {
    playerId: number;
    xG: number;
    xA: number;
    xMins: number;
    role: 'nailed' | 'rotation' | 'benchwarmer';
    volatility: number;
    formTrend: 'rising' | 'stable' | 'declining';
    fixtureAdjustedXG: number;
    fixtureAdjustedXA: number;
    lastUpdated: string;
  };
}

interface SquadOverviewProps {
  players: Player[];
  totalValue: number;
  totalPoints: number;
  teamName: string;
  
  // Enhanced Phase 1 data
  expectedPointsSource?: 'fdr' | 'odds' | 'advanced-stats' | 'simulation';
  confidenceLevel?: number;
  dataFreshness?: {
    odds: string;
    stats: string;
    fpl: string;
  };
}

export default function SquadOverview({ 
  players, 
  totalValue, 
  totalPoints, 
  teamName,
  expectedPointsSource,
  confidenceLevel,
  dataFreshness
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
  
  // Enhanced Phase 1 analytics
  const hasEnhancedData = players.some(p => p.advancedStats || p.volatility || p.expectedPoints);
  const averageVolatility = hasEnhancedData ? 
    players.filter(p => p.volatility).reduce((sum, p) => sum + (p.volatility || 0), 0) / players.filter(p => p.volatility).length : 0;
  const nailedPlayers = players.filter(p => p.advancedStats?.role === 'nailed').length;
  const expectedTotalPoints = players.reduce((sum, p) => sum + (p.expectedPoints || 0), 0);
  
  const getExpectedPointsSourceLabel = () => {
    switch(expectedPointsSource) {
      case 'odds': return 'Bookmaker Odds';
      case 'advanced-stats': return 'Advanced Stats';
      case 'simulation': return 'Monte Carlo';
      default: return 'FDR Analysis';
    }
  };
  
  const getVolatilityColor = (volatility: number) => {
    if (volatility <= 0.3) return 'text-green-600';
    if (volatility <= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };
  
  const getRoleColor = (role: string) => {
    switch(role) {
      case 'nailed': return 'text-green-600 bg-green-50';
      case 'rotation': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-red-600 bg-red-50';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between" data-testid="text-team-name">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            {teamName}
          </div>
          
          {/* Enhanced Phase 1: Intelligence Status */}
          {hasEnhancedData && expectedPointsSource && (
            <div className="flex items-center gap-1">
              <Zap className="w-4 h-4 text-chart-1" />
              <span className="text-xs font-medium text-chart-1 bg-chart-1/10 px-2 py-1 rounded">
                {getExpectedPointsSourceLabel()}
              </span>
              {confidenceLevel && (
                <span className="text-xs text-muted-foreground">
                  ({confidenceLevel}% confidence)
                </span>
              )}
            </div>
          )}
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
              <span className="text-xs text-muted-foreground">
                {expectedTotalPoints > 0 ? 'Expected Points' : 'Total Points'}
              </span>
            </div>
            <div className="text-lg font-bold text-foreground" data-testid="text-total-points">
              {expectedTotalPoints > 0 ? expectedTotalPoints.toFixed(1) : totalPoints} pts
              {expectedTotalPoints > 0 && (
                <div className="text-xs text-muted-foreground">
                  ({totalPoints} actual)
                </div>
              )}
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
            {hasEnhancedData ? (
              <>
                <div>
                  <span className="text-muted-foreground">Avg Volatility:</span>
                  <span className={`ml-1 font-medium ${getVolatilityColor(averageVolatility)}`}>
                    {averageVolatility.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Nailed Players:</span>
                  <span className="ml-1 font-medium text-green-600">{nailedPlayers}</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-muted-foreground">Bench Points:</span>
                  <span className="ml-1 font-medium">{benchPoints}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-chart-1" />
                  <span className="font-medium truncate">{topScorer?.name}</span>
                </div>
              </>
            )}
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
                          {player.expectedPoints ? player.expectedPoints.toFixed(1) : player.points} pts
                          {player.expectedPoints && (
                            <span className="text-xs text-muted-foreground ml-1">
                              ({player.points} actual)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          £{player.price}m
                          {player.volatility && (
                            <span className={`ml-1 ${getVolatilityColor(player.volatility)}`}>
                              σ{player.volatility.toFixed(2)}
                            </span>
                          )}
                        </div>
                        
                        {/* Enhanced Phase 1: Advanced Stats Display */}
                        {player.advancedStats && (
                          <div className="mt-1 space-y-0.5">
                            <div className="flex items-center gap-1">
                              <Badge className={`text-xs px-1 py-0 ${getRoleColor(player.advancedStats.role)}`}>
                                {player.advancedStats.role}
                              </Badge>
                              <span className={`text-xs ${player.advancedStats.formTrend === 'rising' ? 'text-green-600' : 
                                player.advancedStats.formTrend === 'declining' ? 'text-red-600' : 'text-muted-foreground'}`}>
                                {player.advancedStats.formTrend}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              xG: {player.advancedStats.fixtureAdjustedXG.toFixed(1)} 
                              {player.advancedStats.fixtureAdjustedXA > 0 && (
                                <span className="ml-1">xA: {player.advancedStats.fixtureAdjustedXA.toFixed(1)}</span>
                              )}
                            </div>
                          </div>
                        )}
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
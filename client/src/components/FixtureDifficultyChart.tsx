import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Calendar } from "lucide-react";

interface GameweekFDR {
  gameweek: number;
  totalFDR: number;
  averageFDR: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface FixtureDifficultyChartProps {
  gameweeks: GameweekFDR[];
  highlightedGameweeks?: number[];
}

const difficultyConfig = {
  'easy': { color: 'bg-chart-1 text-white', icon: TrendingDown, label: 'Easy' },
  'medium': { color: 'bg-chart-2 text-white', icon: Minus, label: 'Medium' },
  'hard': { color: 'bg-chart-3 text-white', icon: TrendingUp, label: 'Hard' }
};

export default function FixtureDifficultyChart({ 
  gameweeks, 
  highlightedGameweeks = [] 
}: FixtureDifficultyChartProps) {
  const maxFDR = Math.max(...gameweeks.map(gw => gw.totalFDR));
  const minFDR = Math.min(...gameweeks.map(gw => gw.totalFDR));
  
  const getBarHeight = (totalFDR: number) => {
    const range = maxFDR - minFDR;
    if (range === 0) return 50;
    return 20 + ((totalFDR - minFDR) / range) * 60; // 20% to 80% height
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Squad Fixture Difficulty Timeline
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Total FDR across your 15-man squad for upcoming gameweeks
        </p>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(difficultyConfig).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div key={key} className="flex items-center gap-1">
                  <Badge className={`${config.color} text-xs`}>
                    <Icon className="w-3 h-3 mr-1" />
                    {config.label}
                  </Badge>
                </div>
              );
            })}
          </div>

          {/* Chart */}
          <div className="space-y-3">
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${gameweeks.length}, 1fr)` }}>
              {gameweeks.map((gw) => {
                const difficultyInfo = difficultyConfig[gw.difficulty];
                const Icon = difficultyInfo.icon;
                const isHighlighted = highlightedGameweeks.includes(gw.gameweek);
                const barHeight = getBarHeight(gw.totalFDR);
                
                return (
                  <div key={gw.gameweek} className="flex flex-col items-center gap-2">
                    {/* Bar */}
                    <div className="relative w-8 h-20 bg-muted rounded-sm overflow-hidden">
                      <div 
                        className={`absolute bottom-0 w-full transition-all duration-500 ${difficultyInfo.color} ${isHighlighted ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                        style={{ height: `${barHeight}%` }}
                        data-testid={`bar-gw-${gw.gameweek}`}
                      />
                      {isHighlighted && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full" />
                      )}
                    </div>
                    
                    {/* Labels */}
                    <div className="text-center">
                      <div className="text-xs font-medium text-foreground" data-testid={`text-gw-${gw.gameweek}`}>
                        GW{gw.gameweek}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {gw.averageFDR.toFixed(1)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-lg font-bold text-chart-1" data-testid="text-best-gw">
                GW{gameweeks.find(gw => gw.totalFDR === minFDR)?.gameweek || '?'}
              </div>
              <div className="text-xs text-muted-foreground">Best Gameweek</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-chart-3" data-testid="text-worst-gw">
                GW{gameweeks.find(gw => gw.totalFDR === maxFDR)?.gameweek || '?'}
              </div>
              <div className="text-xs text-muted-foreground">Worst Gameweek</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-foreground" data-testid="text-avg-fdr">
                {(gameweeks.reduce((sum, gw) => sum + gw.averageFDR, 0) / gameweeks.length).toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">Avg FDR</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
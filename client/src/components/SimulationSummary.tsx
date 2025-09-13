import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart3, Target, TrendingUp, Zap, Activity, AlertTriangle } from "lucide-react";

interface SimulationSummary {
  strategy: string;
  runs: number;
  gameweeksAnalyzed: number[];
  meanTotalPoints: number;
  p10TotalPoints: number;
  p90TotalPoints: number;
  successRate: number;
  boomRate: number;
  bustRate: number;
  variance: number;
  confidenceInterval: [number, number];
  recommendationStrength: 'strong' | 'moderate' | 'weak';
  lastUpdated: string;
}

interface SimulationSummaryProps {
  simulationSummary: SimulationSummary;
  expectedPointsSource: 'fdr' | 'odds' | 'advanced-stats' | 'simulation';
  confidenceLevel: number;
}

export default function SimulationSummaryCard({ 
  simulationSummary, 
  expectedPointsSource,
  confidenceLevel 
}: SimulationSummaryProps) {
  const getSourceIcon = () => {
    switch(expectedPointsSource) {
      case 'odds': return <Target className="w-4 h-4 text-chart-1" />;
      case 'advanced-stats': return <Activity className="w-4 h-4 text-chart-2" />;
      case 'simulation': return <BarChart3 className="w-4 h-4 text-chart-3" />;
      default: return <TrendingUp className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getSourceLabel = () => {
    switch(expectedPointsSource) {
      case 'odds': return 'Bookmaker Odds Analysis';
      case 'advanced-stats': return 'Advanced Statistics';
      case 'simulation': return 'Monte Carlo Simulation';
      default: return 'Fixture Difficulty Rating';
    }
  };

  const getStrengthColor = (strength: string) => {
    switch(strength) {
      case 'strong': return 'text-green-600 bg-green-50';
      case 'moderate': return 'text-yellow-600 bg-yellow-50';
      default: return 'text-red-600 bg-red-50';
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getSourceIcon()}
            Intelligence Summary
          </div>
          <Badge className={`${getStrengthColor(simulationSummary.recommendationStrength)}`}>
            {simulationSummary.recommendationStrength} confidence
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Powered by {getSourceLabel()} • {simulationSummary.runs.toLocaleString()} simulations
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-chart-1" />
              <span className="text-xs text-muted-foreground">Expected Points</span>
            </div>
            <div className="text-lg font-bold text-foreground" data-testid="text-expected-points">
              {simulationSummary.meanTotalPoints.toFixed(1)} pts
            </div>
            <div className="text-xs text-muted-foreground">
              Range: {simulationSummary.confidenceInterval[0].toFixed(1)} - {simulationSummary.confidenceInterval[1].toFixed(1)}
            </div>
          </div>
          
          <div className="bg-muted/30 p-3 rounded-lg">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-chart-2" />
              <span className="text-xs text-muted-foreground">Success Rate</span>
            </div>
            <div className="text-lg font-bold text-foreground" data-testid="text-success-rate">
              {simulationSummary.successRate.toFixed(0)}%
            </div>
            <div className="text-xs text-muted-foreground">
              Above average outcome
            </div>
          </div>
        </div>

        {/* Outcome Distribution */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Outcome Distribution</h4>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-green-600 flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                Boom (Top 10%)
              </span>
              <span className="font-medium">{simulationSummary.boomRate.toFixed(1)}%</span>
            </div>
            <Progress 
              value={simulationSummary.boomRate} 
              className="h-2" 
              data-testid="progress-boom-rate"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-600 flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                Solid (10-90%)
              </span>
              <span className="font-medium">{(100 - simulationSummary.boomRate - simulationSummary.bustRate).toFixed(1)}%</span>
            </div>
            <Progress 
              value={100 - simulationSummary.boomRate - simulationSummary.bustRate} 
              className="h-2" 
              data-testid="progress-solid-rate"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-red-600 flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                Bust (Bottom 10%)
              </span>
              <span className="font-medium">{simulationSummary.bustRate.toFixed(1)}%</span>
            </div>
            <Progress 
              value={simulationSummary.bustRate} 
              className="h-2" 
              data-testid="progress-bust-rate"
            />
          </div>
        </div>

        {/* Risk Analysis */}
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Risk Assessment</span>
          </div>
          <div className="text-xs text-amber-600 dark:text-amber-400">
            Volatility: σ{Math.sqrt(simulationSummary.variance).toFixed(2)} • 
            GWs analyzed: {simulationSummary.gameweeksAnalyzed.join(', ')} • 
            Confidence: {confidenceLevel}%
          </div>
        </div>

        {/* Data Freshness */}
        <div className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(simulationSummary.lastUpdated).toLocaleTimeString()}
        </div>
      </CardContent>
    </Card>
  );
}
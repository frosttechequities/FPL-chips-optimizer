import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  DollarSign, 
  TrendingUp, 
  ArrowUpDown, 
  Clock, 
  Target, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap,
  Users,
  Star
} from "lucide-react";
import { type BudgetAnalysis, type TransferPlan, type TransferTarget } from "@shared/schema";

interface TransferPlannerProps {
  budget: BudgetAnalysis;
  transferPlans?: TransferPlan[];
  onPlanTransfers?: (params: { chipType?: string; maxHits?: number }) => void;
  isLoading?: boolean;
}

export default function TransferPlanner({ 
  budget, 
  transferPlans, 
  onPlanTransfers,
  isLoading = false 
}: TransferPlannerProps) {
  const nextDeadline = new Date(budget.nextDeadline);
  const timeUntilDeadline = Math.max(0, Math.floor((nextDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  const handlePlanTransfers = (chipType?: string, maxHits: number = 2) => {
    onPlanTransfers?.({ chipType, maxHits });
  };

  return (
    <div className="space-y-6">
      {/* Budget Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Budget & Transfer Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Money ITB</span>
              </div>
              <div className="text-lg font-bold text-foreground" data-testid="text-money-itb">
                £{budget.bank.toFixed(1)}m
              </div>
            </div>

            <div className="bg-chart-1/10 p-3 rounded-lg border border-chart-1/30">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-chart-1" />
                <span className="text-xs text-muted-foreground">Team Value</span>
              </div>
              <div className="text-lg font-bold text-foreground" data-testid="text-team-value">
                £{budget.teamValue.toFixed(1)}m
              </div>
            </div>

            <div className="bg-chart-2/10 p-3 rounded-lg border border-chart-2/30">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpDown className="w-4 h-4 text-chart-2" />
                <span className="text-xs text-muted-foreground">Free Transfers</span>
              </div>
              <div className="text-lg font-bold text-foreground" data-testid="text-free-transfers">
                {budget.freeTransfers}
              </div>
            </div>

            <div className="bg-chart-3/10 p-3 rounded-lg border border-chart-3/30">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-chart-3" />
                <span className="text-xs text-muted-foreground">Deadline</span>
              </div>
              <div className="text-sm font-medium text-foreground">
                {timeUntilDeadline === 0 ? 'Today' : `${timeUntilDeadline}d`}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Max Affordable Player</span>
                <span className="text-sm text-muted-foreground">
                  £{budget.canAfford.maxPlayerPrice.toFixed(1)}m
                </span>
              </div>
              <Progress 
                value={Math.min(100, (budget.canAfford.maxPlayerPrice / 15) * 100)} 
                className="h-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transfer Suggestions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4 text-chart-1" />
              Bench Upgrades
              <Badge variant="secondary" className="text-xs">
                {budget.canAfford.benchUpgrades.length} available
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {budget.canAfford.benchUpgrades.slice(0, 3).map((target: TransferTarget) => (
                <div 
                  key={target.playerId} 
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border hover-elevate"
                  data-testid={`bench-upgrade-${target.playerId}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">
                      {target.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {target.teamName} • {target.position} • {target.expectedPoints.toFixed(1)} pts
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-medium text-foreground">
                      £{target.price}m
                    </div>
                  </div>
                </div>
              ))}
              {budget.canAfford.benchUpgrades.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No affordable bench upgrades available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="w-4 h-4 text-chart-3" />
              Premium Upgrades
              <Badge variant="secondary" className="text-xs">
                {budget.canAfford.starterUpgrades.length} available
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {budget.canAfford.starterUpgrades.slice(0, 3).map((target: TransferTarget) => (
                <div 
                  key={target.playerId} 
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border hover-elevate"
                  data-testid={`starter-upgrade-${target.playerId}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground truncate">
                      {target.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {target.teamName} • {target.position} • {target.expectedPoints.toFixed(1)} pts
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-medium text-foreground">
                      £{target.price}m
                    </div>
                  </div>
                </div>
              ))}
              {budget.canAfford.starterUpgrades.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No premium upgrades within budget
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transfer Plan Generator */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Transfer Plan Generator
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Generate optimal transfer strategies based on your budget and upcoming fixtures
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Button 
              onClick={() => handlePlanTransfers(undefined, 0)}
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-plan-conservative"
            >
              <CheckCircle className="w-4 h-4" />
              Conservative
            </Button>
            
            <Button 
              onClick={() => handlePlanTransfers(undefined, 2)}
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-plan-aggressive"
            >
              <Zap className="w-4 h-4" />
              Aggressive
            </Button>
            
            <Button 
              onClick={() => handlePlanTransfers('bench-boost', 1)}
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-plan-bench-boost"
            >
              <Users className="w-4 h-4" />
              Bench Boost
            </Button>
            
            <Button 
              onClick={() => handlePlanTransfers('triple-captain', 1)}
              disabled={isLoading}
              variant="outline"
              className="flex items-center gap-2"
              data-testid="button-plan-triple-captain"
            >
              <Star className="w-4 h-4" />
              Triple Captain
            </Button>
          </div>

          {/* Transfer Plans */}
          {transferPlans && transferPlans.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-sm font-medium text-foreground">Recommended Plans</h4>
              {transferPlans.map((plan: TransferPlan, index: number) => (
                <Card key={index} className={`${plan.feasible ? 'border-chart-1/30 bg-chart-1/5' : 'border-destructive/30 bg-destructive/5'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {plan.feasible ? (
                          <CheckCircle className="w-4 h-4 text-chart-1" />
                        ) : (
                          <XCircle className="w-4 h-4 text-destructive" />
                        )}
                        <span className="font-medium text-sm">
                          GW {plan.gameweek} Plan
                          {plan.chipContext && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {plan.chipContext}
                            </Badge>
                          )}
                        </span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-foreground">
                          +{plan.projectedGain.toFixed(1)} pts
                        </div>
                        {plan.totalCost > 0 && (
                          <div className="text-xs text-muted-foreground">
                            -{plan.totalCost} hit cost
                          </div>
                        )}
                      </div>
                    </div>

                    {plan.moves.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {plan.moves.map((move, moveIndex) => (
                          <div key={moveIndex} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
                              <span className="text-destructive">{move.outPlayerName}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-chart-1">{move.inPlayerName}</span>
                            </div>
                            <div className="text-muted-foreground">
                              +{move.expectedGain.toFixed(1)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-4">
                        <span className="text-muted-foreground">
                          Confidence: {plan.confidence}%
                        </span>
                        {plan.totalHits > 0 && (
                          <span className="text-muted-foreground">
                            {plan.totalHits} hit{plan.totalHits > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        £{plan.budgetAfter.toFixed(1)}m remaining
                      </span>
                    </div>

                    {plan.notes.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <div className="text-xs text-muted-foreground">
                          {plan.notes[0]}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {isLoading && (
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                Generating transfer plans...
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
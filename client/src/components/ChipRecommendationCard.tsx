import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Calendar, Star, Zap, RotateCcw } from "lucide-react";

type ChipType = 'wildcard' | 'bench-boost' | 'triple-captain' | 'free-hit';

interface ChipRecommendation {
  chipType: ChipType;
  gameweek: number;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  reasoning: string[];
  confidence: number;
}

interface ChipRecommendationCardProps {
  recommendation: ChipRecommendation;
  onViewDetails?: (chipType: ChipType, gameweek: number) => void;
}

const chipConfig = {
  'wildcard': { icon: RotateCcw, color: 'bg-chart-4', label: 'Wildcard' },
  'bench-boost': { icon: TrendingUp, color: 'bg-chart-1', label: 'Bench Boost' },
  'triple-captain': { icon: Star, color: 'bg-chart-2', label: 'Triple Captain' },
  'free-hit': { icon: Zap, color: 'bg-chart-3', label: 'Free Hit' }
};

const priorityConfig = {
  'high': { color: 'bg-chart-1 text-white', label: 'High Priority' },
  'medium': { color: 'bg-chart-2 text-white', label: 'Medium Priority' },
  'low': { color: 'bg-chart-5 text-white', label: 'Low Priority' }
};

export default function ChipRecommendationCard({ 
  recommendation, 
  onViewDetails 
}: ChipRecommendationCardProps) {
  const chipInfo = chipConfig[recommendation.chipType];
  const ChipIcon = chipInfo.icon;
  const priorityInfo = priorityConfig[recommendation.priority];

  return (
    <Card className="w-full hover-elevate">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`inline-flex items-center justify-center w-10 h-10 ${chipInfo.color} rounded-lg`}>
              <ChipIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground text-lg" data-testid={`text-${recommendation.chipType}-title`}>
                {recommendation.title}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  <Calendar className="w-3 h-3 mr-1" />
                  GW {recommendation.gameweek}
                </Badge>
                <Badge className={`text-xs ${priorityInfo.color}`}>
                  {priorityInfo.label}
                </Badge>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-muted-foreground">Confidence</div>
            <div className="text-lg font-bold text-foreground" data-testid={`text-confidence-${recommendation.chipType}`}>
              {recommendation.confidence}%
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground mb-4" data-testid={`text-description-${recommendation.chipType}`}>
          {recommendation.description}
        </p>
        
        <div className="space-y-2 mb-4">
          <h4 className="text-sm font-medium text-foreground">Key Insights:</h4>
          <ul className="space-y-1">
            {recommendation.reasoning.map((reason, index) => (
              <li key={index} className="text-xs text-muted-foreground flex items-start gap-2">
                <TrendingUp className="w-3 h-3 mt-0.5 text-chart-1 flex-shrink-0" />
                {reason}
              </li>
            ))}
          </ul>
        </div>

        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={() => {
            onViewDetails?.(recommendation.chipType, recommendation.gameweek);
            console.log('View details clicked for:', recommendation.chipType, 'GW', recommendation.gameweek);
          }}
          data-testid={`button-details-${recommendation.chipType}`}
        >
          View Detailed Analysis
        </Button>
      </CardContent>
    </Card>
  );
}
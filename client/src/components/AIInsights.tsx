/**
 * AIInsights - Phase 3 Enhancement
 * 
 * Displays AI-generated insights, recommendations, and follow-up questions
 * in a clean, actionable format.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Lightbulb, 
  AlertTriangle, 
  TrendingUp, 
  HelpCircle,
  CheckCircle,
  Star,
  ArrowRight
} from 'lucide-react';
import { type AIInsight } from '@shared/schema';

interface AIInsightsProps {
  insights: AIInsight[];
  suggestions?: string[];
  followUpQuestions?: string[];
  onQuestionClick?: (question: string) => void;
  className?: string;
}

export function AIInsights({ 
  insights, 
  suggestions = [], 
  followUpQuestions = [], 
  onQuestionClick,
  className 
}: AIInsightsProps) {
  
  const getInsightIcon = (type: AIInsight['type']) => {
    switch (type) {
      case 'recommendation':
        return <Lightbulb className="h-4 w-4 text-blue-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'opportunity':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'explanation':
        return <HelpCircle className="h-4 w-4 text-purple-500" />;
      default:
        return <Star className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: AIInsight['priority']) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'medium':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300';
    }
  };

  const formatConfidence = (confidence: number) => {
    return `${Math.round(confidence)}% confidence`;
  };

  if (insights.length === 0 && suggestions.length === 0 && followUpQuestions.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`} data-testid="ai-insights-container">
      {/* AI Insights */}
      {insights.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" />
              AI Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {insights.map((insight, index) => (
              <div
                key={index}
                className="border rounded-lg p-3 space-y-2"
                data-testid={`insight-${insight.type}-${index}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    {getInsightIcon(insight.type)}
                    <h4 className="font-medium text-sm">{insight.title}</h4>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge 
                      className={`text-xs ${getPriorityColor(insight.priority)}`}
                      data-testid={`priority-${insight.priority}`}
                    >
                      {insight.priority}
                    </Badge>
                    <Badge 
                      variant="outline" 
                      className="text-xs"
                      data-testid={`confidence-${index}`}
                    >
                      {formatConfidence(insight.confidence)}
                    </Badge>
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground">
                  {insight.content}
                </p>
                
                {insight.reasoning.length > 0 && (
                  <div className="space-y-1">
                    <h5 className="text-xs font-medium text-muted-foreground">
                      Reasoning:
                    </h5>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {insight.reasoning.map((reason, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <span className="text-primary mt-0.5">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {insight.actionItems && insight.actionItems.length > 0 && (
                  <div className="space-y-1">
                    <h5 className="text-xs font-medium text-muted-foreground">
                      Actions:
                    </h5>
                    <ul className="text-xs space-y-1">
                      {insight.actionItems.map((action, idx) => (
                        <li key={idx} className="flex items-start gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {insight.relatedData?.expectedPoints && (
                  <div className="text-xs text-muted-foreground">
                    Expected impact: +{insight.relatedData.expectedPoints} points
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRight className="h-4 w-4 text-blue-500" />
              Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" data-testid="suggestions-list">
              {suggestions.map((suggestion, index) => (
                <li 
                  key={index} 
                  className="flex items-start gap-2 text-sm"
                  data-testid={`suggestion-${index}`}
                >
                  <span className="text-blue-500 mt-0.5">•</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Follow-up Questions */}
      {followUpQuestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-purple-500" />
              What would you like to know next?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" data-testid="follow-up-questions">
              {followUpQuestions.map((question, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => onQuestionClick?.(question)}
                  className="text-xs h-auto py-1 px-2 whitespace-normal text-left"
                  data-testid={`button-question-${index}`}
                >
                  {question}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
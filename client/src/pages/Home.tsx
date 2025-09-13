import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import TeamIdInput from "@/components/TeamIdInput";
import ChipRecommendationCard from "@/components/ChipRecommendationCard";
import ChipDetailModal from "@/components/ChipDetailModal";
import SquadOverview from "@/components/SquadOverview";
import FixtureDifficultyChart from "@/components/FixtureDifficultyChart";
import TransferPlanner from "@/components/TransferPlanner";
import SimulationSummaryCard from "@/components/SimulationSummary";
import { ChatInterface } from "@/components/ChatInterface";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, AlertCircle, MessageCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { 
  type AnalyzeTeamResponse, 
  type AnalysisResult, 
  type ChipRecommendation,
  type PlanTransfersResponse,
  type TransferPlan
} from "@shared/schema";


type AppState = 'input' | 'loading' | 'results' | 'error';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('input');
  const [teamId, setTeamId] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<ChipRecommendation | null>(null);
  const [transferPlans, setTransferPlans] = useState<TransferPlan[] | null>(null);
  const [activeTab, setActiveTab] = useState('analysis');

  const analyzeMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const response = await apiRequest('POST', '/api/analyze', { teamId });
      return (await response.json()) as AnalyzeTeamResponse;
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        setAnalysisResult(data.data);
        setTransferPlans(null); // Reset transfer plans when new analysis comes in
        setAppState('results');
        console.log('Analysis complete for team:', teamId);
      } else {
        setErrorMessage(data.error || 'Analysis failed');
        setAppState('error');
      }
    },
    onError: (error) => {
      console.error('Analysis error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to analyze team');
      setAppState('error');
    }
  });

  const transferPlanMutation = useMutation({
    mutationFn: async (params: { teamId: string; chipType?: string; maxHits?: number }) => {
      const requestData: any = { teamId: params.teamId };
      if (params.chipType) requestData.chipType = params.chipType;
      if (params.maxHits !== undefined) requestData.maxHits = params.maxHits;
      
      const response = await apiRequest('POST', '/api/transfer-plan', requestData);
      return (await response.json()) as PlanTransfersResponse;
    },
    onSuccess: (data) => {
      if (data.success && data.data) {
        setTransferPlans(data.data.plans);
        console.log('Transfer plans generated:', data.data.plans.length);
      } else {
        console.error('Transfer planning failed:', data.error);
      }
    },
    onError: (error) => {
      console.error('Transfer planning error:', error);
    }
  });

  const handleAnalyze = (id: string) => {
    setTeamId(id);
    setAppState('loading');
    setErrorMessage('');
    setAnalysisResult(null);
    console.log('Starting analysis for team:', id);
    analyzeMutation.mutate(id);
  };

  const handleReset = () => {
    setAppState('input');
    setTeamId('');
    setAnalysisResult(null);
    setErrorMessage('');
    analyzeMutation.reset();
    console.log('Reset to input state');
  };

  const handleRetry = () => {
    if (teamId) {
      handleAnalyze(teamId);
    }
  };

  const handleViewDetails = (chipType: string, gameweek: number) => {
    if (!analysisResult) return;
    
    const recommendation = analysisResult.recommendations.find(
      r => r.chipType === chipType && r.gameweek === gameweek
    );
    
    if (recommendation) {
      setSelectedRecommendation(recommendation);
      setIsModalOpen(true);
    }
  };

  const handlePlanTransfers = (params: { chipType?: string; maxHits?: number }) => {
    if (!teamId || !analysisResult) return;
    
    setActiveTab('transfers'); // Switch to transfers tab
    transferPlanMutation.mutate({
      teamId,
      chipType: params.chipType,
      maxHits: params.maxHits
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="container mx-auto px-4 py-8">
        {appState === 'input' && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold text-foreground">
                Infinitely Powerful FPL Chip Strategy Architect
              </h2>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto">
                AI-powered chip strategy optimization using bookmaker odds, advanced statistics, 
                and Monte Carlo simulations to maximize your FPL performance.
              </p>
            </div>
            
            <TeamIdInput onAnalyze={handleAnalyze} />

            <Card className="p-6">
              <div className="grid md:grid-cols-2 gap-6 text-sm text-muted-foreground">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">How it works:</h3>
                  <ul className="space-y-1">
                    <li>• Analyzes your current 15-player squad</li>
                    <li>• Uses bookmaker odds & advanced statistics</li>
                    <li>• Runs Monte Carlo probabilistic simulations</li>
                    <li>• Provides confidence-rated recommendations</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Key features:</h3>
                  <ul className="space-y-1">
                    <li>• AI-powered probabilistic forecasting</li>
                    <li>• Player volatility & form analysis</li>
                    <li>• Expected points with confidence intervals</li>
                    <li>• Real-time odds & statistics integration</li>
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

        {appState === 'error' && (
          <div className="max-w-md mx-auto">
            <Card className="p-8">
              <div className="text-center space-y-4">
                <AlertCircle className="w-16 h-16 text-destructive mx-auto" />
                <h2 className="text-xl font-semibold text-foreground">
                  Analysis Failed
                </h2>
                <p className="text-muted-foreground text-sm" data-testid="text-error-message">
                  {errorMessage}
                </p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={handleReset} data-testid="button-back">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Try Different Team
                  </Button>
                  <Button onClick={handleRetry} data-testid="button-retry">
                    Retry Analysis
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {appState === 'results' && analysisResult && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground" data-testid="text-results-title">
                  Infinitely Powerful FPL Analysis
                </h2>
                <p className="text-muted-foreground">
                  Based on analysis of {analysisResult.teamName} (Team ID: {teamId})
                </p>
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(analysisResult.lastUpdated).toLocaleString()}
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

            {/* Enhanced Phase 3: Tabbed interface with AI Co-pilot */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="analysis" data-testid="tab-analysis">
                  Analysis & Recommendations
                </TabsTrigger>
                <TabsTrigger value="copilot" data-testid="tab-copilot">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  AI Co-pilot
                </TabsTrigger>
                <TabsTrigger value="transfers" data-testid="tab-transfers">
                  Transfer Planner
                </TabsTrigger>
              </TabsList>

              {/* Analysis Tab - Original content */}
              <TabsContent value="analysis" className="space-y-6 mt-6">
                {/* Enhanced Phase 1: Simulation Summary - shows if enhanced data available */}
                {analysisResult.simulationSummary && (
                  <SimulationSummaryCard 
                    simulationSummary={analysisResult.simulationSummary}
                    expectedPointsSource={analysisResult.expectedPointsSource || 'fdr'}
                    confidenceLevel={analysisResult.confidenceLevel || 75}
                  />
                )}

                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Squad Overview */}
                  <div className="lg:col-span-1">
                    <SquadOverview 
                      players={analysisResult.players}
                      totalValue={analysisResult.totalValue}
                      totalPoints={analysisResult.totalPoints}
                      teamName={analysisResult.teamName}
                      expectedPointsSource={analysisResult.expectedPointsSource}
                      confidenceLevel={analysisResult.confidenceLevel}
                      dataFreshness={analysisResult.dataFreshness}
                    />
                  </div>

                  {/* Fixture Difficulty Chart */}
                  <div className="lg:col-span-2">
                    <FixtureDifficultyChart 
                      gameweeks={analysisResult.gameweeks}
                      highlightedGameweeks={analysisResult.recommendations.map(r => r.gameweek)}
                      showVolatility={!!analysisResult.simulationSummary}
                      expectedPointsSource={analysisResult.expectedPointsSource}
                    />
                  </div>
                </div>

                {/* Chip Recommendations */}
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-4">
                    Recommended Chip Strategy
                  </h3>
                  {analysisResult.recommendations.length > 0 ? (
                    <div className="grid md:grid-cols-2 gap-6">
                      {analysisResult.recommendations.map((recommendation, index) => (
                        <ChipRecommendationCard 
                          key={`${recommendation.chipType}-${index}`}
                          recommendation={recommendation}
                          onViewDetails={handleViewDetails}
                        />
                      ))}
                    </div>
                  ) : (
                    <Card className="p-6">
                      <div className="text-center space-y-2">
                        <p className="text-muted-foreground">
                          No clear chip opportunities identified at this time.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Your current fixture run looks fairly balanced. Consider checking back after the next gameweek.
                        </p>
                      </div>
                    </Card>
                  )}
                </div>
              </TabsContent>

              {/* AI Co-pilot Tab - Phase 3 Enhancement */}
              <TabsContent value="copilot" className="mt-6">
                <div className="grid lg:grid-cols-1 gap-6">
                  <div className="min-h-[600px]">
                    <ChatInterface 
                      teamId={teamId}
                      onAnalysisRequest={handleAnalyze}
                      data-testid="ai-copilot-interface"
                    />
                  </div>
                </div>
              </TabsContent>

              {/* Transfer Planner Tab */}
              <TabsContent value="transfers" className="mt-6">
                <TransferPlanner 
                  budget={analysisResult.budget}
                  transferPlans={transferPlans || undefined}
                  onPlanTransfers={handlePlanTransfers}
                  isLoading={transferPlanMutation.isPending}
                />
              </TabsContent>
            </Tabs>

          </div>
        )}
      </main>
      
      {/* Chip Detail Modal */}
      <ChipDetailModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        recommendation={selectedRecommendation}
        gameweeks={analysisResult?.gameweeks || []}
        players={analysisResult?.players || []}
      />
    </div>
  );
}
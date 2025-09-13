import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Target, Activity, TrendingUp, Zap } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function AppHeader() {
  return (
    <Card className="w-full border-b rounded-none sticky top-0 z-50 backdrop-blur-sm bg-background/95">
      <div className="flex items-center justify-between p-4">
        {/* Logo and Title */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/80 rounded-lg flex items-center justify-center shadow-md">
                <Target className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-chart-1 rounded-full animate-pulse shadow-sm" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2" data-testid="text-app-title">
                FPL Chip Strategy Architect
                <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                  <Activity className="w-3 h-3 mr-1" />
                  LIVE
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-powered chip timing optimization for Fantasy Premier League
              </p>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
              <TrendingUp className="w-3 h-3 text-chart-1" />
              <span>Season 2024/25</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
              <Zap className="w-3 h-3 text-primary" />
              <span>Real-time API</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </Card>
  );
}
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

export default function AppHeader() {
  return (
    <Card className="w-full border-b rounded-none">
      <div className="flex items-center justify-between p-4">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-primary rounded-lg">
            <Target className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground" data-testid="text-app-title">
              FPL Chip Strategy Architect
            </h1>
            <p className="text-sm text-muted-foreground">
              Optimize your Fantasy Premier League chip timing
            </p>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="hidden sm:inline-flex">
            Season 2024/25
          </Badge>
          <ThemeToggle />
        </div>
      </div>
    </Card>
  );
}
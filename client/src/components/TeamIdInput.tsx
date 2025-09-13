import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Target, Search } from "lucide-react";

interface TeamIdInputProps {
  onAnalyze: (teamId: string) => void;
  isLoading?: boolean;
}

export default function TeamIdInput({ onAnalyze, isLoading = false }: TeamIdInputProps) {
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId.trim()) {
      setError("Please enter your FPL Team ID");
      return;
    }
    if (!/^\d+$/.test(teamId.trim())) {
      setError("Team ID must be a number");
      return;
    }
    setError("");
    onAnalyze(teamId.trim());
    console.log('Team ID analysis triggered:', teamId.trim());
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-3">
              <Target className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Enter Your FPL Team ID
            </h2>
            <p className="text-sm text-muted-foreground">
              Get personalized chip strategy recommendations based on your squad
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="teamId" className="text-sm font-medium">
              Team ID
            </Label>
            <Input
              id="teamId"
              type="text"
              placeholder="e.g. 1234567"
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                if (error) setError("");
              }}
              className={error ? "border-destructive" : ""}
              disabled={isLoading}
              data-testid="input-team-id"
            />
            {error && (
              <p className="text-sm text-destructive" data-testid="text-error">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Find your Team ID in the FPL app: My Team → Points → View Gameweek History
            </p>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isLoading}
            data-testid="button-analyze"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Analyzing Squad...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Analyze My Squad
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
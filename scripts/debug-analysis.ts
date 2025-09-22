import { AnalysisEngine } from "../server/services/analysisEngine";

const teamId = process.argv[2] ?? "7892155";
(async () => {
  try {
    const engine = new AnalysisEngine();
    const result = await engine.analyzeTeam(teamId);
    console.log("players", result.players.length);
  } catch (error) {
    console.error("ANALYSIS_ERROR", error);
  }
})();

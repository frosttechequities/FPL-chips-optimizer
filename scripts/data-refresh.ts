import { DataPipeline } from "../server/services/dataPipeline";
import { shutdownDatabase } from "../server/db/client";

async function main(): Promise<void> {
  try {
    const pipeline = DataPipeline.getInstance();
    const result = await pipeline.runFullRefresh("manual");
    console.log("Data refresh complete", {
      status: result.status,
      durationMs: result.durationMs,
      players: result.playersIngested,
      fixtures: result.fixturesIngested,
      advancedStats: result.advancedStatsIngested,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Data refresh failed:", message);
    process.exitCode = 1;
  } finally {
    await shutdownDatabase().catch(() => undefined);
  }
}

void main();

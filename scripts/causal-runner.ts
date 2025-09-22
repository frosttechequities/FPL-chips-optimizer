#!/usr/bin/env tsx
import process from "node:process";
import { CausalEngine } from "../server/services/causalEngine";

function parseArgs() {
  const args = process.argv.slice(2);
  const config: {
    experimentKey: string;
    teamIds: number[];
    hypothesis: string;
  } = {
    experimentKey: 'manager-change',
    teamIds: [],
    hypothesis: 'Manager change leads to improved average points over next month.',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--experiment':
      case '-e':
        config.experimentKey = args[++i] ?? config.experimentKey;
        break;
      case '--team':
      case '-t':
        config.teamIds = (args[++i] ?? '').split(',').map(value => Number(value.trim())).filter(Number.isFinite);
        break;
      case '--hypothesis':
      case '-h':
        config.hypothesis = args[++i] ?? config.hypothesis;
        break;
    }
  }

  if (config.teamIds.length === 0) {
    console.warn('No team IDs provided. Consider using --team 1,2 to narrow the population.');
  }
  return config;
}

(async () => {
  const args = parseArgs();
  const engine = CausalEngine.getInstance();
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const insight = await engine.createInsight({
    experimentKey: args.experimentKey,
    hypothesis: args.hypothesis,
    population: args.teamIds.length ? { teamIds: args.teamIds } : undefined,
    timeWindow: {
      start,
      end: now,
    },
    exposure: {
      name: 'Manager change exposure',
      description: 'Players impacted by recent managerial change.',
      windowDays: 30,
    },
    outcome: {
      name: 'Average FPL points',
      metric: 'total_points',
    },
    confounders: [
      { name: 'fixture_density', value: 'unknown' },
      { name: 'injury_burden', value: 'unknown' }
    ],
    tags: ['phase-4', 'causal', 'draft'],
  });

  console.log('\nCausal insight captured:');
  console.log(JSON.stringify(insight, null, 2));
})();

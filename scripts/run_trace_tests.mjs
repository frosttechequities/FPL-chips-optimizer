import fs from 'fs';

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const TEAM_ID = process.env.TEAM_ID || '7892155';

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

async function main() {
  const out = [];
  try {
    // Warm analysis
    out.push(['analyze', await post('/api/analyze', { teamId: TEAM_ID })]);

    // Tests
    const tests = [
      { name: 'odds_clean_sheet', message: 'For GW8 captaincy, quantify haul odds and clean sheet probabilities shaping defender picks.' },
      { name: 'advanced_metrics', message: 'Compare Palmer vs Saka using npxG/xA and opponent xGC for the next 3 GWs.' },
      { name: 'probabilistic_distribution', message: 'Give P(>=8), P(>=10), P(>=12) for Haaland this GW, plus floor/ceiling.' },
      { name: 'eo_erv', message: 'Captain to maximize rank: show EO and ERV trade-offs (shield vs sword).'},
      { name: 'def_clean_sheets', message: 'Which two defenders in my squad have the best clean sheet probability this week and why?'},
      { name: 'transfer_pair', message: 'Sell Watkins for Isak and downgrade a defender to fund it—does this improve ERV over 3 GWs?'},
      { name: 'mid_comparison', message: 'Between Palmer and Foden, who is the better pick for the next 3 GWs considering minutes risk and npxG/xA?'},
      { name: 'bench_boost', message: 'Am I bench boost ready this week? If not, what changes would make it viable?'},
      { name: 'wildcard_window', message: 'Suggest the optimal wildcard window given my current fixture run and budget.'},
      { name: 'free_hit', message: 'If I play Free Hit in the next blank, outline a high-ERV draft with differentials.'}
    ];

    for (const t of tests) {
      const resp = await post('/api/chat', { message: t.message, teamId: TEAM_ID });
      out.push([t.name, resp]);
    }

    const logPath = `logs/trace_test_${Date.now()}.json`;
    fs.mkdirSync('logs', { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(out, null, 2));
    console.log(`OK ${logPath}`);
    // Print concise summary to stdout
    for (const [name, resp] of out) {
      const text = resp?.json?.data?.message || resp?.json?.message || JSON.stringify(resp?.json)?.slice(0, 400);
      const snippet = (text || '').replace(/\s+/g, ' ').slice(0, 280);
      console.log(`\n--- ${name} ---\n${snippet}${text && text.length > 280 ? '…' : ''}`);
    }
  } catch (e) {
    console.error('TRACE_TEST_FAILED', e?.message || e);
    process.exit(1);
  }
}

main();



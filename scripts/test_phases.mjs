#!/usr/bin/env node

/**
 * Simple Phase Testing Script for FPL AI Co-Pilot
 */

import https from 'https';
import http from 'http';
import { spawn } from 'child_process';

const BASE_URL = 'http://127.0.0.1:5001';
const TEST_TEAM_ID = '7892155';

function log(message, color = '\x1b[0m') {
  console.log(`${color}${message}\x1b[0m`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http;

    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function testPhase1() {
  log('\n🧱 TESTING PHASE 1: Data Foundation', 'cyan');

  // Test health
  const health = await makeRequest(`${BASE_URL}/api/health`);
  log(`Health: ${health.status === 200 ? '✅' : '❌'} (${health.status})`);

  // Test providers
  const providers = await makeRequest(`${BASE_URL}/api/providers/status`);
  log(`Providers: ${providers.status === 200 ? '✅' : '❌'} (${providers.data?.data?.length || 0} providers)`);

  // Test analysis
  const analysis = await makeRequest(`${BASE_URL}/api/analyze`, {
    method: 'POST',
    body: { teamId: TEST_TEAM_ID }
  });
  log(`Analysis: ${analysis.status === 200 ? '✅' : '❌'} (${analysis.data?.data?.players?.length || 0} players)`);

  return analysis.status === 200;
}

async function testPhase2() {
  log('\n📊 TESTING PHASE 2: Probabilistic Forecasting', 'cyan');

  // Test scenarios
  const scenarios = await makeRequest(`${BASE_URL}/api/scenarios?teamId=${TEST_TEAM_ID}&gameweek=6`);
  log(`Scenarios: ${scenarios.status === 200 ? '✅' : '❌'} (${scenarios.data?.data?.scenarios?.length || 0} scenarios)`);
  if (scenarios.data?.data) {
    log(`  └─ Full response: ${JSON.stringify(scenarios.data.data, null, 2)}`);
  }

  // Test effective ownership
  const ownership = await makeRequest(`${BASE_URL}/api/effective-ownership?teamId=${TEST_TEAM_ID}`);
  log(`Ownership: ${ownership.status === 200 ? '✅' : '❌'} (${ownership.data?.data?.length || 0} players)`);

  // Test transfer planning
  const transfers = await makeRequest(`${BASE_URL}/api/transfer-plan`, {
    method: 'POST',
    body: { teamId: TEST_TEAM_ID, targetGameweek: 6, maxHits: 0 }
  });
  log(`Transfers: ${transfers.status === 200 ? '✅' : '❌'} (${transfers.data?.data?.plans?.length || 0} plans)`);
  if (transfers.data?.data?.plans?.length > 0) {
    log(`  └─ First plan: ${transfers.data.data.plans[0].moves?.length || 0} moves`);
  }

  return scenarios.status === 200 && ownership.status === 200;
}

async function testPhase3() {
  log('\n🤖 TESTING PHASE 3: Strategic Engine', 'cyan');

  // Test strategy models
  const models = await makeRequest(`${BASE_URL}/api/strategy/models`);
  log(`Strategy Models: ${models.status === 200 ? '✅' : '❌'}`);

  // Test AI chat
  const chat = await makeRequest(`${BASE_URL}/api/chat`, {
    method: 'POST',
    body: { message: "Who should I transfer in?", teamId: TEST_TEAM_ID }
  });
  log(`AI Chat: ${chat.status === 200 ? '✅' : '❌'} (${chat.data?.data?.message?.length || 0} chars)`);

  return chat.status === 200;
}

async function testPhase4() {
  log('\n🧬 TESTING PHASE 4: Advanced Intelligence', 'cyan');

  // Test counterfactuals
  const counterfactuals = await makeRequest(`${BASE_URL}/api/scenarios/counterfactual?teamId=${TEST_TEAM_ID}&gameweek=6`);
  log(`Counterfactuals: ${counterfactuals.status === 200 ? '✅' : '❌'} (${counterfactuals.data?.data?.counterfactuals?.length || 0} scenarios)`);

  return counterfactuals.status === 200;
}

async function testEndToEnd() {
  log('\n🎯 TESTING END-TO-END EXPERIENCE', 'cyan');

  const messages = [
    "Hello",
    "Who should I transfer in?",
    "Should I use my wildcard?",
    "What chip strategy do you recommend?"
  ];

  let successCount = 0;
  for (const message of messages) {
    const response = await makeRequest(`${BASE_URL}/api/chat`, {
      method: 'POST',
      body: { message, teamId: TEST_TEAM_ID }
    });
    if (response.status === 200 && response.data?.data?.message) {
      successCount++;
    }
  }

  log(`E2E Journey: ${successCount}/${messages.length} successful responses`);
  return successCount === messages.length;
}

async function runTests() {
  log('🚀 FPL AI Co-Pilot Phase Testing', 'bright');

  // Check server
  const health = await makeRequest(`${BASE_URL}/api/health`);
  if (health.status !== 200) {
    log(`❌ Server not running at ${BASE_URL}`, 'red');
    log('Start with: npm run dev', 'yellow');
    return;
  }
  log('✅ Server running', 'green');

  // Run tests
  const results = {
    phase1: await testPhase1(),
    phase2: await testPhase2(),
    phase3: await testPhase3(),
    phase4: await testPhase4(),
    e2e: await testEndToEnd()
  };

  // Summary
  log('\n📊 RESULTS SUMMARY', 'bright');
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([phase, passed]) => {
    const color = passed ? 'green' : 'red';
    log(`${phase.toUpperCase()}: ${passed ? '✅ PASS' : '❌ FAIL'}`, color);
  });

  log(`\nOverall: ${passed}/${total} phases working`);

  if (passed >= 4) {
    log('\n🎉 EXCELLENT! FPL AI Co-Pilot is fully operational!', 'green');
  } else if (passed >= 3) {
    log('\n⚠️ GOOD! Core functionality working.', 'yellow');
  } else {
    log('\n❌ NEEDS WORK! Several phases require attention.', 'red');
  }
}

runTests().catch(console.error);

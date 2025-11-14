#!/usr/bin/env ts-node

import autocannon from 'autocannon';

interface LoadTestConfig {
  url: string;
  connections: number;
  duration: number;
  method?: 'GET' | 'POST' | 'PUT';
  body?: any;
  headers?: Record<string, string>;
}

async function runLoadTest(name: string, config: LoadTestConfig) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔥 Load Test: ${name}`);
  console.log(`${'='.repeat(60)}\n`);

  const result = await autocannon({
    url: config.url,
    connections: config.connections,
    duration: config.duration,
    method: config.method || 'GET',
    body: config.body ? JSON.stringify(config.body) : undefined,
    headers: config.headers || {},
    pipelining: 1
  });

  console.log(`\n📊 Results for ${name}:`);
  console.log(`   Total Requests: ${result.requests.total}`);
  console.log(`   Requests/sec: ${result.requests.average}`);
  console.log(`   Latency (avg): ${result.latency.mean}ms`);
  console.log(`   Latency (p95): ${result.latency.p95}ms`);
  console.log(`   Latency (p99): ${result.latency.p99}ms`);
  console.log(`   Throughput: ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
  console.log(`   Errors: ${result.errors}`);
  console.log(`   Timeouts: ${result.timeouts}`);
  
  // Check if meets targets
  const meetsTarget = result.latency.p95 < 200 && result.requests.average > 100;
  console.log(`   Status: ${meetsTarget ? '✅ PASS' : '❌ FAIL'}`);

  return result;
}

async function main() {
  const baseUrl = process.env.API_URL || 'http://localhost:3000';

  console.log(`🚀 Starting CAD System Load Tests`);
  console.log(`   Target: ${baseUrl}`);
  console.log(`   Timestamp: ${new Date().toISOString()}\n`);

  // Test 1: GET /health
  await runLoadTest('Health Check', {
    url: `${baseUrl}/health`,
    connections: 50,
    duration: 10
  });

  // Test 2: GET /api/incidents
  await runLoadTest('List Incidents', {
    url: `${baseUrl}/api/incidents`,
    connections: 100,
    duration: 30
  });

  // Test 3: GET /api/resources
  await runLoadTest('List Resources', {
    url: `${baseUrl}/api/resources`,
    connections: 100,
    duration: 30
  });

  // Test 4: POST /api/incidents (light load)
  await runLoadTest('Create Incident (Light)', {
    url: `${baseUrl}/api/incidents`,
    method: 'POST',
    connections: 25,
    duration: 30,
    body: {
      priority: 'HIGH',
      description: 'Load test incident',
      location: { lat: 25.6866, lng: -100.3161 }
    },
    headers: { 'content-type': 'application/json' }
  });

  // Test 5: POST /api/incidents (medium load)
  await runLoadTest('Create Incident (Medium)', {
    url: `${baseUrl}/api/incidents`,
    method: 'POST',
    connections: 50,
    duration: 30,
    body: {
      priority: 'HIGH',
      description: 'Load test incident',
      location: { lat: 25.6866, lng: -100.3161 }
    },
    headers: { 'content-type': 'application/json' }
  });

  // Test 6: POST /api/dispatch
  await runLoadTest('Create Dispatch', {
    url: `${baseUrl}/api/dispatch`,
    method: 'POST',
    connections: 50,
    duration: 30,
    body: {
      incidentId: 'test-incident',
      resourceId: 'test-resource'
    },
    headers: { 'content-type': 'application/json' }
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Load Tests Complete`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(error => {
  console.error('Load test failed:', error);
  process.exit(1);
});

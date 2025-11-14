# Performance Testing Strategy

**Status**: 📋 Planning Phase  
**Priority**: P2 (Critical for Production Readiness)  
**Timeline**: 1-2 weeks  
**Updated**: 2025-11-14 04:08 UTC

---

## 📋 Overview

Comprehensive performance testing strategy to validate that the BSV CAD system can handle real-world emergency dispatch workloads under stress conditions.

---

## 🎯 Performance Goals

### Target Metrics (Per Agency)

| Metric | Target | Threshold | Critical |
|--------|--------|-----------|----------|
| **API Response Time** | <100ms (p95) | <200ms | <500ms |
| **Blockchain TX Time** | <2s (avg) | <5s | <10s |
| **Concurrent Incidents** | 1000+ | 500+ | 100+ |
| **Incidents/Second** | 50+ | 25+ | 10+ |
| **Resource Updates/Sec** | 100+ | 50+ | 20+ |
| **Database Queries** | <50ms (p95) | <100ms | <200ms |
| **Memory Usage** | <2GB | <4GB | <8GB |
| **CPU Usage** | <50% avg | <75% | <90% |
| **Uptime** | 99.99% | 99.9% | 99.0% |

### Scalability Targets

| Scenario | Target | Notes |
|----------|--------|-------|
| **Small Agency** | 10-50 incidents/day | Single jurisdiction |
| **Medium Agency** | 500-1000 incidents/day | County-level |
| **Large Agency** | 5000-10000 incidents/day | Major city |
| **Metro Area** | 50000+ incidents/day | Multi-agency region |

---

## 🧪 Testing Scenarios

### 1. API Endpoint Performance

**Goal**: Validate REST API response times under load

```typescript
// tests/performance/api-load.test.ts

import autocannon from 'autocannon';

describe('API Performance', () => {
  it('should handle 100 RPS for GET /api/incidents', async () => {
    const result = await autocannon({
      url: 'http://localhost:3000/api/incidents',
      connections: 100,
      duration: 60, // 60 seconds
      pipelining: 1
    });

    expect(result.requests.average).toBeGreaterThan(100);
    expect(result.latency.p95).toBeLessThan(200); // 200ms p95
  });

  it('should handle 50 RPS for POST /api/incidents', async () => {
    const result = await autocannon({
      url: 'http://localhost:3000/api/incidents',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priority: 'HIGH',
        description: 'Test incident',
        location: { lat: 25.6866, lng: -100.3161 }
      }),
      connections: 50,
      duration: 60
    });

    expect(result.requests.average).toBeGreaterThan(50);
    expect(result.latency.p99).toBeLessThan(500);
  });
});
```

### 2. Blockchain Write Performance

**Goal**: Measure transaction creation and broadcast times

```typescript
// tests/performance/blockchain-write.test.ts

describe('Blockchain Performance', () => {
  it('should create 100 transactions in <5 minutes', async () => {
    const start = Date.now();
    const txids = [];

    for (let i = 0; i < 100; i++) {
      const txid = await walletManager.createIncidentTx({
        priority: 'HIGH',
        description: `Test incident ${i}`,
        location: { lat: 25.6866, lng: -100.3161 }
      });
      txids.push(txid);
    }

    const duration = Date.now() - start;
    const avgTime = duration / 100;

    console.log(`Created 100 TXs in ${duration}ms (avg: ${avgTime}ms/tx)`);
    
    expect(avgTime).toBeLessThan(3000); // <3s per transaction
    expect(txids.length).toBe(100);
  });

  it('should handle concurrent transaction creation', async () => {
    const promises = [];
    
    for (let i = 0; i < 10; i++) {
      promises.push(
        walletManager.createIncidentTx({
          priority: 'HIGH',
          description: `Concurrent incident ${i}`,
          location: { lat: 25.6866, lng: -100.3161 }
        })
      );
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
  });
});
```

### 3. Database Performance

**Goal**: Validate PostgreSQL query performance under load

```typescript
// tests/performance/database.test.ts

describe('Database Performance', () => {
  beforeAll(async () => {
    // Seed 10,000 incidents
    for (let i = 0; i < 10000; i++) {
      await db.incidents.create({
        priority: 'HIGH',
        status: 'ACTIVE',
        location: { lat: 25.6866 + Math.random() * 0.1, lng: -100.3161 + Math.random() * 0.1 }
      });
    }
  });

  it('should query incidents with geospatial filter in <50ms', async () => {
    const start = Date.now();
    
    const results = await db.incidents.find({
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [-100.3161, 25.6866] },
          $maxDistance: 5000 // 5km radius
        }
      },
      status: 'ACTIVE'
    }).limit(100);

    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(50);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle 1000 concurrent reads', async () => {
    const promises = [];
    
    for (let i = 0; i < 1000; i++) {
      promises.push(db.incidents.findById(Math.floor(Math.random() * 10000)));
    }

    const start = Date.now();
    await Promise.all(promises);
    const duration = Date.now() - start;

    console.log(`1000 reads in ${duration}ms`);
    expect(duration).toBeLessThan(5000); // <5s for 1000 reads
  });
});
```

### 4. SPV Indexer Performance

**Goal**: Measure blockchain event parsing speed

```typescript
// tests/performance/indexer.test.ts

describe('SPV Indexer Performance', () => {
  it('should parse 1000 blocks in <10 minutes', async () => {
    const indexer = new SPVIndexer(database, 'https://api.whatsonchain.com/v1/bsv/test');
    
    const startBlock = 1000000;
    const endBlock = 1001000;
    
    const start = Date.now();
    
    for (let block = startBlock; block < endBlock; block++) {
      await indexer.processBlock(block);
    }
    
    const duration = Date.now() - start;
    const blocksPerSec = 1000 / (duration / 1000);
    
    console.log(`Processed 1000 blocks in ${duration}ms (${blocksPerSec} blocks/sec)`);
    
    expect(duration).toBeLessThan(600000); // <10 minutes
  });

  it('should handle 100 TXs per block', async () => {
    // Mock block with 100 CAD transactions
    const mockBlock = {
      height: 1000000,
      hash: '00000000...',
      txs: Array(100).fill(null).map((_, i) => createMockCADTransaction(i))
    };

    const start = Date.now();
    await indexer.processBlock(mockBlock.height);
    const duration = Date.now() - start;

    console.log(`Parsed 100 TXs in ${duration}ms`);
    expect(duration).toBeLessThan(1000); // <1s for 100 TXs
  });
});
```

### 5. End-to-End Workflow Performance

**Goal**: Measure complete incident lifecycle duration

```typescript
// tests/performance/e2e-workflow.test.ts

describe('E2E Workflow Performance', () => {
  it('should complete incident lifecycle in <30 seconds', async () => {
    const workflow = new IncidentWorkflow();
    
    const start = Date.now();
    
    // 1. Create incident (API + blockchain)
    const incident = await workflow.createIncident({
      priority: 'HIGH',
      description: '911 call - medical emergency',
      location: { lat: 25.6866, lng: -100.3161 }
    });
    
    // 2. Dispatch resources
    await workflow.dispatchResources(incident.id, ['UNIT-101', 'UNIT-102']);
    
    // 3. Units accept
    await workflow.acceptDispatch(incident.id, 'UNIT-101');
    await workflow.acceptDispatch(incident.id, 'UNIT-102');
    
    // 4. Units en route
    await workflow.updateStatus(incident.id, 'UNIT-101', 'EN_ROUTE');
    await workflow.updateStatus(incident.id, 'UNIT-102', 'EN_ROUTE');
    
    // 5. Units on scene
    await workflow.updateStatus(incident.id, 'UNIT-101', 'ON_SCENE');
    await workflow.updateStatus(incident.id, 'UNIT-102', 'ON_SCENE');
    
    // 6. Close incident
    await workflow.closeIncident(incident.id);
    
    const duration = Date.now() - start;
    
    console.log(`E2E workflow completed in ${duration}ms`);
    expect(duration).toBeLessThan(30000); // <30 seconds
  });
});
```

---

## 🛠️ Testing Tools

### 1. Load Testing - autocannon

```bash
npm install --save-dev autocannon

# Run load test
npx autocannon -c 100 -d 60 http://localhost:3000/api/incidents
```

**Output**:
```
Running 60s test @ http://localhost:3000/api/incidents
100 connections

Stat      Avg     Stdev   Max
Latency   45ms    12ms    200ms
Req/Sec   2200    100     2500
Bytes/Sec 1.2MB   50KB    1.5MB

110k requests in 60s, 72MB read
```

### 2. Stress Testing - artillery

```yaml
# artillery-config.yaml
config:
  target: "http://localhost:3000"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Ramp up load"
    - duration: 300
      arrivalRate: 100
      name: "Sustained high load"

scenarios:
  - name: "Create incidents"
    flow:
      - post:
          url: "/api/incidents"
          json:
            priority: "HIGH"
            description: "Test incident"
            location:
              lat: 25.6866
              lng: -100.3161
```

```bash
npm install --save-dev artillery

# Run stress test
npx artillery run artillery-config.yaml
```

### 3. Profiling - clinic.js

```bash
npm install --save-dev clinic

# CPU profiling
clinic doctor -- node src/server.ts

# Memory profiling
clinic heapprofiler -- node src/server.ts

# Event loop profiling
clinic bubbleprof -- node src/server.ts
```

### 4. Monitoring - Prometheus + Grafana

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'cad-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 5s
```

**Grafana Dashboard Panels**:
- Request rate (req/sec)
- Response time (p50, p95, p99)
- Error rate (%)
- Active incidents
- Blockchain TPS
- Database query time
- Memory usage
- CPU usage

---

## 📊 Benchmarking Results (Expected)

### Baseline Performance (Single Instance)

| Metric | Measurement | Target | Status |
|--------|------------|--------|--------|
| GET /api/incidents | 50ms (p95) | <100ms | ✅ |
| POST /api/incidents | 120ms (p95) | <200ms | ✅ |
| Blockchain TX | 2.5s (avg) | <5s | ✅ |
| Database query | 35ms (p95) | <50ms | ✅ |
| Max RPS | 2000 | >1000 | ✅ |
| Memory | 1.2GB | <2GB | ✅ |
| CPU | 35% | <50% | ✅ |

### Scalability (Horizontal Scaling)

| Instances | Max RPS | Incidents/Day | Cost |
|-----------|---------|---------------|------|
| 1 | 2000 | 172M | $50/mo |
| 2 | 4000 | 345M | $100/mo |
| 5 | 10000 | 864M | $250/mo |
| 10 | 20000 | 1.7B | $500/mo |

**Note**: BSV blockchain scales unbounded (Teranode handles 1M+ TPS)

---

## 🚨 Load Testing Scenarios

### Scenario 1: Normal Operations
- **Duration**: 1 hour
- **Incident Rate**: 10/minute (600/hour)
- **Resource Updates**: 50/minute
- **Expected**: All metrics within target

### Scenario 2: Peak Hours
- **Duration**: 2 hours
- **Incident Rate**: 50/minute (6000/hour)
- **Resource Updates**: 200/minute
- **Expected**: All metrics within threshold

### Scenario 3: Emergency Event (Mass Casualty)
- **Duration**: 30 minutes
- **Incident Rate**: 200/minute (6000 total)
- **Resource Updates**: 500/minute
- **Expected**: Metrics may exceed threshold but stay within critical

### Scenario 4: System Stress Test
- **Duration**: 10 minutes
- **Incident Rate**: 500/minute (5000 total)
- **Resource Updates**: 1000/minute
- **Expected**: Identify breaking point

---

## 🔧 Optimization Strategies

### 1. Database Optimization
- **Indexes**: Geospatial indexes on location fields
- **Connection Pooling**: 20-50 connections
- **Query Caching**: Redis for frequently accessed data
- **Partitioning**: Partition incidents by date

### 2. API Optimization
- **Response Caching**: Cache GET endpoints (60s TTL)
- **Compression**: gzip for responses >1KB
- **Keep-Alive**: HTTP connection reuse
- **Rate Limiting**: 100 req/sec per client

### 3. Blockchain Optimization
- **Batch Transactions**: Group 10-100 incidents per TX
- **Async Broadcasting**: Don't wait for confirmation
- **UTXO Management**: Maintain 100+ spendable UTXOs
- **Fee Optimization**: Use minimum relay fee (0.5 sat/byte)

### 4. Infrastructure Optimization
- **Load Balancing**: Nginx reverse proxy
- **Horizontal Scaling**: K8s autoscaling (2-10 replicas)
- **CDN**: CloudFlare for static assets
- **Database Read Replicas**: 2-3 read replicas

---

## 📝 Testing Checklist

### Pre-Production Performance Tests

- [ ] API load test (100 RPS for 1 hour)
- [ ] Database stress test (10K+ records)
- [ ] Blockchain write test (100+ transactions)
- [ ] SPV indexer benchmark (1000 blocks)
- [ ] E2E workflow test (100+ complete lifecycles)
- [ ] Memory leak test (24-hour run)
- [ ] CPU profiling (identify hotspots)
- [ ] Network latency test (simulate slow connections)
- [ ] Concurrent user test (1000+ simultaneous)
- [ ] Failover test (container restart during load)

---

## 🚀 Next Steps

1. **Implement Prometheus metrics** in API endpoints
2. **Deploy Grafana dashboard** for real-time monitoring
3. **Write autocannon load test scripts** (tests/performance/)
4. **Run baseline benchmarks** on current deployment
5. **Optimize based on results** (indexes, caching, etc.)
6. **Re-run tests** and compare improvements
7. **Document final results** in DEPLOYMENT_STATUS.md

---

**Status**: Awaiting testnet wallet funding to begin blockchain write tests

**Dependencies**:
- Testnet BSV tokens (for transaction tests)
- Production-like data (seed database with 10K+ incidents)
- Monitoring infrastructure (Prometheus + Grafana)

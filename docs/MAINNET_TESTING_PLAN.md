# BSV CAD System - Mainnet Testing Plan

> **Version**: 1.0  
> **Date**: 2025-11-14  
> **Status**: Ready for Mainnet Validation  
> **Network**: BSV Mainnet (Teranode-ready)

---

## 🎯 Objectives

1. Validate blockchain transactions on BSV mainnet
2. Establish P2P encrypted communication channels
3. Test UHRP evidence upload to production network
4. Verify DID/VC resolution on mainnet
5. Validate NENA i3 interoperability with external PSAPs
6. Measure performance under realistic conditions
7. Confirm cost per transaction

---

## 📋 Pre-requisites

### Testnet Validation ✅

Before mainnet deployment, complete these testnet validations:

- [ ] **STN (Scaling Test Network)**
  - 1000+ transactions broadcast
  - SPV indexer synchronized
  - All event types parsed correctly
  - Geographic routing functional
  - Message Box encryption verified

- [ ] **Regression Tests**
  - All unit tests passing (85%+ coverage)
  - All integration tests passing
  - E2E test completes successfully
  - Performance benchmarks met

- [ ] **Security Audit**
  - Key management review
  - Encryption implementation verified
  - Access control validation
  - DDoS mitigation strategy
  - Rate limiting configured

---

## 💰 Mainnet Cost Analysis

### Transaction Costs (Based on Current BSV Fees)

| Transaction Type | Avg Size | Cost (satoshis) | Cost (USD @ $50/BSV) |
|------------------|----------|-----------------|----------------------|
| Incident Created | 250 bytes | 250 | $0.000125 |
| Resource Update | 200 bytes | 200 | $0.0001 |
| Evidence Anchor | 300 bytes | 300 | $0.00015 |
| DID Document | 500 bytes | 500 | $0.00025 |
| NENA Message | 400 bytes | 400 | $0.0002 |

**Daily Cost Estimate** (1000 incidents/day):
- Incidents: 1000 × $0.000125 = $0.125
- Updates: 3000 × $0.0001 = $0.30
- Evidence: 500 × $0.00015 = $0.075
- **Total**: ~$0.50/day = **$15/month**

**Scaling Cost** (100,000 incidents/day):
- **$50/day** = **$1,500/month**

---

## 🔑 Mainnet Setup

### 1. Generate Production Keys

```bash
# Generate department master key (SECURE STORAGE REQUIRED)
npm run keygen -- --output keys/master.key --entropy 256

# Generate individual DIDs
npm run keygen -- --role dispatcher --output keys/dispatchers/
npm run keygen -- --role officer --output keys/officers/
npm run run keygen -- --role supervisor --output keys/supervisors/

# CRITICAL: Backup keys to HSM or encrypted vault
# NEVER commit keys to git
# Use environment variables for key paths
```

### 2. Fund Wallets

```bash
# Get mainnet address
npm run wallet:address -- --key keys/master.key

# Minimum funding per wallet:
# - Dispatcher: 10,000 satoshis (100 incidents)
# - Officer: 5,000 satoshis (50 updates)
# - Agency: 50,000 satoshis (initial setup)

# Monitor balance
npm run wallet:balance -- --key keys/master.key
```

### 3. Configure Mainnet Endpoints

```typescript
// config/mainnet.ts
export const mainnetConfig = {
  network: 'mainnet',
  broadcastUrl: 'https://api.whatsonchain.com/v1/bsv/main/tx/raw',
  indexerUrl: 'https://api.whatsonchain.com/v1/bsv/main',
  uhrpEndpoint: 'https://uhrp.babbage.systems', // Production UHRP
  messageBoxUrl: 'https://messagebox.babbage.systems', // Production MB
  didResolverUrl: 'https://identity.bsvblockchain.org',
  
  // Rate limits
  maxTxPerSecond: 10,
  maxConcurrentConnections: 100,
  
  // Retry policy
  retryAttempts: 3,
  retryBackoff: 1000, // ms
  
  // Monitoring
  prometheusPort: 9090,
  grafanaUrl: 'https://grafana.example.com'
};
```

---

## 🧪 Phase 1: Isolated Component Testing (Week 1)

### Test 1.1: DID Issuance on Mainnet

**Objective**: Issue production DIDs for 3 test personnel

```bash
# Issue dispatcher DID
npm run did:issue -- \
  --key keys/dispatchers/jane.key \
  --name "Jane Dispatcher" \
  --badge D-1001 \
  --role dispatcher \
  --department "Metro PD" \
  --network mainnet

# Verify DID resolution
npm run did:resolve -- did:bsv:03a1b2c3... --network mainnet

# Expected output:
# ✓ DID document retrieved
# ✓ Verification method valid
# ✓ Blockchain anchor confirmed
```

**Success Criteria**:
- DIDs successfully anchored to mainnet
- Resolution time < 2 seconds
- DID documents conform to W3C spec
- Total cost < $0.001

---

### Test 1.2: Evidence Upload to UHRP Production

**Objective**: Upload test evidence file and verify retrieval

```bash
# Upload test image (bodycam screenshot)
npm run evidence:upload -- \
  --file tests/fixtures/bodycam.jpg \
  --incident INC-TEST-001 \
  --type BODYCAM \
  --officer keys/officers/john.key \
  --network mainnet

# Verify UHRP hash
npm run evidence:verify -- \
  --uhrp-hash abc123def456... \
  --network mainnet

# Expected output:
# ✓ File uploaded to UHRP
# ✓ Blockchain anchor: txid
# ✓ SHA-256 integrity: MATCH
# ✓ Chain of custody: VALID
```

**Success Criteria**:
- File successfully uploaded to UHRP
- Blockchain anchor transaction confirmed
- File retrievable with correct hash
- Upload time < 5 seconds (for 10MB file)
- Storage cost: ~$0.0002

---

### Test 1.3: P2P Message Box Channel Establishment

**Objective**: Establish encrypted P2P channel between dispatcher and officer

```bash
# Dispatcher: Create channel
npm run messagebox:create-channel -- \
  --key keys/dispatchers/jane.key \
  --recipient keys/officers/john.key.pub \
  --network mainnet

# Officer: Subscribe to channel
npm run messagebox:subscribe -- \
  --key keys/officers/john.key \
  --sender keys/dispatchers/jane.key.pub \
  --network mainnet

# Dispatcher: Send test message
npm run messagebox:send -- \
  --key keys/dispatchers/jane.key \
  --recipient keys/officers/john.key.pub \
  --type DISPATCH_NOTIFICATION \
  --data '{"incidentId":"TEST-001","priority":1}' \
  --network mainnet

# Officer: Receive message
npm run messagebox:poll -- \
  --key keys/officers/john.key \
  --network mainnet

# Expected output:
# ✓ Channel established
# ✓ Message encrypted (ECIES)
# ✓ Message signed (ECDSA)
# ✓ Message received
# ✓ Decryption successful
# ✓ Signature verified
```

**Success Criteria**:
- Channel created on first attempt
- Message delivered within 5 seconds
- Encryption/decryption successful
- Signature verification passes
- Cost per message: $0.0002

---

## 🏗️ Phase 2: Integration Testing (Week 2)

### Test 2.1: Full Incident Workflow

**Objective**: Execute complete incident lifecycle on mainnet

**Scenario**: Simulated 911 call → dispatch → response → resolution

```bash
# Run automated E2E test against mainnet
npm run test:e2e -- --network mainnet --scenario incident-workflow

# Monitor progress in real-time
tail -f logs/mainnet-test.log
```

**Workflow Steps**:

1. **Incident Creation** (Dispatcher)
   - Transaction broadcast to mainnet
   - SPV indexer picks up event
   - Geographic router calculates nearest unit

2. **Dispatch Notification** (Dispatcher → Officer)
   - P2P encrypted message sent
   - Officer receives notification < 5s
   - Officer acknowledges via P2P

3. **Resource Updates** (Officer)
   - EN_ROUTE status broadcast
   - ON_SCENE status broadcast
   - Location updates every 30s

4. **Evidence Upload** (Officer)
   - Bodycam footage uploaded to UHRP
   - Blockchain anchor created
   - Chain of custody initialized

5. **Incident Resolution** (Officer)
   - INCIDENT_CLOSED transaction
   - Final report attached
   - Evidence sealed

6. **Verification** (Supervisor)
   - Chain of custody verified
   - Evidence integrity confirmed
   - Audit trail complete

**Success Criteria**:
- All transactions confirmed on mainnet
- Total workflow time < 2 minutes
- Zero transaction failures
- Total cost < $0.01
- All components operational

---

### Test 2.2: NENA i3 Interoperability

**Objective**: Test cross-jurisdiction transfer with external PSAP

**Partners**: Coordinate with adjacent agency running NENA i3

```bash
# Send NENA i3 IncidentNotification
npm run nena:send -- \
  --incident INC-MAINNET-001 \
  --recipient-agency STATE-PD-001 \
  --recipient-url https://psap.statepolice.example.com/nena \
  --network mainnet

# Receive acknowledgment
npm run nena:poll -- --network mainnet

# Expected output:
# ✓ NENA message generated
# ✓ Message sent to STATE-PD-001
# ✓ Acknowledgment received
# ✓ Incident transferred
```

**Success Criteria**:
- NENA message conforms to standard
- External PSAP receives message
- Incident data correctly mapped
- Response received within 10 seconds

---

## 🚀 Phase 3: Load Testing (Week 3)

### Test 3.1: Concurrent Incident Handling

**Objective**: Simulate 100 concurrent incidents

```bash
# Run load test
npm run load-test -- \
  --incidents 100 \
  --concurrent 10 \
  --duration 600 \ # 10 minutes
  --network mainnet

# Monitor metrics
npm run metrics:dashboard
```

**Metrics to Track**:
- Transactions per second (TPS)
- Average confirmation time
- Failed transactions (should be 0%)
- SPV indexer lag
- P2P message delivery latency
- UHRP upload throughput

**Success Criteria**:
- 100 incidents processed successfully
- Avg confirmation time < 3 seconds
- Zero transaction failures
- SPV indexer lag < 10 seconds
- P2P latency < 5 seconds
- Total cost < $1.00

---

### Test 3.2: Geographic Routing Under Load

**Objective**: Test resource allocation with 500 units and 200 incidents

```bash
# Populate mainnet with test resources
npm run seed:resources -- \
  --count 500 \
  --area "25.6866,-100.3161,10km" \ # Monterrey, 10km radius
  --network mainnet

# Generate incidents
npm run generate:incidents -- \
  --count 200 \
  --rate 10/s \ # 10 incidents per second
  --network mainnet

# Monitor routing performance
npm run metrics:routing
```

**Success Criteria**:
- All incidents assigned to nearest available resource
- Avg routing time < 100ms
- Geohash queries < 50ms
- Resource availability updated in real-time
- No routing conflicts

---

## 📊 Phase 4: Performance Benchmarking (Week 4)

### Benchmark 4.1: Transaction Throughput

**Goal**: Measure max sustained TPS

```bash
npm run benchmark:throughput -- \
  --duration 3600 \ # 1 hour
  --network mainnet
```

**Target**: 50+ TPS sustained

---

### Benchmark 4.2: Indexer Performance

**Goal**: Measure SPV indexer throughput

```bash
npm run benchmark:indexer -- \
  --blocks 100 \
  --network mainnet
```

**Target**: 1000+ tx/s processed

---

### Benchmark 4.3: End-to-End Latency

**Goal**: Measure total latency from incident creation to officer notification

```bash
npm run benchmark:latency -- \
  --samples 1000 \
  --network mainnet
```

**Target**: p50 < 3s, p99 < 10s

---

## 🛡️ Security Validation

### Security Test 1: Key Compromise Scenario

**Objective**: Verify system behavior if officer key is compromised

```bash
# Revoke compromised DID
npm run did:revoke -- \
  --did did:bsv:compromised \
  --reason "Key compromised" \
  --authority keys/supervisor.key \
  --network mainnet

# Verify revocation propagated
npm run did:resolve -- did:bsv:compromised --network mainnet

# Expected: DID marked as revoked
```

---

### Security Test 2: Evidence Tamper Detection

**Objective**: Attempt to modify uploaded evidence and verify detection

```bash
# Upload evidence
EVIDENCE_HASH=$(npm run evidence:upload -- \
  --file test.jpg \
  --incident INC-SEC-001 \
  --network mainnet | grep hash | awk '{print $2}')

# Attempt to retrieve with wrong hash
npm run evidence:verify -- \
  --uhrp-hash wrong_hash \
  --network mainnet

# Expected: Integrity check FAILS
```

---

## 📞 P2P Call Setup (Future Enhancement)

### WebRTC over BSV

**Architecture**:
```
Dispatcher ↔ BSV Blockchain (signaling) ↔ Officer
              ↓
         WebRTC (STUN/TURN)
              ↓
       Direct P2P Voice/Video
```

**Signaling via Message Box**:
```typescript
// Dispatcher initiates call
const offer = await peerConnection.createOffer();
await messageBox.sendMessage(
  officerPubKey,
  'CALL_OFFER',
  { sdp: offer.sdp, ice: candidates }
);

// Officer responds
const answer = await peerConnection.createAnswer();
await messageBox.sendMessage(
  dispatcherPubKey,
  'CALL_ANSWER',
  { sdp: answer.sdp }
);

// Media stream established (P2P, no relay)
```

**Testing**:
```bash
npm run call:test -- \
  --caller keys/dispatcher.key \
  --callee keys/officer.key \
  --duration 60 \ # 1 minute
  --network mainnet
```

---

## 📈 Monitoring & Observability

### Prometheus Metrics

```yaml
# metrics.yaml
metrics:
  - name: cad_transactions_total
    type: counter
    help: Total transactions broadcast
    labels: [type, status]
  
  - name: cad_transaction_duration_seconds
    type: histogram
    help: Transaction confirmation time
    buckets: [1, 3, 5, 10, 30]
  
  - name: cad_p2p_messages_total
    type: counter
    help: P2P messages sent/received
    labels: [type, direction]
  
  - name: cad_indexer_lag_seconds
    type: gauge
    help: SPV indexer lag behind chain tip
  
  - name: cad_routing_duration_seconds
    type: histogram
    help: Geographic routing query time
    buckets: [0.01, 0.05, 0.1, 0.5, 1]
```

### Grafana Dashboards

1. **Transaction Overview**
   - TPS graph
   - Confirmation time heatmap
   - Failed transactions alert

2. **P2P Communication**
   - Message delivery latency
   - Encryption/decryption time
   - Active channels gauge

3. **Geographic Routing**
   - Resource distribution map
   - Avg routing time
   - Geohash query performance

4. **Evidence Management**
   - UHRP uploads/downloads
   - Evidence integrity checks
   - Chain of custody audits

---

## 🚨 Incident Response

### Scenario 1: Mainnet Node Failure

**Detection**: SPV indexer unable to connect

**Response**:
1. Fallback to secondary node
2. Alert ops team
3. Continue operations (degraded mode)
4. Resume full operation when primary recovers

**Automation**:
```bash
# Health check
npm run health:check -- --network mainnet

# Auto-failover
npm run failover:trigger -- --reason "primary_down"
```

---

### Scenario 2: UHRP Service Outage

**Detection**: Evidence uploads failing

**Response**:
1. Queue evidence locally
2. Continue blockchain anchoring (with local hash)
3. Retry uploads when service recovers
4. Verify integrity post-recovery

**Automation**:
```bash
# Queue evidence
npm run evidence:queue -- \
  --file evidence.mp4 \
  --incident INC-001 \
  --network mainnet

# Retry queue
npm run evidence:retry-queue -- --network mainnet
```

---

## ✅ Mainnet Go-Live Checklist

- [ ] All testnet validations passed
- [ ] Security audit complete
- [ ] Production keys generated & backed up
- [ ] Wallets funded (min 100,000 satoshis each)
- [ ] Monitoring dashboards configured
- [ ] Alerting rules active
- [ ] Incident response procedures documented
- [ ] Team trained on mainnet operations
- [ ] Backup/recovery tested
- [ ] DDoS mitigation active
- [ ] Rate limiting configured
- [ ] Phase 1 tests: 100% pass
- [ ] Phase 2 tests: 100% pass
- [ ] Phase 3 tests: 100% pass
- [ ] Phase 4 benchmarks: all targets met
- [ ] Security validations: all passed
- [ ] Executive sign-off obtained

---

## 📞 Support Contacts

- **BSV Blockchain**: support@bsvblockchain.org
- **UHRP Team**: support@babbage.systems
- **Message Box**: dev@babbage.systems
- **Emergency Escalation**: ops-oncall@example.com

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-14 02:00 CST  
**Next Review**: 2025-12-01  
**Owner**: CAD Development Team

# CAD Adapter Layer

**BSV Blockchain Adapter Layer for Legacy Emergency Dispatch Systems**

> Bridge between 342 legacy CAD components and modern BSV blockchain-native architecture.

---

## 📋 Overview

The **Adapter Layer** enables **backward compatibility** while migrating from legacy telephony/video/messaging systems to BSV blockchain-native protocols.

### Architecture Pattern

```
┌─────────────────────────────────────────────────────┐
│             Modern Clients (BSV-native)             │
│  Dispatcher Wallet │ Field Unit Wallet │ Citizen App│
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                  Adapter Layer                       │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │ Telephony │  │   Video   │  │ Messaging │       │
│  │  Adapter  │  │  Adapter  │  │  Adapter  │       │
│  └───────────┘  └───────────┘  └───────────┘       │
│         │              │               │             │
│  ┌──────▼──────┬───────▼──────┬────────▼──────┐    │
│  │  WebRTC     │  WebRTC      │  Message Box  │    │
│  │  SIP/TLS    │  Jitsi       │  Matrix       │    │
│  │  Avaya ⚠️   │  VXG ⚠️      │  Redis WS ⚠️  │    │
│  └─────────────┴──────────────┴───────────────┘    │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              BSV Blockchain Layer                   │
│  Teranode │ UHRP │ Identity Services │ Message Box  │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│            Legacy Systems (Obsolete)                 │
│  Avaya JTAPI │ VXG (26 servers) │ Redis WebSocket   │
└─────────────────────────────────────────────────────┘
```

**⚠️ = Legacy bridge (will be deprecated)**

---

## 🏗️ Project Structure

```
adapter-layer/
├── packages/
│   ├── shared/           # Shared types, blockchain logger, utilities
│   │   └── src/
│   │       ├── types.ts              # 216 lines - DID, events, protocols
│   │       └── blockchain-logger.ts  # 256 lines - Teranode logger
│   ├── telephony/        # Telephony adapter (WebRTC, Avaya, SIP)
│   │   └── src/
│   │       └── telephony-adapter.ts  # 436 lines - Call handling
│   ├── video/            # Video adapter (WebRTC, VXG, Jitsi, UHRP)
│   │   └── src/
│   │       └── video-adapter.ts      # 680 lines - Streaming + recording
│   ├── messaging/        # Messaging adapter (Message Box, Matrix, Redis)
│   │   └── src/
│   │       └── messaging-adapter.ts  # 619 lines - Real-time messaging
│   └── base/             # Base adapter class (future)
├── tests/                # Integration tests
├── docs/
│   └── VENDOR_INTEGRATIONS.md  # 536 lines - Complexity analysis
└── README.md             # This file
```

**Total**: ~2,700 lines of TypeScript (core adapters)

---

## 🎯 Adapters

### 1️⃣ Telephony Adapter

**Protocols**: WebRTC P2P → SIP/TLS → Avaya JTAPI (legacy) → PSTN

**Features**:
- Protocol negotiation (based on DID capabilities)
- E2E encrypted calls (WebRTC, SIP/TLS)
- Legacy bridge to Avaya PBX (Java REST wrapper)
- All calls logged to blockchain (immutable audit trail)

**Status**: 
- ✅ Core adapter complete (436 lines)
- ⚠️ Avaya Java bridge pending (8-12 weeks)
- ⚠️ WebRTC gateway stub (needs implementation)
- ⚠️ SIP/TLS gateway stub (needs implementation)

**Complexity**: 🔴 **Very High** (Avaya JTAPI integration)

---

### 2️⃣ Video Adapter

**Protocols**: WebRTC P2P → Jitsi Meet → VXG Video (legacy) → RTSP

**Features**:
- Live camera streaming (WebRTC, VXG proxy)
- Incident recording (dual-write: VXG + UHRP)
- Historical migration (500TB VXG → UHRP over 6 months)
- sCrypt access control (3-of-5 multisig for evidence)
- Video conferencing (Jitsi integration)
- All evidence anchored to blockchain

**Status**:
- ✅ Core adapter complete (680 lines)
- ⚠️ VXG proxy stub (needs VXG API integration)
- ⚠️ UHRP client stub (needs UHRP service)
- ⚠️ WebRTC streaming stub (needs transcoding)
- ⚠️ Jitsi gateway stub (needs Jitsi API)

**Complexity**: 🔴 **Very High** (500TB migration + 26 VXG servers)

---

### 3️⃣ Messaging Adapter

**Protocols**: Message Box P2P → Matrix Protocol → Redis WebSocket (legacy)

**Features**:
- Protocol negotiation (based on DID capabilities)
- Signal Protocol E2E encryption (planned)
- Dual-listen (Message Box + Matrix + Redis during transition)
- Rate limiting (token bucket algorithm)
- Delivery/read receipts (logged to blockchain)
- Broadcast to multiple recipients

**Status**:
- ✅ Core adapter complete (619 lines)
- ⚠️ Message Box client stub (needs BSV Message Box SDK)
- ⚠️ Matrix client stub (needs Matrix SDK)
- ⚠️ Redis bridge stub (needs Redis pub/sub)
- ⚠️ Signal Protocol stub (needs libsignal-protocol-typescript)

**Complexity**: 🟢 **Low** (Redis bridge is straightforward)

---

## 🔗 Shared Components

### Blockchain Logger (`packages/shared/src/blockchain-logger.ts`)

**Purpose**: Normalize ALL adapter events to blockchain (immutable audit)

**Features**:
- OP_RETURN compact format (~80 bytes per event)
- Event type codes (0x10-0x51 for call/video/message events)
- Content hash (SHA256, not content itself)
- Batch logging support
- Query capability (read events from blockchain)

**Event Types**:
```typescript
// Telephony
0x10: call_initiated
0x11: call_answered
0x12: call_ended
0x13: call_recorded

// Video
0x20: camera_accessed
0x21: video_streamed
0x22: evidence_recorded
0x23: evidence_accessed

// Messaging
0x30: message_sent
0x31: message_delivered
0x32: message_read

// Meta
0x40: protocol_negotiated
0x50: legacy_bridge_access
0x51: access_denied
```

---

### Shared Types (`packages/shared/src/types.ts`)

**Purpose**: Type definitions for DIDs, events, protocols, errors

**Key Types**:
- `DID` - BSV DID identifier (`did:bsv:pubkey`)
- `DIDCapabilities` - Protocol support (webrtc, sipTls, matrix, etc.)
- `NormalizedEvent` - Unified blockchain event format
- `AdapterConfig` - Configuration for all adapters
- `AdapterError` - Typed error system with error codes

---

## 🚀 Getting Started

### Prerequisites

```bash
node >= 20.0.0
pnpm >= 8.0.0
```

### Installation

```bash
cd adapter-layer
pnpm install
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

---

## 📊 Vendor Integration Complexity

### Critical Path (Must Implement First)

| Vendor | Adapter | Complexity | Effort | Risk |
|--------|---------|------------|--------|------|
| **Avaya JTAPI** | Telephony | 🔴 Very High | 8-12 weeks | ⚠️ Critical |
| **VXG Video (26 servers)** | Video | 🔴 Very High | 26 weeks | ⚠️ Critical |

### Medium Priority

| Vendor | Adapter | Complexity | Effort | Risk |
|--------|---------|------------|--------|------|
| **Oreka Call Recorder** | Telephony | 🟠 High | 4-6 weeks | Medium |
| **C-Insight Analytics** | Video | 🟠 High | 4-6 weeks | Medium |

### Low Priority

| Vendor | Adapter | Complexity | Effort | Risk |
|--------|---------|------------|--------|------|
| **Redis WebSocket** | Messaging | 🟢 Low | 1-2 weeks | Low |
| **Dahua Cameras** | Video | 🟡 Medium | 3-4 weeks | Low |

**Total Effort**: 46-64 weeks sequential, **16-22 weeks parallel** (3 teams)

See [`docs/VENDOR_INTEGRATIONS.md`](./docs/VENDOR_INTEGRATIONS.md) for detailed analysis.

---

## 🔒 Security

### Avaya JTAPI Bridge

- mTLS authentication (Node.js ↔ Java)
- IP whitelist (only adapter nodes)
- Rate limiting (100 calls/minute)
- Blockchain audit log (all JTAPI calls)

### VXG Video Access

- sCrypt multisig contracts (3-of-5: supervisor, chief, DA, judge, IA)
- UHRP evidence URLs expire after 24 hours
- Blockchain access log (who viewed what, when)

### Message Box

- Signal Protocol E2E encryption
- DID-based authentication
- Rate limiting (per-user token bucket)
- Blockchain message hash log (NOT content)

---

## 📈 Migration Timeline

### Phase 1: Adapter Deploy (Months 1-3)

- ✅ Core adapters implemented
- ⬜ Avaya Java bridge (REST wrapper)
- ⬜ VXG dual-write enabled
- ⬜ Redis WebSocket bridge complete

### Phase 2: Modern Protocol Rollout (Months 4-6)

- ⬜ WebRTC gateway (P2P audio/video)
- ⬜ Jitsi Meet gateway (conferencing)
- ⬜ Message Box client (P2P messaging)
- ⬜ Matrix protocol client (federated)

### Phase 3: Historical Migration (Months 7-12)

- ⬜ VXG → UHRP migration (500TB @ 100GB/day)
- ⬜ Oreka → UHRP integration
- ⬜ 50%+ calls via WebRTC

### Phase 4: Legacy Deprecation (Months 13-18)

- ⬜ Decommission Avaya (emergency-only)
- ⬜ Decommission VXG (26 servers)
- ⬜ Remove Redis WebSocket
- ⬜ 100% blockchain-native

---

## 🛠️ Implementation Status

### ✅ Complete (5/6)

- [x] Project structure (monorepo)
- [x] Shared types & blockchain logger
- [x] Telephony adapter core
- [x] Video adapter core
- [x] Messaging adapter core

### ⚠️ In Progress (1/6)

- [ ] DID resolver service (protocol negotiation)

### ⬜ Pending (Major Blockers)

**Telephony**:
- [ ] Avaya JTAPI bridge (Java Spring Boot REST wrapper) - **8-12 weeks**
- [ ] WebRTC gateway (STUN/TURN + signaling)
- [ ] SIP/TLS gateway (SIP.js integration)

**Video**:
- [ ] VXG API client (record, download, stream) - **2-4 weeks**
- [ ] UHRP client (upload, stream URLs) - **2-3 weeks**
- [ ] VXG migration worker (500TB background job) - **26 weeks execution**
- [ ] WebRTC streaming (RTSP → WebRTC transcode)
- [ ] Jitsi gateway (REST API + XMPP)
- [ ] sCrypt evidence contracts (3-of-5 multisig)

**Messaging**:
- [ ] Message Box client (BSV SDK) - **1-2 weeks**
- [ ] Matrix client (Matrix SDK) - **1-2 weeks**
- [ ] Redis bridge (Redis pub/sub) - **1 week**
- [ ] Signal Protocol (libsignal) - **2-3 weeks**

---

## 📚 References

### Internal Docs

- **Architecture**: `/cad/WARP.md` (main CAD architecture)
- **Inventory**: `/cad/INVENTORY.md` (342 components)
- **Backward Compat**: `/cad/BACKWARD_COMPATIBILITY.md` (adapter strategy)
- **Vendor Integrations**: `./docs/VENDOR_INTEGRATIONS.md` (complexity analysis)

### BSV Standards

- **Message Box**: [BSV Message Box Spec](https://github.com/bitcoin-sv/message-box)
- **DID Services**: [W3C DID Core](https://www.w3.org/TR/did-core/)
- **UHRP**: [Universal Hash Resolution Protocol](https://github.com/bitcoin-sv/uhrp)
- **Teranode**: [BSV Teranode](https://github.com/bitcoin-sv/teranode)

### External Standards

- **WebRTC**: [RFC 8854](https://datatracker.ietf.org/doc/html/rfc8854)
- **SIP over TLS**: [RFC 3261](https://datatracker.ietf.org/doc/html/rfc3261)
- **Matrix Protocol**: [Matrix.org Spec](https://spec.matrix.org/v1.1/)
- **Signal Protocol**: [Signal.org Docs](https://signal.org/docs/)

---

## 🎯 Next Steps

### Immediate (Week 1-2)

1. **Deploy DID resolver service** (protocol negotiation)
2. **Implement Avaya Java bridge** (start in parallel)
3. **Integrate VXG API client** (video adapter)
4. **Deploy Redis WebSocket bridge** (messaging adapter)

### Short-term (Month 1-3)

1. **Complete Avaya bridge** (Java Spring Boot + Node.js client)
2. **Enable VXG dual-write** (VXG + UHRP)
3. **Deploy Message Box client** (BSV SDK)
4. **WebRTC gateway POC** (1-1 call demo)

### Long-term (Month 4-18)

1. **VXG historical migration** (500TB background job)
2. **WebRTC production rollout** (50%+ calls)
3. **Legacy deprecation** (Avaya, VXG, Redis)
4. **100% blockchain-native** (Month 18 goal)

---

**Status**: 🔄 Core Implementation Complete, Vendor Integrations Pending  
**Last Updated**: 2025-11-03 06:27 CST  
**Total Lines**: ~2,700 (core adapters) + 536 (vendor docs) = **3,236 lines**

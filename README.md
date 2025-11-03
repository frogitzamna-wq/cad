# BSV CAD System - Computer-Aided Dispatch on Blockchain

A decentralized Computer-Aided Dispatch (CAD) system built on Bitcoin SV (BSV) blockchain using sCrypt smart contracts. This system provides immutable, transparent, and secure incident management for emergency services.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Smart Contracts](#smart-contracts)
- [Managers](#managers)
- [Installation](#installation)
- [Usage](#usage)
- [Testing](#testing)
- [Deployment](#deployment)
- [API Reference](#api-reference)
- [Standards Compliance](#standards-compliance)
- [License](#license)

---

## Overview

### What is a CAD System?

A Computer-Aided Dispatch (CAD) system is mission-critical software used by emergency services (police, fire, EMS) to:
- Receive and process 911/emergency calls
- Create and manage incidents
- Dispatch resources (units, personnel)
- Track resource location and status
- Maintain audit trails for legal/compliance purposes

### Why Blockchain?

Traditional CAD systems face challenges:
- **Centralization risks**: Single point of failure
- **Data integrity**: Potential tampering or manipulation
- **Audit trails**: Difficult to prove authenticity
- **Inter-agency coordination**: Data silos between jurisdictions

This BSV-based CAD system provides:
- **Immutability**: All actions permanently recorded on blockchain
- **Transparency**: Complete audit trail for accountability
- **Decentralization**: No single point of failure
- **Cryptographic verification**: Unforgeable digital signatures
- **Inter-agency cooperation**: Seamless data sharing across jurisdictions

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
│  (Dispatch Console, Mobile Apps, Admin Dashboard)           │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     Manager Layer                            │
│  IncidentManager | ResourceManager | DispatchManager         │
│  AgencyManager   | StateReconstructor                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 Smart Contract Layer                         │
│  IncidentContract | ResourceContract | DispatchContract      │
│  AgencyContract   | IncidentRelationContract                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   BSV Blockchain                             │
│  (Immutable ledger, cryptographic verification)             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Operator** creates incident via IncidentManager
2. **Manager** constructs and signs smart contract transaction
3. **Transaction** broadcast to BSV network
4. **Blockchain** validates and confirms transaction
5. **Indexer** indexes transaction for fast querying
6. **Application** reconstructs current state from blockchain history

---

## Features

### Core Capabilities

✅ **Incident Management**
- Create incidents from 911 calls, officer-initiated events, or other sources
- Update incident data, status, and priority
- Add field notes and evidence
- Split complex incidents into multiple cases
- Merge related incidents into coordinated investigations
- Close incidents with comprehensive closure reports

✅ **Resource Management**
- Register units (patrol cars, fire trucks, ambulances, etc.)
- Track real-time GPS location
- Update resource status (available, en route, on scene, out of service)
- Assign resources to incidents
- Automatic availability detection

✅ **Dispatch Operations**
- Manual dispatch to specific resources
- Automatic dispatch based on proximity and availability
- Reassign resources between incidents
- Release resources when incident resolved

✅ **Multi-Agency Coordination**
- Register agencies with jurisdictional boundaries
- Share incidents across jurisdictions
- Collaborative closure reports
- Inter-agency audit trails

✅ **Audit & Compliance**
- Complete blockchain-based audit trail
- Cryptographic proof of all actions
- Reconstruct complete incident history
- Tamper-proof evidence chain
- NENA i3 standards compliance

---

## Smart Contracts

### IncidentContract

Core contract managing incident lifecycle on blockchain.

**Properties:**
- `incidentId`: Unique identifier (SHA256 hash)
- `status`: Current state (NEW, PENDING, ACTIVE, RESOLVED, CLOSED)
- `priority`: Urgency level (1-5, 1=highest)
- `dataHash`: SHA256 hash of incident data
- `agencyIds`: List of agencies with access
- `operatorPubKey`: Key of creating operator
- `supervisorPubKeys`: Keys authorized to modify
- `version`: Optimistic locking version

**Methods:**
- `create()`: Initialize new incident
- `updateData()`: Update incident details
- `changeStatus()`: Transition between states (with validation)
- `close()`: Close incident with final report
- `reopen()`: Reopen closed incident
- `share()`: Share with another agency

**State Machine:**
```
NEW → PENDING → ACTIVE → RESOLVED → CLOSED
 ↓       ↓        ↓         ↓          ↑
 └───────┴────────┴─────────┴─────REOPEN
```

### ResourceContract

Manages emergency resources (units, personnel).

**Properties:**
- `resourceId`: Unique identifier
- `status`: Current availability status
- `currentIncidentId`: Assigned incident (if any)
- `location`: Latest GPS coordinates
- `resourcePubKey`: Key of resource operator
- `dispatcherPubKey`: Key of dispatcher

**Methods:**
- `register()`: Register new resource
- `updateStatus()`: Change availability status
- `updateLocation()`: Update GPS coordinates
- `assign()`: Assign to incident
- `release()`: Release from incident

### DispatchContract

Handles resource dispatch and assignment.

**Properties:**
- `dispatchId`: Unique identifier
- `incidentId`: Target incident
- `resourceIds`: Assigned resources
- `timestamp`: Dispatch time
- `dispatcherPubKey`: Dispatcher authorization

**Methods:**
- `dispatch()`: Assign resources to incident
- `reassign()`: Move resource to different incident
- `complete()`: Mark dispatch as completed

### AgencyContract

Manages agency registration and authorization.

**Properties:**
- `agencyId`: Unique identifier
- `jurisdiction`: Geographic boundaries (GeoJSON)
- `authorizedKeys`: Public keys of authorized personnel
- `contactInfo`: Agency contact details

**Methods:**
- `register()`: Register new agency
- `updateKeys()`: Modify authorized keys
- `updateJurisdiction()`: Update boundaries

### IncidentRelationContract

Links related incidents.

**Properties:**
- `relationId`: Unique identifier
- `incidentId1`: First incident
- `incidentId2`: Second incident
- `relationType`: RELATED, DUPLICATE, SPLIT, MERGED
- `metadata`: Additional relation details

**Methods:**
- `link()`: Create relation between incidents
- `unlink()`: Remove relation

---

## Managers

Managers provide high-level TypeScript/JavaScript API for interacting with smart contracts.

### IncidentManager

```typescript
class IncidentManager {
  async createIncident(data: IncidentData, privKey: PrivateKey): Promise<string>
  async updateData(id: string, data: Partial<IncidentData>, privKey: PrivateKey): Promise<string>
  async updateStatus(id: string, status: IncidentStatus, privKey: PrivateKey): Promise<string>
  async closeIncident(id: string, report: ClosureReport, duration: number, privKey: PrivateKey): Promise<string>
  async reopenIncident(id: string, reason: string, privKey: PrivateKey): Promise<string>
  async splitIncident(id: string, newIncidents: IncidentData[], privKey: PrivateKey): Promise<string[]>
  async mergeIncidents(ids: string[], mergedData: IncidentData, privKey: PrivateKey): Promise<string>
  async shareIncident(id: string, agencyId: string, metadata: any, privKey: PrivateKey): Promise<string>
  async addFieldNotes(id: string, notes: any, privKey: PrivateKey): Promise<string>
  async getIncident(id: string): Promise<IncidentData>
}
```

### ResourceManager

```typescript
class ResourceManager {
  async registerResource(id: string, data: ResourceData, privKey: PrivateKey): Promise<string>
  async updateStatus(id: string, status: ResourceStatus, privKey: PrivateKey): Promise<string>
  async updateLocation(id: string, location: Location, privKey: PrivateKey): Promise<string>
  async assignToIncident(id: string, incidentId: string, privKey: PrivateKey): Promise<string>
  async releaseFromIncident(id: string, privKey: PrivateKey): Promise<string>
  async getResource(id: string): Promise<ResourceData>
  async getAvailableResources(): Promise<ResourceData[]>
}
```

### DispatchManager

```typescript
class DispatchManager {
  async dispatch(params: DispatchParams): Promise<string>
  async autoDispatch(incidentId: string, requirements: DispatchRequirements): Promise<string>
  async reassign(params: ReassignParams): Promise<string>
  async completeDispatch(dispatchId: string, privKey: PrivateKey): Promise<string>
  async getDispatch(dispatchId: string): Promise<DispatchData>
}
```

### AgencyManager

```typescript
class AgencyManager {
  async registerAgency(id: string, data: AgencyData, privKey: PrivateKey): Promise<string>
  async updateAuthorizedKeys(id: string, keys: string[], privKey: PrivateKey): Promise<string>
  async updateJurisdiction(id: string, jurisdiction: GeoJSON, privKey: PrivateKey): Promise<string>
  async getAgency(id: string): Promise<AgencyData>
}
```

---

## Installation

### Prerequisites

- Node.js >= 18.x
- npm or yarn
- BSV wallet with funds for transaction fees

### Install Dependencies

```bash
npm install
```

### Build Project

```bash
npm run build
```

### Compile Smart Contracts

```bash
npm run compile
```

---

## Usage

### Initialize Managers

```typescript
import { IncidentManager, ResourceManager, DispatchManager } from './src';
import { PrivateKey } from 'bsv';

const broadcastUrl = 'https://api.whatsonchain.com/v1/bsv/main/tx/raw';
const indexerUrl = 'https://your-indexer.example.com';

const incidentManager = new IncidentManager(broadcastUrl, indexerUrl);
const resourceManager = new ResourceManager(broadcastUrl, indexerUrl);
const dispatchManager = new DispatchManager(broadcastUrl, indexerUrl, resourceManager, incidentManager);

// Load operator's private key
const operatorPrivKey = PrivateKey.fromWIF('your-wif-key-here');
```

### Create Incident

```typescript
const incidentData = {
  reason: 'ARMED_ROBBERY',
  priority: 1,
  description: 'Armed robbery at convenience store. Suspect fled on foot.',
  location: {
    lat: 19.432608,
    lng: -99.133209,
    address: '123 Main St, City, State'
  },
  origin: IncidentOrigin.CALL_911,
  operatorPubKey: operatorPrivKey.toPublicKey().toString(),
  timestamp: Date.now()
};

const incidentId = await incidentManager.createIncident(incidentData, operatorPrivKey);
console.log('Incident created:', incidentId);
```

### Dispatch Resource

```typescript
const dispatcherPrivKey = PrivateKey.fromWIF('dispatcher-wif-key');

const txid = await dispatchManager.dispatch({
  incidentId,
  resourceIds: ['PATROL-42'],
  dispatcherPrivKey
});

console.log('Dispatch transaction:', txid);
```

### Update Resource Status

```typescript
const unitPrivKey = PrivateKey.fromWIF('unit-wif-key');

await resourceManager.updateStatus('PATROL-42', ResourceStatus.EN_ROUTE, unitPrivKey);
await resourceManager.updateLocation('PATROL-42', {
  lat: 19.430000,
  lng: -99.135000,
  timestamp: Date.now()
}, unitPrivKey);
```

### Close Incident

```typescript
const supervisorPrivKey = PrivateKey.fromWIF('supervisor-wif-key');

const closureReport = {
  description: 'Suspect apprehended. Property recovered.',
  outcome: 'ARREST_MADE',
  arrests: 1,
  propertyRecovered: true,
  closedBy: supervisorPrivKey.toPublicKey().toString(),
  closedAt: Date.now()
};

const duration = 1200000; // 20 minutes in milliseconds

await incidentManager.closeIncident(incidentId, closureReport, duration, supervisorPrivKey);
```

---

## Testing

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
npm test -- scenario-1-standard-911
npm test -- scenario-2-multi-agency
npm test -- scenario-3-split-merge
```

### Test Coverage

```bash
npm run test:coverage
```

### Test Scenarios

**Scenario 1: Standard 911 Call**
- Complete incident lifecycle from call to closure
- Single unit dispatch and response
- NENA i3 performance metrics validation

**Scenario 2: Multi-Agency Incident**
- Cross-jurisdiction vehicle pursuit
- Agency coordination and data sharing
- Multi-agency closure report

**Scenario 3: Incident Split/Merge**
- Complex incident discovery
- Split into 3 separate investigations
- Merge back into coordinated operation

---

## Deployment

### Mainnet Deployment

1. **Fund BSV Wallet**: Ensure sufficient BSV for transaction fees

2. **Configure Environment**:
```bash
export BSV_PRIVKEY="your-mainnet-private-key-wif"
export BROADCAST_URL="https://api.whatsonchain.com/v1/bsv/main/tx/raw"
export INDEXER_URL="https://your-production-indexer.com"
```

3. **Deploy Contracts**:
```bash
npm run deploy:mainnet
```

4. **Initialize Agencies**:
```typescript
const agencyManager = new AgencyManager(broadcastUrl, indexerUrl);

await agencyManager.registerAgency('AGENCY-ID', {
  name: 'Police Department',
  jurisdiction: { /* GeoJSON polygon */ },
  contactInfo: { phone: '+1-555-1234', email: 'dispatch@pd.gov' },
  authorizedKeys: [pubKey1, pubKey2, pubKey3]
}, supervisorPrivKey);
```

5. **Register Resources**:
```typescript
await resourceManager.registerResource('PATROL-1', {
  type: 'PATROL_CAR',
  status: ResourceStatus.AVAILABLE,
  location: { lat: 19.4326, lng: -99.1332 }
}, dispatcherPrivKey);
```

### Testnet Deployment

Use BSV testnet for development:

```bash
export BROADCAST_URL="https://api.whatsonchain.com/v1/bsv/test/tx/raw"
npm run deploy:testnet
```

---

## API Reference

### Types

#### IncidentStatus
```typescript
enum IncidentStatus {
  NEW = 0,        // Just created
  PENDING = 1,    // Awaiting dispatch
  ACTIVE = 2,     // Units en route or on scene
  RESOLVED = 3,   // Situation resolved
  CLOSED = 4      // Incident closed with report
}
```

#### ResourceStatus
```typescript
enum ResourceStatus {
  AVAILABLE = 0,      // Ready for dispatch
  EN_ROUTE = 1,       // Traveling to scene
  ON_SCENE = 2,       // At incident location
  OUT_OF_SERVICE = 3  // Unavailable
}
```

#### IncidentOrigin
```typescript
enum IncidentOrigin {
  CALL_911 = 0,
  OFFICER_INITIATED = 1,
  ALARM = 2,
  WALK_IN = 3,
  SPLIT = 4,
  MERGED = 5
}
```

#### Location
```typescript
interface Location {
  lat: number;
  lng: number;
  address?: string;
  timestamp?: number;
}
```

#### IncidentData
```typescript
interface IncidentData {
  reason: string;
  priority: number;
  description: string;
  location: Location;
  origin: IncidentOrigin;
  additionalInfo?: any;
  operatorPubKey: string;
  timestamp: number;
}
```

---

## Standards Compliance

### NENA i3 Standards

This system implements key performance indicators from NENA i3 (National Emergency Number Association) standards:

| Metric | Standard | Implementation |
|--------|----------|----------------|
| Call answer time | < 10 seconds | Tracked in incident metadata |
| Incident creation | < 90 seconds | Validated in tests |
| Unit dispatch | < 60 seconds | Validated in tests |
| P1 response time | < 8 minutes | GPS tracking + timestamps |

### Data Retention

All blockchain data is **permanently retained** with cryptographic verification. No data deletion possible (by design).

### Privacy Considerations

- Personal information should be encrypted before storage
- Use off-chain storage for sensitive data (photos, recordings)
- Store only hashes on-chain for verification
- Implement role-based access control via public key authorization

---

## Project Structure

```
cad/
├── src/
│   ├── contracts/           # sCrypt smart contracts
│   │   ├── IncidentContract.ts
│   │   ├── ResourceContract.ts
│   │   ├── DispatchContract.ts
│   │   ├── AgencyContract.ts
│   │   └── IncidentRelationContract.ts
│   ├── managers/            # High-level TypeScript APIs
│   │   ├── IncidentManager.ts
│   │   ├── ResourceManager.ts
│   │   ├── DispatchManager.ts
│   │   └── AgencyManager.ts
│   ├── types/               # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/               # Utility functions
│   │   └── index.ts
│   └── index.ts             # Main exports
├── tests/
│   ├── scenarios/           # End-to-end test scenarios
│   │   ├── scenario-1-standard-911.spec.ts
│   │   ├── scenario-2-multi-agency.spec.ts
│   │   └── scenario-3-split-merge.spec.ts
│   └── unit/                # Unit tests (TODO)
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

---

## Roadmap

### Phase 1: Core Functionality ✅
- [x] Smart contract implementation
- [x] Manager layer
- [x] Basic types and utilities
- [x] End-to-end test scenarios

### Phase 2: Production Features (In Progress)
- [ ] State reconstruction from blockchain
- [ ] Real-time event subscriptions (WebSocket)
- [ ] Performance optimizations (caching, batching)
- [ ] Comprehensive unit tests

### Phase 3: Advanced Features (Planned)
- [ ] Mobile applications (iOS/Android)
- [ ] Web-based dispatch console
- [ ] Administrative dashboard
- [ ] Analytics and reporting
- [ ] AI-assisted dispatch recommendations
- [ ] Voice integration (radio, phone)

### Phase 4: Enterprise (Future)
- [ ] High-availability deployment
- [ ] Multi-region replication
- [ ] Disaster recovery
- [ ] SLA guarantees
- [ ] Professional support

---

## Contributing

This is currently a proof-of-concept project. Contributions welcome!

### Development Workflow

1. Fork repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

### Code Style

- Use TypeScript strict mode
- Follow existing code patterns
- Write tests for new features
- Document public APIs
- Use semantic commit messages

---

## License

MIT License - Copyright (c) 2025 Raul Licea Yañez

See [LICENSE](LICENSE) file for full details.

This software is provided as-is. Use at your own risk.


---

## Acknowledgments

- **sCrypt** - Smart contract framework for Bitcoin SV
- **BSV Blockchain** - Scalable blockchain infrastructure
- **NENA** - Emergency number standards
- **CAD Industry** - Domain expertise and best practices

---

**Built with ❤️ for emergency services and public safety**

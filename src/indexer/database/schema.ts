/**
 * Database schema for SPV Indexer
 * Stores reconstructed state from blockchain events
 */

export interface IndexedIncident {
  txid: string; // Primary key - transaction ID
  incidentId: string; // Same as txid
  status: number; // 0-6: CREATED, PENDING, DISPATCHED, EN_ROUTE, ON_SCENE, RESOLVED, CLOSED
  priority: number; // 1-5
  reason: string;
  description: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
    geohash?: string;
  };
  origin: string; // CALL_911, PANIC_BUTTON, etc.
  operatorPubKey: string;
  agencies: string[]; // Array of agency public keys
  dataHash: string; // SHA256 of full incident data
  createdAt: number; // Unix timestamp
  updatedAt: number; // Unix timestamp
  closedAt?: number;
  duration?: number; // milliseconds
  closureReport?: any;
  version: number; // Optimistic locking version
  utxoSpent: boolean; // True if this UTXO was spent (updated)
  spentBy?: string; // TXID that spent this UTXO
  blockHeight?: number;
  blockHash?: string;
  metadata?: Record<string, any>;
}

export interface IndexedResource {
  txid: string; // Current UTXO txid
  resourceId: string; // Unique resource identifier
  resourceType: number; // 0=POLICE, 1=AMBULANCE, 2=FIRE, 3=SUPERVISOR, 4=SPECIAL
  status: number; // 0=AVAILABLE, 1=DISPATCHED, 2=EN_ROUTE, 3=ON_SCENE, 4=OUT_OF_SERVICE
  currentIncidentId?: string;
  location: {
    lat: number;
    lng: number;
    geohash: string;
    timestamp: number;
  };
  agencyPubKey: string;
  operatorPubKeys: string[];
  version: number;
  utxoSpent: boolean;
  spentBy?: string;
  blockHeight?: number;
  updatedAt: number;
}

export interface IndexedDispatch {
  txid: string;
  dispatchId: string;
  incidentId: string;
  resourceId: string;
  dispatchedBy: string; // PubKey
  dispatchedAt: number;
  estimatedArrival?: number;
  arrivedAt?: number;
  status: number; // 0=PENDING, 1=ACCEPTED, 2=EN_ROUTE, 3=ARRIVED, 4=COMPLETED
  blockHeight?: number;
}

export interface IndexedAgency {
  txid: string;
  agencyId: string;
  agencyNameHash: string;
  agencyPubKey: string;
  adminPubKeys: string[];
  sharedIncidents: string[];
  sharedIncidentCount: number;
  jurisdiction?: {
    type: 'Polygon';
    coordinates: number[][][]; // GeoJSON format
  };
  version: number;
  utxoSpent: boolean;
  spentBy?: string;
  blockHeight?: number;
}

export interface IndexedIncidentRelation {
  txid: string;
  relationId: string;
  sourceIncidentId: string;
  destIncidentId: string;
  relationType: number; // 0=RELATE, 1=PARENT, 2=COMBINE, 3=SPLIT, 4=TRANSFER
  timestamp: number;
  createdBy: string; // PubKey
  notesHash: string;
  blockHeight?: number;
}

export interface BlockchainEvent {
  txid: string;
  eventType: string;
  timestamp: number;
  blockHeight: number;
  blockHash: string;
  contractType: 'IncidentContract' | 'ResourceContract' | 'DispatchContract' | 'AgencyContract' | 'IncidentRelationContract';
  payload: any;
  opReturnData?: string;
  indexed: boolean;
  indexedAt?: number;
}

export interface IndexerState {
  lastProcessedBlock: number;
  lastProcessedTxid: string;
  totalIncidents: number;
  totalResources: number;
  totalDispatches: number;
  totalAgencies: number;
  startedAt: number;
  updatedAt: number;
}

/**
 * Database interface for indexer storage
 */
export interface IndexerDatabase {
  // Incidents
  saveIncident(incident: IndexedIncident): Promise<void>;
  getIncident(txid: string): Promise<IndexedIncident | null>;
  getIncidentHistory(incidentId: string): Promise<IndexedIncident[]>;
  queryIncidents(filters: IncidentFilters): Promise<IndexedIncident[]>;
  markIncidentSpent(txid: string, spentBy: string): Promise<void>;

  // Resources
  saveResource(resource: IndexedResource): Promise<void>;
  getResource(resourceId: string): Promise<IndexedResource | null>;
  queryAvailableResources(filters: ResourceFilters): Promise<IndexedResource[]>;
  queryResourcesByGeohash(geohashes: string[]): Promise<IndexedResource[]>;
  markResourceSpent(txid: string, spentBy: string): Promise<void>;

  // Dispatches
  saveDispatch(dispatch: IndexedDispatch): Promise<void>;
  getDispatch(txid: string): Promise<IndexedDispatch | null>;
  queryDispatches(incidentId: string): Promise<IndexedDispatch[]>;

  // Agencies
  saveAgency(agency: IndexedAgency): Promise<void>;
  getAgency(agencyId: string): Promise<IndexedAgency | null>;
  queryAgencies(): Promise<IndexedAgency[]>;
  markAgencySpent(txid: string, spentBy: string): Promise<void>;

  // Relations
  saveIncidentRelation(relation: IndexedIncidentRelation): Promise<void>;
  getIncidentRelations(incidentId: string): Promise<IndexedIncidentRelation[]>;

  // Events
  saveEvent(event: BlockchainEvent): Promise<void>;
  getUnindexedEvents(): Promise<BlockchainEvent[]>;
  markEventIndexed(txid: string): Promise<void>;

  // State
  getIndexerState(): Promise<IndexerState>;
  updateIndexerState(state: Partial<IndexerState>): Promise<void>;
}

export interface IncidentFilters {
  status?: number[];
  priority?: number[];
  agencies?: string[];
  geohash?: string;
  fromDate?: number;
  toDate?: number;
  limit?: number;
  offset?: number;
}

export interface ResourceFilters {
  resourceType?: number[];
  status?: number[];
  agencyPubKey?: string;
  geohash?: string;
  limit?: number;
}

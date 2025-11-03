/**
 * Core types for BSV CAD System
 */

/**
 * Incident Status Enum
 */
export enum IncidentStatus {
  CREATED = 0,
  PENDING = 1,
  DISPATCHED = 2,
  EN_ROUTE = 3,
  ON_SCENE = 4,
  RESOLVED = 5,
  CLOSED = 6
}

/**
 * Resource Status Enum
 */
export enum ResourceStatus {
  AVAILABLE = 0,
  DISPATCHED = 1,
  EN_ROUTE = 2,
  ON_SCENE = 3,
  OUT_OF_SERVICE = 4
}

/**
 * Resource Type Enum
 */
export enum ResourceType {
  POLICE_UNIT = 0,
  AMBULANCE = 1,
  FIRE_TRUCK = 2,
  SUPERVISOR = 3,
  SPECIAL_UNIT = 4
}

/**
 * Incident Relation Type Enum
 */
export enum IncidentRelationType {
  RELATE = 0,
  PARENT = 1,
  COMBINE = 2,
  SPLIT = 3,
  TRANSFER = 4
}

/**
 * Incident Origin Enum
 */
export enum IncidentOrigin {
  CALL_911 = 'CALL_911',
  PANIC_BUTTON = 'PANIC_BUTTON',
  OFFICER_INITIATED = 'OFFICER_INITIATED',
  ANPR_ALERT = 'ANPR_ALERT',
  CAMERA_DETECTION = 'CAMERA_DETECTION',
  CITIZEN_REPORT = 'CITIZEN_REPORT'
}

/**
 * Geographic Location
 */
export interface GeoLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  address?: string;
}

/**
 * Incident Reason Codes
 */
export type IncidentReasonCode =
  | 'ARMED_ROBBERY'
  | 'ASSAULT'
  | 'BURGLARY'
  | 'VEHICLE_ACCIDENT'
  | 'FIRE'
  | 'MEDICAL_EMERGENCY'
  | 'DOMESTIC_VIOLENCE'
  | 'THEFT'
  | 'VANDALISM'
  | 'PURSUIT'
  | 'SUSPICIOUS_ACTIVITY'
  | 'EMERGENCY_PANIC'
  | 'OTHER';

/**
 * Incident Priority (1 = Highest, 5 = Lowest)
 */
export type IncidentPriority = 1 | 2 | 3 | 4 | 5;

/**
 * Incident Data
 */
export interface IncidentData {
  incidentId?: string; // TXID (generated)
  reason: IncidentReasonCode;
  priority: IncidentPriority;
  description: string;
  location: GeoLocation;
  origin: IncidentOrigin;
  additionalInfo?: Record<string, any>;
  operatorPubKey: string;
  agencies?: string[]; // Array of agency public keys
  timestamp?: number;
}

/**
 * Incident State (from blockchain)
 */
export interface IncidentState {
  incidentId: string;
  status: IncidentStatus;
  priority: IncidentPriority;
  reason: IncidentReasonCode;
  description: string;
  location: GeoLocation;
  origin: IncidentOrigin;
  dataHash: string; // SHA256 hash of full incident data
  agencies: string[];
  operatorPubKey: string;
  createdAt: number;
  updatedAt: number;
  duration?: number; // Only set when closed
  closureReport?: ClosureReport;
  metadata?: Record<string, any>;
  history?: IncidentEvent[];
}

/**
 * Incident Event (for event sourcing)
 */
export interface IncidentEvent {
  type: IncidentEventType;
  timestamp: number;
  txid: string;
  incidentId: string;
  payload: any;
  signature?: string;
  signatureValid?: boolean;
  actor: string; // Public key
}

/**
 * Incident Event Types
 */
export type IncidentEventType =
  | 'INCIDENT_CREATED'
  | 'INCIDENT_UPDATED'
  | 'STATUS_CHANGED'
  | 'PRIORITY_CHANGED'
  | 'UNIT_DISPATCHED'
  | 'UNIT_EN_ROUTE'
  | 'UNIT_ON_SCENE'
  | 'FIELD_NOTES_ADDED'
  | 'INCIDENT_RESOLVED'
  | 'INCIDENT_CLOSED'
  | 'INCIDENT_REOPENED'
  | 'INCIDENT_SPLIT'
  | 'INCIDENTS_COMBINED'
  | 'INCIDENT_SHARED'
  | 'INCIDENT_TRANSFERRED';

/**
 * Closure Report
 */
export interface ClosureReport {
  description: string;
  outcome: string;
  arrests?: number;
  injuries?: number;
  propertyDamage?: boolean;
  propertyRecovered?: boolean;
  additionalFields?: Record<string, any>;
  closedBy: string; // Public key
  closedAt: number;
}

/**
 * Resource Data
 */
export interface ResourceData {
  resourceId: string;
  resourceType: ResourceType;
  status: ResourceStatus;
  currentIncidentId?: string;
  location: GeoLocation;
  agencyPubKey: string;
  capabilities?: string[];
  metadata?: Record<string, any>;
}

/**
 * Dispatch Data
 */
export interface DispatchData {
  incidentId: string;
  resourceIds: string[];
  dispatchedAt: number;
  dispatchedBy: string; // Public key
  estimatedArrival?: number;
  notes?: string;
}

/**
 * Agency Data
 */
export interface AgencyData {
  agencyId: string;
  agencyName: string;
  agencyPubKey: string;
  jurisdiction: GeoPolygon;
  sharedIncidents: string[];
  contactInfo?: {
    phone: string;
    email: string;
    address: string;
  };
}

/**
 * Geographic Polygon (for jurisdiction boundaries)
 */
export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [[[lng, lat], [lng, lat], ...]]
}

/**
 * Incident Relation
 */
export interface IncidentRelation {
  sourceIncidentId: string;
  destIncidentId: string;
  relationType: IncidentRelationType;
  timestamp: number;
  createdBy: string;
  metadata?: Record<string, any>;
}

/**
 * Transaction Metadata (OP_RETURN data)
 */
export interface TransactionMetadata {
  version: number;
  eventType: IncidentEventType;
  timestamp: number;
  incidentId?: string;
  payload: any;
}

/**
 * UTXO Reference
 */
export interface UTXOReference {
  txid: string;
  vout: number;
  satoshis: number;
  script: string;
}

/**
 * Panic Button Event
 */
export interface PanicButtonEvent {
  deviceId: string;
  location: GeoLocation;
  timestamp: number;
  deviceType: 'PANIC_BUTTON';
  registeredTo?: {
    businessName: string;
    businessType: string;
    contactPhone: string;
  };
}

/**
 * Camera Reference
 */
export interface CameraReference {
  cameraId: string;
  distance: number; // Distance in meters
  videoUrl: string; // UHRP URL
  azimuth?: number; // Direction camera is facing
}

/**
 * Query Parameters
 */
export interface IncidentQueryParams {
  status?: IncidentStatus[];
  priority?: IncidentPriority[];
  reason?: IncidentReasonCode[];
  agencies?: string[];
  location?: {
    center: GeoLocation;
    radius: number; // meters
  };
  dateRange?: {
    start: number;
    end: number;
  };
  limit?: number;
  offset?: number;
}

/**
 * Indexer Response
 */
export interface IndexerResponse<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
}

/**
 * Blockchain Transaction Result
 */
export interface TransactionResult {
  txid: string;
  success: boolean;
  error?: string;
  confirmations?: number;
}

/**
 * Permission Levels
 */
export enum PermissionLevel {
  OPERATOR = 0,
  DISPATCHER = 1,
  SUPERVISOR = 2,
  ADMIN = 3
}

/**
 * User Permissions
 */
export interface UserPermissions {
  level: PermissionLevel;
  pubKey: string;
  agencyPubKey: string;
  capabilities: string[];
}

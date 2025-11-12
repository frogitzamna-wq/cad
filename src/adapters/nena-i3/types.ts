/**
 * NENA i3 Standard Types
 * 
 * Based on NENA-STA-010.3-2021 (i3 Standard for Next Generation 9-1-1)
 * and APCO CAD-to-CAD Interoperability Standards
 */

export interface NENALocation {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number; // meters
  address?: {
    houseNumber?: string;
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  civicAddress?: string;
  /** NENA-compliant location URN */
  locationURN?: string;
}

export interface NENAAgency {
  agencyId: string;
  agencyName: string;
  jurisdiction?: string;
  /** NENA Service URN (e.g., urn:service:sos.police) */
  serviceURN?: string;
  contactInfo?: {
    phone?: string;
    email?: string;
    radio?: string;
  };
}

/**
 * APCO Message Type: Incident Notification
 * Used to notify other agencies of an incident
 */
export interface NENAIncidentNotification {
  messageType: 'IncidentNotification';
  messageId: string;
  timestamp: string; // ISO 8601
  version: string; // e.g., "1.0"
  
  originatingAgency: NENAAgency;
  receivingAgency?: NENAAgency;
  
  incident: {
    incidentId: string;
    externalId?: string; // For cross-reference
    status: NENAIncidentStatus;
    priority: number; // 1-5
    incidentType: NENAIncidentType;
    description: string;
    location: NENALocation;
    reportedAt: string; // ISO 8601
    caller?: {
      callbackNumber?: string;
      name?: string;
    };
  };
  
  /** Optional multimedia attachments */
  attachments?: Array<{
    type: 'audio' | 'video' | 'image' | 'document';
    url: string;
    hash?: string; // For integrity verification
  }>;
}

/**
 * APCO Message Type: Resource Request
 * Request resources from another agency
 */
export interface NENAResourceRequest {
  messageType: 'ResourceRequest';
  messageId: string;
  timestamp: string;
  
  requestingAgency: NENAAgency;
  targetAgency: NENAAgency;
  
  incidentId: string;
  resourceType: NENAResourceType;
  quantity: number;
  urgency: 'IMMEDIATE' | 'URGENT' | 'ROUTINE';
  
  location: NENALocation;
  specialRequirements?: string;
  estimatedDuration?: number; // minutes
}

/**
 * APCO Message Type: Status Update
 * Update status of resource or incident
 */
export interface NENAStatusUpdate {
  messageType: 'StatusUpdate';
  messageId: string;
  timestamp: string;
  
  originatingAgency: NENAAgency;
  
  /** Can be incident or resource status */
  subject: {
    type: 'incident' | 'resource';
    id: string;
  };
  
  status: NENAIncidentStatus | NENAResourceStatus;
  location?: NENALocation;
  notes?: string;
}

/**
 * APCO Message Type: Incident Transfer
 * Transfer incident to another jurisdiction
 */
export interface NENAIncidentTransfer {
  messageType: 'IncidentTransfer';
  messageId: string;
  timestamp: string;
  
  fromAgency: NENAAgency;
  toAgency: NENAAgency;
  
  incidentId: string;
  reason: 'JURISDICTIONAL_BOUNDARY' | 'RESOURCE_AVAILABILITY' | 'SPECIALTY_REQUIRED' | 'OTHER';
  reasonDescription?: string;
  
  /** Complete incident data */
  incidentData: NENAIncidentNotification['incident'];
  
  /** History of actions taken */
  history?: Array<{
    timestamp: string;
    action: string;
    actor: string;
  }>;
  
  /** Transfer acceptance required */
  requiresAcceptance: boolean;
}

/**
 * NENA Incident Status Values
 */
export enum NENAIncidentStatus {
  RECEIVED = 'RECEIVED',
  PENDING = 'PENDING',
  DISPATCHED = 'DISPATCHED',
  EN_ROUTE = 'EN_ROUTE',
  ON_SCENE = 'ON_SCENE',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED'
}

/**
 * NENA Incident Types
 * Based on NEMA incident classification
 */
export type NENAIncidentType =
  | 'POLICE_EMERGENCY'
  | 'FIRE_EMERGENCY'
  | 'MEDICAL_EMERGENCY'
  | 'TRAFFIC_ACCIDENT'
  | 'HAZMAT'
  | 'NATURAL_DISASTER'
  | 'CIVIL_DISORDER'
  | 'SEARCH_RESCUE'
  | 'TERRORISM'
  | 'OTHER';

/**
 * NENA Resource Types
 */
export type NENAResourceType =
  | 'POLICE_UNIT'
  | 'AMBULANCE'
  | 'FIRE_ENGINE'
  | 'LADDER_TRUCK'
  | 'RESCUE_UNIT'
  | 'HAZMAT_UNIT'
  | 'AIR_SUPPORT'
  | 'K9_UNIT'
  | 'SWAT'
  | 'SUPERVISOR';

/**
 * NENA Resource Status
 */
export enum NENAResourceStatus {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
  DISPATCHED = 'DISPATCHED',
  EN_ROUTE = 'EN_ROUTE',
  ON_SCENE = 'ON_SCENE',
  RETURNING = 'RETURNING',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE'
}

/**
 * Union type of all NENA messages
 */
export type NENAMessage =
  | NENAIncidentNotification
  | NENAResourceRequest
  | NENAStatusUpdate
  | NENAIncidentTransfer;

/**
 * NENA Message Response
 */
export interface NENAMessageResponse {
  messageId: string;
  originalMessageId: string;
  timestamp: string;
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING';
  reason?: string;
  respondingAgency: NENAAgency;
}

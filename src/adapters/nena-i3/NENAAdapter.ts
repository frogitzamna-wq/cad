import { IndexedIncident, IndexedResource } from '../../indexer/database/schema';
import {
  NENAMessage,
  NENAIncidentNotification,
  NENAStatusUpdate,
  NENAResourceRequest,
  NENAIncidentTransfer,
  NENAIncidentStatus,
  NENAResourceStatus,
  NENAIncidentType,
  NENAResourceType,
  NENAAgency
} from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * NENAAdapter
 * 
 * Bidirectional adapter between BSV blockchain CAD events and NENA i3 standard messages
 * Enables interoperability with legacy PSAP systems
 */
export class NENAAdapter {
  constructor(
    private localAgency: NENAAgency
  ) {}

  // ===== Blockchain → NENA =====

  /**
   * Convert blockchain incident to NENA Incident Notification
   */
  toIncidentNotification(
    incident: IndexedIncident,
    receivingAgency?: NENAAgency
  ): NENAIncidentNotification {
    return {
      messageType: 'IncidentNotification',
      messageId: uuidv4(),
      timestamp: new Date(incident.createdAt).toISOString(),
      version: '1.0',
      originatingAgency: this.localAgency,
      receivingAgency,
      incident: {
        incidentId: incident.incidentId,
        status: this.mapIncidentStatus(incident.status),
        priority: incident.priority,
        incidentType: this.mapIncidentType(incident.reason),
        description: incident.description,
        location: {
          latitude: incident.location.lat,
          longitude: incident.location.lng,
          address: incident.location.address ? {
            civicAddress: incident.location.address
          } as any : undefined
        },
        reportedAt: new Date(incident.createdAt).toISOString()
      }
    };
  }

  /**
   * Convert resource status to NENA Status Update
   */
  toStatusUpdate(
    resource: IndexedResource,
    subjectType: 'incident' | 'resource' = 'resource'
  ): NENAStatusUpdate {
    return {
      messageType: 'StatusUpdate',
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      originatingAgency: this.localAgency,
      subject: {
        type: subjectType,
        id: resource.resourceId
      },
      status: this.mapResourceStatus(resource.status),
      location: {
        latitude: resource.location.lat,
        longitude: resource.location.lng
      }
    };
  }

  /**
   * Convert to NENA Resource Request
   */
  toResourceRequest(
    incidentId: string,
    resourceType: number,
    targetAgency: NENAAgency,
    location: { lat: number; lng: number },
    urgency: 'IMMEDIATE' | 'URGENT' | 'ROUTINE' = 'URGENT'
  ): NENAResourceRequest {
    return {
      messageType: 'ResourceRequest',
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      requestingAgency: this.localAgency,
      targetAgency,
      incidentId,
      resourceType: this.mapResourceType(resourceType),
      quantity: 1,
      urgency,
      location: {
        latitude: location.lat,
        longitude: location.lng
      }
    };
  }

  /**
   * Convert to NENA Incident Transfer
   */
  toIncidentTransfer(
    incident: IndexedIncident,
    toAgency: NENAAgency,
    reason: string,
    requiresAcceptance: boolean = true
  ): NENAIncidentTransfer {
    return {
      messageType: 'IncidentTransfer',
      messageId: uuidv4(),
      timestamp: new Date().toISOString(),
      fromAgency: this.localAgency,
      toAgency,
      incidentId: incident.incidentId,
      reason: 'JURISDICTIONAL_BOUNDARY',
      reasonDescription: reason,
      incidentData: {
        incidentId: incident.incidentId,
        status: this.mapIncidentStatus(incident.status),
        priority: incident.priority,
        incidentType: this.mapIncidentType(incident.reason),
        description: incident.description,
        location: {
          latitude: incident.location.lat,
          longitude: incident.location.lng,
          address: incident.location.address ? {
            civicAddress: incident.location.address
          } as any : undefined
        },
        reportedAt: new Date(incident.createdAt).toISOString()
      },
      requiresAcceptance
    };
  }

  // ===== NENA → Blockchain =====

  /**
   * Parse NENA message and extract incident data for blockchain
   */
  fromIncidentNotification(message: NENAIncidentNotification): Partial<IndexedIncident> {
    return {
      incidentId: message.incident.incidentId,
      status: this.unmapIncidentStatus(message.incident.status),
      priority: message.incident.priority,
      reason: this.unmapIncidentType(message.incident.incidentType),
      description: message.incident.description,
      location: {
        lat: message.incident.location.latitude,
        lng: message.incident.location.longitude,
        address: message.incident.location.address?.civicAddress || 
                message.incident.location.civicAddress
      },
      origin: 'CALL_911', // Default
      createdAt: new Date(message.incident.reportedAt).getTime(),
      updatedAt: Date.now()
    };
  }

  /**
   * Parse NENA status update
   */
  fromStatusUpdate(message: NENAStatusUpdate): { 
    id: string; 
    status: number; 
    location?: { lat: number; lng: number } 
  } {
    return {
      id: message.subject.id,
      status: message.subject.type === 'incident' 
        ? this.unmapIncidentStatus(message.status as NENAIncidentStatus)
        : this.unmapResourceStatus(message.status as NENAResourceStatus),
      location: message.location ? {
        lat: message.location.latitude,
        lng: message.location.longitude
      } : undefined
    };
  }

  // ===== Status Mapping =====

  private mapIncidentStatus(status: number): NENAIncidentStatus {
    const mapping: Record<number, NENAIncidentStatus> = {
      0: NENAIncidentStatus.RECEIVED,
      1: NENAIncidentStatus.PENDING,
      2: NENAIncidentStatus.DISPATCHED,
      3: NENAIncidentStatus.EN_ROUTE,
      4: NENAIncidentStatus.ON_SCENE,
      5: NENAIncidentStatus.RESOLVED,
      6: NENAIncidentStatus.CLOSED
    };
    return mapping[status] || NENAIncidentStatus.PENDING;
  }

  private unmapIncidentStatus(status: NENAIncidentStatus): number {
    const mapping: Record<NENAIncidentStatus, number> = {
      [NENAIncidentStatus.RECEIVED]: 0,
      [NENAIncidentStatus.PENDING]: 1,
      [NENAIncidentStatus.DISPATCHED]: 2,
      [NENAIncidentStatus.EN_ROUTE]: 3,
      [NENAIncidentStatus.ON_SCENE]: 4,
      [NENAIncidentStatus.RESOLVED]: 5,
      [NENAIncidentStatus.CLOSED]: 6,
      [NENAIncidentStatus.CANCELLED]: 6
    };
    return mapping[status] || 1;
  }

  private mapResourceStatus(status: number): NENAResourceStatus {
    const mapping: Record<number, NENAResourceStatus> = {
      0: NENAResourceStatus.AVAILABLE,
      1: NENAResourceStatus.DISPATCHED,
      2: NENAResourceStatus.EN_ROUTE,
      3: NENAResourceStatus.ON_SCENE,
      4: NENAResourceStatus.OUT_OF_SERVICE
    };
    return mapping[status] || NENAResourceStatus.UNAVAILABLE;
  }

  private unmapResourceStatus(status: NENAResourceStatus): number {
    const mapping: Record<NENAResourceStatus, number> = {
      [NENAResourceStatus.AVAILABLE]: 0,
      [NENAResourceStatus.UNAVAILABLE]: 4,
      [NENAResourceStatus.DISPATCHED]: 1,
      [NENAResourceStatus.EN_ROUTE]: 2,
      [NENAResourceStatus.ON_SCENE]: 3,
      [NENAResourceStatus.RETURNING]: 2,
      [NENAResourceStatus.OUT_OF_SERVICE]: 4
    };
    return mapping[status] || 0;
  }

  private mapIncidentType(reason: string): NENAIncidentType {
    const mapping: Record<string, NENAIncidentType> = {
      'ARMED_ROBBERY': 'POLICE_EMERGENCY',
      'ASSAULT': 'POLICE_EMERGENCY',
      'BURGLARY': 'POLICE_EMERGENCY',
      'FIRE': 'FIRE_EMERGENCY',
      'MEDICAL_EMERGENCY': 'MEDICAL_EMERGENCY',
      'VEHICLE_ACCIDENT': 'TRAFFIC_ACCIDENT',
      'HAZMAT': 'HAZMAT'
    };
    return mapping[reason] || 'OTHER';
  }

  private unmapIncidentType(type: NENAIncidentType): string {
    const mapping: Record<NENAIncidentType, string> = {
      'POLICE_EMERGENCY': 'ASSAULT',
      'FIRE_EMERGENCY': 'FIRE',
      'MEDICAL_EMERGENCY': 'MEDICAL_EMERGENCY',
      'TRAFFIC_ACCIDENT': 'VEHICLE_ACCIDENT',
      'HAZMAT': 'HAZMAT',
      'NATURAL_DISASTER': 'EMERGENCY',
      'CIVIL_DISORDER': 'CIVIL_UNREST',
      'SEARCH_RESCUE': 'SEARCH_RESCUE',
      'TERRORISM': 'TERRORISM',
      'OTHER': 'OTHER'
    };
    return mapping[type] || 'OTHER';
  }

  private mapResourceType(type: number): NENAResourceType {
    const mapping: Record<number, NENAResourceType> = {
      0: 'POLICE_UNIT',
      1: 'AMBULANCE',
      2: 'FIRE_ENGINE',
      3: 'SUPERVISOR',
      4: 'SWAT'
    };
    return mapping[type] || 'POLICE_UNIT';
  }
}

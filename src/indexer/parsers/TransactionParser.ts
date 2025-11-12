import * as bsv from 'bsv';
import { BlockchainEvent } from '../database/schema';

/**
 * TransactionParser
 * 
 * Extracts and parses OP_RETURN data from BSV transactions
 * to reconstruct CAD system events
 */
export class TransactionParser {
  /**
   * Parse transaction and extract CAD event data
   */
  parseTransaction(tx: bsv.Transaction, blockHeight: number, blockHash: string): BlockchainEvent | null {
    try {
      // Find OP_RETURN output
      const opReturnOutput = this.findOPReturnOutput(tx);
      
      if (!opReturnOutput) {
        return null;
      }

      // Extract and parse data
      const opReturnData = this.extractOPReturnData(opReturnOutput);
      const eventData = this.parseEventData(opReturnData);

      if (!eventData) {
        return null;
      }

      // Determine contract type from event type
      const contractType = this.getContractType(eventData.type);

      if (!contractType) {
        return null;
      }

      return {
        txid: tx.id,
        eventType: eventData.type,
        timestamp: eventData.timestamp || Date.now(),
        blockHeight,
        blockHash,
        contractType,
        payload: eventData.payload,
        opReturnData,
        indexed: false
      };
    } catch (error) {
      console.error(`Failed to parse transaction ${tx.id}:`, error);
      return null;
    }
  }

  /**
   * Find OP_RETURN output in transaction
   */
  private findOPReturnOutput(tx: bsv.Transaction): any | null {
    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i];
      
      // Check if this is OP_RETURN (starts with 0x6a)
      if (output.script && output.script.toBuffer()[0] === 0x6a) {
        return output;
      }
    }
    
    return null;
  }

  /**
   * Extract data from OP_RETURN output
   */
  private extractOPReturnData(output: any): string {
    try {
      const script = output.script.toBuffer();
      
      // Skip OP_RETURN opcode (0x6a)
      let offset = 1;
      
      // Read pushdata
      const length = script[offset];
      offset++;
      
      // Extract data
      const data = script.slice(offset, offset + length);
      
      return data.toString('utf8');
    } catch (error) {
      console.error('Failed to extract OP_RETURN data:', error);
      return '';
    }
  }

  /**
   * Parse event data from JSON string
   */
  private parseEventData(data: string): any | null {
    try {
      return JSON.parse(data);
    } catch (error) {
      // Try to parse as key-value pairs
      try {
        const obj: any = {};
        const pairs = data.split('|');
        
        for (const pair of pairs) {
          const [key, value] = pair.split('=');
          if (key && value) {
            obj[key.trim()] = value.trim();
          }
        }
        
        return obj;
      } catch {
        return null;
      }
    }
  }

  /**
   * Determine contract type from event type
   */
  private getContractType(eventType: string): BlockchainEvent['contractType'] | null {
    const incidentEvents = [
      'INCIDENT_CREATED',
      'INCIDENT_UPDATED',
      'STATUS_CHANGED',
      'PRIORITY_CHANGED',
      'INCIDENT_CLOSED',
      'INCIDENT_REOPENED',
      'INCIDENT_SHARED'
    ];

    const resourceEvents = [
      'RESOURCE_REGISTERED',
      'RESOURCE_DISPATCHED',
      'RESOURCE_STATUS_UPDATED',
      'RESOURCE_LOCATION_UPDATED',
      'RESOURCE_RELEASED'
    ];

    const dispatchEvents = [
      'DISPATCH_CREATED',
      'DISPATCH_ACCEPTED',
      'DISPATCH_COMPLETED',
      'DISPATCH_CANCELLED'
    ];

    const agencyEvents = [
      'AGENCY_REGISTERED',
      'AGENCY_UPDATED',
      'INCIDENT_SHARED_WITH_AGENCY'
    ];

    const relationEvents = [
      'INCIDENT_SPLIT',
      'INCIDENTS_COMBINED',
      'INCIDENT_RELATED',
      'INCIDENT_TRANSFERRED'
    ];

    if (incidentEvents.includes(eventType)) {
      return 'IncidentContract';
    } else if (resourceEvents.includes(eventType)) {
      return 'ResourceContract';
    } else if (dispatchEvents.includes(eventType)) {
      return 'DispatchContract';
    } else if (agencyEvents.includes(eventType)) {
      return 'AgencyContract';
    } else if (relationEvents.includes(eventType)) {
      return 'IncidentRelationContract';
    }

    return null;
  }

  /**
   * Parse incident data from event payload
   */
  parseIncidentEvent(event: BlockchainEvent): any {
    const { eventType, payload, txid } = event;

    switch (eventType) {
      case 'INCIDENT_CREATED':
        return {
          txid,
          incidentId: txid,
          status: 0, // CREATED
          priority: payload.priority || 3,
          reason: payload.reason || 'UNKNOWN',
          description: payload.description || '',
          location: payload.location || {},
          origin: payload.origin || 'UNKNOWN',
          operatorPubKey: payload.operatorPubKey || '',
          agencies: payload.agencies || [],
          dataHash: payload.dataHash || '',
          createdAt: payload.timestamp || Date.now(),
          updatedAt: payload.timestamp || Date.now(),
          version: 1,
          utxoSpent: false,
          blockHeight: event.blockHeight
        };

      case 'STATUS_CHANGED':
        return {
          status: payload.newStatus,
          updatedAt: payload.timestamp || Date.now()
        };

      case 'PRIORITY_CHANGED':
        return {
          priority: payload.newPriority,
          updatedAt: payload.timestamp || Date.now()
        };

      case 'INCIDENT_CLOSED':
        return {
          status: 6, // CLOSED
          closedAt: payload.timestamp || Date.now(),
          duration: payload.duration,
          closureReport: payload.closureReport,
          updatedAt: payload.timestamp || Date.now()
        };

      default:
        return null;
    }
  }

  /**
   * Parse resource data from event payload
   */
  parseResourceEvent(event: BlockchainEvent): any {
    const { eventType, payload, txid } = event;

    switch (eventType) {
      case 'RESOURCE_REGISTERED':
        return {
          txid,
          resourceId: payload.resourceId,
          resourceType: payload.resourceType || 0,
          status: 0, // AVAILABLE
          location: payload.location || {},
          agencyPubKey: payload.agencyPubKey || '',
          operatorPubKeys: payload.operatorPubKeys || [],
          version: 1,
          utxoSpent: false,
          blockHeight: event.blockHeight,
          updatedAt: payload.timestamp || Date.now()
        };

      case 'RESOURCE_DISPATCHED':
        return {
          status: 1, // DISPATCHED
          currentIncidentId: payload.incidentId,
          updatedAt: payload.timestamp || Date.now()
        };

      case 'RESOURCE_STATUS_UPDATED':
        return {
          status: payload.newStatus,
          updatedAt: payload.timestamp || Date.now()
        };

      case 'RESOURCE_LOCATION_UPDATED':
        return {
          location: payload.location,
          updatedAt: payload.timestamp || Date.now()
        };

      case 'RESOURCE_RELEASED':
        return {
          status: 0, // AVAILABLE
          currentIncidentId: undefined,
          updatedAt: payload.timestamp || Date.now()
        };

      default:
        return null;
    }
  }

  /**
   * Parse dispatch data from event payload
   */
  parseDispatchEvent(event: BlockchainEvent): any {
    const { eventType, payload, txid } = event;

    if (eventType === 'DISPATCH_CREATED') {
      return {
        txid,
        dispatchId: txid,
        incidentId: payload.incidentId,
        resourceId: payload.resourceId,
        dispatchedBy: payload.dispatchedBy,
        dispatchedAt: payload.timestamp || Date.now(),
        estimatedArrival: payload.estimatedArrival,
        status: 0, // PENDING
        blockHeight: event.blockHeight
      };
    }

    return null;
  }

  /**
   * Parse agency data from event payload
   */
  parseAgencyEvent(event: BlockchainEvent): any {
    const { eventType, payload, txid } = event;

    if (eventType === 'AGENCY_REGISTERED') {
      return {
        txid,
        agencyId: payload.agencyId,
        agencyNameHash: payload.agencyNameHash,
        agencyPubKey: payload.agencyPubKey,
        adminPubKeys: payload.adminPubKeys || [],
        sharedIncidents: [],
        sharedIncidentCount: 0,
        jurisdiction: payload.jurisdiction,
        version: 1,
        utxoSpent: false,
        blockHeight: event.blockHeight
      };
    }

    return null;
  }

  /**
   * Parse incident relation data from event payload
   */
  parseIncidentRelationEvent(event: BlockchainEvent): any {
    const { eventType, payload, txid } = event;

    const relationTypes: Record<string, number> = {
      'INCIDENT_RELATED': 0,
      'INCIDENT_SPLIT': 3,
      'INCIDENTS_COMBINED': 2,
      'INCIDENT_TRANSFERRED': 4
    };

    const relationType = relationTypes[eventType];

    if (relationType !== undefined) {
      return {
        txid,
        relationId: txid,
        sourceIncidentId: payload.sourceIncidentId,
        destIncidentId: payload.destIncidentId,
        relationType,
        timestamp: payload.timestamp || Date.now(),
        createdBy: payload.createdBy,
        notesHash: payload.notesHash || '',
        blockHeight: event.blockHeight
      };
    }

    return null;
  }
}

import { PrivateKey, Transaction } from 'bsv';
import {
  ResourceData,
  ResourceStatus,
  ResourceType,
  GeoLocation
} from '../types';

/**
 * ResourceManager
 * 
 * Manages emergency response resources (units, vehicles, personnel).
 * Handles dispatch, status updates, and GPS tracking.
 */
export class ResourceManager {
  private broadcastUrl: string;
  private indexerUrl: string;

  constructor(broadcastUrl: string, indexerUrl: string) {
    this.broadcastUrl = broadcastUrl;
    this.indexerUrl = indexerUrl;
  }

  /**
   * Get resource by ID
   */
  async getResource(resourceId: string): Promise<ResourceData> {
    const response = await fetch(`${this.indexerUrl}/resources/${resourceId}`);
    if (!response.ok) {
      throw new Error(`Resource not found: ${resourceId}`);
    }
    return response.json();
  }

  /**
   * Update resource status
   */
  async updateStatus(
    resourceId: string,
    newStatus: ResourceStatus,
    operatorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      const resource = await this.getResource(resourceId);

      if (!this.validateStatusTransition(resource.status, newStatus)) {
        throw new Error(`Invalid status transition: ${resource.status} → ${newStatus}`);
      }

      const tx = await this.buildUpdateStatusTx(resource, newStatus, operatorPrivKey);
      const txid = await this.broadcast(tx);

      console.log(`✅ Resource ${resourceId} status: ${ResourceStatus[newStatus]}`);

      return txid;
    } catch (error) {
      console.error('Failed to update resource status:', error);
      throw error;
    }
  }

  /**
   * Update GPS location
   */
  async updateLocation(
    resourceId: string,
    location: GeoLocation,
    operatorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      const resource = await this.getResource(resourceId);
      const tx = await this.buildUpdateLocationTx(resource, location, operatorPrivKey);
      const txid = await this.broadcast(tx);

      console.log(`📍 GPS updated: ${resourceId} → ${location.lat}, ${location.lng}`);

      return txid;
    } catch (error) {
      console.error('Failed to update location:', error);
      throw error;
    }
  }

  /**
   * Batch update GPS locations for multiple resources
   */
  async batchUpdateLocations(
    updates: Array<{ resourceId: string; location: GeoLocation }>,
    operatorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      const tx = await this.buildBatchUpdateLocationsTx(updates, operatorPrivKey);
      const txid = await this.broadcast(tx);

      console.log(`📍 Batch GPS update: ${updates.length} resources`);

      return txid;
    } catch (error) {
      console.error('Failed to batch update locations:', error);
      throw error;
    }
  }

  /**
   * Find nearest available resource
   */
  async findNearestAvailable(
    location: GeoLocation,
    resourceType: ResourceType,
    maxDistance: number = 10000 // meters
  ): Promise<ResourceData & { distance: number }> {
    const response = await fetch(`${this.indexerUrl}/resources/nearest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location, resourceType, maxDistance })
    });

    if (!response.ok) {
      throw new Error('No available resources found');
    }

    return response.json();
  }

  /**
   * Release resource from incident
   */
  async release(resourceId: string, operatorPrivKey: PrivateKey): Promise<string> {
    try {
      const resource = await this.getResource(resourceId);
      const tx = await this.buildReleaseTx(resource, operatorPrivKey);
      const txid = await this.broadcast(tx);

      console.log(`✅ Resource ${resourceId} released`);

      return txid;
    } catch (error) {
      console.error('Failed to release resource:', error);
      throw error;
    }
  }

  // ===== Private Methods =====

  private validateStatusTransition(current: ResourceStatus, next: ResourceStatus): boolean {
    const transitions: Record<ResourceStatus, ResourceStatus[]> = {
      [ResourceStatus.AVAILABLE]: [ResourceStatus.DISPATCHED, ResourceStatus.OUT_OF_SERVICE],
      [ResourceStatus.DISPATCHED]: [ResourceStatus.EN_ROUTE, ResourceStatus.AVAILABLE],
      [ResourceStatus.EN_ROUTE]: [ResourceStatus.ON_SCENE, ResourceStatus.AVAILABLE],
      [ResourceStatus.ON_SCENE]: [ResourceStatus.AVAILABLE, ResourceStatus.OUT_OF_SERVICE],
      [ResourceStatus.OUT_OF_SERVICE]: [ResourceStatus.AVAILABLE]
    };

    return transitions[current]?.includes(next) || false;
  }

  private async buildUpdateStatusTx(
    resource: ResourceData,
    newStatus: ResourceStatus,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual transaction building
    return new Transaction();
  }

  private async buildUpdateLocationTx(
    resource: ResourceData,
    location: GeoLocation,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual transaction building
    return new Transaction();
  }

  private async buildBatchUpdateLocationsTx(
    updates: Array<{ resourceId: string; location: GeoLocation }>,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement batch transaction building
    return new Transaction();
  }

  private async buildReleaseTx(
    resource: ResourceData,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual transaction building
    return new Transaction();
  }

  private async broadcast(tx: Transaction): Promise<string> {
    const response = await fetch(this.broadcastUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawtx: tx.toString() })
    });

    if (!response.ok) {
      throw new Error('Failed to broadcast transaction');
    }

    const result = await response.json();
    return result.txid || tx.id;
  }
}

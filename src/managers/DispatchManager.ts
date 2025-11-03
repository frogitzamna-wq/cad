import { PrivateKey, Transaction } from 'bsv';
import { DispatchData, ResourceManager, IncidentManager } from '../';

/**
 * DispatchManager
 * 
 * Coordinates dispatch operations linking incidents to resources.
 * Handles automatic and manual dispatch assignments.
 */
export class DispatchManager {
  private broadcastUrl: string;
  private indexerUrl: string;
  private resourceManager: ResourceManager;
  private incidentManager: IncidentManager;

  constructor(
    broadcastUrl: string,
    indexerUrl: string,
    resourceManager: ResourceManager,
    incidentManager: IncidentManager
  ) {
    this.broadcastUrl = broadcastUrl;
    this.indexerUrl = indexerUrl;
    this.resourceManager = resourceManager;
    this.incidentManager = incidentManager;
  }

  /**
   * Dispatch resources to incident (atomic operation)
   */
  async dispatch(params: {
    incidentId: string;
    resourceIds: string[];
    dispatcherPrivKey: PrivateKey;
    notes?: string;
  }): Promise<string> {
    try {
      const { incidentId, resourceIds, dispatcherPrivKey, notes } = params;

      // Verify all resources are available
      for (const resourceId of resourceIds) {
        const resource = await this.resourceManager.getResource(resourceId);
        if (resource.status !== 0) { // AVAILABLE
          throw new Error(`Resource ${resourceId} not available`);
        }
      }

      // Build atomic dispatch transaction
      const tx = await this.buildDispatchTx(
        incidentId,
        resourceIds,
        dispatcherPrivKey,
        notes
      );

      const txid = await this.broadcast(tx);

      console.log(`✅ Dispatched ${resourceIds.length} resource(s) to incident ${incidentId}`);

      return txid;
    } catch (error) {
      console.error('Failed to dispatch:', error);
      throw error;
    }
  }

  /**
   * Auto-dispatch nearest available resource
   */
  async autoDispatch(incidentId: string, resourceType: number): Promise<string> {
    try {
      // Fetch incident to get location
      const incident = await this.getIncidentFromIndexer(incidentId);

      // Find nearest available resource
      const nearestResource = await this.resourceManager.findNearestAvailable(
        incident.location,
        resourceType,
        10000 // 10km radius
      );

      console.log(`🤖 Auto-dispatching ${nearestResource.resourceId} (${nearestResource.distance}m away)`);

      // Dispatch using system dispatcher key
      // Note: In production, this would use a dedicated auto-dispatch key
      const txid = await this.dispatch({
        incidentId,
        resourceIds: [nearestResource.resourceId],
        dispatcherPrivKey: this.getAutoDispatchKey(),
        notes: `Auto-dispatched: ${nearestResource.distance}m away`
      });

      return txid;
    } catch (error) {
      console.error('Failed to auto-dispatch:', error);
      throw error;
    }
  }

  /**
   * Cancel dispatch
   */
  async cancelDispatch(
    dispatchId: string,
    dispatcherPrivKey: PrivateKey
  ): Promise<string> {
    try {
      const tx = await this.buildCancelDispatchTx(dispatchId, dispatcherPrivKey);
      const txid = await this.broadcast(tx);

      console.log(`✅ Dispatch cancelled: ${dispatchId}`);

      return txid;
    } catch (error) {
      console.error('Failed to cancel dispatch:', error);
      throw error;
    }
  }

  // ===== Private Methods =====

  private async buildDispatchTx(
    incidentId: string,
    resourceIds: string[],
    privKey: PrivateKey,
    notes?: string
  ): Promise<Transaction> {
    // TODO: Implement atomic dispatch transaction
    // This should:
    // 1. Update incident status to DISPATCHED
    // 2. Update all resources to DISPATCHED
    // 3. Create DispatchContract UTXOs for each assignment
    return new Transaction();
  }

  private async buildCancelDispatchTx(
    dispatchId: string,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement cancel dispatch transaction
    return new Transaction();
  }

  private async getIncidentFromIndexer(incidentId: string): Promise<any> {
    const response = await fetch(`${this.indexerUrl}/incidents/${incidentId}`);
    if (!response.ok) {
      throw new Error(`Incident not found: ${incidentId}`);
    }
    return response.json();
  }

  private getAutoDispatchKey(): PrivateKey {
    // TODO: Load from secure configuration
    // This is a placeholder
    throw new Error('Auto-dispatch key not configured');
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

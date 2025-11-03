import { PrivateKey, Transaction, Script } from 'bsv';
import * as crypto from 'crypto';
import {
  IncidentData,
  IncidentStatus,
  IncidentState,
  ClosureReport,
  TransactionResult,
  TransactionMetadata,
  IncidentEventType
} from '../types';

/**
 * IncidentManager
 * 
 * High-level manager for incident lifecycle operations.
 * Handles creation, updates, status changes, and closures on blockchain.
 */
export class IncidentManager {
  private broadcastUrl: string;
  private indexerUrl: string;

  constructor(broadcastUrl: string, indexerUrl: string) {
    this.broadcastUrl = broadcastUrl;
    this.indexerUrl = indexerUrl;
  }

  /**
   * Create new incident on blockchain
   */
  async createIncident(
    data: IncidentData,
    operatorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      // Set timestamp if not provided
      if (!data.timestamp) {
        data.timestamp = Date.now();
      }

      // Calculate data hash
      const dataHash = this.hashIncidentData(data);

      // Build transaction
      const tx = await this.buildCreateIncidentTx(data, dataHash, operatorPrivKey);

      // Broadcast to blockchain
      const txid = await this.broadcast(tx);

      console.log(`✅ Incident created: ${txid}`);
      console.log(`⏱️  Timestamp: ${new Date(data.timestamp).toISOString()}`);

      return txid;
    } catch (error) {
      console.error('Failed to create incident:', error);
      throw error;
    }
  }

  /**
   * Update incident data or priority
   */
  async updateIncident(
    incidentId: string,
    updates: Partial<IncidentData>,
    operatorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      // Fetch current incident UTXO
      const currentUtxo = await this.getIncidentUtxo(incidentId);

      // Merge updates
      const updatedData = { ...currentUtxo.data, ...updates };

      // Calculate new data hash
      const newDataHash = this.hashIncidentData(updatedData);

      // Build transaction
      const tx = await this.buildUpdateIncidentTx(
        currentUtxo,
        newDataHash,
        updates.priority || currentUtxo.data.priority,
        operatorPrivKey
      );

      // Broadcast
      const txid = await this.broadcast(tx);

      console.log(`✅ Incident updated: ${txid}`);

      return txid;
    } catch (error) {
      console.error('Failed to update incident:', error);
      throw error;
    }
  }

  /**
   * Change incident status
   */
  async updateStatus(
    incidentId: string,
    newStatus: IncidentStatus,
    userPrivKey: PrivateKey
  ): Promise<string> {
    try {
      // Fetch current incident UTXO
      const currentUtxo = await this.getIncidentUtxo(incidentId);

      // Validate status transition
      if (!this.validateStatusTransition(currentUtxo.data.status, newStatus)) {
        throw new Error(`Invalid status transition: ${currentUtxo.data.status} → ${newStatus}`);
      }

      // Build transaction
      const tx = await this.buildChangeStatusTx(
        currentUtxo,
        newStatus,
        userPrivKey
      );

      // Broadcast
      const txid = await this.broadcast(tx);

      console.log(`✅ Status changed: ${IncidentStatus[currentUtxo.data.status]} → ${IncidentStatus[newStatus]}`);

      return txid;
    } catch (error) {
      console.error('Failed to update status:', error);
      throw error;
    }
  }

  /**
   * Close incident
   */
  async closeIncident(
    incidentId: string,
    closureReport: ClosureReport,
    duration: number,
    supervisorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      // Fetch current incident UTXO
      const currentUtxo = await this.getIncidentUtxo(incidentId);

      // Verify not already closed
      if (currentUtxo.data.status === IncidentStatus.CLOSED) {
        throw new Error('Incident already closed');
      }

      // Build transaction with closure report in OP_RETURN
      const tx = await this.buildCloseIncidentTx(
        currentUtxo,
        closureReport,
        duration,
        supervisorPrivKey
      );

      // Broadcast
      const txid = await this.broadcast(tx);

      console.log(`✅ Incident closed: ${txid}`);
      console.log(`⏱️  Duration: ${duration}ms (${Math.round(duration / 60000)} minutes)`);

      return txid;
    } catch (error) {
      console.error('Failed to close incident:', error);
      throw error;
    }
  }

  /**
   * Reopen closed incident
   */
  async reopenIncident(
    incidentId: string,
    supervisorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      // Fetch current incident UTXO
      const currentUtxo = await this.getIncidentUtxo(incidentId);

      // Verify currently closed
      if (currentUtxo.data.status !== IncidentStatus.CLOSED) {
        throw new Error('Incident not closed');
      }

      // Build transaction
      const tx = await this.buildReopenIncidentTx(currentUtxo, supervisorPrivKey);

      // Broadcast
      const txid = await this.broadcast(tx);

      console.log(`✅ Incident reopened: ${txid}`);

      return txid;
    } catch (error) {
      console.error('Failed to reopen incident:', error);
      throw error;
    }
  }

  /**
   * Split incident into two separate incidents
   */
  async splitIncident(
    incidentId: string,
    supervisorPrivKey: PrivateKey
  ): Promise<{ originalTxid: string; newTxid: string }> {
    try {
      // Fetch current incident UTXO
      const currentUtxo = await this.getIncidentUtxo(incidentId);

      // Verify incident is open
      if (currentUtxo.data.status === IncidentStatus.CLOSED) {
        throw new Error('Cannot split closed incident');
      }

      // Build atomic split transaction
      const tx = await this.buildSplitIncidentTx(currentUtxo, supervisorPrivKey);

      // Broadcast
      const txid = await this.broadcast(tx);

      // New incident ID is the same TXID (different vout)
      console.log(`✅ Incident split: ${txid}`);

      return {
        originalTxid: txid,
        newTxid: txid // Same TX, different outputs
      };
    } catch (error) {
      console.error('Failed to split incident:', error);
      throw error;
    }
  }

  /**
   * Combine two incidents (close source, update destination)
   */
  async combineIncidents(
    sourceIncidentId: string,
    destIncidentId: string,
    supervisorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      // Fetch both incident UTXOs
      const sourceUtxo = await this.getIncidentUtxo(sourceIncidentId);
      const destUtxo = await this.getIncidentUtxo(destIncidentId);

      // Verify both are open
      if (sourceUtxo.data.status === IncidentStatus.CLOSED) {
        throw new Error('Source incident already closed');
      }
      if (destUtxo.data.status === IncidentStatus.CLOSED) {
        throw new Error('Destination incident already closed');
      }

      // Verify same reason and agency
      if (sourceUtxo.data.reason !== destUtxo.data.reason) {
        throw new Error('Incidents must have same reason');
      }

      // Build atomic combine transaction
      const tx = await this.buildCombineIncidentsTx(
        sourceUtxo,
        destUtxo,
        supervisorPrivKey
      );

      // Broadcast
      const txid = await this.broadcast(tx);

      console.log(`✅ Incidents combined: ${sourceIncidentId} → ${destIncidentId}`);

      return txid;
    } catch (error) {
      console.error('Failed to combine incidents:', error);
      throw error;
    }
  }

  /**
   * Share incident with another agency
   */
  async shareIncident(
    incidentId: string,
    agencyPubKey: string,
    supervisorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      // Fetch current incident UTXO
      const currentUtxo = await this.getIncidentUtxo(incidentId);

      // Verify not closed
      if (currentUtxo.data.status === IncidentStatus.CLOSED) {
        throw new Error('Cannot share closed incident');
      }

      // Build transaction
      const tx = await this.buildShareIncidentTx(
        currentUtxo,
        agencyPubKey,
        supervisorPrivKey
      );

      // Broadcast
      const txid = await this.broadcast(tx);

      console.log(`✅ Incident shared with agency: ${agencyPubKey.substring(0, 16)}...`);

      return txid;
    } catch (error) {
      console.error('Failed to share incident:', error);
      throw error;
    }
  }

  /**
   * Add field notes to incident
   */
  async addFieldNotes(
    incidentId: string,
    notes: any,
    operatorPrivKey: PrivateKey
  ): Promise<string> {
    try {
      // This creates a new TX with notes in OP_RETURN
      // linked to the incident
      const tx = await this.buildFieldNotesTx(incidentId, notes, operatorPrivKey);

      // Broadcast
      const txid = await this.broadcast(tx);

      console.log(`📝 Field notes added: ${txid}`);

      return txid;
    } catch (error) {
      console.error('Failed to add field notes:', error);
      throw error;
    }
  }

  // ===== Private Helper Methods =====

  /**
   * Hash incident data for storage in contract
   */
  private hashIncidentData(data: IncidentData): string {
    const dataStr = JSON.stringify({
      reason: data.reason,
      priority: data.priority,
      description: data.description,
      location: data.location,
      origin: data.origin,
      additionalInfo: data.additionalInfo || {}
    });
    return crypto.createHash('sha256').update(dataStr).digest('hex');
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(current: IncidentStatus, next: IncidentStatus): boolean {
    const transitions: Record<IncidentStatus, IncidentStatus[]> = {
      [IncidentStatus.CREATED]: [IncidentStatus.PENDING, IncidentStatus.CLOSED],
      [IncidentStatus.PENDING]: [IncidentStatus.DISPATCHED, IncidentStatus.CLOSED],
      [IncidentStatus.DISPATCHED]: [IncidentStatus.PENDING, IncidentStatus.EN_ROUTE, IncidentStatus.CLOSED],
      [IncidentStatus.EN_ROUTE]: [IncidentStatus.DISPATCHED, IncidentStatus.ON_SCENE],
      [IncidentStatus.ON_SCENE]: [IncidentStatus.RESOLVED],
      [IncidentStatus.RESOLVED]: [IncidentStatus.CLOSED],
      [IncidentStatus.CLOSED]: [IncidentStatus.CREATED] // Reopen
    };

    return transitions[current]?.includes(next) || false;
  }

  /**
   * Build create incident transaction
   */
  private async buildCreateIncidentTx(
    data: IncidentData,
    dataHash: string,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual transaction building with IncidentContract
    // This is a placeholder showing the structure
    
    const tx = new Transaction();
    
    // Input: Funding UTXO from operator
    // (would need to fetch available UTXOs)
    
    // Output 0: IncidentContract UTXO
    // Output 1: OP_RETURN with metadata
    // Output 2: Change
    
    // Add OP_RETURN with metadata
    const metadata: TransactionMetadata = {
      version: 1,
      eventType: 'INCIDENT_CREATED',
      timestamp: data.timestamp!,
      incidentId: '', // Will be TXID
      payload: data
    };
    
    const opReturnScript = Script.buildSafeDataOut(Buffer.from(JSON.stringify(metadata)));
    tx.addOutput(new Transaction.Output({
      script: opReturnScript,
      satoshis: 0
    }));
    
    // Sign transaction
    // tx.sign(privKey);
    
    return tx;
  }

  /**
   * Build update incident transaction
   */
  private async buildUpdateIncidentTx(
    currentUtxo: any,
    newDataHash: string,
    newPriority: number,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual update transaction
    return new Transaction();
  }

  /**
   * Build change status transaction
   */
  private async buildChangeStatusTx(
    currentUtxo: any,
    newStatus: IncidentStatus,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual status change transaction
    return new Transaction();
  }

  /**
   * Build close incident transaction
   */
  private async buildCloseIncidentTx(
    currentUtxo: any,
    closureReport: ClosureReport,
    duration: number,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual close transaction
    return new Transaction();
  }

  /**
   * Build reopen incident transaction
   */
  private async buildReopenIncidentTx(
    currentUtxo: any,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual reopen transaction
    return new Transaction();
  }

  /**
   * Build split incident transaction
   */
  private async buildSplitIncidentTx(
    currentUtxo: any,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual split transaction
    return new Transaction();
  }

  /**
   * Build combine incidents transaction
   */
  private async buildCombineIncidentsTx(
    sourceUtxo: any,
    destUtxo: any,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual combine transaction
    return new Transaction();
  }

  /**
   * Build share incident transaction
   */
  private async buildShareIncidentTx(
    currentUtxo: any,
    agencyPubKey: string,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement actual share transaction
    return new Transaction();
  }

  /**
   * Build field notes transaction
   */
  private async buildFieldNotesTx(
    incidentId: string,
    notes: any,
    privKey: PrivateKey
  ): Promise<Transaction> {
    // TODO: Implement field notes transaction
    return new Transaction();
  }

  /**
   * Get incident UTXO from indexer
   */
  private async getIncidentUtxo(incidentId: string): Promise<any> {
    // TODO: Implement actual indexer query
    // This would fetch the current UTXO for the incident from the indexer
    const response = await fetch(`${this.indexerUrl}/incidents/${incidentId}/utxo`);
    if (!response.ok) {
      throw new Error(`Incident not found: ${incidentId}`);
    }
    return response.json();
  }

  /**
   * Broadcast transaction to BSV network
   */
  private async broadcast(tx: Transaction): Promise<string> {
    // TODO: Implement actual broadcast
    // This would send the transaction to a BSV node
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

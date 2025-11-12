import { PubKey, toByteString, FixedArray, ByteString } from 'scrypt-ts';
import * as bsv from 'bsv';
import { AgencyContract } from '../contracts/AgencyContract';

/**
 * AgencyManager
 * 
 * Manages agency data, cross-jurisdiction collaboration, and shared incidents.
 * Enables multi-agency coordination for complex incidents.
 */
export class AgencyManager {
  private broadcastUrl: string;
  private indexerUrl: string;
  private privateKey: bsv.PrivateKey;

  constructor(
    broadcastUrl: string,
    indexerUrl: string,
    privateKey: bsv.PrivateKey
  ) {
    this.broadcastUrl = broadcastUrl;
    this.indexerUrl = indexerUrl;
    this.privateKey = privateKey;
  }

  /**
   * Register a new agency
   */
  async registerAgency(
    agencyId: string,
    agencyName: string,
    agencyPubKey: string,
    adminPubKeys: string[]
  ): Promise<string> {
    // Validate admin pub keys (max 3)
    if (adminPubKeys.length > 3) {
      throw new Error('Maximum 3 admin public keys allowed');
    }

    // Pad admin keys to exactly 3
    const paddedAdminKeys = [...adminPubKeys];
    while (paddedAdminKeys.length < 3) {
      paddedAdminKeys.push(agencyPubKey); // Use agency key as default
    }

    // Convert to PubKey array
    const adminPubKeyArray = paddedAdminKeys.map(
      (key) => PubKey(toByteString(key))
    ) as FixedArray<PubKey, 3>;

    // Initialize empty shared incidents array
    const emptyIncidents = new Array(100).fill(
      toByteString('')
    ) as FixedArray<ByteString, 100>;

    // Create agency contract instance
    const agencyContract = new AgencyContract(
      toByteString(agencyId),
      toByteString(this.hashName(agencyName)),
      PubKey(toByteString(agencyPubKey)),
      adminPubKeyArray,
      emptyIncidents,
      0n, // sharedIncidentCount
      1n  // version
    );

    // Build and broadcast transaction
    const tx = await this.buildDeployTx(agencyContract);
    const txid = await this.broadcastTx(tx);

    console.log(`✅ Agency registered: ${agencyId} (TXID: ${txid})`);
    return txid;
  }

  /**
   * Add a shared incident to an agency
   */
  async addSharedIncident(
    agencyId: string,
    incidentId: string
  ): Promise<string> {
    // Fetch current agency state
    const agencyUtxo = await this.fetchAgencyUtxo(agencyId);

    // Build method call transaction
    const tx = await this.buildMethodCallTx(
      agencyUtxo,
      'addSharedIncident',
      {
        incidentId: toByteString(incidentId)
      }
    );

    const txid = await this.broadcastTx(tx);

    console.log(`✅ Incident ${incidentId} shared with agency ${agencyId} (TXID: ${txid})`);
    return txid;
  }

  /**
   * Remove a shared incident from an agency
   */
  async removeSharedIncident(
    agencyId: string,
    incidentId: string
  ): Promise<string> {
    // Fetch current agency state
    const agencyUtxo = await this.fetchAgencyUtxo(agencyId);

    // Build method call transaction
    const tx = await this.buildMethodCallTx(
      agencyUtxo,
      'removeSharedIncident',
      {
        incidentId: toByteString(incidentId)
      }
    );

    const txid = await this.broadcastTx(tx);

    console.log(`✅ Incident ${incidentId} removed from agency ${agencyId} (TXID: ${txid})`);
    return txid;
  }

  /**
   * Update admin public keys for an agency
   */
  async updateAdmins(
    agencyId: string,
    newAdminPubKeys: string[]
  ): Promise<string> {
    // Validate admin pub keys (max 3)
    if (newAdminPubKeys.length > 3) {
      throw new Error('Maximum 3 admin public keys allowed');
    }

    // Fetch current agency state
    const agencyUtxo = await this.fetchAgencyUtxo(agencyId);

    // Pad admin keys to exactly 3
    const paddedAdminKeys = [...newAdminPubKeys];
    while (paddedAdminKeys.length < 3) {
      paddedAdminKeys.push(newAdminPubKeys[0]); // Use first key as default
    }

    // Convert to PubKey array
    const adminPubKeyArray = paddedAdminKeys.map(
      (key) => PubKey(toByteString(key))
    ) as FixedArray<PubKey, 3>;

    // Build method call transaction
    const tx = await this.buildMethodCallTx(
      agencyUtxo,
      'updateAdmins',
      {
        newAdminPubKeys: adminPubKeyArray
      }
    );

    const txid = await this.broadcastTx(tx);

    console.log(`✅ Admin keys updated for agency ${agencyId} (TXID: ${txid})`);
    return txid;
  }

  /**
   * Get agency details
   */
  async getAgency(agencyId: string): Promise<AgencyDetails> {
    const agencyUtxo = await this.fetchAgencyUtxo(agencyId);

    // Parse agency contract from UTXO
    const agency = this.parseAgencyFromUtxo(agencyUtxo);

    return agency;
  }

  /**
   * List all shared incidents for an agency
   */
  async listSharedIncidents(agencyId: string): Promise<string[]> {
    const agency = await this.getAgency(agencyId);
    return agency.sharedIncidents;
  }

  /**
   * Check if an incident is shared with an agency
   */
  async isIncidentShared(
    agencyId: string,
    incidentId: string
  ): Promise<boolean> {
    const sharedIncidents = await this.listSharedIncidents(agencyId);
    return sharedIncidents.includes(incidentId);
  }

  // ========== Private Helper Methods ==========

  /**
   * Hash agency name for privacy
   */
  private hashName(name: string): string {
    const hash = bsv.crypto.Hash.sha256(Buffer.from(name));
    return hash.toString('hex');
  }

  /**
   * Fetch current agency UTXO from indexer
   */
  private async fetchAgencyUtxo(agencyId: string): Promise<any> {
    // Query indexer for latest UTXO with this agencyId
    const response = await fetch(`${this.indexerUrl}/utxos?agencyId=${agencyId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch agency UTXO: ${response.statusText}`);
    }

    const data = await response.json() as any[];
    
    if (!data || data.length === 0) {
      throw new Error(`Agency not found: ${agencyId}`);
    }

    // Return most recent UTXO
    return data[0];
  }

  /**
   * Parse agency details from UTXO
   */
  private parseAgencyFromUtxo(utxo: any): AgencyDetails {
    // Parse script to extract agency state
    // This is a simplified implementation
    // In production, would use proper sCrypt deserialization
    
    return {
      agencyId: utxo.agencyId,
      agencyPubKey: utxo.agencyPubKey,
      adminPubKeys: utxo.adminPubKeys || [],
      sharedIncidents: utxo.sharedIncidents || [],
      sharedIncidentCount: utxo.sharedIncidentCount || 0,
      version: utxo.version || 1,
      txid: utxo.txid
    };
  }

  /**
   * Build deployment transaction for new agency
   */
  private async buildDeployTx(contract: AgencyContract): Promise<bsv.Transaction> {
    const tx = new bsv.Transaction();

    // Add inputs (funding from private key)
    // TODO: Implement proper UTXO selection and funding
    
    // Add output with contract script
    const scriptPubKey = contract.lockingScript;
    tx.addOutput(
      new bsv.Transaction.Output({
        script: scriptPubKey,
        satoshis: 10000 // 10,000 satoshis to anchor state
      })
    );

    // Add OP_RETURN with agency metadata
    const metadata = {
      type: 'AGENCY_REGISTERED',
      agencyId: contract.agencyId.toString(),
      timestamp: Date.now()
    };
    
    const opReturnScript = bsv.Script.buildSafeDataOut(
      JSON.stringify(metadata)
    );
    
    tx.addOutput(
      new bsv.Transaction.Output({
        script: opReturnScript,
        satoshis: 0
      })
    );

    // Sign transaction
    tx.sign(this.privateKey);

    return tx;
  }

  /**
   * Build method call transaction for agency contract
   */
  private async buildMethodCallTx(
    utxo: any,
    method: string,
    params: Record<string, any>
  ): Promise<bsv.Transaction> {
    const tx = new bsv.Transaction();

    // Add input spending the agency UTXO
    tx.from({
      txId: utxo.txid,
      outputIndex: utxo.vout,
      script: utxo.scriptPubKey,
      satoshis: utxo.satoshis
    });

    // TODO: Build proper unlocking script with method call and signature
    // This requires connecting to the actual contract instance and calling the method
    
    // Add output with updated contract state
    // The contract will validate and update state
    
    // Add OP_RETURN with event metadata
    const metadata = {
      type: `AGENCY_${method.toUpperCase()}`,
      agencyId: utxo.agencyId,
      params,
      timestamp: Date.now()
    };
    
    const opReturnScript = bsv.Script.buildSafeDataOut(
      JSON.stringify(metadata)
    );
    
    tx.addOutput(
      new bsv.Transaction.Output({
        script: opReturnScript,
        satoshis: 0
      })
    );

    // Sign transaction
    tx.sign(this.privateKey);

    return tx;
  }

  /**
   * Broadcast transaction to BSV network
   */
  private async broadcastTx(tx: bsv.Transaction): Promise<string> {
    const response = await fetch(this.broadcastUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rawtx: tx.serialize()
      })
    });

    if (!response.ok) {
      throw new Error(`Broadcast failed: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.txid || tx.id;
  }
}

/**
 * Agency Details Interface
 */
export interface AgencyDetails {
  agencyId: string;
  agencyPubKey: string;
  adminPubKeys: string[];
  sharedIncidents: string[];
  sharedIncidentCount: number;
  version: number;
  txid: string;
}

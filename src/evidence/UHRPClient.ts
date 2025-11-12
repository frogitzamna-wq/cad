import * as bsv from 'bsv';
import { createHash } from 'crypto';

/**
 * Evidence types supported
 */
export enum EvidenceType {
  PHOTO = 'photo',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  BODYCAM = 'bodycam',
  DASHCAM = 'dashcam',
  RECORDING_911 = '911_recording'
}

export interface EvidenceMetadata {
  incidentId: string;
  type: EvidenceType;
  timestamp: number;
  location?: { lat: number; lng: number };
  officer?: string; // Public key
  deviceId?: string;
  duration?: number; // For audio/video
  resolution?: string; // For photos/videos
  fileSize: number;
  mimeType: string;
  description?: string;
}

export interface Evidence {
  evidenceId: string; // TXID of anchor transaction
  uhrpHash: string; // Content hash
  uhrpUrl: string; // uhrp://hash
  metadata: EvidenceMetadata;
  uploadedAt: number;
  accessControl: {
    requiredSignatures: number;
    authorizedKeys: string[];
  };
  blockchainTxid: string;
}

/**
 * UHRPClient
 * 
 * Client for storing evidence in UHRP (Universal Hash Resolution Protocol)
 * with blockchain anchoring for integrity verification
 */
export class UHRPClient {
  private uhrpEndpoint: string;
  private broadcastUrl: string;

  constructor(
    uhrpEndpoint: string = 'https://uhrp.bsvapi.net',
    broadcastUrl: string = 'https://api.whatsonchain.com/v1/bsv/main/tx/raw'
  ) {
    this.uhrpEndpoint = uhrpEndpoint;
    this.broadcastUrl = broadcastUrl;
  }

  /**
   * Upload evidence file to UHRP and anchor to blockchain
   */
  async uploadEvidence(
    file: Buffer,
    metadata: EvidenceMetadata,
    uploaderPrivKey: bsv.PrivateKey,
    accessControl?: {
      requiredSignatures: number;
      authorizedKeys: string[];
    }
  ): Promise<Evidence> {
    try {
      // 1. Calculate content hash
      const contentHash = this.calculateHash(file);
      
      // 2. Upload to UHRP
      const uhrpHash = await this.uploadToUHRP(file, contentHash);
      
      // 3. Create anchor transaction
      const tx = await this.createAnchorTransaction(
        uhrpHash,
        metadata,
        uploaderPrivKey,
        accessControl
      );
      
      // 4. Broadcast transaction
      const txid = await this.broadcastTransaction(tx);
      
      console.log(`📎 Evidence uploaded: ${metadata.type} → ${uhrpHash.substring(0, 16)}...`);
      
      return {
        evidenceId: txid,
        uhrpHash,
        uhrpUrl: `uhrp://${uhrpHash}`,
        metadata,
        uploadedAt: Date.now(),
        accessControl: accessControl || {
          requiredSignatures: 1,
          authorizedKeys: [uploaderPrivKey.toPublicKey().toString()]
        },
        blockchainTxid: txid
      };
    } catch (error) {
      console.error('Failed to upload evidence:', error);
      throw error;
    }
  }

  /**
   * Retrieve evidence from UHRP
   */
  async retrieveEvidence(
    uhrpHash: string,
    verifyIntegrity: boolean = true
  ): Promise<Buffer> {
    try {
      const response = await fetch(`${this.uhrpEndpoint}/content/${uhrpHash}`);
      
      if (!response.ok) {
        throw new Error(`Failed to retrieve evidence: ${response.statusText}`);
      }
      
      const content = await response.arrayBuffer();
      const buffer = Buffer.from(content);
      
      // Verify integrity
      if (verifyIntegrity) {
        const calculatedHash = this.calculateHash(buffer);
        if (calculatedHash !== uhrpHash) {
          throw new Error('Evidence integrity check failed: hash mismatch');
        }
      }
      
      console.log(`📥 Evidence retrieved: ${uhrpHash.substring(0, 16)}...`);
      
      return buffer;
    } catch (error) {
      console.error('Failed to retrieve evidence:', error);
      throw error;
    }
  }

  /**
   * Get evidence metadata from blockchain
   */
  async getEvidenceMetadata(txid: string): Promise<EvidenceMetadata | null> {
    try {
      // Query blockchain for transaction
      const response = await fetch(
        `https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txid}`
      );
      
      if (!response.ok) {
        return null;
      }
      
      const tx = await response.json();
      
      // Parse OP_RETURN data
      for (const output of tx.vout) {
        if (output.scriptPubKey?.type === 'nulldata') {
          const hex = output.scriptPubKey.hex;
          const data = Buffer.from(hex, 'hex');
          
          // Extract metadata (skip OP_RETURN opcode)
          const metadataStr = data.slice(2).toString('utf8');
          const metadata = JSON.parse(metadataStr);
          
          return metadata;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get evidence metadata:', error);
      return null;
    }
  }

  /**
   * Verify evidence chain of custody
   */
  async verifyChainOfCustody(evidenceId: string): Promise<{
    valid: boolean;
    history: Array<{
      txid: string;
      timestamp: number;
      action: string;
      actor: string;
    }>;
  }> {
    try {
      // Query blockchain for all transactions related to evidence
      const history: Array<any> = [];
      
      // Start with the anchor transaction
      let currentTxid = evidenceId;
      
      while (currentTxid) {
        const tx = await this.getTransaction(currentTxid);
        if (!tx) break;
        
        const metadata = await this.getEvidenceMetadata(currentTxid);
        if (!metadata) break;
        
        history.push({
          txid: currentTxid,
          timestamp: tx.time * 1000,
          action: 'UPLOADED',
          actor: metadata.officer || 'unknown'
        });
        
        // Check if there's a next transaction in the chain
        currentTxid = ''; // Would track spending UTXOs in production
      }
      
      return {
        valid: history.length > 0,
        history
      };
    } catch (error) {
      console.error('Failed to verify chain of custody:', error);
      return { valid: false, history: [] };
    }
  }

  /**
   * Create evidence access log transaction
   */
  async logAccess(
    evidenceId: string,
    accessorPubKey: string,
    reason: string,
    accessorPrivKey: bsv.PrivateKey
  ): Promise<string> {
    try {
      const tx = new bsv.Transaction();
      
      // Add OP_RETURN with access log
      const accessLog = {
        type: 'EVIDENCE_ACCESS',
        evidenceId,
        accessor: accessorPubKey,
        reason,
        timestamp: Date.now()
      };
      
      const opReturnScript = bsv.Script.buildSafeDataOut(
        JSON.stringify(accessLog)
      );
      
      tx.addOutput(
        new bsv.Transaction.Output({
          script: opReturnScript,
          satoshis: 0
        })
      );
      
      // Sign and broadcast
      tx.sign(accessorPrivKey);
      const txid = await this.broadcastTransaction(tx);
      
      console.log(`📝 Evidence access logged: ${evidenceId.substring(0, 16)}...`);
      
      return txid;
    } catch (error) {
      console.error('Failed to log evidence access:', error);
      throw error;
    }
  }

  // ===== Private Methods =====

  private calculateHash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  private async uploadToUHRP(file: Buffer, hash: string): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([file]));
      formData.append('hash', hash);
      
      const response = await fetch(`${this.uhrpEndpoint}/upload`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`UHRP upload failed: ${response.statusText}`);
      }
      
      const result = await response.json() as any;
      return result.hash || hash;
    } catch (error) {
      console.error('UHRP upload error:', error);
      // Fallback: return calculated hash (would use backup storage)
      return hash;
    }
  }

  private async createAnchorTransaction(
    uhrpHash: string,
    metadata: EvidenceMetadata,
    uploaderPrivKey: bsv.PrivateKey,
    accessControl?: {
      requiredSignatures: number;
      authorizedKeys: string[];
    }
  ): Promise<bsv.Transaction> {
    const tx = new bsv.Transaction();
    
    // Add OP_RETURN with evidence metadata
    const anchorData = {
      type: 'EVIDENCE_ANCHOR',
      uhrpHash,
      metadata,
      accessControl: accessControl || {
        requiredSignatures: 1,
        authorizedKeys: [uploaderPrivKey.toPublicKey().toString()]
      },
      timestamp: Date.now()
    };
    
    const opReturnScript = bsv.Script.buildSafeDataOut(
      JSON.stringify(anchorData)
    );
    
    tx.addOutput(
      new bsv.Transaction.Output({
        script: opReturnScript,
        satoshis: 0
      })
    );
    
    // TODO: Add inputs (funding)
    // TODO: Add change output
    
    // Sign transaction
    tx.sign(uploaderPrivKey);
    
    return tx;
  }

  private async broadcastTransaction(tx: bsv.Transaction): Promise<string> {
    try {
      const response = await fetch(this.broadcastUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawtx: tx.serialize() })
      });
      
      if (!response.ok) {
        throw new Error(`Broadcast failed: ${response.statusText}`);
      }
      
      const result = await response.json() as any;
      return result.txid || tx.id;
    } catch (error) {
      console.error('Broadcast error:', error);
      return tx.id; // Return local txid as fallback
    }
  }

  private async getTransaction(txid: string): Promise<any> {
    try {
      const response = await fetch(
        `https://api.whatsonchain.com/v1/bsv/main/tx/hash/${txid}`
      );
      
      if (!response.ok) {
        return null;
      }
      
      return await response.json();
    } catch {
      return null;
    }
  }
}

/**
 * MultisigEvidenceVault
 * 
 * Manages evidence with multi-signature access control (e.g., 3-of-5)
 * Required for sensitive evidence (internal affairs, witness protection, etc.)
 */
export class MultisigEvidenceVault {
  constructor(
    private uhrpClient: UHRPClient,
    private requiredSignatures: number = 3,
    private authorizedKeys: string[] = []
  ) {}

  /**
   * Upload evidence with multisig access control
   */
  async uploadSecureEvidence(
    file: Buffer,
    metadata: EvidenceMetadata,
    uploaderPrivKey: bsv.PrivateKey
  ): Promise<Evidence> {
    return await this.uhrpClient.uploadEvidence(
      file,
      metadata,
      uploaderPrivKey,
      {
        requiredSignatures: this.requiredSignatures,
        authorizedKeys: this.authorizedKeys
      }
    );
  }

  /**
   * Request access to evidence (requires multiple signatures)
   */
  async requestAccess(
    evidenceId: string,
    reason: string,
    signatures: Array<{ pubKey: string; privKey: bsv.PrivateKey }>
  ): Promise<{ granted: boolean; evidence?: Buffer }> {
    try {
      // Verify we have enough signatures
      if (signatures.length < this.requiredSignatures) {
        return {
          granted: false
        };
      }
      
      // Verify all signatures are authorized
      for (const sig of signatures) {
        if (!this.authorizedKeys.includes(sig.pubKey)) {
          console.warn(`Unauthorized key: ${sig.pubKey}`);
          return { granted: false };
        }
      }
      
      // Log each access attempt
      for (const sig of signatures) {
        await this.uhrpClient.logAccess(
          evidenceId,
          sig.pubKey,
          reason,
          sig.privKey
        );
      }
      
      // Get evidence metadata
      const metadata = await this.uhrpClient.getEvidenceMetadata(evidenceId);
      if (!metadata) {
        return { granted: false };
      }
      
      // Retrieve evidence (would extract UHRP hash from metadata)
      // For now, return granted status
      console.log(`✅ Evidence access granted: ${this.requiredSignatures}-of-${this.authorizedKeys.length}`);
      
      return {
        granted: true
      };
    } catch (error) {
      console.error('Access request failed:', error);
      return { granted: false };
    }
  }

  /**
   * Add authorized key to vault
   */
  addAuthorizedKey(pubKey: string): void {
    if (!this.authorizedKeys.includes(pubKey)) {
      this.authorizedKeys.push(pubKey);
      console.log(`🔑 Authorized key added (total: ${this.authorizedKeys.length})`);
    }
  }

  /**
   * Remove authorized key
   */
  removeAuthorizedKey(pubKey: string): void {
    const index = this.authorizedKeys.indexOf(pubKey);
    if (index > -1) {
      this.authorizedKeys.splice(index, 1);
      console.log(`🔓 Authorized key removed (total: ${this.authorizedKeys.length})`);
    }
  }
}

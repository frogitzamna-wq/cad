import * as bsv from 'bsv';
import { createHash } from 'crypto';

/**
 * W3C DID Document
 * https://www.w3.org/TR/did-core/
 */
export interface DIDDocument {
  '@context': string[];
  id: string; // did:bsv:pubkey
  controller?: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: ServiceEndpoint[];
  created: string;
  updated?: string;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyBase58?: string;
  publicKeyMultibase?: string;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

/**
 * Officer/Dispatcher roles
 */
export enum Role {
  DISPATCHER = 'dispatcher',
  OFFICER = 'officer',
  SUPERVISOR = 'supervisor',
  CHIEF = 'chief',
  DISTRICT_ATTORNEY = 'district_attorney',
  INTERNAL_AFFAIRS = 'internal_affairs',
  JUDGE = 'judge',
  EMERGENCY_MEDICAL = 'emergency_medical',
  FIRE_DEPARTMENT = 'fire_department'
}

export interface PersonnelProfile {
  did: string;
  name: string;
  badgeNumber: string;
  department: string;
  rank: string;
  role: Role;
  clearanceLevel: number; // 1-10
  publicKey: string;
  created: number;
  active: boolean;
}

/**
 * DIDService
 * 
 * Issues and resolves W3C Decentralized Identifiers (DIDs) for personnel
 * Follows did:bsv method specification
 */
export class DIDService {
  private broadcastUrl: string;
  private resolver: Map<string, DIDDocument>;

  constructor(
    broadcastUrl: string = 'https://api.whatsonchain.com/v1/bsv/main/tx/raw'
  ) {
    this.broadcastUrl = broadcastUrl;
    this.resolver = new Map();
  }

  /**
   * Issue DID for personnel
   */
  async issueDID(
    privKey: bsv.PrivateKey,
    profile: Omit<PersonnelProfile, 'did' | 'publicKey' | 'created'>
  ): Promise<PersonnelProfile> {
    try {
      const pubKey = privKey.toPublicKey();
      const did = this.generateDID(pubKey);

      // Create DID document
      const didDocument = this.createDIDDocument(did, pubKey);

      // Anchor DID document to blockchain
      const txid = await this.anchorDIDDocument(didDocument, privKey);

      const personnel: PersonnelProfile = {
        ...profile,
        did,
        publicKey: pubKey.toString(),
        created: Date.now()
      };

      console.log(`🆔 DID issued: ${did} (${profile.role})`);
      console.log(`   Blockchain: ${txid}`);

      return personnel;
    } catch (error) {
      console.error('Failed to issue DID:', error);
      throw error;
    }
  }

  /**
   * Resolve DID to DID document
   */
  async resolveDID(did: string): Promise<DIDDocument | null> {
    try {
      // Check cache
      if (this.resolver.has(did)) {
        return this.resolver.get(did)!;
      }

      // Query blockchain (would use BSV indexer in production)
      const document = await this.queryBlockchainForDID(did);

      if (document) {
        this.resolver.set(did, document);
      }

      return document;
    } catch (error) {
      console.error('Failed to resolve DID:', error);
      return null;
    }
  }

  /**
   * Update DID document (e.g., add service endpoint, rotate key)
   */
  async updateDID(
    did: string,
    updates: Partial<DIDDocument>,
    privKey: bsv.PrivateKey
  ): Promise<string> {
    try {
      // Get current document
      const currentDoc = await this.resolveDID(did);
      if (!currentDoc) {
        throw new Error(`DID not found: ${did}`);
      }

      // Verify authorization
      const pubKey = privKey.toPublicKey();
      const verificationMethod = currentDoc.verificationMethod[0];
      if (verificationMethod.publicKeyBase58 !== pubKey.toString()) {
        throw new Error('Unauthorized: private key does not match DID');
      }

      // Create updated document
      const updatedDoc: DIDDocument = {
        ...currentDoc,
        ...updates,
        updated: new Date().toISOString()
      };

      // Anchor update to blockchain
      const txid = await this.anchorDIDDocument(updatedDoc, privKey);

      // Update cache
      this.resolver.set(did, updatedDoc);

      console.log(`🔄 DID updated: ${did}`);
      console.log(`   Blockchain: ${txid}`);

      return txid;
    } catch (error) {
      console.error('Failed to update DID:', error);
      throw error;
    }
  }

  /**
   * Revoke DID (deactivate)
   */
  async revokeDID(did: string, privKey: bsv.PrivateKey): Promise<string> {
    try {
      const tx = new bsv.Transaction();

      // Add OP_RETURN with revocation
      const revocationData = {
        type: 'DID_REVOCATION',
        did,
        timestamp: Date.now(),
        reason: 'Personnel terminated or DID compromised'
      };

      const opReturnScript = bsv.Script.buildSafeDataOut(
        JSON.stringify(revocationData)
      );

      tx.addOutput(
        new bsv.Transaction.Output({
          script: opReturnScript,
          satoshis: 0
        })
      );

      // Sign and broadcast
      tx.sign(privKey);
      const txid = await this.broadcastTransaction(tx);

      // Remove from cache
      this.resolver.delete(did);

      console.log(`❌ DID revoked: ${did}`);
      console.log(`   Blockchain: ${txid}`);

      return txid;
    } catch (error) {
      console.error('Failed to revoke DID:', error);
      throw error;
    }
  }

  /**
   * Verify DID signature
   */
  verifySignature(
    did: string,
    message: string,
    signature: string
  ): boolean {
    try {
      // Extract public key from DID
      const pubKeyStr = did.replace('did:bsv:', '');
      const pubKey = bsv.PublicKey.fromString(pubKeyStr);

      // Verify signature
      const messageHash = bsv.crypto.Hash.sha256(Buffer.from(message));
      const sig = bsv.crypto.Signature.fromString(signature);

      return bsv.crypto.ECDSA.verify(messageHash, sig, pubKey);
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  // ===== Private Methods =====

  private generateDID(pubKey: bsv.PublicKey): string {
    // did:bsv method uses public key directly
    return `did:bsv:${pubKey.toString()}`;
  }

  private createDIDDocument(did: string, pubKey: bsv.PublicKey): DIDDocument {
    const verificationMethodId = `${did}#key-1`;

    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/secp256k1-2019/v1'
      ],
      id: did,
      verificationMethod: [
        {
          id: verificationMethodId,
          type: 'EcdsaSecp256k1VerificationKey2019',
          controller: did,
          publicKeyBase58: pubKey.toString()
        }
      ],
      authentication: [verificationMethodId],
      assertionMethod: [verificationMethodId],
      capabilityInvocation: [verificationMethodId],
      created: new Date().toISOString()
    };
  }

  private async anchorDIDDocument(
    document: DIDDocument,
    privKey: bsv.PrivateKey
  ): Promise<string> {
    const tx = new bsv.Transaction();

    // Add OP_RETURN with DID document
    const anchorData = {
      type: 'DID_DOCUMENT',
      document,
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

    // Sign and broadcast
    tx.sign(privKey);
    return await this.broadcastTransaction(tx);
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

      const result = (await response.json()) as any;
      return result.txid || tx.id;
    } catch (error) {
      console.error('Broadcast error:', error);
      return tx.id; // Return local txid as fallback
    }
  }

  private async queryBlockchainForDID(
    did: string
  ): Promise<DIDDocument | null> {
    try {
      // Would query BSV indexer for DID_DOCUMENT transactions
      // For now, return null (would be implemented with SPV indexer)
      console.warn(`DID resolution not implemented: ${did}`);
      return null;
    } catch (error) {
      console.error('Blockchain query failed:', error);
      return null;
    }
  }
}

/**
 * DIDRegistry
 * 
 * Central registry for managing personnel DIDs
 */
export class DIDRegistry {
  private didService: DIDService;
  private personnel: Map<string, PersonnelProfile>;

  constructor(didService: DIDService) {
    this.didService = didService;
    this.personnel = new Map();
  }

  /**
   * Register new personnel
   */
  async registerPersonnel(
    privKey: bsv.PrivateKey,
    profile: Omit<PersonnelProfile, 'did' | 'publicKey' | 'created'>
  ): Promise<PersonnelProfile> {
    const personnel = await this.didService.issueDID(privKey, profile);
    this.personnel.set(personnel.did, personnel);
    return personnel;
  }

  /**
   * Get personnel by DID
   */
  getPersonnel(did: string): PersonnelProfile | null {
    return this.personnel.get(did) || null;
  }

  /**
   * Get personnel by badge number
   */
  getPersonnelByBadge(badgeNumber: string): PersonnelProfile | null {
    for (const personnel of this.personnel.values()) {
      if (personnel.badgeNumber === badgeNumber) {
        return personnel;
      }
    }
    return null;
  }

  /**
   * Get all personnel by role
   */
  getPersonnelByRole(role: Role): PersonnelProfile[] {
    return Array.from(this.personnel.values()).filter((p) => p.role === role);
  }

  /**
   * Deactivate personnel
   */
  async deactivatePersonnel(
    did: string,
    privKey: bsv.PrivateKey
  ): Promise<void> {
    await this.didService.revokeDID(did, privKey);

    const personnel = this.personnel.get(did);
    if (personnel) {
      personnel.active = false;
      console.log(`👤 Personnel deactivated: ${personnel.name} (${personnel.badgeNumber})`);
    }
  }

  /**
   * Verify personnel has minimum clearance level
   */
  verifyAccessLevel(did: string, requiredLevel: number): boolean {
    const personnel = this.personnel.get(did);
    if (!personnel || !personnel.active) {
      return false;
    }
    return personnel.clearanceLevel >= requiredLevel;
  }

  /**
   * List all active personnel
   */
  listActivePersonnel(): PersonnelProfile[] {
    return Array.from(this.personnel.values()).filter((p) => p.active);
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    active: number;
    byRole: Record<string, number>;
  } {
    const all = Array.from(this.personnel.values());
    const active = all.filter((p) => p.active);

    const byRole: Record<string, number> = {};
    for (const p of active) {
      byRole[p.role] = (byRole[p.role] || 0) + 1;
    }

    return {
      total: all.length,
      active: active.length,
      byRole
    };
  }
}

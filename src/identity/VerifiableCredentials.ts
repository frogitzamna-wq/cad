import * as bsv from 'bsv';
import { Role } from './DIDService';

/**
 * W3C Verifiable Credential
 * https://www.w3.org/TR/vc-data-model/
 */
export interface VerifiableCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: string; // DID
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: CredentialSubject;
  proof: Proof;
}

export interface CredentialSubject {
  id: string; // DID of subject
  [key: string]: any;
}

export interface Proof {
  type: string;
  created: string;
  verificationMethod: string;
  proofPurpose: string;
  jws: string; // JSON Web Signature
}

/**
 * Credential types for CAD system
 */
export enum CredentialType {
  ROLE_CREDENTIAL = 'RoleCredential',
  CLEARANCE_CREDENTIAL = 'ClearanceCredential',
  TRAINING_CREDENTIAL = 'TrainingCredential',
  CERTIFICATION_CREDENTIAL = 'CertificationCredential',
  JURISDICTION_CREDENTIAL = 'JurisdictionCredential'
}

/**
 * Role credential subject
 */
export interface RoleCredentialSubject extends CredentialSubject {
  role: Role;
  department: string;
  badgeNumber: string;
  rank: string;
}

/**
 * Clearance credential subject
 */
export interface ClearanceCredentialSubject extends CredentialSubject {
  clearanceLevel: number; // 1-10
  authorizedDatabases: string[];
  authorizedOperations: string[];
}

/**
 * Training credential subject
 */
export interface TrainingCredentialSubject extends CredentialSubject {
  trainingName: string;
  completionDate: string;
  certifyingAuthority: string;
  expirationDate?: string;
}

/**
 * CredentialIssuer
 * 
 * Issues W3C Verifiable Credentials for personnel
 */
export class CredentialIssuer {
  private issuerDID: string;
  private issuerPrivKey: bsv.PrivateKey;
  private broadcastUrl: string;

  constructor(
    issuerDID: string,
    issuerPrivKey: bsv.PrivateKey,
    broadcastUrl: string = 'https://api.whatsonchain.com/v1/bsv/main/tx/raw'
  ) {
    this.issuerDID = issuerDID;
    this.issuerPrivKey = issuerPrivKey;
    this.broadcastUrl = broadcastUrl;
  }

  /**
   * Issue role credential
   */
  async issueRoleCredential(
    subjectDID: string,
    role: Role,
    department: string,
    badgeNumber: string,
    rank: string,
    expirationDate?: Date
  ): Promise<VerifiableCredential> {
    const credentialSubject: RoleCredentialSubject = {
      id: subjectDID,
      role,
      department,
      badgeNumber,
      rank
    };

    const credential = await this.issueCredential(
      CredentialType.ROLE_CREDENTIAL,
      credentialSubject,
      expirationDate
    );

    console.log(`📜 Role credential issued: ${role} → ${subjectDID.substring(0, 20)}...`);

    return credential;
  }

  /**
   * Issue clearance credential
   */
  async issueClearanceCredential(
    subjectDID: string,
    clearanceLevel: number,
    authorizedDatabases: string[],
    authorizedOperations: string[],
    expirationDate?: Date
  ): Promise<VerifiableCredential> {
    const credentialSubject: ClearanceCredentialSubject = {
      id: subjectDID,
      clearanceLevel,
      authorizedDatabases,
      authorizedOperations
    };

    const credential = await this.issueCredential(
      CredentialType.CLEARANCE_CREDENTIAL,
      credentialSubject,
      expirationDate
    );

    console.log(`🔐 Clearance credential issued: Level ${clearanceLevel} → ${subjectDID.substring(0, 20)}...`);

    return credential;
  }

  /**
   * Issue training credential
   */
  async issueTrainingCredential(
    subjectDID: string,
    trainingName: string,
    completionDate: Date,
    certifyingAuthority: string,
    expirationDate?: Date
  ): Promise<VerifiableCredential> {
    const credentialSubject: TrainingCredentialSubject = {
      id: subjectDID,
      trainingName,
      completionDate: completionDate.toISOString(),
      certifyingAuthority,
      expirationDate: expirationDate?.toISOString()
    };

    const credential = await this.issueCredential(
      CredentialType.TRAINING_CREDENTIAL,
      credentialSubject,
      expirationDate
    );

    console.log(`🎓 Training credential issued: ${trainingName} → ${subjectDID.substring(0, 20)}...`);

    return credential;
  }

  /**
   * Revoke credential
   */
  async revokeCredential(credentialId: string): Promise<string> {
    const tx = new bsv.Transaction();

    // Add OP_RETURN with revocation
    const revocationData = {
      type: 'CREDENTIAL_REVOCATION',
      credentialId,
      issuer: this.issuerDID,
      timestamp: Date.now(),
      reason: 'Credential revoked by issuer'
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
    tx.sign(this.issuerPrivKey);
    const txid = await this.broadcastTransaction(tx);

    console.log(`❌ Credential revoked: ${credentialId}`);
    console.log(`   Blockchain: ${txid}`);

    return txid;
  }

  // ===== Private Methods =====

  private async issueCredential(
    type: CredentialType,
    credentialSubject: CredentialSubject,
    expirationDate?: Date
  ): Promise<VerifiableCredential> {
    const credentialId = `urn:uuid:${this.generateUUID()}`;
    const issuanceDate = new Date().toISOString();

    // Create unsigned credential
    const unsignedCredential: Omit<VerifiableCredential, 'proof'> = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://bsv.org/credentials/v1'
      ],
      id: credentialId,
      type: ['VerifiableCredential', type],
      issuer: this.issuerDID,
      issuanceDate,
      expirationDate: expirationDate?.toISOString(),
      credentialSubject
    };

    // Create proof
    const proof = await this.createProof(unsignedCredential);

    const credential: VerifiableCredential = {
      ...unsignedCredential,
      proof
    };

    // Anchor to blockchain
    await this.anchorCredential(credential);

    return credential;
  }

  private async createProof(
    credential: Omit<VerifiableCredential, 'proof'>
  ): Promise<Proof> {
    const verificationMethod = `${this.issuerDID}#key-1`;

    // Create JWS (JSON Web Signature)
    const credentialJson = JSON.stringify(credential);
    const messageHash = bsv.crypto.Hash.sha256(Buffer.from(credentialJson));
    const signature = bsv.crypto.ECDSA.sign(
      messageHash,
      this.issuerPrivKey
    );

    return {
      type: 'EcdsaSecp256k1Signature2019',
      created: new Date().toISOString(),
      verificationMethod,
      proofPurpose: 'assertionMethod',
      jws: signature.toString()
    };
  }

  private async anchorCredential(
    credential: VerifiableCredential
  ): Promise<string> {
    const tx = new bsv.Transaction();

    // Add OP_RETURN with credential
    const anchorData = {
      type: 'VERIFIABLE_CREDENTIAL',
      credential,
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
    tx.sign(this.issuerPrivKey);
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

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}

/**
 * CredentialVerifier
 * 
 * Verifies W3C Verifiable Credentials
 */
export class CredentialVerifier {
  private revokedCredentials: Set<string>;

  constructor() {
    this.revokedCredentials = new Set();
  }

  /**
   * Verify credential
   */
  async verifyCredential(
    credential: VerifiableCredential
  ): Promise<{ valid: boolean; reason?: string }> {
    try {
      // 1. Check expiration
      if (credential.expirationDate) {
        const expiration = new Date(credential.expirationDate);
        if (expiration < new Date()) {
          return { valid: false, reason: 'Credential expired' };
        }
      }

      // 2. Check revocation
      if (this.revokedCredentials.has(credential.id)) {
        return { valid: false, reason: 'Credential revoked' };
      }

      // 3. Verify proof signature
      const isValidSignature = await this.verifyProof(credential);
      if (!isValidSignature) {
        return { valid: false, reason: 'Invalid signature' };
      }

      // 4. Verify blockchain anchor (optional)
      const isAnchored = await this.verifyBlockchainAnchor(credential.id);
      if (!isAnchored) {
        console.warn(`Credential not anchored to blockchain: ${credential.id}`);
      }

      return { valid: true };
    } catch (error) {
      console.error('Credential verification failed:', error);
      return { valid: false, reason: String(error) };
    }
  }

  /**
   * Verify proof signature
   */
  private async verifyProof(
    credential: VerifiableCredential
  ): Promise<boolean> {
    try {
      // Extract issuer public key from DID
      const issuerDID = credential.issuer;
      const pubKeyStr = issuerDID.replace('did:bsv:', '');
      const pubKey = bsv.PublicKey.fromString(pubKeyStr);

      // Create credential without proof
      const { proof, ...credentialWithoutProof } = credential;

      // Verify signature
      const credentialJson = JSON.stringify(credentialWithoutProof);
      const messageHash = bsv.crypto.Hash.sha256(Buffer.from(credentialJson));
      const signature = bsv.crypto.Signature.fromString(proof.jws);

      return bsv.crypto.ECDSA.verify(messageHash, signature, pubKey);
    } catch (error) {
      console.error('Proof verification failed:', error);
      return false;
    }
  }

  /**
   * Verify blockchain anchor
   */
  private async verifyBlockchainAnchor(credentialId: string): Promise<boolean> {
    try {
      // Would query BSV indexer for VERIFIABLE_CREDENTIAL transactions
      // For now, return true (would be implemented with SPV indexer)
      console.warn(`Blockchain anchor verification not implemented: ${credentialId}`);
      return true;
    } catch (error) {
      console.error('Blockchain anchor verification failed:', error);
      return false;
    }
  }

  /**
   * Mark credential as revoked
   */
  markRevoked(credentialId: string): void {
    this.revokedCredentials.add(credentialId);
    console.log(`🚫 Credential marked as revoked: ${credentialId}`);
  }

  /**
   * Check if credential is revoked
   */
  isRevoked(credentialId: string): boolean {
    return this.revokedCredentials.has(credentialId);
  }
}

/**
 * CredentialRegistry
 * 
 * Central registry for managing personnel credentials
 */
export class CredentialRegistry {
  private credentials: Map<string, VerifiableCredential[]>;
  private verifier: CredentialVerifier;

  constructor(verifier: CredentialVerifier) {
    this.credentials = new Map();
    this.verifier = verifier;
  }

  /**
   * Add credential for subject
   */
  addCredential(subjectDID: string, credential: VerifiableCredential): void {
    const existing = this.credentials.get(subjectDID) || [];
    existing.push(credential);
    this.credentials.set(subjectDID, existing);
  }

  /**
   * Get all credentials for subject
   */
  getCredentials(subjectDID: string): VerifiableCredential[] {
    return this.credentials.get(subjectDID) || [];
  }

  /**
   * Get credentials by type
   */
  getCredentialsByType(
    subjectDID: string,
    type: CredentialType
  ): VerifiableCredential[] {
    const all = this.credentials.get(subjectDID) || [];
    return all.filter((c) => c.type.includes(type));
  }

  /**
   * Verify subject has valid credential of type
   */
  async hasValidCredential(
    subjectDID: string,
    type: CredentialType
  ): Promise<boolean> {
    const credentials = this.getCredentialsByType(subjectDID, type);

    for (const credential of credentials) {
      const result = await this.verifier.verifyCredential(credential);
      if (result.valid) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSubjects: number;
    totalCredentials: number;
    byType: Record<string, number>;
  } {
    let totalCredentials = 0;
    const byType: Record<string, number> = {};

    for (const credentials of this.credentials.values()) {
      totalCredentials += credentials.length;

      for (const credential of credentials) {
        for (const type of credential.type) {
          if (type !== 'VerifiableCredential') {
            byType[type] = (byType[type] || 0) + 1;
          }
        }
      }
    }

    return {
      totalSubjects: this.credentials.size,
      totalCredentials,
      byType
    };
  }
}

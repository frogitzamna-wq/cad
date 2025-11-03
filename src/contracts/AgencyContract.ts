import {
  assert,
  ByteString,
  hash256,
  method,
  prop,
  PubKey,
  Sig,
  SmartContract,
  FixedArray
} from 'scrypt-ts';

/**
 * AgencyContract
 * 
 * Manages agency data, jurisdiction, and shared incidents.
 * Enables cross-agency collaboration and permissions.
 */
export class AgencyContract extends SmartContract {
  // Agency unique ID
  @prop()
  readonly agencyId: ByteString;

  // Agency name (hash of name for privacy)
  @prop()
  readonly agencyNameHash: ByteString;

  // Agency public key
  @prop()
  readonly agencyPubKey: PubKey;

  // Admin public keys (up to 3 admins)
  @prop()
  adminPubKeys: FixedArray<PubKey, 3>;

  // Shared incident IDs (up to 100 incidents)
  @prop()
  sharedIncidents: FixedArray<ByteString, 100>;

  // Number of active shared incidents
  @prop()
  sharedIncidentCount: bigint;

  // Version for optimistic locking
  @prop()
  version: bigint;

  constructor(
    agencyId: ByteString,
    agencyNameHash: ByteString,
    agencyPubKey: PubKey,
    adminPubKeys: FixedArray<PubKey, 3>,
    sharedIncidents: FixedArray<ByteString, 100>,
    sharedIncidentCount: bigint,
    version: bigint
  ) {
    super(...arguments);
    this.agencyId = agencyId;
    this.agencyNameHash = agencyNameHash;
    this.agencyPubKey = agencyPubKey;
    this.adminPubKeys = adminPubKeys;
    this.sharedIncidents = sharedIncidents;
    this.sharedIncidentCount = sharedIncidentCount;
    this.version = version;
  }

  /**
   * Add shared incident
   * Only admin can add
   */
  @method()
  public addSharedIncident(sig: Sig, incidentId: ByteString): void {
    // Verify admin signature
    assert(this.checkAnyAdmin(sig), 'Admin signature required');

    // Verify not at capacity
    assert(this.sharedIncidentCount < 100n, 'Shared incidents at capacity');

    // Verify incident not already shared
    assert(!this.hasSharedIncident(incidentId), 'Incident already shared');

    // Add incident
    let newState = this;
    const index = Number(this.sharedIncidentCount);
    newState.sharedIncidents[index] = incidentId;
    newState.sharedIncidentCount = this.sharedIncidentCount + 1n;
    newState.version = this.version + 1n;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Remove shared incident
   * Only admin can remove
   */
  @method()
  public removeSharedIncident(sig: Sig, incidentId: ByteString): void {
    // Verify admin signature
    assert(this.checkAnyAdmin(sig), 'Admin signature required');

    // Find and remove incident
    let found = false;
    let newState = this;
    
    for (let i = 0; i < Number(this.sharedIncidentCount); i++) {
      if (this.sharedIncidents[i] == incidentId) {
        // Shift remaining elements left
        for (let j = i; j < Number(this.sharedIncidentCount) - 1; j++) {
          newState.sharedIncidents[j] = this.sharedIncidents[j + 1];
        }
        // Clear last element
        newState.sharedIncidents[Number(this.sharedIncidentCount) - 1] = toByteString('');
        newState.sharedIncidentCount = this.sharedIncidentCount - 1n;
        found = true;
        break;
      }
    }

    assert(found, 'Incident not found');

    newState.version = this.version + 1n;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Update admin public keys
   * Only existing admin can update
   */
  @method()
  public updateAdmins(
    sig: Sig,
    newAdminPubKeys: FixedArray<PubKey, 3>
  ): void {
    // Verify current admin signature
    assert(this.checkAnyAdmin(sig), 'Admin signature required');

    // Update admins
    let newState = this;
    newState.adminPubKeys = newAdminPubKeys;
    newState.version = this.version + 1n;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Check if incident is already shared
   */
  @method()
  hasSharedIncident(incidentId: ByteString): boolean {
    let found = false;
    for (let i = 0; i < Number(this.sharedIncidentCount); i++) {
      if (this.sharedIncidents[i] == incidentId) {
        found = true;
        break;
      }
    }
    return found;
  }

  /**
   * Check if signature matches any admin
   */
  @method()
  checkAnyAdmin(sig: Sig): boolean {
    let valid = false;
    for (let i = 0; i < 3; i++) {
      if (this.checkSig(sig, this.adminPubKeys[i])) {
        valid = true;
        break;
      }
    }
    return valid;
  }
}

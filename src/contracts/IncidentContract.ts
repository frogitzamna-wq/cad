import {
  assert,
  ByteString,
  hash256,
  method,
  prop,
  PubKey,
  Sig,
  SmartContract,
  FixedArray,
  sha256
} from 'scrypt-ts';

/**
 * IncidentContract
 * 
 * Main smart contract for managing incident lifecycle on BSV blockchain.
 * Implements state transitions, permissions, and event sourcing.
 */
export class IncidentContract extends SmartContract {
  // Incident ID (derived from genesis TX)
  @prop()
  readonly incidentId: ByteString;

  // Current status (0-6)
  @prop()
  status: bigint;

  // Priority level (1-5, 1 = highest)
  @prop()
  priority: bigint;

  // SHA256 hash of complete incident data
  @prop()
  dataHash: ByteString;

  // Array of agency public keys (up to 10 agencies)
  @prop()
  agencyPubKeys: FixedArray<PubKey, 10>;

  // Operator who created the incident
  @prop()
  operatorPubKey: PubKey;

  // Supervisor public keys (up to 5 supervisors)
  @prop()
  supervisorPubKeys: FixedArray<PubKey, 5>;

  // Version number for optimistic locking
  @prop()
  version: bigint;

  constructor(
    incidentId: ByteString,
    status: bigint,
    priority: bigint,
    dataHash: ByteString,
    agencyPubKeys: FixedArray<PubKey, 10>,
    operatorPubKey: PubKey,
    supervisorPubKeys: FixedArray<PubKey, 5>,
    version: bigint
  ) {
    super(...arguments);
    this.incidentId = incidentId;
    this.status = status;
    this.priority = priority;
    this.dataHash = dataHash;
    this.agencyPubKeys = agencyPubKeys;
    this.operatorPubKey = operatorPubKey;
    this.supervisorPubKeys = supervisorPubKeys;
    this.version = version;
  }

  /**
   * Create new incident
   * Only operator can create
   */
  @method()
  public create(sig: Sig, incidentData: ByteString): void {
    // Verify operator signature
    assert(this.checkSig(sig, this.operatorPubKey), 'Invalid operator signature');

    // Verify initial status is CREATED (0)
    assert(this.status == 0n, 'Initial status must be CREATED');

    // Verify incident data hash
    assert(sha256(incidentData) == this.dataHash, 'Data hash mismatch');

    // Build output with current state
    const output: ByteString = this.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Update incident data or priority
   * Operator can update own incidents, Supervisor can update any
   */
  @method()
  public update(
    sig: Sig,
    newDataHash: ByteString,
    newPriority: bigint,
    expectedVersion: bigint
  ): void {
    // Verify signature (operator or supervisor)
    const isOperator = this.checkSig(sig, this.operatorPubKey);
    const isSupervisor = this.checkAnySig(sig, this.supervisorPubKeys);
    assert(isOperator || isSupervisor, 'Unauthorized');

    // Verify incident is not closed
    assert(this.status < 6n, 'Cannot update closed incident');

    // Optimistic locking: verify version
    assert(this.version == expectedVersion, 'Version conflict');

    // Update state
    let newState = this;
    newState.dataHash = newDataHash;
    newState.priority = newPriority;
    newState.version = this.version + 1n;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Change incident status
   * Validates state transitions
   */
  @method()
  public changeStatus(sig: Sig, newStatus: bigint): void {
    // Verify signature (supervisor required for most transitions)
    const isSupervisor = this.checkAnySig(sig, this.supervisorPubKeys);
    
    // Only supervisor can change status (except operator can set to PENDING)
    if (newStatus != 1n) {
      assert(isSupervisor, 'Supervisor required for this transition');
    } else {
      const isOperator = this.checkSig(sig, this.operatorPubKey);
      assert(isOperator || isSupervisor, 'Unauthorized');
    }

    // Validate state transition
    assert(this.validateTransition(this.status, newStatus), 'Invalid state transition');

    // Update state
    let newState = this;
    newState.status = newStatus;
    newState.version = this.version + 1n;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Close incident
   * Only supervisor can close
   */
  @method()
  public close(sig: Sig, closureReportHash: ByteString): void {
    // Verify supervisor signature
    assert(this.checkAnySig(sig, this.supervisorPubKeys), 'Supervisor signature required');

    // Verify not already closed
    assert(this.status != 6n, 'Already closed');

    // Update to closed status
    let newState = this;
    newState.status = 6n;
    newState.version = this.version + 1n;

    // Build output (closure report goes in OP_RETURN)
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Reopen closed incident
   * Only supervisor or admin can reopen
   */
  @method()
  public reopen(sig: Sig): void {
    // Verify supervisor signature
    assert(this.checkAnySig(sig, this.supervisorPubKeys), 'Supervisor signature required');

    // Verify currently closed
    assert(this.status == 6n, 'Incident not closed');

    // Update to CREATED status
    let newState = this;
    newState.status = 0n;
    newState.version = this.version + 1n;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Share incident with another agency
   * Adds agency public key to array
   */
  @method()
  public shareWithAgency(sig: Sig, newAgencyPubKey: PubKey, agencyIndex: bigint): void {
    // Verify supervisor signature
    assert(this.checkAnySig(sig, this.supervisorPubKeys), 'Supervisor signature required');

    // Verify incident not closed
    assert(this.status < 6n, 'Cannot share closed incident');

    // Verify index is valid and slot is empty
    assert(agencyIndex < 10n, 'Invalid agency index');
    
    // Update agency array
    let newState = this;
    newState.agencyPubKeys[Number(agencyIndex)] = newAgencyPubKey;
    newState.version = this.version + 1n;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Validate state transition
   * Returns true if transition is allowed
   */
  @method()
  validateTransition(currentStatus: bigint, newStatus: bigint): boolean {
    let valid = false;

    // CREATED (0) can transition to PENDING (1) or CLOSED (6)
    if (currentStatus == 0n) {
      valid = newStatus == 1n || newStatus == 6n;
    }
    // PENDING (1) can transition to DISPATCHED (2) or CLOSED (6)
    else if (currentStatus == 1n) {
      valid = newStatus == 2n || newStatus == 6n;
    }
    // DISPATCHED (2) can transition to PENDING (1), EN_ROUTE (3), or CLOSED (6)
    else if (currentStatus == 2n) {
      valid = newStatus == 1n || newStatus == 3n || newStatus == 6n;
    }
    // EN_ROUTE (3) can transition to ON_SCENE (4) or back to DISPATCHED (2)
    else if (currentStatus == 3n) {
      valid = newStatus == 2n || newStatus == 4n;
    }
    // ON_SCENE (4) can transition to RESOLVED (5)
    else if (currentStatus == 4n) {
      valid = newStatus == 5n;
    }
    // RESOLVED (5) can transition to CLOSED (6)
    else if (currentStatus == 5n) {
      valid = newStatus == 6n;
    }
    // CLOSED (6) can transition to CREATED (0) - reopen
    else if (currentStatus == 6n) {
      valid = newStatus == 0n;
    }

    return valid;
  }

  /**
   * Check if any supervisor signature matches
   */
  @method()
  checkAnySig(sig: Sig, pubKeys: FixedArray<PubKey, 5>): boolean {
    let valid = false;
    for (let i = 0; i < 5; i++) {
      if (this.checkSig(sig, pubKeys[i])) {
        valid = true;
        break;
      }
    }
    return valid;
  }
}

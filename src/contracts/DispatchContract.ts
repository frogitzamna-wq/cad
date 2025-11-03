import {
  assert,
  ByteString,
  hash256,
  method,
  prop,
  PubKey,
  Sig,
  SmartContract
} from 'scrypt-ts';

/**
 * DispatchContract
 * 
 * Records dispatch assignments linking incidents to resources.
 * Serves as immutable audit trail of dispatch decisions.
 */
export class DispatchContract extends SmartContract {
  // Incident ID
  @prop()
  readonly incidentId: ByteString;

  // Resource ID
  @prop()
  readonly resourceId: ByteString;

  // Dispatcher who made the assignment
  @prop()
  readonly dispatchedBy: PubKey;

  // Timestamp of dispatch (Unix timestamp in milliseconds)
  @prop()
  readonly dispatchedAt: bigint;

  // Estimated time of arrival (optional, in milliseconds)
  @prop()
  estimatedArrival: bigint;

  // Actual arrival timestamp (0 if not arrived yet)
  @prop()
  arrivedAt: bigint;

  // Status: 0=ASSIGNED, 1=EN_ROUTE, 2=ARRIVED, 3=COMPLETED, 4=CANCELLED
  @prop()
  status: bigint;

  constructor(
    incidentId: ByteString,
    resourceId: ByteString,
    dispatchedBy: PubKey,
    dispatchedAt: bigint,
    estimatedArrival: bigint,
    arrivedAt: bigint,
    status: bigint
  ) {
    super(...arguments);
    this.incidentId = incidentId;
    this.resourceId = resourceId;
    this.dispatchedBy = dispatchedBy;
    this.dispatchedAt = dispatchedAt;
    this.estimatedArrival = estimatedArrival;
    this.arrivedAt = arrivedAt;
    this.status = status;
  }

  /**
   * Create dispatch assignment
   * Only dispatcher can create
   */
  @method()
  public create(sig: Sig): void {
    // Verify dispatcher signature
    assert(this.checkSig(sig, this.dispatchedBy), 'Invalid dispatcher signature');

    // Verify initial status
    assert(this.status == 0n, 'Initial status must be ASSIGNED');

    // Verify timestamp is reasonable (not in future)
    // Note: In production, would compare against block timestamp

    // Build output
    const output: ByteString = this.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Update dispatch status
   * Dispatcher or resource operator can update
   */
  @method()
  public updateStatus(
    sig: Sig,
    newStatus: bigint,
    currentTimestamp: bigint
  ): void {
    // Verify signature (dispatcher or implied resource operator)
    assert(this.checkSig(sig, this.dispatchedBy), 'Unauthorized');

    // Validate status transition
    assert(this.validateStatusTransition(this.status, newStatus), 'Invalid status transition');

    // Update state
    let newState = this;
    newState.status = newStatus;

    // If status is ARRIVED, record arrival time
    if (newStatus == 2n && this.arrivedAt == 0n) {
      newState.arrivedAt = currentTimestamp;
    }

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Update estimated arrival time
   */
  @method()
  public updateETA(sig: Sig, newETA: bigint): void {
    // Verify dispatcher signature
    assert(this.checkSig(sig, this.dispatchedBy), 'Invalid dispatcher signature');

    // Can only update if not yet arrived
    assert(this.arrivedAt == 0n, 'Resource already arrived');

    // Update ETA
    let newState = this;
    newState.estimatedArrival = newETA;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Cancel dispatch
   */
  @method()
  public cancel(sig: Sig): void {
    // Verify dispatcher signature
    assert(this.checkSig(sig, this.dispatchedBy), 'Invalid dispatcher signature');

    // Can only cancel if not completed
    assert(this.status < 3n, 'Cannot cancel completed dispatch');

    // Update to cancelled
    let newState = this;
    newState.status = 4n; // CANCELLED

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Validate status transition
   */
  @method()
  validateStatusTransition(currentStatus: bigint, newStatus: bigint): boolean {
    let valid = false;

    // ASSIGNED (0) → EN_ROUTE (1) or CANCELLED (4)
    if (currentStatus == 0n) {
      valid = newStatus == 1n || newStatus == 4n;
    }
    // EN_ROUTE (1) → ARRIVED (2) or CANCELLED (4)
    else if (currentStatus == 1n) {
      valid = newStatus == 2n || newStatus == 4n;
    }
    // ARRIVED (2) → COMPLETED (3)
    else if (currentStatus == 2n) {
      valid = newStatus == 3n;
    }
    // COMPLETED (3) and CANCELLED (4) are terminal states
    else {
      valid = false;
    }

    return valid;
  }
}

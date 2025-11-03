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
 * GeoLocation embedded in contract
 */
export type GeoLocation = {
  lat: bigint; // Latitude * 1000000 (6 decimal places)
  lng: bigint; // Longitude * 1000000
};

/**
 * ResourceContract
 * 
 * Smart contract for managing emergency response resources (units, vehicles, personnel).
 * Tracks resource status, location, and incident assignments.
 */
export class ResourceContract extends SmartContract {
  // Resource ID (unique identifier)
  @prop()
  readonly resourceId: ByteString;

  // Resource type (0=POLICE, 1=AMBULANCE, 2=FIRE, 3=SUPERVISOR, 4=SPECIAL)
  @prop()
  readonly resourceType: bigint;

  // Current status (0=AVAILABLE, 1=DISPATCHED, 2=EN_ROUTE, 3=ON_SCENE, 4=OUT_OF_SERVICE)
  @prop()
  status: bigint;

  // Current incident ID (empty if not assigned)
  @prop()
  currentIncidentId: ByteString;

  // Current location (lat/lng * 1000000)
  @prop()
  locationLat: bigint;

  @prop()
  locationLng: bigint;

  // Agency that owns this resource
  @prop()
  readonly agencyPubKey: PubKey;

  // Authorized operators (up to 3 operators per resource)
  @prop()
  operatorPubKeys: FixedArray<PubKey, 3>;

  // Version for optimistic locking
  @prop()
  version: bigint;

  constructor(
    resourceId: ByteString,
    resourceType: bigint,
    status: bigint,
    currentIncidentId: ByteString,
    locationLat: bigint,
    locationLng: bigint,
    agencyPubKey: PubKey,
    operatorPubKeys: FixedArray<PubKey, 3>,
    version: bigint
  ) {
    super(...arguments);
    this.resourceId = resourceId;
    this.resourceType = resourceType;
    this.status = status;
    this.currentIncidentId = currentIncidentId;
    this.locationLat = locationLat;
    this.locationLng = locationLng;
    this.agencyPubKey = agencyPubKey;
    this.operatorPubKeys = operatorPubKeys;
    this.version = version;
  }

  /**
   * Dispatch resource to incident
   * Only dispatcher can dispatch
   */
  @method()
  public dispatch(
    sig: Sig,
    incidentId: ByteString,
    dispatcherPubKey: PubKey
  ): void {
    // Verify dispatcher signature (agency dispatcher)
    assert(this.checkSig(sig, dispatcherPubKey), 'Invalid dispatcher signature');

    // Verify resource is available
    assert(this.status == 0n, 'Resource not available');

    // Update state
    let newState = this;
    newState.status = 1n; // DISPATCHED
    newState.currentIncidentId = incidentId;
    newState.version = this.version + 1n;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Update resource status
   * Operator or dispatcher can update
   */
  @method()
  public updateStatus(
    sig: Sig,
    newStatus: bigint
  ): void {
    // Verify signature (operator or agency)
    const isOperator = this.checkAnyOperator(sig);
    const isAgency = this.checkSig(sig, this.agencyPubKey);
    assert(isOperator || isAgency, 'Unauthorized');

    // Validate status transition
    assert(this.validateStatusTransition(this.status, newStatus), 'Invalid status transition');

    // Update state
    let newState = this;
    newState.status = newStatus;
    newState.version = this.version + 1n;

    // If returning to AVAILABLE, clear incident assignment
    if (newStatus == 0n) {
      newState.currentIncidentId = toByteString('');
    }

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Update GPS location
   * Only authorized operators can update location
   */
  @method()
  public updateLocation(
    sig: Sig,
    newLat: bigint,
    newLng: bigint
  ): void {
    // Verify operator signature
    assert(this.checkAnyOperator(sig), 'Invalid operator signature');

    // Update location
    let newState = this;
    newState.locationLat = newLat;
    newState.locationLng = newLng;
    newState.version = this.version + 1n;

    // Build output
    const output: ByteString = newState.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Release resource from incident
   * Clear incident assignment and return to AVAILABLE
   */
  @method()
  public release(sig: Sig): void {
    // Verify signature (operator or agency)
    const isOperator = this.checkAnyOperator(sig);
    const isAgency = this.checkSig(sig, this.agencyPubKey);
    assert(isOperator || isAgency, 'Unauthorized');

    // Update state
    let newState = this;
    newState.status = 0n; // AVAILABLE
    newState.currentIncidentId = toByteString('');
    newState.version = this.version + 1n;

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

    // AVAILABLE (0) → DISPATCHED (1) or OUT_OF_SERVICE (4)
    if (currentStatus == 0n) {
      valid = newStatus == 1n || newStatus == 4n;
    }
    // DISPATCHED (1) → EN_ROUTE (2) or back to AVAILABLE (0)
    else if (currentStatus == 1n) {
      valid = newStatus == 2n || newStatus == 0n;
    }
    // EN_ROUTE (2) → ON_SCENE (3) or back to AVAILABLE (0)
    else if (currentStatus == 2n) {
      valid = newStatus == 3n || newStatus == 0n;
    }
    // ON_SCENE (3) → AVAILABLE (0) or OUT_OF_SERVICE (4)
    else if (currentStatus == 3n) {
      valid = newStatus == 0n || newStatus == 4n;
    }
    // OUT_OF_SERVICE (4) → AVAILABLE (0)
    else if (currentStatus == 4n) {
      valid = newStatus == 0n;
    }

    return valid;
  }

  /**
   * Check if signature matches any operator
   */
  @method()
  checkAnyOperator(sig: Sig): boolean {
    let valid = false;
    for (let i = 0; i < 3; i++) {
      if (this.checkSig(sig, this.operatorPubKeys[i])) {
        valid = true;
        break;
      }
    }
    return valid;
  }
}

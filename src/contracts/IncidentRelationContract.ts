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
 * IncidentRelationContract
 * 
 * Records relationships between incidents (combine, split, parent-child, transfer).
 * Provides immutable audit trail of incident relationships.
 */
export class IncidentRelationContract extends SmartContract {
  // Source incident ID
  @prop()
  readonly sourceIncidentId: ByteString;

  // Destination incident ID
  @prop()
  readonly destIncidentId: ByteString;

  // Relation type: 0=RELATE, 1=PARENT, 2=COMBINE, 3=SPLIT, 4=TRANSFER
  @prop()
  readonly relationType: bigint;

  // Timestamp when relation was created
  @prop()
  readonly timestamp: bigint;

  // User who created the relation
  @prop()
  readonly createdBy: PubKey;

  // Optional reason/notes hash
  @prop()
  readonly notesHash: ByteString;

  constructor(
    sourceIncidentId: ByteString,
    destIncidentId: ByteString,
    relationType: bigint,
    timestamp: bigint,
    createdBy: PubKey,
    notesHash: ByteString
  ) {
    super(...arguments);
    this.sourceIncidentId = sourceIncidentId;
    this.destIncidentId = destIncidentId;
    this.relationType = relationType;
    this.timestamp = timestamp;
    this.createdBy = createdBy;
    this.notesHash = notesHash;
  }

  /**
   * Create incident relation
   * Only authorized supervisor can create
   */
  @method()
  public create(sig: Sig): void {
    // Verify creator signature
    assert(this.checkSig(sig, this.createdBy), 'Invalid creator signature');

    // Verify valid relation type
    assert(this.relationType >= 0n && this.relationType <= 4n, 'Invalid relation type');

    // Verify source and dest are different
    assert(this.sourceIncidentId != this.destIncidentId, 'Cannot relate incident to itself');

    // Build output (this is immutable, no state changes)
    const output: ByteString = this.buildStateOutput(this.ctx.utxo.value);
    assert(hash256(output) == this.ctx.hashOutputs, 'Output mismatch');
  }

  /**
   * Verify relation type description
   * Helper for validation
   */
  @method()
  getRelationTypeName(type: bigint): ByteString {
    let name: ByteString = toByteString('UNKNOWN');

    if (type == 0n) {
      name = toByteString('RELATE');
    } else if (type == 1n) {
      name = toByteString('PARENT');
    } else if (type == 2n) {
      name = toByteString('COMBINE');
    } else if (type == 3n) {
      name = toByteString('SPLIT');
    } else if (type == 4n) {
      name = toByteString('TRANSFER');
    }

    return name;
  }
}

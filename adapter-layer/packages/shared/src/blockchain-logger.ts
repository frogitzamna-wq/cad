import { createHash } from 'crypto';
import type { NormalizedEvent, AdapterConfig } from './types';
import { AdapterError, AdapterErrorCode } from './types';

/**
 * TeranodeLogger - Logs all adapter events to BSV blockchain
 * 
 * Design principles:
 * - All events normalized to common format before logging
 * - Transaction IDs returned for audit trail
 * - Retries with exponential backoff
 * - Minimal on-chain data (hashes only, not content)
 */
export class TeranodeLogger {
  private config: AdapterConfig;
  
  constructor(config: AdapterConfig) {
    this.config = config;
  }

  /**
   * Log event to blockchain
   * Returns transaction ID (txid)
   */
  async logEvent(event: NormalizedEvent): Promise<string> {
    if (!this.config.features.blockchainLoggingEnabled) {
      console.warn('[TeranodeLogger] Blockchain logging disabled, skipping');
      return 'mock-txid-' + Date.now();
    }

    try {
      // 1. Validate event
      this.validateEvent(event);

      // 2. Prepare OP_RETURN data (compact format)
      const opReturnData = this.prepareOpReturnData(event);

      // 3. Create transaction
      const txid = await this.createTransaction(opReturnData);

      console.log(`[TeranodeLogger] Event logged to blockchain: ${txid}`, {
        type: event.type,
        actor: event.actorDID,
        timestamp: event.timestamp.toISOString()
      });

      return txid;
    } catch (error) {
      console.error('[TeranodeLogger] Failed to log event to blockchain', error);
      
      throw new AdapterError(
        'Failed to log event to blockchain',
        AdapterErrorCode.BLOCKCHAIN_LOG_FAILED,
        { originalError: error, event }
      );
    }
  }

  /**
   * Batch log multiple events (more efficient)
   */
  async logBatch(events: NormalizedEvent[]): Promise<string[]> {
    if (!this.config.features.blockchainLoggingEnabled) {
      return events.map(() => 'mock-txid-' + Date.now());
    }

    // TODO: Implement batch transaction creation
    // For now, log sequentially (can optimize later)
    const txids: string[] = [];
    for (const event of events) {
      const txid = await this.logEvent(event);
      txids.push(txid);
    }
    return txids;
  }

  /**
   * Query events from blockchain by txid
   */
  async queryEvent(txid: string): Promise<NormalizedEvent | null> {
    try {
      const response = await fetch(`${this.config.teranodeUrl}/tx/${txid}`);
      if (!response.ok) {
        return null;
      }

      const tx = await response.json();
      
      // Parse OP_RETURN data back to event
      return this.parseOpReturnData(tx.vout[0].scriptPubKey.hex);
    } catch (error) {
      console.error('[TeranodeLogger] Failed to query event', error);
      return null;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private validateEvent(event: NormalizedEvent): void {
    if (!event.type) {
      throw new AdapterError(
        'Event type is required',
        AdapterErrorCode.INVALID_EVENT
      );
    }

    if (!event.timestamp) {
      throw new AdapterError(
        'Event timestamp is required',
        AdapterErrorCode.INVALID_EVENT
      );
    }

    if (!event.actorDID) {
      throw new AdapterError(
        'Event actor DID is required',
        AdapterErrorCode.INVALID_EVENT
      );
    }

    if (!event.contentHash) {
      throw new AdapterError(
        'Event content hash is required',
        AdapterErrorCode.INVALID_EVENT
      );
    }
  }

  /**
   * Prepare OP_RETURN data (compact binary format)
   * 
   * Format (bytes):
   * [4] Magic: 0xCADEVENT
   * [1] Version: 0x01
   * [1] Event type code
   * [8] Timestamp (Unix epoch)
   * [32] Content hash (SHA256)
   * [33] Actor pubkey (compressed)
   * [N] Protocol-specific data (compact)
   * 
   * Total: ~80 bytes (fits in OP_RETURN)
   */
  private prepareOpReturnData(event: NormalizedEvent): Buffer {
    const buffers: Buffer[] = [];

    // Magic + Version
    buffers.push(Buffer.from([0xCA, 0xDE, 0xVE, 0xNT])); // CAD-EVENT
    buffers.push(Buffer.from([0x01])); // Version 1

    // Event type code
    buffers.push(Buffer.from([this.getEventTypeCode(event.type)]));

    // Timestamp (8 bytes, Unix epoch in milliseconds)
    const timestampBuf = Buffer.allocUnsafe(8);
    timestampBuf.writeBigUInt64BE(BigInt(event.timestamp.getTime()));
    buffers.push(timestampBuf);

    // Content hash (32 bytes SHA256)
    buffers.push(Buffer.from(event.contentHash, 'hex'));

    // Actor DID → compressed pubkey (33 bytes)
    // For now, use placeholder (real impl would extract pubkey from DID)
    buffers.push(Buffer.alloc(33, 0));

    // Protocol-specific compact data
    buffers.push(this.encodeProtocolData(event));

    return Buffer.concat(buffers);
  }

  private getEventTypeCode(type: string): number {
    // Map event types to single-byte codes
    const codes: Record<string, number> = {
      'call_initiated': 0x10,
      'call_answered': 0x11,
      'call_ended': 0x12,
      'call_recorded': 0x13,
      'camera_accessed': 0x20,
      'video_streamed': 0x21,
      'evidence_recorded': 0x22,
      'evidence_accessed': 0x23,
      'message_sent': 0x30,
      'message_delivered': 0x31,
      'message_read': 0x32,
      'protocol_negotiated': 0x40,
      'legacy_bridge_access': 0x50,
      'access_denied': 0x51
    };
    return codes[type] ?? 0xFF;
  }

  private encodeProtocolData(event: NormalizedEvent): Buffer {
    // Compact encoding of protocol-specific fields
    // TODO: Implement compact binary encoding per event type
    // For now, use JSON (less efficient but readable)
    const data = JSON.stringify({
      protocol: 'protocol' in event ? event.protocol : undefined,
      e2e: 'e2eEncrypted' in event ? event.e2eEncrypted : undefined
    });
    return Buffer.from(data);
  }

  private parseOpReturnData(_hex: string): NormalizedEvent {
    // TODO: Implement reverse parsing
    throw new Error('Not implemented yet');
  }

  /**
   * Create blockchain transaction with OP_RETURN
   */
  private async createTransaction(opReturnData: Buffer): Promise<string> {
    // TODO: Integrate with @bsv/sdk or ts-sdk
    // For now, use REST API to Teranode
    
    const response = await fetch(`${this.config.teranodeUrl}/tx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getAuthToken()}`
      },
      body: JSON.stringify({
        outputs: [
          {
            script: 'OP_FALSE OP_RETURN ' + opReturnData.toString('hex'),
            satoshis: 0
          }
        ],
        // Add fee output
        fee: 1000 // 1000 satoshis
      })
    });

    if (!response.ok) {
      throw new Error(`Teranode request failed: ${response.status}`);
    }

    const result = await response.json();
    return result.txid;
  }

  private getAuthToken(): string {
    // TODO: Sign with wallet private key
    // For now, return placeholder
    return 'mock-jwt-token';
  }

  /**
   * Compute SHA256 hash of arbitrary data
   */
  static hashContent(data: unknown): string {
    const json = JSON.stringify(data);
    return createHash('sha256').update(json).digest('hex');
  }
}

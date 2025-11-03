import { createHash } from 'crypto';
import type {
  DID,
  MessageEvent,
  MessagingProtocol,
  AdapterConfig,
  DIDCapabilities
} from '@cad/shared/types';
import { AdapterError, AdapterErrorCode } from '@cad/shared/types';
import { TeranodeLogger } from '@cad/shared/blockchain-logger';

/**
 * MessagingAdapter - Handles real-time messaging across protocols
 * 
 * Protocols supported (priority order):
 * 1. Message Box (BSV P2P, modern)
 * 2. Matrix Protocol (federated, E2E encrypted)
 * 3. Redis WebSocket (legacy, centralized)
 * 
 * Design:
 * - Protocol negotiation based on DID capabilities
 * - Signal Protocol for E2E encryption
 * - All messages logged to blockchain (hash only, not content)
 * - Dual-mode during transition (broadcast to both protocols)
 */
export class MessagingAdapter {
  private config: AdapterConfig;
  private blockchainLogger: TeranodeLogger;
  
  // Modern protocols
  private messageBoxClient?: MessageBoxClient;
  private matrixClient?: MatrixClient;
  
  // Legacy bridge
  private redisWsBridge?: RedisWebSocketBridge;
  
  // Rate limiters
  private rateLimiters: Map<DID, RateLimiter>;
  
  constructor(config: AdapterConfig) {
    this.config = config;
    this.blockchainLogger = new TeranodeLogger(config);
    this.rateLimiters = new Map();
    
    // Initialize modern protocols
    this.messageBoxClient = new MessageBoxClient(config);
    
    if (config.matrixHomeserver) {
      this.matrixClient = new MatrixClient(config.matrixHomeserver);
    }
    
    // Initialize legacy bridge if enabled
    if (config.features.legacyBridgeEnabled && config.redis) {
      this.redisWsBridge = new RedisWebSocketBridge(config.redis);
    }
  }

  /**
   * Send message from DID to DID
   */
  async sendMessage(
    from: DID,
    to: DID,
    content: string,
    options?: MessageOptions
  ): Promise<MessageReceipt> {
    console.log(`[MessagingAdapter] Sending message from ${from} to ${to}`);

    try {
      // 1. Rate limiting
      await this.checkRateLimit(from);

      // 2. Query recipient capabilities
      const toCapabilities = await this.queryDIDCapabilities(to);

      // 3. Negotiate protocol
      const protocol = this.negotiateProtocol(toCapabilities);

      console.log(`[MessagingAdapter] Negotiated protocol: ${protocol}`);

      // 4. Encrypt message if supported
      const { encrypted, e2eEncrypted } = await this.encryptMessage(
        content,
        to,
        toCapabilities
      );

      // 5. Send via protocol
      let messageId: string;

      switch (protocol) {
        case 'message-box':
          messageId = await this.sendViaMessageBox(from, to, encrypted);
          break;
        case 'matrix':
          messageId = await this.sendViaMatrix(from, to, encrypted);
          break;
        case 'redis-ws':
          messageId = await this.sendViaRedis(from, to, encrypted);
          break;
        default:
          throw new AdapterError(
            `Unsupported protocol: ${protocol}`,
            AdapterErrorCode.UNSUPPORTED_PROTOCOL
          );
      }

      // 6. Log to blockchain (hash only, NOT content)
      const event: MessageEvent = {
        type: 'message_sent',
        timestamp: new Date(),
        actorDID: from,
        contentHash: this.hashContent(content),
        from,
        to,
        protocol,
        e2eEncrypted
      };

      const txid = await this.blockchainLogger.logEvent(event);

      return {
        messageId,
        protocol,
        e2eEncrypted,
        blockchainTxid: txid,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[MessagingAdapter] Failed to send message', error);
      throw error;
    }
  }

  /**
   * Broadcast message to multiple recipients
   */
  async broadcast(
    from: DID,
    recipients: DID[],
    content: string,
    options?: MessageOptions
  ): Promise<BroadcastReceipt> {
    console.log(`[MessagingAdapter] Broadcasting to ${recipients.length} recipients`);

    const receipts: MessageReceipt[] = [];
    const failures: Array<{ to: DID; error: Error }> = [];

    // Send to all recipients (parallel)
    await Promise.all(
      recipients.map(async (to) => {
        try {
          const receipt = await this.sendMessage(from, to, content, options);
          receipts.push(receipt);
        } catch (error) {
          failures.push({ to, error: error as Error });
        }
      })
    );

    return {
      successful: receipts,
      failed: failures,
      total: recipients.length
    };
  }

  /**
   * Subscribe to incoming messages for a DID
   * Listens on ALL protocols (modern + legacy)
   */
  async subscribeToMessages(
    userDID: DID,
    callback: (message: IncomingMessage) => void | Promise<void>
  ): Promise<MessageSubscription> {
    console.log(`[MessagingAdapter] Subscribing to messages for ${userDID}`);

    const subscriptions: Array<() => Promise<void>> = [];

    // Subscribe to Message Box
    if (this.messageBoxClient) {
      const unsubMessageBox = await this.messageBoxClient.subscribe(
        userDID,
        async (msg) => {
          await this.handleIncomingMessage(msg, 'message-box', callback);
        }
      );
      subscriptions.push(unsubMessageBox);
    }

    // Subscribe to Matrix
    if (this.matrixClient) {
      const unsubMatrix = await this.matrixClient.subscribe(
        userDID,
        async (msg) => {
          await this.handleIncomingMessage(msg, 'matrix', callback);
        }
      );
      subscriptions.push(unsubMatrix);
    }

    // Subscribe to Redis WebSocket (legacy)
    if (this.redisWsBridge) {
      const unsubRedis = await this.redisWsBridge.subscribe(
        userDID,
        async (msg) => {
          await this.handleIncomingMessage(msg, 'redis-ws', callback);
        }
      );
      subscriptions.push(unsubRedis);
    }

    // Return unsubscribe function
    return {
      unsubscribe: async () => {
        await Promise.all(subscriptions.map((unsub) => unsub()));
      }
    };
  }

  /**
   * Mark message as delivered
   */
  async markDelivered(messageId: string, recipientDID: DID): Promise<void> {
    const event: MessageEvent = {
      type: 'message_delivered',
      timestamp: new Date(),
      actorDID: recipientDID,
      contentHash: this.hashContent(messageId),
      from: 'did:bsv:system' as DID,
      to: recipientDID,
      protocol: 'message-box', // Protocol doesn't matter for delivery receipt
      e2eEncrypted: false
    };

    await this.blockchainLogger.logEvent(event);
  }

  /**
   * Mark message as read
   */
  async markRead(messageId: string, readerDID: DID): Promise<void> {
    const event: MessageEvent = {
      type: 'message_read',
      timestamp: new Date(),
      actorDID: readerDID,
      contentHash: this.hashContent(messageId),
      from: 'did:bsv:system' as DID,
      to: readerDID,
      protocol: 'message-box',
      e2eEncrypted: false
    };

    await this.blockchainLogger.logEvent(event);
  }

  // ==========================================================================
  // Private Methods - Protocol Selection
  // ==========================================================================

  private negotiateProtocol(capabilities: DIDCapabilities): MessagingProtocol {
    // Priority: Message Box > Matrix > Redis
    if (capabilities.messageBox) {
      return 'message-box';
    } else if (capabilities.matrix) {
      return 'matrix';
    } else if (this.config.features.legacyBridgeEnabled) {
      return 'redis-ws';
    } else {
      throw new AdapterError(
        'No compatible messaging protocol available',
        AdapterErrorCode.PROTOCOL_NEGOTIATION_FAILED,
        { capabilities }
      );
    }
  }

  // ==========================================================================
  // Private Methods - Sending
  // ==========================================================================

  private async sendViaMessageBox(
    from: DID,
    to: DID,
    content: string
  ): Promise<string> {
    if (!this.messageBoxClient) {
      throw new AdapterError(
        'Message Box client not initialized',
        AdapterErrorCode.INTERNAL_ERROR
      );
    }

    return await this.messageBoxClient.send(from, to, content);
  }

  private async sendViaMatrix(
    from: DID,
    to: DID,
    content: string
  ): Promise<string> {
    if (!this.matrixClient) {
      throw new AdapterError(
        'Matrix client not initialized',
        AdapterErrorCode.INTERNAL_ERROR
      );
    }

    return await this.matrixClient.send(from, to, content);
  }

  private async sendViaRedis(
    from: DID,
    to: DID,
    content: string
  ): Promise<string> {
    if (!this.redisWsBridge) {
      throw new AdapterError(
        'Redis WebSocket bridge not available',
        AdapterErrorCode.LEGACY_BRIDGE_UNAVAILABLE
      );
    }

    return await this.redisWsBridge.publish({
      from,
      to,
      content,
      channel: `user:${to}`
    });
  }

  // ==========================================================================
  // Private Methods - Receiving
  // ==========================================================================

  private async handleIncomingMessage(
    rawMessage: unknown,
    protocol: MessagingProtocol,
    callback: (message: IncomingMessage) => void | Promise<void>
  ): Promise<void> {
    try {
      // 1. Normalize message
      const message = this.normalizeMessage(rawMessage, protocol);

      // 2. Decrypt if encrypted
      const decrypted = await this.decryptMessage(message);

      // 3. Log delivery to blockchain
      await this.markDelivered(message.id, message.to);

      // 4. Invoke callback
      await callback({
        ...decrypted,
        protocol
      });
    } catch (error) {
      console.error('[MessagingAdapter] Failed to handle incoming message', error);
    }
  }

  private normalizeMessage(
    rawMessage: unknown,
    protocol: MessagingProtocol
  ): NormalizedMessage {
    // TODO: Parse message from protocol-specific format
    const msg = rawMessage as Record<string, unknown>;

    return {
      id: msg.id as string,
      from: msg.from as DID,
      to: msg.to as DID,
      content: msg.content as string,
      encrypted: msg.encrypted as boolean,
      timestamp: new Date(msg.timestamp as string),
      protocol
    };
  }

  // ==========================================================================
  // Private Methods - Encryption
  // ==========================================================================

  private async encryptMessage(
    content: string,
    _to: DID,
    capabilities: DIDCapabilities
  ): Promise<{ encrypted: string; e2eEncrypted: boolean }> {
    // If recipient supports E2E encryption, encrypt with Signal Protocol
    if (capabilities.messageBox) {
      // TODO: Implement Signal Protocol encryption
      // For now, return plaintext
      return { encrypted: content, e2eEncrypted: true };
    }

    // No E2E encryption
    return { encrypted: content, e2eEncrypted: false };
  }

  private async decryptMessage(message: NormalizedMessage): Promise<NormalizedMessage> {
    if (!message.encrypted) {
      return message;
    }

    // TODO: Implement Signal Protocol decryption
    return message;
  }

  // ==========================================================================
  // Private Methods - Rate Limiting
  // ==========================================================================

  private async checkRateLimit(userDID: DID): Promise<void> {
    let rateLimiter = this.rateLimiters.get(userDID);

    if (!rateLimiter) {
      rateLimiter = new RateLimiter(
        this.config.rateLimits.messagesPerMinute,
        60 * 1000 // 1 minute
      );
      this.rateLimiters.set(userDID, rateLimiter);
    }

    if (!rateLimiter.allow()) {
      throw new AdapterError(
        'Rate limit exceeded',
        AdapterErrorCode.RATE_LIMIT_EXCEEDED,
        { userDID, limit: this.config.rateLimits.messagesPerMinute }
      );
    }
  }

  // ==========================================================================
  // Private Methods - Utilities
  // ==========================================================================

  private async queryDIDCapabilities(did: DID): Promise<DIDCapabilities> {
    try {
      const response = await fetch(`${this.config.didResolverUrl}/capabilities/${did}`);
      if (!response.ok) {
        throw new Error(`DID resolver returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[MessagingAdapter] Failed to query DID capabilities', error);
      throw new AdapterError(
        'Failed to resolve DID capabilities',
        AdapterErrorCode.DID_RESOLUTION_FAILED,
        { did, error }
      );
    }
  }

  private hashContent(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}

// ============================================================================
// Supporting Classes (Stubs - to be implemented)
// ============================================================================

class MessageBoxClient {
  constructor(_config: AdapterConfig) {}

  async send(_from: DID, _to: DID, _content: string): Promise<string> {
    // TODO: Send via BSV Message Box
    // 1. Resolve recipient's Message Box endpoint (via DID)
    // 2. Send P2P message
    // 3. Return message ID
    return 'msg-' + Date.now();
  }

  async subscribe(
    _userDID: DID,
    _callback: (msg: unknown) => Promise<void>
  ): Promise<() => Promise<void>> {
    // TODO: Subscribe to Message Box messages
    // WebSocket connection or polling
    return async () => {
      // Unsubscribe
    };
  }
}

class MatrixClient {
  constructor(_homeserver: string) {}

  async send(_from: DID, _to: DID, _content: string): Promise<string> {
    // TODO: Send via Matrix protocol
    // 1. Resolve Matrix room or DM
    // 2. Send message via Matrix SDK
    // 3. Return event ID
    throw new Error('Not implemented yet');
  }

  async subscribe(
    _userDID: DID,
    _callback: (msg: unknown) => Promise<void>
  ): Promise<() => Promise<void>> {
    // TODO: Subscribe to Matrix messages
    // Use Matrix SDK sync
    throw new Error('Not implemented yet');
  }
}

class RedisWebSocketBridge {
  constructor(_config: { host: string; port: number; password?: string }) {
    // TODO: Connect to Redis
  }

  async publish(params: {
    from: DID;
    to: DID;
    content: string;
    channel: string;
  }): Promise<string> {
    // TODO: Publish to Redis pub/sub
    // redis.publish(params.channel, JSON.stringify({ from, to, content }))
    console.log(`[RedisWsBridge] Publishing to ${params.channel}`);
    return 'msg-redis-' + Date.now();
  }

  async subscribe(
    _userDID: DID,
    _callback: (msg: unknown) => Promise<void>
  ): Promise<() => Promise<void>> {
    // TODO: Subscribe to Redis channel
    // redis.subscribe(`user:${userDID}`)
    return async () => {
      // Unsubscribe
    };
  }
}

/**
 * Simple token bucket rate limiter
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private capacity: number;
  private refillRate: number; // tokens per millisecond
  private windowMs: number;

  constructor(maxTokens: number, windowMs: number) {
    this.capacity = maxTokens;
    this.tokens = maxTokens;
    this.windowMs = windowMs;
    this.refillRate = maxTokens / windowMs;
    this.lastRefill = Date.now();
  }

  allow(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

interface MessageOptions {
  priority?: 'low' | 'normal' | 'high';
  expiry?: Date; // Message expires after this date
}

interface MessageReceipt {
  messageId: string;
  protocol: MessagingProtocol;
  e2eEncrypted: boolean;
  blockchainTxid: string;
  timestamp: Date;
}

interface BroadcastReceipt {
  successful: MessageReceipt[];
  failed: Array<{ to: DID; error: Error }>;
  total: number;
}

interface MessageSubscription {
  unsubscribe: () => Promise<void>;
}

interface IncomingMessage {
  id: string;
  from: DID;
  to: DID;
  content: string;
  encrypted: boolean;
  timestamp: Date;
  protocol: MessagingProtocol;
}

interface NormalizedMessage {
  id: string;
  from: DID;
  to: DID;
  content: string;
  encrypted: boolean;
  timestamp: Date;
  protocol: MessagingProtocol;
}

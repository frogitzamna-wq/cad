import type { 
  DID, 
  CallEvent, 
  TelephonyProtocol, 
  AdapterConfig,
  DIDCapabilities 
} from '@cad/shared/types';
import { AdapterError, AdapterErrorCode } from '@cad/shared/types';
import { TeranodeLogger } from '@cad/shared/blockchain-logger';

/**
 * TelephonyAdapter - Handles voice calls across protocols
 * 
 * Protocols supported (priority order):
 * 1. WebRTC P2P (modern, E2E encrypted)
 * 2. SIP over TLS (VoIP standard)
 * 3. Avaya JTAPI (legacy bridge)
 * 4. PSTN (fallback via Avaya)
 * 
 * Design:
 * - Protocol negotiation based on DID capabilities
 * - All calls logged to blockchain (immutable audit)
 * - Dual-mode: modern clients get P2P, legacy clients get bridge
 */
export class TelephonyAdapter {
  private config: AdapterConfig;
  private blockchainLogger: TeranodeLogger;
  
  // Modern protocol gateways
  private webrtcGateway?: WebRTCGateway;
  private sipTlsGateway?: SIPTLSGateway;
  
  // Legacy bridge (conditionally enabled)
  private avayaBridge?: AvayaJTAPIBridge;
  
  constructor(config: AdapterConfig) {
    this.config = config;
    this.blockchainLogger = new TeranodeLogger(config);
    
    // Initialize gateways
    this.webrtcGateway = new WebRTCGateway(config);
    this.sipTlsGateway = new SIPTLSGateway(config);
    
    // Initialize legacy bridge if enabled
    if (config.features.legacyBridgeEnabled && config.avaya) {
      this.avayaBridge = new AvayaJTAPIBridge(config.avaya);
    }
  }

  /**
   * Initiate call from dispatcher to field unit or PSTN
   */
  async initiateCall(
    from: DID, 
    to: DID | string // DID or phone number
  ): Promise<CallSession> {
    console.log(`[TelephonyAdapter] Initiating call from ${from} to ${to}`);

    try {
      // 1. Determine if "to" is DID or phone number
      const isDID = this.isDID(to);

      if (isDID) {
        // Modern path: negotiate protocol with DID
        return await this.initiateModernCall(from, to as DID);
      } else {
        // Legacy path: bridge to PSTN via Avaya
        return await this.initiateLegacyCall(from, to);
      }
    } catch (error) {
      console.error('[TelephonyAdapter] Call initiation failed', error);
      throw error;
    }
  }

  /**
   * Handle incoming call from PSTN (via Avaya bridge)
   */
  async handleIncomingCall(event: IncomingCallEvent): Promise<void> {
    console.log('[TelephonyAdapter] Incoming call from', event.callerPhone);

    try {
      // 1. Detect protocol (PSTN via Avaya, SIP, etc.)
      const protocol = this.detectProtocol(event);

      // 2. Normalize to CallEvent
      const normalizedCall = this.normalizeIncomingCall(event, protocol);

      // 3. Log to blockchain
      const txid = await this.blockchainLogger.logEvent(normalizedCall);
      normalizedCall.txid = txid;

      // 4. Route to dispatcher
      await this.routeToDispatcher(normalizedCall);

      console.log('[TelephonyAdapter] Incoming call routed successfully');
    } catch (error) {
      console.error('[TelephonyAdapter] Failed to handle incoming call', error);
      throw error;
    }
  }

  /**
   * End call and log final state
   */
  async endCall(callId: string, duration: number): Promise<void> {
    console.log(`[TelephonyAdapter] Ending call ${callId}, duration: ${duration}s`);

    // TODO: Retrieve call session from store
    const session = await this.getCallSession(callId);

    // Log call_ended event
    const event: CallEvent = {
      type: 'call_ended',
      timestamp: new Date(),
      actorDID: session.callerDID,
      contentHash: TeranodeLogger.hashContent({ callId, duration }),
      callerDID: session.callerDID,
      calleeDID: session.calleeDID,
      protocol: session.protocol,
      duration,
      e2eEncrypted: session.e2eEncrypted
    };

    await this.blockchainLogger.logEvent(event);
  }

  // ==========================================================================
  // Private Methods - Modern Call Path
  // ==========================================================================

  private async initiateModernCall(from: DID, to: DID): Promise<CallSession> {
    // 1. Query capabilities of "to" DID
    const capabilities = await this.queryDIDCapabilities(to);

    // 2. Negotiate protocol (best available)
    const protocol = this.negotiateProtocol(capabilities);

    console.log(`[TelephonyAdapter] Negotiated protocol: ${protocol}`);

    // 3. Log protocol_negotiated event
    await this.logProtocolNegotiation(from, to, protocol);

    // 4. Create call session based on protocol
    let session: CallSession;

    switch (protocol) {
      case 'webrtc':
        session = await this.createWebRTCCall(from, to);
        break;
      case 'sip-tls':
        session = await this.createSIPCall(from, to);
        break;
      default:
        throw new AdapterError(
          `Unsupported protocol: ${protocol}`,
          AdapterErrorCode.UNSUPPORTED_PROTOCOL
        );
    }

    // 5. Log call_initiated event
    const event: CallEvent = {
      type: 'call_initiated',
      timestamp: new Date(),
      actorDID: from,
      contentHash: TeranodeLogger.hashContent({ from, to, protocol }),
      callerDID: from,
      calleeDID: to,
      protocol,
      e2eEncrypted: protocol === 'webrtc' || protocol === 'sip-tls'
    };

    const txid = await this.blockchainLogger.logEvent(event);
    session.blockchainTxid = txid;

    return session;
  }

  private async createWebRTCCall(from: DID, to: DID): Promise<CallSession> {
    if (!this.webrtcGateway) {
      throw new AdapterError(
        'WebRTC gateway not initialized',
        AdapterErrorCode.INTERNAL_ERROR
      );
    }

    const peerConnection = await this.webrtcGateway.createPeerConnection(from, to);

    return {
      id: this.generateCallId(),
      callerDID: from,
      calleeDID: to,
      protocol: 'webrtc',
      e2eEncrypted: true,
      peerConnection,
      startTime: new Date()
    };
  }

  private async createSIPCall(from: DID, to: DID): Promise<CallSession> {
    if (!this.sipTlsGateway) {
      throw new AdapterError(
        'SIP/TLS gateway not initialized',
        AdapterErrorCode.INTERNAL_ERROR
      );
    }

    const sipSession = await this.sipTlsGateway.createSession(from, to);

    return {
      id: this.generateCallId(),
      callerDID: from,
      calleeDID: to,
      protocol: 'sip-tls',
      e2eEncrypted: true,
      sipSession,
      startTime: new Date()
    };
  }

  // ==========================================================================
  // Private Methods - Legacy Call Path
  // ==========================================================================

  private async initiateLegacyCall(from: DID, toPhone: string): Promise<CallSession> {
    console.log(`[TelephonyAdapter] Bridging call to PSTN: ${toPhone}`);

    if (!this.avayaBridge) {
      throw new AdapterError(
        'Avaya bridge not available (legacyBridgeEnabled=false)',
        AdapterErrorCode.LEGACY_BRIDGE_UNAVAILABLE
      );
    }

    // 1. Bridge to Avaya
    const avayaCall = await this.avayaBridge.makeCall(from, toPhone);

    // 2. Create session
    const session: CallSession = {
      id: this.generateCallId(),
      callerDID: from,
      calleePhone: toPhone,
      protocol: 'avaya',
      e2eEncrypted: false, // ⚠️ PSTN not encrypted
      avayaCall,
      startTime: new Date()
    };

    // 3. Log to blockchain
    const event: CallEvent = {
      type: 'call_initiated',
      timestamp: new Date(),
      actorDID: from,
      contentHash: TeranodeLogger.hashContent({ from, toPhone }),
      callerDID: from,
      calleePhone: toPhone,
      protocol: 'avaya',
      e2eEncrypted: false
    };

    const txid = await this.blockchainLogger.logEvent(event);
    session.blockchainTxid = txid;

    return session;
  }

  private normalizeIncomingCall(
    event: IncomingCallEvent, 
    protocol: TelephonyProtocol
  ): CallEvent {
    return {
      type: 'call_initiated',
      timestamp: new Date(),
      actorDID: 'did:bsv:unknown' as DID, // Unknown caller (PSTN)
      contentHash: TeranodeLogger.hashContent(event),
      callerDID: 'did:bsv:unknown' as DID,
      calleePhone: event.callerPhone,
      protocol,
      e2eEncrypted: false
    };
  }

  private detectProtocol(event: IncomingCallEvent): TelephonyProtocol {
    // Detect based on source
    if (event.source === 'avaya') {
      return 'avaya';
    }
    // TODO: Add SIP detection
    return 'pstn';
  }

  private async routeToDispatcher(call: CallEvent): Promise<void> {
    // TODO: Implement dispatcher routing (via Message Box or WebSocket)
    console.log('[TelephonyAdapter] Routing call to dispatcher:', call);
  }

  // ==========================================================================
  // Protocol Negotiation
  // ==========================================================================

  private negotiateProtocol(capabilities: DIDCapabilities): TelephonyProtocol {
    // Priority order: WebRTC > SIP/TLS > Avaya
    if (capabilities.webrtc) {
      return 'webrtc';
    } else if (capabilities.sipTls) {
      return 'sip-tls';
    } else if (capabilities.avaya && this.config.features.legacyBridgeEnabled) {
      return 'avaya';
    } else {
      throw new AdapterError(
        'No compatible protocol available',
        AdapterErrorCode.PROTOCOL_NEGOTIATION_FAILED,
        { capabilities }
      );
    }
  }

  private async queryDIDCapabilities(did: DID): Promise<DIDCapabilities> {
    try {
      const response = await fetch(`${this.config.didResolverUrl}/capabilities/${did}`);
      if (!response.ok) {
        throw new Error(`DID resolver returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[TelephonyAdapter] Failed to query DID capabilities', error);
      throw new AdapterError(
        'Failed to resolve DID capabilities',
        AdapterErrorCode.DID_RESOLUTION_FAILED,
        { did, error }
      );
    }
  }

  private async logProtocolNegotiation(
    from: DID, 
    to: DID, 
    protocol: TelephonyProtocol
  ): Promise<void> {
    const event = {
      type: 'protocol_negotiated' as const,
      timestamp: new Date(),
      actorDID: from,
      contentHash: TeranodeLogger.hashContent({ from, to, protocol }),
      protocol,
      participants: [from, to]
    };

    await this.blockchainLogger.logEvent(event);
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  private isDID(value: string): boolean {
    return value.startsWith('did:bsv:');
  }

  private generateCallId(): string {
    return `call-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private async getCallSession(_callId: string): Promise<CallSession> {
    // TODO: Retrieve from session store (Redis or in-memory)
    throw new Error('Not implemented');
  }
}

// ============================================================================
// Supporting Classes (Stubs - to be implemented)
// ============================================================================

class WebRTCGateway {
  constructor(_config: AdapterConfig) {}

  async createPeerConnection(_from: DID, _to: DID): Promise<RTCPeerConnection> {
    // TODO: Implement WebRTC peer connection
    // 1. Create RTCPeerConnection with STUN/TURN servers
    // 2. Signal via Message Box (P2P signaling)
    // 3. Return connection
    throw new Error('Not implemented yet');
  }
}

class SIPTLSGateway {
  constructor(_config: AdapterConfig) {}

  async createSession(_from: DID, _to: DID): Promise<unknown> {
    // TODO: Implement SIP over TLS
    // Use library like SIP.js
    throw new Error('Not implemented yet');
  }
}

class AvayaJTAPIBridge {
  constructor(_config: { host: string; port: number; username: string; password: string }) {
    // TODO: Connect to Avaya via JTAPI (Java library)
    // Will need Java FFI or REST wrapper
  }

  async makeCall(_from: DID, _toPhone: string): Promise<unknown> {
    // TODO: Bridge call to Avaya
    // 1. Authenticate with Avaya
    // 2. Place call via JTAPI
    // 3. Return call handle
    throw new Error('Not implemented yet - requires Avaya JTAPI integration');
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

interface CallSession {
  id: string;
  callerDID: DID;
  calleeDID?: DID;
  calleePhone?: string;
  protocol: TelephonyProtocol;
  e2eEncrypted: boolean;
  blockchainTxid?: string;
  startTime: Date;
  
  // Protocol-specific handles
  peerConnection?: RTCPeerConnection;
  sipSession?: unknown;
  avayaCall?: unknown;
}

interface IncomingCallEvent {
  source: 'avaya' | 'sip' | 'pstn';
  callerPhone: string;
  calleePhone: string;
  timestamp: Date;
}

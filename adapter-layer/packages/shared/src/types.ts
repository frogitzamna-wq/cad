/**
 * Shared types for CAD Adapter Layer
 * Used across telephony, video, and messaging adapters
 */

// ============================================================================
// DID & Identity
// ============================================================================

export type DID = `did:bsv:${string}`;

export interface DIDCapabilities {
  webrtc: boolean;
  sipTls: boolean;
  avaya: boolean;
  matrix: boolean;
  messageBox: boolean;
  jitsi: boolean;
  vxg: boolean;
}

export interface DIDProfile {
  did: DID;
  name: string;
  department: string;
  rank: string;
  clearanceLevel: number;
  capabilities: DIDCapabilities;
}

// ============================================================================
// Blockchain Events (Normalized)
// ============================================================================

export type BlockchainEventType =
  // Telephony
  | 'call_initiated'
  | 'call_answered'
  | 'call_ended'
  | 'call_recorded'
  // Video
  | 'camera_accessed'
  | 'video_streamed'
  | 'evidence_recorded'
  | 'evidence_accessed'
  // Messaging
  | 'message_sent'
  | 'message_delivered'
  | 'message_read'
  // Protocol negotiation
  | 'protocol_negotiated'
  // Security
  | 'legacy_bridge_access'
  | 'access_denied';

export interface BaseBlockchainEvent {
  txid?: string; // Set after logging to blockchain
  type: BlockchainEventType;
  timestamp: Date;
  actorDID: DID;
  contentHash: string; // SHA256 hash
}

export interface CallEvent extends BaseBlockchainEvent {
  type: 'call_initiated' | 'call_answered' | 'call_ended' | 'call_recorded';
  callerDID: DID;
  calleeDID?: DID; // Optional for PSTN calls
  calleePhone?: string; // For legacy PSTN
  protocol: 'webrtc' | 'sip-tls' | 'avaya' | 'pstn';
  duration?: number; // seconds
  e2eEncrypted: boolean;
  recordingUHRP?: string; // UHRP hash if recorded
}

export interface VideoEvent extends BaseBlockchainEvent {
  type: 'camera_accessed' | 'video_streamed' | 'evidence_recorded' | 'evidence_accessed';
  cameraId?: string;
  incidentId?: string;
  uhrpHash?: string;
  protocol: 'webrtc' | 'jitsi' | 'vxg' | 'rtsp';
  viewers?: DID[];
}

export interface MessageEvent extends BaseBlockchainEvent {
  type: 'message_sent' | 'message_delivered' | 'message_read';
  from: DID;
  to: DID;
  protocol: 'message-box' | 'matrix' | 'redis-ws';
  e2eEncrypted: boolean;
}

export type NormalizedEvent = CallEvent | VideoEvent | MessageEvent | BaseBlockchainEvent;

// ============================================================================
// Protocols
// ============================================================================

export type TelephonyProtocol = 'webrtc' | 'sip-tls' | 'avaya' | 'pstn';
export type VideoProtocol = 'webrtc' | 'jitsi' | 'vxg' | 'rtsp';
export type MessagingProtocol = 'message-box' | 'matrix' | 'redis-ws';

export interface ProtocolNegotiationResult {
  protocol: TelephonyProtocol | VideoProtocol | MessagingProtocol;
  reason: string;
  fallback?: boolean;
}

// ============================================================================
// Legacy System Identifiers
// ============================================================================

export interface LegacyIdentifier {
  type: 'phone' | 'ip' | 'username' | 'camera-id' | 'vxg-id';
  value: string;
}

// ============================================================================
// Error Types
// ============================================================================

export class AdapterError extends Error {
  constructor(
    message: string,
    public code: AdapterErrorCode,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export enum AdapterErrorCode {
  // Protocol errors
  PROTOCOL_NEGOTIATION_FAILED = 'PROTOCOL_NEGOTIATION_FAILED',
  UNSUPPORTED_PROTOCOL = 'UNSUPPORTED_PROTOCOL',
  PROTOCOL_DOWNGRADE_REJECTED = 'PROTOCOL_DOWNGRADE_REJECTED',
  
  // Bridge errors
  LEGACY_BRIDGE_UNAVAILABLE = 'LEGACY_BRIDGE_UNAVAILABLE',
  AVAYA_CONNECTION_FAILED = 'AVAYA_CONNECTION_FAILED',
  VXG_PROXY_ERROR = 'VXG_PROXY_ERROR',
  REDIS_WS_ERROR = 'REDIS_WS_ERROR',
  
  // Security errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_EVENT = 'INVALID_EVENT',
  
  // Blockchain errors
  BLOCKCHAIN_LOG_FAILED = 'BLOCKCHAIN_LOG_FAILED',
  DID_RESOLUTION_FAILED = 'DID_RESOLUTION_FAILED',
  
  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  TIMEOUT = 'TIMEOUT'
}

// ============================================================================
// Configuration
// ============================================================================

export interface AdapterConfig {
  // Blockchain
  teranodeUrl: string;
  walletPrivateKey: string;
  
  // DID services
  didResolverUrl: string;
  
  // UHRP
  uhrpServiceUrl: string;
  
  // Legacy bridges (optional - only if bridge enabled)
  avaya?: {
    host: string;
    port: number;
    username: string;
    password: string;
  };
  
  vxg?: {
    apiUrl: string;
    apiKey: string;
  };
  
  redis?: {
    host: string;
    port: number;
    password?: string;
  };
  
  // Modern protocols
  stunServers: string[];
  turnServers?: Array<{
    urls: string;
    username: string;
    credential: string;
  }>;
  
  matrixHomeserver?: string;
  jitsiDomain?: string;
  
  // Security
  rateLimits: {
    callsPerMinute: number;
    messagesPerMinute: number;
    videoStreamsPerMinute: number;
  };
  
  // Feature flags
  features: {
    legacyBridgeEnabled: boolean;
    e2eEncryptionRequired: boolean;
    blockchainLoggingEnabled: boolean;
  };
}

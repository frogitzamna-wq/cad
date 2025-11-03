import type {
  DID,
  VideoEvent,
  VideoProtocol,
  AdapterConfig,
  DIDCapabilities
} from '@cad/shared/types';
import { AdapterError, AdapterErrorCode } from '@cad/shared/types';
import { TeranodeLogger } from '@cad/shared/blockchain-logger';

/**
 * VideoAdapter - Handles video streaming and evidence recording
 * 
 * Protocols supported (priority order):
 * 1. WebRTC P2P (modern, low latency)
 * 2. Jitsi Meet (conferencing)
 * 3. VXG Video (legacy proxy, 26 servers)
 * 4. RTSP (direct camera access)
 * 
 * Design:
 * - Dual-write: VXG + UHRP (transition phase)
 * - Historical migration: 500TB VXG → UHRP
 * - sCrypt access control for evidence
 * - All evidence anchored to blockchain
 */
export class VideoAdapter {
  private config: AdapterConfig;
  private blockchainLogger: TeranodeLogger;
  
  // Modern protocols
  private webrtcStreaming?: WebRTCStreamingGateway;
  private jitsiGateway?: JitsiMeetGateway;
  
  // Legacy proxy (VXG - 26 servers)
  private vxgProxy?: VXGVideoProxy;
  
  // UHRP client (content-addressed storage)
  private uhrpClient?: UHRPClient;
  
  constructor(config: AdapterConfig) {
    this.config = config;
    this.blockchainLogger = new TeranodeLogger(config);
    
    // Initialize modern gateways
    this.webrtcStreaming = new WebRTCStreamingGateway(config);
    this.jitsiGateway = new JitsiMeetGateway(config);
    
    // Initialize UHRP client
    this.uhrpClient = new UHRPClient(config.uhrpServiceUrl);
    
    // Initialize legacy proxy if enabled
    if (config.features.legacyBridgeEnabled && config.vxg) {
      this.vxgProxy = new VXGVideoProxy(config.vxg);
    }
  }

  /**
   * Stream camera to viewer (live)
   */
  async streamCamera(
    cameraId: string,
    viewer: DID,
    options?: StreamOptions
  ): Promise<VideoStream> {
    console.log(`[VideoAdapter] Streaming camera ${cameraId} to ${viewer}`);

    try {
      // 1. Get camera metadata
      const camera = await this.getCameraMetadata(cameraId);

      // 2. Check access authorization (sCrypt if blockchain-based)
      const authorized = await this.checkCameraAccess(camera, viewer);
      if (!authorized) {
        await this.logAccessDenied(camera, viewer);
        throw new AdapterError(
          'Unauthorized camera access',
          AdapterErrorCode.UNAUTHORIZED,
          { cameraId, viewer }
        );
      }

      // 3. Query viewer capabilities
      const capabilities = await this.queryDIDCapabilities(viewer);

      // 4. Negotiate protocol
      const protocol = this.negotiateStreamProtocol(capabilities);

      console.log(`[VideoAdapter] Negotiated protocol: ${protocol}`);

      // 5. Create stream based on protocol
      let stream: VideoStream;

      switch (protocol) {
        case 'webrtc':
          stream = await this.streamViaWebRTC(camera, viewer, options);
          break;
        case 'jitsi':
          stream = await this.streamViaJitsi(camera, viewer, options);
          break;
        case 'vxg':
          stream = await this.streamViaVXG(camera, viewer, options);
          break;
        default:
          throw new AdapterError(
            `Unsupported protocol: ${protocol}`,
            AdapterErrorCode.UNSUPPORTED_PROTOCOL
          );
      }

      // 6. Log to blockchain
      const event: VideoEvent = {
        type: 'camera_accessed',
        timestamp: new Date(),
        actorDID: viewer,
        contentHash: TeranodeLogger.hashContent({ cameraId, viewer }),
        cameraId,
        protocol,
        viewers: [viewer]
      };

      const txid = await this.blockchainLogger.logEvent(event);
      stream.blockchainTxid = txid;

      return stream;
    } catch (error) {
      console.error('[VideoAdapter] Camera streaming failed', error);
      throw error;
    }
  }

  /**
   * Record incident evidence (camera streams)
   * Dual-write: VXG + UHRP during transition
   */
  async recordIncident(
    incidentId: string,
    streams: CameraStream[],
    options?: RecordingOptions
  ): Promise<EvidenceRecording> {
    console.log(`[VideoAdapter] Recording incident ${incidentId} (${streams.length} cameras)`);

    try {
      const recordings: RecordingResult[] = [];

      // Record each camera stream
      for (const stream of streams) {
        // 1. Record to VXG (legacy - if enabled)
        let vxgRecording: VXGRecording | undefined;
        if (this.vxgProxy && this.config.features.legacyBridgeEnabled) {
          vxgRecording = await this.vxgProxy.record(stream, options);
          console.log(`[VideoAdapter] VXG recording: ${vxgRecording.id}`);
        }

        // 2. Get recording data (from VXG or direct RTSP)
        const recordingData = vxgRecording
          ? await this.vxgProxy!.download(vxgRecording.id)
          : await this.recordDirectRTSP(stream, options);

        // 3. Upload to UHRP (content-addressed, immutable)
        if (!this.uhrpClient) {
          throw new AdapterError(
            'UHRP client not initialized',
            AdapterErrorCode.INTERNAL_ERROR
          );
        }

        const uhrpHash = await this.uhrpClient.upload(recordingData, {
          contentType: 'video/mp4',
          metadata: {
            incidentId,
            cameraId: stream.cameraId,
            timestamp: new Date().toISOString()
          }
        });

        console.log(`[VideoAdapter] UHRP upload: ${uhrpHash}`);

        recordings.push({
          cameraId: stream.cameraId,
          uhrpHash,
          vxgId: vxgRecording?.id,
          duration: options?.duration || 0,
          size: recordingData.byteLength
        });
      }

      // 4. Create sCrypt access control contract (3-of-5 multisig)
      const accessContract = await this.createEvidenceContract({
        incidentId,
        recordings,
        requiredSignatures: 3,
        authorizedPubkeys: this.getAuthorizedPubkeys(incidentId)
      });

      // 5. Anchor to blockchain
      const event: VideoEvent = {
        type: 'evidence_recorded',
        timestamp: new Date(),
        actorDID: 'did:bsv:system' as DID, // System-initiated
        contentHash: TeranodeLogger.hashContent({ incidentId, recordings }),
        incidentId,
        uhrpHash: recordings[0].uhrpHash, // Primary recording
        protocol: 'vxg', // Source protocol
        viewers: []
      };

      const txid = await this.blockchainLogger.logEvent(event);

      return {
        incidentId,
        recordings,
        accessContract,
        blockchainTxid: txid
      };
    } catch (error) {
      console.error('[VideoAdapter] Recording failed', error);
      throw error;
    }
  }

  /**
   * Get incident recording (from UHRP or VXG fallback)
   */
  async getRecording(
    incidentId: string,
    viewer: DID
  ): Promise<VideoStream> {
    console.log(`[VideoAdapter] Retrieving recording for incident ${incidentId}`);

    try {
      // 1. Query blockchain for evidence event
      const event = await this.queryEvidenceEvent(incidentId);

      if (!event) {
        throw new AdapterError(
          'Incident recording not found',
          AdapterErrorCode.INTERNAL_ERROR,
          { incidentId }
        );
      }

      // 2. Check access authorization (sCrypt contract)
      const authorized = await this.checkEvidenceAccess(event, viewer);
      if (!authorized) {
        await this.logAccessDenied({ incidentId }, viewer);
        throw new AdapterError(
          'Unauthorized evidence access',
          AdapterErrorCode.UNAUTHORIZED,
          { incidentId, viewer }
        );
      }

      // 3. Get stream URL (UHRP or VXG fallback)
      let streamUrl: string;

      if (event.uhrpHash) {
        // Modern: Stream from UHRP
        streamUrl = await this.uhrpClient!.getStreamUrl(event.uhrpHash);
        console.log('[VideoAdapter] Streaming from UHRP');
      } else if (event.vxgId && this.vxgProxy) {
        // Fallback: Stream from VXG (not migrated yet)
        streamUrl = await this.vxgProxy.getStreamUrl(event.vxgId);
        console.log('[VideoAdapter] Streaming from VXG (fallback)');
      } else {
        throw new AdapterError(
          'No stream URL available',
          AdapterErrorCode.INTERNAL_ERROR
        );
      }

      // 4. Log access to blockchain
      const accessEvent: VideoEvent = {
        type: 'evidence_accessed',
        timestamp: new Date(),
        actorDID: viewer,
        contentHash: TeranodeLogger.hashContent({ incidentId, viewer }),
        incidentId,
        uhrpHash: event.uhrpHash,
        protocol: event.uhrpHash ? 'uhrp' : 'vxg' as VideoProtocol,
        viewers: [viewer]
      };

      const txid = await this.blockchainLogger.logEvent(accessEvent);

      return {
        url: streamUrl,
        protocol: event.uhrpHash ? 'uhrp' : 'vxg' as VideoProtocol,
        blockchainTxid: txid
      };
    } catch (error) {
      console.error('[VideoAdapter] Failed to retrieve recording', error);
      throw error;
    }
  }

  /**
   * Create video conference room (Jitsi)
   */
  async createConferenceRoom(
    incidentId: string,
    participants: DID[],
    options?: ConferenceOptions
  ): Promise<ConferenceRoom> {
    console.log(`[VideoAdapter] Creating conference for incident ${incidentId}`);

    if (!this.jitsiGateway) {
      throw new AdapterError(
        'Jitsi gateway not initialized',
        AdapterErrorCode.INTERNAL_ERROR
      );
    }

    // 1. Create ephemeral Jitsi room
    const room = await this.jitsiGateway.createRoom({
      roomName: `incident-${incidentId}`,
      participants,
      e2eEncryption: true,
      ...options
    });

    // 2. Log to blockchain
    const event: VideoEvent = {
      type: 'video_streamed',
      timestamp: new Date(),
      actorDID: participants[0], // Initiator
      contentHash: TeranodeLogger.hashContent({ incidentId, participants }),
      incidentId,
      protocol: 'jitsi',
      viewers: participants
    };

    const txid = await this.blockchainLogger.logEvent(event);
    room.blockchainTxid = txid;

    return room;
  }

  // ==========================================================================
  // Private Methods - Protocol Selection
  // ==========================================================================

  private negotiateStreamProtocol(capabilities: DIDCapabilities): VideoProtocol {
    // Priority: WebRTC > Jitsi > VXG
    if (capabilities.webrtc) {
      return 'webrtc';
    } else if (capabilities.jitsi) {
      return 'jitsi';
    } else if (capabilities.vxg && this.config.features.legacyBridgeEnabled) {
      return 'vxg';
    } else {
      throw new AdapterError(
        'No compatible video protocol available',
        AdapterErrorCode.PROTOCOL_NEGOTIATION_FAILED,
        { capabilities }
      );
    }
  }

  // ==========================================================================
  // Private Methods - Streaming
  // ==========================================================================

  private async streamViaWebRTC(
    camera: CameraMetadata,
    _viewer: DID,
    _options?: StreamOptions
  ): Promise<VideoStream> {
    if (!this.webrtcStreaming) {
      throw new AdapterError(
        'WebRTC streaming not initialized',
        AdapterErrorCode.INTERNAL_ERROR
      );
    }

    // TODO: Implement WebRTC camera streaming
    // 1. Get RTSP URL from camera
    // 2. Transcode RTSP → WebRTC
    // 3. Return stream URL

    return {
      url: `webrtc://${camera.ip}:${camera.port}`,
      protocol: 'webrtc'
    };
  }

  private async streamViaJitsi(
    camera: CameraMetadata,
    _viewer: DID,
    _options?: StreamOptions
  ): Promise<VideoStream> {
    if (!this.jitsiGateway) {
      throw new AdapterError(
        'Jitsi gateway not initialized',
        AdapterErrorCode.INTERNAL_ERROR
      );
    }

    // TODO: Implement Jitsi camera streaming
    return {
      url: `jitsi://${camera.id}`,
      protocol: 'jitsi'
    };
  }

  private async streamViaVXG(
    camera: CameraMetadata,
    _viewer: DID,
    _options?: StreamOptions
  ): Promise<VideoStream> {
    if (!this.vxgProxy) {
      throw new AdapterError(
        'VXG proxy not available',
        AdapterErrorCode.LEGACY_BRIDGE_UNAVAILABLE
      );
    }

    // Proxy through VXG (26 servers)
    const vxgStream = await this.vxgProxy.getStreamUrl(camera.vxgId!);

    return {
      url: vxgStream,
      protocol: 'vxg'
    };
  }

  private async recordDirectRTSP(
    stream: CameraStream,
    _options?: RecordingOptions
  ): Promise<ArrayBuffer> {
    // TODO: Implement direct RTSP recording
    // 1. Connect to camera RTSP stream
    // 2. Record for specified duration
    // 3. Return video data (H.264/MP4)

    console.log(`[VideoAdapter] Recording direct RTSP for camera ${stream.cameraId}`);
    return new ArrayBuffer(0); // Placeholder
  }

  // ==========================================================================
  // Private Methods - Access Control
  // ==========================================================================

  private async checkCameraAccess(
    camera: CameraMetadata,
    viewer: DID
  ): Promise<boolean> {
    // TODO: Implement sCrypt access control check
    // Query blockchain for camera permissions
    console.log(`[VideoAdapter] Checking camera access: ${camera.id} for ${viewer}`);
    return true; // Placeholder
  }

  private async checkEvidenceAccess(
    event: VideoEvent,
    viewer: DID
  ): Promise<boolean> {
    // TODO: Implement sCrypt contract verification
    // Check if viewer has required signatures (3-of-5)
    console.log(`[VideoAdapter] Checking evidence access for ${viewer}`);
    return true; // Placeholder
  }

  private async createEvidenceContract(params: {
    incidentId: string;
    recordings: RecordingResult[];
    requiredSignatures: number;
    authorizedPubkeys: string[];
  }): Promise<string> {
    // TODO: Deploy sCrypt multisig contract
    // Require 3-of-5 signatures: supervisor, chief, DA, judge, IA
    console.log(`[VideoAdapter] Creating evidence contract for incident ${params.incidentId}`);
    return 'mock-contract-txid'; // Placeholder
  }

  private getAuthorizedPubkeys(_incidentId: string): string[] {
    // TODO: Get authorized pubkeys for incident
    // Query from DID registry or config
    return [
      'pubkey-supervisor',
      'pubkey-chief',
      'pubkey-da',
      'pubkey-judge',
      'pubkey-ia'
    ];
  }

  private async logAccessDenied(
    resource: { cameraId?: string; incidentId?: string },
    viewer: DID
  ): Promise<void> {
    const event = {
      type: 'access_denied' as const,
      timestamp: new Date(),
      actorDID: viewer,
      contentHash: TeranodeLogger.hashContent({ resource, viewer }),
      resource
    };

    await this.blockchainLogger.logEvent(event);
  }

  // ==========================================================================
  // Private Methods - Queries
  // ==========================================================================

  private async getCameraMetadata(cameraId: string): Promise<CameraMetadata> {
    // TODO: Query camera metadata from database or blockchain
    return {
      id: cameraId,
      ip: '10.10.11.20',
      port: 554,
      vxgId: `vxg-${cameraId}`
    };
  }

  private async queryDIDCapabilities(did: DID): Promise<DIDCapabilities> {
    try {
      const response = await fetch(`${this.config.didResolverUrl}/capabilities/${did}`);
      if (!response.ok) {
        throw new Error(`DID resolver returned ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[VideoAdapter] Failed to query DID capabilities', error);
      throw new AdapterError(
        'Failed to resolve DID capabilities',
        AdapterErrorCode.DID_RESOLUTION_FAILED,
        { did, error }
      );
    }
  }

  private async queryEvidenceEvent(incidentId: string): Promise<VideoEvent | null> {
    // TODO: Query blockchain for evidence_recorded event
    console.log(`[VideoAdapter] Querying evidence event for incident ${incidentId}`);
    return null; // Placeholder
  }
}

// ============================================================================
// Supporting Classes (Stubs - to be implemented)
// ============================================================================

class WebRTCStreamingGateway {
  constructor(_config: AdapterConfig) {}
  
  // TODO: Implement WebRTC camera streaming
}

class JitsiMeetGateway {
  constructor(_config: AdapterConfig) {}

  async createRoom(_params: {
    roomName: string;
    participants: DID[];
    e2eEncryption: boolean;
  }): Promise<ConferenceRoom> {
    // TODO: Create Jitsi room via API
    // Use Jitsi REST API or prosody XMPP
    throw new Error('Not implemented yet');
  }
}

class VXGVideoProxy {
  private apiUrl: string;
  private apiKey: string;

  constructor(config: { apiUrl: string; apiKey: string }) {
    this.apiUrl = config.apiUrl;
    this.apiKey = config.apiKey;
  }

  async record(_stream: CameraStream, _options?: RecordingOptions): Promise<VXGRecording> {
    // TODO: Start recording via VXG API
    // POST /api/v3/cameras/{id}/recording/start
    throw new Error('Not implemented yet - requires VXG API');
  }

  async download(_recordingId: string): Promise<ArrayBuffer> {
    // TODO: Download recording from VXG
    // GET /api/v3/recordings/{id}/download
    throw new Error('Not implemented yet');
  }

  async getStreamUrl(_cameraIdOrVxgId: string): Promise<string> {
    // TODO: Get HLS/DASH stream URL from VXG
    // GET /api/v3/cameras/{id}/live/urls
    return `https://vxg-proxy.example.com/stream/${_cameraIdOrVxgId}`;
  }
}

class UHRPClient {
  private serviceUrl: string;

  constructor(serviceUrl: string) {
    this.serviceUrl = serviceUrl;
  }

  async upload(
    data: ArrayBuffer,
    metadata?: { contentType?: string; metadata?: Record<string, string> }
  ): Promise<string> {
    // TODO: Upload to UHRP service
    // Returns content-addressed hash
    console.log(`[UHRPClient] Uploading ${data.byteLength} bytes to ${this.serviceUrl}`);
    const hash = 'mock-uhrp-hash-' + Date.now();
    return hash;
  }

  async getStreamUrl(hash: string): Promise<string> {
    // TODO: Get UHRP stream URL
    // UHRP resolves hash → CDN URL
    return `${this.serviceUrl}/stream/${hash}`;
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

interface CameraMetadata {
  id: string;
  ip: string;
  port: number;
  vxgId?: string;
}

interface CameraStream {
  cameraId: string;
  rtspUrl?: string;
}

interface StreamOptions {
  quality?: 'low' | 'medium' | 'high';
  duration?: number; // seconds
}

interface RecordingOptions {
  duration?: number; // seconds
  quality?: 'low' | 'medium' | 'high';
}

interface VideoStream {
  url: string;
  protocol: VideoProtocol;
  blockchainTxid?: string;
}

interface VXGRecording {
  id: string;
  cameraId: string;
  duration: number;
}

interface RecordingResult {
  cameraId: string;
  uhrpHash: string;
  vxgId?: string;
  duration: number;
  size: number;
}

interface EvidenceRecording {
  incidentId: string;
  recordings: RecordingResult[];
  accessContract: string; // sCrypt contract txid
  blockchainTxid: string;
}

interface ConferenceRoom {
  roomUrl: string;
  roomName: string;
  participants: DID[];
  blockchainTxid?: string;
}

interface ConferenceOptions {
  maxParticipants?: number;
  recordingEnabled?: boolean;
}

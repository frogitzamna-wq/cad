import * as bsv from 'bsv';
import { EventEmitter } from 'events';

/**
 * Message types for CAD P2P communication
 */
export enum MessageType {
  DISPATCH_NOTIFICATION = 'DISPATCH_NOTIFICATION',
  STATUS_UPDATE = 'STATUS_UPDATE',
  LOCATION_UPDATE = 'LOCATION_UPDATE',
  FIELD_NOTE = 'FIELD_NOTE',
  BACKUP_REQUEST = 'BACKUP_REQUEST',
  ACKNOWLEDGE = 'ACK',
  EMERGENCY_ALERT = 'EMERGENCY_ALERT'
}

export interface CADMessage {
  type: MessageType;
  from: string; // Sender public key
  to: string; // Recipient public key
  timestamp: number;
  payload: any;
  signature?: string;
  encrypted: boolean;
}

export interface DispatchNotification {
  incidentId: string;
  location: { lat: number; lng: number };
  priority: number;
  description: string;
  estimatedArrival?: number;
}

export interface StatusUpdate {
  resourceId: string;
  status: number;
  incidentId?: string;
  location?: { lat: number; lng: number };
}

/**
 * MessageBoxClient
 * 
 * P2P encrypted messaging for dispatcher ↔ field unit communication
 * Uses BSV Message Box protocol for decentralized messaging
 */
export class MessageBoxClient extends EventEmitter {
  private privateKey: bsv.PrivateKey;
  private publicKey: bsv.PublicKey;
  private messageBoxUrl: string;
  private pollInterval: number = 5000; // 5 seconds
  private isPolling: boolean = false;
  private lastMessageId: string = '';

  constructor(
    privateKey: bsv.PrivateKey,
    messageBoxUrl: string = 'https://messagebox.bsvapi.net'
  ) {
    super();
    this.privateKey = privateKey;
    this.publicKey = privateKey.toPublicKey();
    this.messageBoxUrl = messageBoxUrl;
  }

  /**
   * Start listening for incoming messages
   */
  async startListening(): Promise<void> {
    if (this.isPolling) {
      console.log('Already listening');
      return;
    }

    this.isPolling = true;
    console.log(`📬 Message Box listening on ${this.publicKey.toString().substring(0, 20)}...`);

    while (this.isPolling) {
      try {
        await this.pollMessages();
        await this.sleep(this.pollInterval);
      } catch (error) {
        console.error('Polling error:', error);
        await this.sleep(this.pollInterval * 2);
      }
    }
  }

  /**
   * Stop listening
   */
  stopListening(): void {
    this.isPolling = false;
    console.log('📪 Message Box stopped listening');
  }

  /**
   * Send dispatch notification to field unit
   */
  async sendDispatchNotification(
    unitPubKey: string,
    notification: DispatchNotification
  ): Promise<string> {
    return await this.sendMessage({
      type: MessageType.DISPATCH_NOTIFICATION,
      from: this.publicKey.toString(),
      to: unitPubKey,
      timestamp: Date.now(),
      payload: notification,
      encrypted: true
    });
  }

  /**
   * Send status update from field unit to dispatcher
   */
  async sendStatusUpdate(
    dispatcherPubKey: string,
    update: StatusUpdate
  ): Promise<string> {
    return await this.sendMessage({
      type: MessageType.STATUS_UPDATE,
      from: this.publicKey.toString(),
      to: dispatcherPubKey,
      timestamp: Date.now(),
      payload: update,
      encrypted: false // Status updates can be public
    });
  }

  /**
   * Send location update (GPS tracking)
   */
  async sendLocationUpdate(
    dispatcherPubKey: string,
    location: { lat: number; lng: number; timestamp: number }
  ): Promise<string> {
    return await this.sendMessage({
      type: MessageType.LOCATION_UPDATE,
      from: this.publicKey.toString(),
      to: dispatcherPubKey,
      timestamp: Date.now(),
      payload: location,
      encrypted: false
    });
  }

  /**
   * Send emergency alert (panic button)
   */
  async sendEmergencyAlert(
    dispatcherPubKey: string,
    location: { lat: number; lng: number }
  ): Promise<string> {
    return await this.sendMessage({
      type: MessageType.EMERGENCY_ALERT,
      from: this.publicKey.toString(),
      to: dispatcherPubKey,
      timestamp: Date.now(),
      payload: { location, urgent: true },
      encrypted: false
    });
  }

  /**
   * Send field note
   */
  async sendFieldNote(
    recipientPubKey: string,
    note: { incidentId: string; content: string }
  ): Promise<string> {
    return await this.sendMessage({
      type: MessageType.FIELD_NOTE,
      from: this.publicKey.toString(),
      to: recipientPubKey,
      timestamp: Date.now(),
      payload: note,
      encrypted: true
    });
  }

  /**
   * Send backup request
   */
  async sendBackupRequest(
    dispatcherPubKey: string,
    request: { incidentId: string; urgency: 'IMMEDIATE' | 'URGENT' | 'ROUTINE' }
  ): Promise<string> {
    return await this.sendMessage({
      type: MessageType.BACKUP_REQUEST,
      from: this.publicKey.toString(),
      to: dispatcherPubKey,
      timestamp: Date.now(),
      payload: request,
      encrypted: false
    });
  }

  /**
   * Generic send message
   */
  private async sendMessage(message: CADMessage): Promise<string> {
    try {
      // Sign message
      const messageStr = JSON.stringify({
        type: message.type,
        payload: message.payload,
        timestamp: message.timestamp
      });
      
      const signature = this.signMessage(messageStr);
      message.signature = signature;

      // Encrypt if needed
      let content = messageStr;
      if (message.encrypted) {
        content = await this.encryptMessage(messageStr, message.to);
      }

      // Send to Message Box
      const response = await fetch(`${this.messageBoxUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: message.to,
          from: message.from,
          content,
          encrypted: message.encrypted,
          signature
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const result = await response.json() as any;
      console.log(`✉️  Message sent: ${message.type} → ${message.to.substring(0, 20)}...`);
      
      return result.messageId || '';
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  /**
   * Poll for new messages
   */
  private async pollMessages(): Promise<void> {
    try {
      const response = await fetch(
        `${this.messageBoxUrl}/messages/${this.publicKey.toString()}?since=${this.lastMessageId}`
      );

      if (!response.ok) {
        return;
      }

      const messages = await response.json() as any[];

      for (const msg of messages) {
        await this.processMessage(msg);
        this.lastMessageId = msg.id;
      }
    } catch (error) {
      console.error('Failed to poll messages:', error);
    }
  }

  /**
   * Process incoming message
   */
  private async processMessage(msg: any): Promise<void> {
    try {
      let content = msg.content;

      // Decrypt if encrypted
      if (msg.encrypted) {
        content = await this.decryptMessage(content, msg.from);
      }

      // Parse message
      const message = JSON.parse(content);

      // Verify signature
      if (msg.signature) {
        const valid = this.verifySignature(content, msg.signature, msg.from);
        if (!valid) {
          console.warn('Invalid signature for message:', msg.id);
          return;
        }
      }

      // Emit event based on type
      this.emit('message', {
        type: message.type,
        from: msg.from,
        payload: message.payload,
        timestamp: message.timestamp
      });

      this.emit(message.type, {
        from: msg.from,
        payload: message.payload,
        timestamp: message.timestamp
      });

      console.log(`📨 Message received: ${message.type} from ${msg.from.substring(0, 20)}...`);
    } catch (error) {
      console.error('Failed to process message:', error);
    }
  }

  /**
   * Sign message with private key
   */
  private signMessage(message: string): string {
    const hash = bsv.crypto.Hash.sha256(Buffer.from(message));
    const signature = bsv.crypto.ECDSA.sign(hash, this.privateKey);
    return signature.toString('hex');
  }

  /**
   * Verify message signature
   */
  private verifySignature(message: string, signature: string, senderPubKey: string): boolean {
    try {
      const hash = bsv.crypto.Hash.sha256(Buffer.from(message));
      const sig = Buffer.from(signature, 'hex');
      const pubKey = bsv.PublicKey.fromString(senderPubKey);
      return bsv.crypto.ECDSA.verify(hash, sig, pubKey);
    } catch {
      return false;
    }
  }

  /**
   * Encrypt message for recipient (ECIES)
   */
  private async encryptMessage(message: string, recipientPubKey: string): Promise<string> {
    try {
      const pubKey = bsv.PublicKey.fromString(recipientPubKey);
      const encrypted = bsv.crypto.ECIES.encrypt(
        Buffer.from(message),
        pubKey,
        this.privateKey
      );
      return encrypted.toString('base64');
    } catch (error) {
      console.error('Encryption failed:', error);
      return message; // Fallback to unencrypted
    }
  }

  /**
   * Decrypt message from sender (ECIES)
   */
  private async decryptMessage(encrypted: string, senderPubKey: string): Promise<string> {
    try {
      const buffer = Buffer.from(encrypted, 'base64');
      const decrypted = bsv.crypto.ECIES.decrypt(
        buffer,
        this.privateKey
      );
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('Decryption failed:', error);
      return encrypted; // Return as-is if decryption fails
    }
  }

  /**
   * Get own public key
   */
  getPublicKey(): string {
    return this.publicKey.toString();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Push Notification Service
 * Sends real-time notifications for critical events
 */
export class PushNotificationService {
  constructor(private messageBox: MessageBoxClient) {
    this.setupListeners();
  }

  private setupListeners(): void {
    // Emergency alerts get immediate notification
    this.messageBox.on(MessageType.EMERGENCY_ALERT, (msg) => {
      this.sendPushNotification({
        title: '🚨 EMERGENCY ALERT',
        body: `Officer needs immediate backup at ${msg.payload.location.lat}, ${msg.payload.location.lng}`,
        priority: 'high',
        sound: 'emergency.wav'
      });
    });

    // Dispatch notifications
    this.messageBox.on(MessageType.DISPATCH_NOTIFICATION, (msg) => {
      this.sendPushNotification({
        title: '🚓 New Dispatch',
        body: `Priority ${msg.payload.priority}: ${msg.payload.description}`,
        priority: 'normal',
        data: msg.payload
      });
    });

    // Backup requests
    this.messageBox.on(MessageType.BACKUP_REQUEST, (msg) => {
      this.sendPushNotification({
        title: '🆘 Backup Requested',
        body: `Urgency: ${msg.payload.urgency}`,
        priority: 'high'
      });
    });
  }

  private sendPushNotification(notification: {
    title: string;
    body: string;
    priority: 'high' | 'normal';
    sound?: string;
    data?: any;
  }): void {
    // In production, integrate with Firebase Cloud Messaging, APNs, etc.
    console.log('🔔 PUSH NOTIFICATION:', notification);
    
    // Browser notification API
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.body,
          icon: '/icon-192.png',
          badge: '/badge-72.png',
          tag: 'cad-notification',
          requireInteraction: notification.priority === 'high'
        });
      }
    }
  }
}

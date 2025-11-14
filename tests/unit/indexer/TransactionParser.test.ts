import { TransactionParser } from '../../../src/indexer/parsers/TransactionParser';
import * as bsv from 'bsv';

describe('TransactionParser', () => {
  let parser: TransactionParser;

  beforeEach(() => {
    parser = new TransactionParser();
  });

  describe('parseTransaction', () => {
    it('should parse INCIDENT_CREATED event', () => {
      const opReturnData = {
        type: 'INCIDENT_CREATED',
        incidentId: 'INC-001',
        location: { lat: 25.6866, lng: -100.3161 },
        priority: 1,
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed).toBeDefined();
      expect(parsed?.eventType).toBe('INCIDENT_CREATED');
      expect(parsed?.data.incidentId).toBe('INC-001');
      expect(parsed?.data.location).toEqual(opReturnData.location);
    });

    it('should parse RESOURCE_ASSIGNED event', () => {
      const opReturnData = {
        type: 'RESOURCE_ASSIGNED',
        incidentId: 'INC-001',
        resourceId: 'UNIT-42',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('RESOURCE_ASSIGNED');
      expect(parsed?.data.resourceId).toBe('UNIT-42');
    });

    it('should parse INCIDENT_UPDATED event', () => {
      const opReturnData = {
        type: 'INCIDENT_UPDATED',
        incidentId: 'INC-001',
        status: 2,
        updates: { notes: 'En escena' },
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('INCIDENT_UPDATED');
      expect(parsed?.data.status).toBe(2);
    });

    it('should parse INCIDENT_CLOSED event', () => {
      const opReturnData = {
        type: 'INCIDENT_CLOSED',
        incidentId: 'INC-001',
        resolution: 'Resolved',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('INCIDENT_CLOSED');
      expect(parsed?.data.resolution).toBe('Resolved');
    });

    it('should parse RESOURCE_STATUS_UPDATE event', () => {
      const opReturnData = {
        type: 'RESOURCE_STATUS_UPDATE',
        resourceId: 'UNIT-42',
        status: 1,
        location: { lat: 25.6866, lng: -100.3161 },
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('RESOURCE_STATUS_UPDATE');
      expect(parsed?.data.status).toBe(1);
    });

    it('should parse DISPATCH_CREATED event', () => {
      const opReturnData = {
        type: 'DISPATCH_CREATED',
        dispatchId: 'DISP-001',
        incidentId: 'INC-001',
        resourceId: 'UNIT-42',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('DISPATCH_CREATED');
      expect(parsed?.data.dispatchId).toBe('DISP-001');
    });

    it('should parse AGENCY_REGISTERED event', () => {
      const opReturnData = {
        type: 'AGENCY_REGISTERED',
        agencyId: 'AGENCY-001',
        name: 'Metro Police',
        jurisdiction: { type: 'Polygon', coordinates: [] },
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('AGENCY_REGISTERED');
      expect(parsed?.data.agencyId).toBe('AGENCY-001');
    });

    it('should parse JURISDICTION_TRANSFER event', () => {
      const opReturnData = {
        type: 'JURISDICTION_TRANSFER',
        incidentId: 'INC-001',
        fromAgency: 'AGENCY-001',
        toAgency: 'AGENCY-002',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('JURISDICTION_TRANSFER');
      expect(parsed?.data.fromAgency).toBe('AGENCY-001');
      expect(parsed?.data.toAgency).toBe('AGENCY-002');
    });

    it('should parse MUTUAL_AID_REQUEST event', () => {
      const opReturnData = {
        type: 'MUTUAL_AID_REQUEST',
        requestId: 'AID-001',
        requestingAgency: 'AGENCY-001',
        resourceType: 'patrol',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('MUTUAL_AID_REQUEST');
      expect(parsed?.data.requestId).toBe('AID-001');
    });

    it('should parse EVIDENCE_UPLOADED event', () => {
      const opReturnData = {
        type: 'EVIDENCE_UPLOADED',
        evidenceId: 'EVD-001',
        incidentId: 'INC-001',
        uhrpHash: 'abc123',
        evidenceType: 'BODYCAM',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('EVIDENCE_UPLOADED');
      expect(parsed?.data.uhrpHash).toBe('abc123');
    });

    it('should parse DID_ISSUED event', () => {
      const opReturnData = {
        type: 'DID_ISSUED',
        did: 'did:bsv:abc123',
        role: 'OFFICER',
        badgeNumber: 'P-12345',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('DID_ISSUED');
      expect(parsed?.data.did).toBe('did:bsv:abc123');
    });

    it('should parse CREDENTIAL_ISSUED event', () => {
      const opReturnData = {
        type: 'CREDENTIAL_ISSUED',
        credentialId: 'urn:uuid:123',
        subjectDID: 'did:bsv:abc123',
        credentialType: 'RoleCredential',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('CREDENTIAL_ISSUED');
      expect(parsed?.data.credentialId).toBe('urn:uuid:123');
    });

    it('should parse MESSAGE_SENT event', () => {
      const opReturnData = {
        type: 'MESSAGE_SENT',
        messageId: 'MSG-001',
        from: 'pubkey1',
        to: 'pubkey2',
        messageType: 'DISPATCH_NOTIFICATION',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('MESSAGE_SENT');
      expect(parsed?.data.messageType).toBe('DISPATCH_NOTIFICATION');
    });

    it('should parse INCIDENT_RELATED event', () => {
      const opReturnData = {
        type: 'INCIDENT_RELATED',
        sourceIncidentId: 'INC-001',
        targetIncidentId: 'INC-002',
        relationType: 'DUPLICATE',
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('INCIDENT_RELATED');
      expect(parsed?.data.relationType).toBe('DUPLICATE');
    });

    it('should parse OFFICER_LOCATION_UPDATE event', () => {
      const opReturnData = {
        type: 'OFFICER_LOCATION_UPDATE',
        officerId: 'UNIT-42',
        location: { lat: 25.6866, lng: -100.3161 },
        heading: 45,
        speed: 60,
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('OFFICER_LOCATION_UPDATE');
      expect(parsed?.data.heading).toBe(45);
      expect(parsed?.data.speed).toBe(60);
    });

    it('should parse EMERGENCY_ALERT event', () => {
      const opReturnData = {
        type: 'EMERGENCY_ALERT',
        officerId: 'UNIT-42',
        alertType: 'OFFICER_DOWN',
        location: { lat: 25.6866, lng: -100.3161 },
        timestamp: Date.now()
      };

      const tx = createMockTransaction(opReturnData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed?.eventType).toBe('EMERGENCY_ALERT');
      expect(parsed?.data.alertType).toBe('OFFICER_DOWN');
    });

    it('should return null for transaction without OP_RETURN', () => {
      const tx = new bsv.Transaction();
      const parsed = parser.parseTransaction(tx);

      expect(parsed).toBeNull();
    });

    it('should return null for invalid JSON in OP_RETURN', () => {
      const tx = new bsv.Transaction();
      const invalidData = Buffer.from('invalid json {]');
      const script = new bsv.Script()
        .add(bsv.Opcode.OP_RETURN)
        .add(invalidData);

      tx.addOutput(
        new bsv.Transaction.Output({
          script,
          satoshis: 0
        })
      );

      const parsed = parser.parseTransaction(tx);

      expect(parsed).toBeNull();
    });

    it('should handle large OP_RETURN data', () => {
      const largeData = {
        type: 'INCIDENT_CREATED',
        incidentId: 'INC-001',
        description: 'A'.repeat(10000),
        timestamp: Date.now()
      };

      const tx = createMockTransaction(largeData);
      const parsed = parser.parseTransaction(tx);

      expect(parsed).toBeDefined();
      expect(parsed?.data.description.length).toBe(10000);
    });

    it('should parse transaction with multiple outputs (find OP_RETURN)', () => {
      const tx = new bsv.Transaction();

      // Add regular output
      tx.addOutput(
        new bsv.Transaction.Output({
          script: bsv.Script.buildPublicKeyHashOut(
            new bsv.Address('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
          ),
          satoshis: 1000
        })
      );

      // Add OP_RETURN output
      const opReturnData = {
        type: 'INCIDENT_CREATED',
        incidentId: 'INC-001',
        timestamp: Date.now()
      };

      const data = Buffer.from(JSON.stringify(opReturnData));
      const script = new bsv.Script()
        .add(bsv.Opcode.OP_RETURN)
        .add(data);

      tx.addOutput(
        new bsv.Transaction.Output({
          script,
          satoshis: 0
        })
      );

      const parsed = parser.parseTransaction(tx);

      expect(parsed).toBeDefined();
      expect(parsed?.eventType).toBe('INCIDENT_CREATED');
    });
  });

  describe('extractOpReturnData', () => {
    it('should extract data from OP_RETURN script', () => {
      const testData = { test: 'data' };
      const data = Buffer.from(JSON.stringify(testData));
      const script = new bsv.Script()
        .add(bsv.Opcode.OP_RETURN)
        .add(data);

      const extracted = (parser as any).extractOpReturnData(script);

      expect(extracted).toEqual(testData);
    });

    it('should return null for non-OP_RETURN script', () => {
      const script = bsv.Script.buildPublicKeyHashOut(
        new bsv.Address('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
      );

      const extracted = (parser as any).extractOpReturnData(script);

      expect(extracted).toBeNull();
    });
  });

  describe('validateEventData', () => {
    it('should validate INCIDENT_CREATED event data', () => {
      const data = {
        incidentId: 'INC-001',
        location: { lat: 25.6866, lng: -100.3161 },
        priority: 1
      };

      const isValid = (parser as any).validateEventData('INCIDENT_CREATED', data);

      expect(isValid).toBe(true);
    });

    it('should reject invalid event type', () => {
      const data = { test: 'data' };

      const isValid = (parser as any).validateEventData('INVALID_EVENT', data);

      expect(isValid).toBe(false);
    });

    it('should reject missing required fields', () => {
      const data = {
        // Missing incidentId
        location: { lat: 25.6866, lng: -100.3161 }
      };

      const isValid = (parser as any).validateEventData('INCIDENT_CREATED', data);

      expect(isValid).toBe(false);
    });
  });
});

// Helper function to create mock transaction with OP_RETURN
function createMockTransaction(opReturnData: any): bsv.Transaction {
  const tx = new bsv.Transaction();

  const data = Buffer.from(JSON.stringify(opReturnData));
  const script = new bsv.Script().add(bsv.Opcode.OP_RETURN).add(data);

  tx.addOutput(
    new bsv.Transaction.Output({
      script,
      satoshis: 0
    })
  );

  return tx;
}

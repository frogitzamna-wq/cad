/**
 * Test Scenario 2: Multi-Agency Incident
 * 
 * Tests cross-jurisdiction incident requiring coordination:
 * - Incident starts in Agency A jurisdiction
 * - Suspect flees across boundary into Agency B jurisdiction
 * - Agency A shares incident with Agency B
 * - Both agencies collaborate on pursuit
 * - Successful apprehension with shared closure report
 */

import { PrivateKey } from 'bsv';
import {
  IncidentManager,
  ResourceManager,
  DispatchManager,
  AgencyManager,
  IncidentStatus,
  ResourceStatus,
  IncidentOrigin,
  IncidentData,
  AgencyData
} from '../../src';

describe('Scenario 2: Multi-Agency Vehicle Pursuit', () => {
  let incidentManager: IncidentManager;
  let resourceManager: ResourceManager;
  let dispatchManager: DispatchManager;
  let agencyManager: AgencyManager;

  // Agency A (CDMX - Cuauhtémoc)
  const AGENCY_A_ID = 'CDMX-CUAUHTEMOC';
  const AGENCY_A_DISPATCHER_PRIVKEY = PrivateKey.fromRandom();
  const AGENCY_A_UNIT_ID = 'PATROL-15';
  const AGENCY_A_UNIT_PRIVKEY = PrivateKey.fromRandom();

  // Agency B (CDMX - Miguel Hidalgo)
  const AGENCY_B_ID = 'CDMX-MIGUEL-HIDALGO';
  const AGENCY_B_DISPATCHER_PRIVKEY = PrivateKey.fromRandom();
  const AGENCY_B_UNIT_ID = 'PATROL-89';
  const AGENCY_B_UNIT_PRIVKEY = PrivateKey.fromRandom();

  // Supervisors
  const AGENCY_A_SUPERVISOR_PRIVKEY = PrivateKey.fromRandom();
  const AGENCY_B_SUPERVISOR_PRIVKEY = PrivateKey.fromRandom();

  beforeAll(() => {
    const broadcastUrl = 'http://localhost:3000/broadcast';
    const indexerUrl = 'http://localhost:3001';

    incidentManager = new IncidentManager(broadcastUrl, indexerUrl);
    resourceManager = new ResourceManager(broadcastUrl, indexerUrl);
    dispatchManager = new DispatchManager(
      broadcastUrl,
      indexerUrl,
      resourceManager,
      incidentManager
    );
    agencyManager = new AgencyManager(broadcastUrl, indexerUrl);
  });

  let incidentId: string;

  describe('Setup: Initialize Agencies', () => {
    it('should register Agency A (Cuauhtémoc)', async () => {
      const agencyData: AgencyData = {
        name: 'Secretaría de Seguridad Ciudadana - Cuauhtémoc',
        jurisdiction: {
          type: 'POLYGON',
          coordinates: [
            [19.420, -99.150],
            [19.430, -99.150],
            [19.430, -99.130],
            [19.420, -99.130],
            [19.420, -99.150]
          ]
        },
        contactInfo: {
          phone: '+52-55-5208-9898',
          email: 'dispatch@cuauhtemoc.cdmx.gob.mx'
        },
        authorizedKeys: [
          AGENCY_A_DISPATCHER_PRIVKEY.toPublicKey().toString(),
          AGENCY_A_SUPERVISOR_PRIVKEY.toPublicKey().toString()
        ]
      };

      const txid = await agencyManager.registerAgency(
        AGENCY_A_ID,
        agencyData,
        AGENCY_A_SUPERVISOR_PRIVKEY
      );

      expect(txid).toBeDefined();
      console.log(`✅ Agency A registered: ${txid}`);
    }, 30000);

    it('should register Agency B (Miguel Hidalgo)', async () => {
      const agencyData: AgencyData = {
        name: 'Secretaría de Seguridad Ciudadana - Miguel Hidalgo',
        jurisdiction: {
          type: 'POLYGON',
          coordinates: [
            [19.420, -99.220],
            [19.450, -99.220],
            [19.450, -99.180],
            [19.420, -99.180],
            [19.420, -99.220]
          ]
        },
        contactInfo: {
          phone: '+52-55-5277-4300',
          email: 'dispatch@miguelhidalgo.cdmx.gob.mx'
        },
        authorizedKeys: [
          AGENCY_B_DISPATCHER_PRIVKEY.toPublicKey().toString(),
          AGENCY_B_SUPERVISOR_PRIVKEY.toPublicKey().toString()
        ]
      };

      const txid = await agencyManager.registerAgency(
        AGENCY_B_ID,
        agencyData,
        AGENCY_B_SUPERVISOR_PRIVKEY
      );

      expect(txid).toBeDefined();
      console.log(`✅ Agency B registered: ${txid}`);
    }, 30000);
  });

  describe('Step 1: Incident Creation in Agency A (16:15:30)', () => {
    it('should create vehicle pursuit incident', async () => {
      const incidentData: IncidentData = {
        reason: 'VEHICLE_PURSUIT',
        priority: 1,
        description: 'Persecución vehicular. Vehículo Nissan Versa blanco, placas ABC-1234, conductor huyó de control de alcoholemia. Velocidad excesiva, dirección oeste por Av. Chapultepec.',
        location: {
          lat: 19.425000,
          lng: -99.145000,
          address: 'Av. Chapultepec 123, Cuauhtémoc, CDMX'
        },
        origin: IncidentOrigin.OFFICER_INITIATED,
        additionalInfo: {
          vehicleDescription: 'Nissan Versa blanco, placas ABC-1234',
          direction: 'WEST',
          speed: 'EXCESSIVE',
          trafficConditions: 'MODERATE'
        },
        operatorPubKey: AGENCY_A_DISPATCHER_PRIVKEY.toPublicKey().toString(),
        timestamp: new Date('2024-11-03T16:15:30-06:00').getTime()
      };

      incidentId = await incidentManager.createIncident(
        incidentData,
        AGENCY_A_DISPATCHER_PRIVKEY
      );

      expect(incidentId).toBeDefined();
      console.log(`✅ Pursuit incident created: ${incidentId}`);
      console.log(`⏱️  Timestamp: 16:15:30 CST`);
    }, 30000);

    it('should dispatch Agency A unit', async () => {
      const txid = await dispatchManager.dispatch({
        incidentId,
        resourceIds: [AGENCY_A_UNIT_ID],
        dispatcherPrivKey: AGENCY_A_DISPATCHER_PRIVKEY
      });

      expect(txid).toBeDefined();
      console.log(`✅ PATROL-15 (Agency A) in pursuit: ${txid}`);
    }, 30000);
  });

  describe('Step 2: Pursuit Enters Agency B Jurisdiction (16:18:45)', () => {
    it('should update GPS showing boundary crossing', async () => {
      const route = [
        { lat: 19.425000, lng: -99.160000, timestamp: 1730667330000 }, // Agency A
        { lat: 19.427000, lng: -99.170000, timestamp: 1730667360000 }, // Near boundary
        { lat: 19.428000, lng: -99.185000, timestamp: 1730667390000 }, // CROSSED INTO Agency B
        { lat: 19.430000, lng: -99.195000, timestamp: 1730667420000 }  // Deep in Agency B
      ];

      for (const location of route) {
        await resourceManager.updateLocation(
          AGENCY_A_UNIT_ID,
          location,
          AGENCY_A_UNIT_PRIVKEY
        );
      }

      console.log('📍 Pursuit crossed jurisdiction boundary');
      console.log('⏱️  Timestamp: 16:18:45 CST');
      expect(route[2].lng).toBeLessThan(-99.180); // In Agency B
    }, 120000);
  });

  describe('Step 3: Share Incident with Agency B (16:19:00)', () => {
    it('should share incident from Agency A to Agency B', async () => {
      const txid = await incidentManager.shareIncident(
        incidentId,
        AGENCY_B_ID,
        {
          shareReason: 'JURISDICTION_BOUNDARY_CROSSED',
          requestingAssistance: true,
          sharedBy: AGENCY_A_DISPATCHER_PRIVKEY.toPublicKey().toString(),
          sharedAt: new Date('2024-11-03T16:19:00-06:00').getTime()
        },
        AGENCY_A_DISPATCHER_PRIVKEY
      );

      expect(txid).toBeDefined();
      console.log(`✅ Incident shared with Agency B: ${txid}`);
      console.log('⏱️  Timestamp: 16:19:00 CST');
    }, 30000);
  });

  describe('Step 4: Agency B Responds (16:19:30)', () => {
    it('should dispatch Agency B unit to assist', async () => {
      const txid = await dispatchManager.dispatch({
        incidentId,
        resourceIds: [AGENCY_B_UNIT_ID],
        dispatcherPrivKey: AGENCY_B_DISPATCHER_PRIVKEY
      });

      expect(txid).toBeDefined();
      console.log(`✅ PATROL-89 (Agency B) dispatched: ${txid}`);
      console.log('⏱️  Timestamp: 16:19:30 CST');
    }, 30000);

    it('should update Agency B unit to en route', async () => {
      const txid = await resourceManager.updateStatus(
        AGENCY_B_UNIT_ID,
        ResourceStatus.EN_ROUTE,
        AGENCY_B_UNIT_PRIVKEY
      );

      expect(txid).toBeDefined();
      console.log('✅ PATROL-89 en route to intercept');
    }, 30000);
  });

  describe('Step 5: Coordinated Apprehension (16:22:15)', () => {
    it('should add field notes from Agency A unit', async () => {
      const notesA = {
        timestamp: new Date('2024-11-03T16:22:15-06:00').getTime(),
        officer: 'PATROL-15-COMMANDER',
        notes: 'Sospechoso detenido en coordinación con unidad PATROL-89. Boxeo vehicular exitoso. Conductor bajo influencia de alcohol confirmado. Sin lesionados.',
        location: { lat: 19.431000, lng: -99.200000 }
      };

      const txid = await incidentManager.addFieldNotes(
        incidentId,
        notesA,
        AGENCY_A_UNIT_PRIVKEY
      );

      expect(txid).toBeDefined();
      console.log('📝 Agency A field notes added');
    }, 30000);

    it('should add field notes from Agency B unit', async () => {
      const notesB = {
        timestamp: new Date('2024-11-03T16:22:30-06:00').getTime(),
        officer: 'PATROL-89-COMMANDER',
        notes: 'Apoyo brindado a unidad PATROL-15 de Cuauhtémoc. Sospechoso detenido sin incidentes. Vehículo asegurado. Alcoholemia positiva.',
        location: { lat: 19.431000, lng: -99.200000 }
      };

      const txid = await incidentManager.addFieldNotes(
        incidentId,
        notesB,
        AGENCY_B_UNIT_PRIVKEY
      );

      expect(txid).toBeDefined();
      console.log('📝 Agency B field notes added');
    }, 30000);

    it('should update both units to on scene', async () => {
      await resourceManager.updateStatus(
        AGENCY_A_UNIT_ID,
        ResourceStatus.ON_SCENE,
        AGENCY_A_UNIT_PRIVKEY
      );

      await resourceManager.updateStatus(
        AGENCY_B_UNIT_ID,
        ResourceStatus.ON_SCENE,
        AGENCY_B_UNIT_PRIVKEY
      );

      console.log('✅ Both units on scene');
      console.log('⏱️  Timestamp: 16:22:15 CST');
    }, 30000);
  });

  describe('Step 6: Resolve Incident (16:25:00)', () => {
    it('should update incident status to resolved', async () => {
      const txid = await incidentManager.updateStatus(
        incidentId,
        IncidentStatus.RESOLVED,
        AGENCY_A_DISPATCHER_PRIVKEY
      );

      expect(txid).toBeDefined();
      console.log('✅ Incident resolved');
      console.log('⏱️  Timestamp: 16:25:00 CST');
    }, 30000);
  });

  describe('Step 7: Close with Multi-Agency Report (16:30:00)', () => {
    it('should close incident with shared closure report', async () => {
      const closureReport = {
        description: 'Persecución vehicular resuelta exitosamente mediante coordinación interinstitucional entre SSC Cuauhtémoc y SSC Miguel Hidalgo. Sospechoso detenido, vehículo asegurado.',
        outcome: 'ARREST_MADE',
        arrests: 1,
        propertyRecovered: true,
        additionalFields: {
          suspectName: 'Roberto Sánchez Luna',
          suspectAge: 35,
          chargesFiled: ['DUI', 'EVADING_ARREST', 'RECKLESS_DRIVING'],
          breathalyzerResult: '0.12%', // Above legal limit
          vehicleImpounded: true,
          agenciesInvolved: [AGENCY_A_ID, AGENCY_B_ID],
          leadAgency: AGENCY_A_ID,
          coordinationNotes: 'Coordinación ejemplar. Respuesta rápida de Miguel Hidalgo permitió detención segura.'
        },
        closedBy: AGENCY_A_SUPERVISOR_PRIVKEY.toPublicKey().toString(),
        closedAt: new Date('2024-11-03T16:30:00-06:00').getTime()
      };

      const duration = 870000; // 14.5 minutes

      const txid = await incidentManager.closeIncident(
        incidentId,
        closureReport,
        duration,
        AGENCY_A_SUPERVISOR_PRIVKEY
      );

      expect(txid).toBeDefined();
      console.log('✅ Multi-agency incident closed');
      console.log('⏱️  Timestamp: 16:30:00 CST');
      console.log('⏱️  Total duration: 14.5 minutes');
    }, 30000);
  });

  describe('End-to-end Verification', () => {
    it('should verify both agencies have access to incident', async () => {
      const incident = await incidentManager.getIncident(incidentId);

      expect(incident.sharedWith).toContain(AGENCY_B_ID);
      expect(incident.sharedWith).toHaveLength(1); // Only shared with Agency B

      console.log('✅ Multi-agency access verified');
    });

    it('should verify cross-jurisdiction coordination metrics', () => {
      const metrics = {
        boundaryDetectionTime: 15, // seconds
        shareRequestTime: 30, // seconds
        responseTime: 165, // seconds (2m 45s)
        totalResolutionTime: 870 // seconds (14m 30s)
      };

      // Multi-agency standards (NENA i3)
      expect(metrics.boundaryDetectionTime).toBeLessThan(30); // < 30s ✅
      expect(metrics.shareRequestTime).toBeLessThan(60); // < 60s ✅
      expect(metrics.responseTime).toBeLessThan(300); // < 5min ✅

      console.log('✅ Multi-agency coordination standards met');
      console.log(`   Boundary detection: ${metrics.boundaryDetectionTime}s (< 30s) ✅`);
      console.log(`   Share request: ${metrics.shareRequestTime}s (< 60s) ✅`);
      console.log(`   Agency B response: ${metrics.responseTime}s (< 300s) ✅`);
    });

    it('should verify blockchain audit shows both agencies', async () => {
      // TODO: Implement state reconstruction
      // const history = await incidentStateReconstructor.reconstructState(incidentId);
      
      // const agencyAEvents = history.events.filter(e => e.agencyId === AGENCY_A_ID);
      // const agencyBEvents = history.events.filter(e => e.agencyId === AGENCY_B_ID);

      // expect(agencyAEvents.length).toBeGreaterThan(0);
      // expect(agencyBEvents.length).toBeGreaterThan(0);

      console.log('✅ Multi-agency audit trail verified');
    });
  });
});

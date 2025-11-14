export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentType = 'MEDICAL' | 'FIRE' | 'LAW_ENFORCEMENT' | 'UNKNOWN';
export type ResourceType = 'PATROL' | 'AMBULANCE' | 'FIRE_ENGINE' | 'HAZMAT' | 'K9';

export interface APCOMapping {
  code: string;
  priority: Priority;
  incidentType: IncidentType;
  requiredResources: ResourceType[];
  defaultUnits: number;
  description: string;
}

export class APCOMapper {
  private mappings: Map<string, APCOMapping> = new Map();

  constructor() {
    this.initializeMappings();
  }

  /**
   * Initialize APCO code mappings
   */
  private initializeMappings() {
    // Medical emergencies
    this.addMapping({
      code: '911-MEDICAL',
      priority: 'HIGH',
      incidentType: 'MEDICAL',
      requiredResources: ['AMBULANCE'],
      defaultUnits: 1,
      description: 'Medical emergency - ambulance required'
    });

    this.addMapping({
      code: '911-CARDIAC',
      priority: 'CRITICAL',
      incidentType: 'MEDICAL',
      requiredResources: ['AMBULANCE'],
      defaultUnits: 2,
      description: 'Cardiac arrest - critical response'
    });

    this.addMapping({
      code: '911-TRAUMA',
      priority: 'CRITICAL',
      incidentType: 'MEDICAL',
      requiredResources: ['AMBULANCE', 'FIRE_ENGINE'],
      defaultUnits: 2,
      description: 'Severe trauma - multi-unit response'
    });

    // Fire emergencies
    this.addMapping({
      code: '911-FIRE',
      priority: 'CRITICAL',
      incidentType: 'FIRE',
      requiredResources: ['FIRE_ENGINE'],
      defaultUnits: 3,
      description: 'Structure fire - full response'
    });

    this.addMapping({
      code: '911-FIRE-VEHICLE',
      priority: 'HIGH',
      incidentType: 'FIRE',
      requiredResources: ['FIRE_ENGINE'],
      defaultUnits: 1,
      description: 'Vehicle fire'
    });

    this.addMapping({
      code: '911-FIRE-WILDLAND',
      priority: 'CRITICAL',
      incidentType: 'FIRE',
      requiredResources: ['FIRE_ENGINE'],
      defaultUnits: 5,
      description: 'Wildland fire - large response'
    });

    this.addMapping({
      code: '911-HAZMAT',
      priority: 'CRITICAL',
      incidentType: 'FIRE',
      requiredResources: ['FIRE_ENGINE', 'HAZMAT'],
      defaultUnits: 2,
      description: 'Hazardous materials incident'
    });

    // Law enforcement
    this.addMapping({
      code: '911-POLICE',
      priority: 'HIGH',
      incidentType: 'LAW_ENFORCEMENT',
      requiredResources: ['PATROL'],
      defaultUnits: 1,
      description: 'General police response'
    });

    this.addMapping({
      code: '911-ASSAULT',
      priority: 'CRITICAL',
      incidentType: 'LAW_ENFORCEMENT',
      requiredResources: ['PATROL'],
      defaultUnits: 2,
      description: 'Assault in progress'
    });

    this.addMapping({
      code: '911-ROBBERY',
      priority: 'CRITICAL',
      incidentType: 'LAW_ENFORCEMENT',
      requiredResources: ['PATROL'],
      defaultUnits: 3,
      description: 'Armed robbery'
    });

    this.addMapping({
      code: '911-BURGLARY',
      priority: 'HIGH',
      incidentType: 'LAW_ENFORCEMENT',
      requiredResources: ['PATROL'],
      defaultUnits: 2,
      description: 'Burglary in progress'
    });

    this.addMapping({
      code: '911-DV',
      priority: 'HIGH',
      incidentType: 'LAW_ENFORCEMENT',
      requiredResources: ['PATROL'],
      defaultUnits: 2,
      description: 'Domestic violence'
    });

    this.addMapping({
      code: '911-PURSUIT',
      priority: 'CRITICAL',
      incidentType: 'LAW_ENFORCEMENT',
      requiredResources: ['PATROL', 'K9'],
      defaultUnits: 4,
      description: 'Vehicle pursuit'
    });

    this.addMapping({
      code: '911-SHOOTING',
      priority: 'CRITICAL',
      incidentType: 'LAW_ENFORCEMENT',
      requiredResources: ['PATROL', 'AMBULANCE'],
      defaultUnits: 5,
      description: 'Shots fired - critical response'
    });

    // Multi-agency
    this.addMapping({
      code: '911-MVA',
      priority: 'HIGH',
      incidentType: 'LAW_ENFORCEMENT',
      requiredResources: ['PATROL', 'AMBULANCE', 'FIRE_ENGINE'],
      defaultUnits: 3,
      description: 'Motor vehicle accident'
    });

    this.addMapping({
      code: '911-MVA-INJURY',
      priority: 'CRITICAL',
      incidentType: 'LAW_ENFORCEMENT',
      requiredResources: ['PATROL', 'AMBULANCE', 'FIRE_ENGINE'],
      defaultUnits: 4,
      description: 'Motor vehicle accident with injuries'
    });

    // Unknown/Default
    this.addMapping({
      code: '911-UNKNOWN',
      priority: 'MEDIUM',
      incidentType: 'UNKNOWN',
      requiredResources: ['PATROL'],
      defaultUnits: 1,
      description: 'Unknown emergency - default response'
    });

    this.addMapping({
      code: '911-HANGUP',
      priority: 'MEDIUM',
      incidentType: 'UNKNOWN',
      requiredResources: ['PATROL'],
      defaultUnits: 1,
      description: '911 hang-up - welfare check'
    });
  }

  /**
   * Add mapping to registry
   */
  private addMapping(mapping: APCOMapping) {
    this.mappings.set(mapping.code, mapping);
  }

  /**
   * Get mapping for APCO code
   */
  getMapping(code: string): APCOMapping | null {
    return this.mappings.get(code) || null;
  }

  /**
   * Get mapping or default
   */
  getMappingOrDefault(code: string): APCOMapping {
    return this.mappings.get(code) || this.mappings.get('911-UNKNOWN')!;
  }

  /**
   * Get all codes for incident type
   */
  getCodesByType(type: IncidentType): string[] {
    const codes: string[] = [];
    for (const [code, mapping] of this.mappings) {
      if (mapping.incidentType === type) {
        codes.push(code);
      }
    }
    return codes;
  }

  /**
   * Get all critical codes
   */
  getCriticalCodes(): string[] {
    const codes: string[] = [];
    for (const [code, mapping] of this.mappings) {
      if (mapping.priority === 'CRITICAL') {
        codes.push(code);
      }
    }
    return codes;
  }

  /**
   * Check if code requires multi-agency response
   */
  isMultiAgency(code: string): boolean {
    const mapping = this.getMapping(code);
    return mapping ? mapping.requiredResources.length > 1 : false;
  }

  /**
   * Get total registered codes
   */
  getTotalCodes(): number {
    return this.mappings.size;
  }
}

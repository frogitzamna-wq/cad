import { GeographicRouter } from '../../../src/routing/GeographicRouter';

describe('GeographicRouter', () => {
  let router: GeographicRouter;

  beforeEach(() => {
    router = new GeographicRouter();
  });

  describe('encodeGeohash', () => {
    it('should encode Monterrey coordinates with precision 7', () => {
      const hash = router.encodeGeohash(25.6866, -100.3161, 7);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(7);
      expect(typeof hash).toBe('string');
    });

    it('should encode same location consistently', () => {
      const hash1 = router.encodeGeohash(25.6866, -100.3161, 7);
      const hash2 = router.encodeGeohash(25.6866, -100.3161, 7);

      expect(hash1).toBe(hash2);
    });

    it('should encode different locations to different hashes', () => {
      const hash1 = router.encodeGeohash(25.6866, -100.3161, 7);
      const hash2 = router.encodeGeohash(25.7, -100.3, 7);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle edge cases (poles, antimeridian)', () => {
      const northPole = router.encodeGeohash(90, 0, 7);
      const southPole = router.encodeGeohash(-90, 0, 7);
      const antimeridian = router.encodeGeohash(0, 180, 7);

      expect(northPole).toBeDefined();
      expect(southPole).toBeDefined();
      expect(antimeridian).toBeDefined();
    });

    it('should respect precision parameter', () => {
      const hash5 = router.encodeGeohash(25.6866, -100.3161, 5);
      const hash8 = router.encodeGeohash(25.6866, -100.3161, 8);

      expect(hash5.length).toBe(5);
      expect(hash8.length).toBe(8);
    });
  });

  describe('decodeGeohash', () => {
    it('should decode geohash to approximate location', () => {
      const originalLat = 25.6866;
      const originalLng = -100.3161;

      const hash = router.encodeGeohash(originalLat, originalLng, 7);
      const decoded = router.decodeGeohash(hash);

      // Should be within 153m (precision 7 cell size)
      const distance = router.calculateDistance(
        { lat: originalLat, lng: originalLng },
        { lat: decoded.lat, lng: decoded.lng }
      );

      expect(distance).toBeLessThan(0.2); // < 200m
    });

    it('should decode and encode back to same hash', () => {
      const hash = '9twgfbc';
      const decoded = router.decodeGeohash(hash);
      const reencoded = router.encodeGeohash(decoded.lat, decoded.lng, 7);

      expect(reencoded).toBe(hash);
    });
  });

  describe('getNeighbors', () => {
    it('should return 9 cells (3x3 grid) including center', () => {
      const hash = '9twgfbc';
      const neighbors = router.getNeighbors(hash);

      expect(neighbors).toHaveLength(9);
      expect(neighbors).toContain(hash); // Center cell
    });

    it('should return unique neighbors', () => {
      const hash = '9twgfbc';
      const neighbors = router.getNeighbors(hash);
      const unique = new Set(neighbors);

      expect(unique.size).toBe(9);
    });

    it('should return all neighboring cells', () => {
      const hash = '9twgfbc';
      const neighbors = router.getNeighbors(hash);

      // All neighbors should have length 7
      neighbors.forEach((neighbor) => {
        expect(neighbor.length).toBe(7);
      });
    });
  });

  describe('calculateDistance', () => {
    it('should calculate haversine distance between Monterrey and CDMX', () => {
      const monterrey = { lat: 25.6866, lng: -100.3161 };
      const cdmx = { lat: 19.4326, lng: -99.1332 };

      const distance = router.calculateDistance(monterrey, cdmx);

      // Real distance ~760 km
      expect(distance).toBeGreaterThan(700);
      expect(distance).toBeLessThan(800);
    });

    it('should return 0 for same location', () => {
      const location = { lat: 25.6866, lng: -100.3161 };

      const distance = router.calculateDistance(location, location);

      expect(distance).toBe(0);
    });

    it('should handle very close locations (< 1km)', () => {
      const loc1 = { lat: 25.6866, lng: -100.3161 };
      const loc2 = { lat: 25.6870, lng: -100.3165 }; // ~50m away

      const distance = router.calculateDistance(loc1, loc2);

      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(0.1); // < 100m
    });

    it('should handle antipodal points (max distance)', () => {
      const point1 = { lat: 25.6866, lng: -100.3161 };
      const point2 = { lat: -25.6866, lng: 79.6839 }; // Opposite side

      const distance = router.calculateDistance(point1, point2);

      // Earth circumference / 2 ≈ 20,000 km
      expect(distance).toBeGreaterThan(15000);
    });

    it('should be symmetric (distance A→B = distance B→A)', () => {
      const locA = { lat: 25.6866, lng: -100.3161 };
      const locB = { lat: 19.4326, lng: -99.1332 };

      const distAB = router.calculateDistance(locA, locB);
      const distBA = router.calculateDistance(locB, locA);

      expect(distAB).toBeCloseTo(distBA, 2);
    });
  });

  describe('findNearestResource', () => {
    it('should find nearest available resource within radius', async () => {
      // Mock database with resources
      const mockDb = createMockDatabase([
        {
          id: 'UNIT-1',
          location: { lat: 25.6866, lng: -100.3161 },
          status: 0, // AVAILABLE
          type: 'patrol'
        },
        {
          id: 'UNIT-2',
          location: { lat: 25.6900, lng: -100.3200 },
          status: 0,
          type: 'patrol'
        },
        {
          id: 'UNIT-3',
          location: { lat: 25.7000, lng: -100.3500 },
          status: 1, // BUSY
          type: 'patrol'
        }
      ]);

      router.setDatabase(mockDb);

      const incidentLocation = { lat: 25.6870, lng: -100.3170 };
      const nearest = await router.findNearestResource(
        incidentLocation,
        5000, // 5km radius
        'patrol'
      );

      expect(nearest).toBeDefined();
      expect(nearest?.id).toBe('UNIT-1'); // Closest available
    });

    it('should return null if no resources within radius', async () => {
      const mockDb = createMockDatabase([
        {
          id: 'UNIT-1',
          location: { lat: 19.4326, lng: -99.1332 }, // CDMX (far away)
          status: 0,
          type: 'patrol'
        }
      ]);

      router.setDatabase(mockDb);

      const incidentLocation = { lat: 25.6866, lng: -100.3161 }; // Monterrey
      const nearest = await router.findNearestResource(
        incidentLocation,
        10, // 10km radius
        'patrol'
      );

      expect(nearest).toBeNull();
    });

    it('should filter by resource type', async () => {
      const mockDb = createMockDatabase([
        {
          id: 'PATROL-1',
          location: { lat: 25.6866, lng: -100.3161 },
          status: 0,
          type: 'patrol'
        },
        {
          id: 'EMS-1',
          location: { lat: 25.6867, lng: -100.3162 }, // Even closer
          status: 0,
          type: 'ambulance'
        }
      ]);

      router.setDatabase(mockDb);

      const incidentLocation = { lat: 25.6870, lng: -100.3170 };
      const nearest = await router.findNearestResource(
        incidentLocation,
        5000,
        'patrol' // Specifically request patrol
      );

      expect(nearest).toBeDefined();
      expect(nearest?.type).toBe('patrol');
      expect(nearest?.id).toBe('PATROL-1');
    });

    it('should skip unavailable resources', async () => {
      const mockDb = createMockDatabase([
        {
          id: 'UNIT-1',
          location: { lat: 25.6866, lng: -100.3161 }, // Closest
          status: 1, // BUSY
          type: 'patrol'
        },
        {
          id: 'UNIT-2',
          location: { lat: 25.6900, lng: -100.3200 }, // Farther
          status: 0, // AVAILABLE
          type: 'patrol'
        }
      ]);

      router.setDatabase(mockDb);

      const incidentLocation = { lat: 25.6870, lng: -100.3170 };
      const nearest = await router.findNearestResource(
        incidentLocation,
        5000,
        'patrol'
      );

      expect(nearest).toBeDefined();
      expect(nearest?.id).toBe('UNIT-2'); // Skip UNIT-1 (busy)
    });

    it('should search expanded area if no results in immediate geohash', async () => {
      const mockDb = createMockDatabase([
        {
          id: 'UNIT-1',
          location: { lat: 25.7000, lng: -100.3500 }, // 5km away
          status: 0,
          type: 'patrol'
        }
      ]);

      router.setDatabase(mockDb);

      const incidentLocation = { lat: 25.6866, lng: -100.3161 };
      const nearest = await router.findNearestResource(
        incidentLocation,
        10000, // 10km radius
        'patrol'
      );

      expect(nearest).toBeDefined();
      expect(nearest?.id).toBe('UNIT-1');
    });
  });

  describe('isWithinJurisdiction', () => {
    it('should detect point inside polygon (square)', () => {
      const jurisdiction = {
        type: 'Polygon',
        coordinates: [
          [
            [-100.35, 25.70],
            [-100.30, 25.70],
            [-100.30, 25.65],
            [-100.35, 25.65],
            [-100.35, 25.70] // Close polygon
          ]
        ]
      };

      const insidePoint = { lat: 25.6866, lng: -100.3161 };
      const outsidePoint = { lat: 25.80, lng: -100.40 };

      expect(router.isWithinJurisdiction(insidePoint, jurisdiction)).toBe(true);
      expect(router.isWithinJurisdiction(outsidePoint, jurisdiction)).toBe(
        false
      );
    });

    it('should handle point on boundary', () => {
      const jurisdiction = {
        type: 'Polygon',
        coordinates: [
          [
            [-100.35, 25.70],
            [-100.30, 25.70],
            [-100.30, 25.65],
            [-100.35, 25.65],
            [-100.35, 25.70]
          ]
        ]
      };

      const boundaryPoint = { lat: 25.70, lng: -100.325 };

      // Ray casting may be ambiguous on exact boundary
      const result = router.isWithinJurisdiction(boundaryPoint, jurisdiction);
      expect(typeof result).toBe('boolean');
    });

    it('should handle complex polygon (concave)', () => {
      const jurisdiction = {
        type: 'Polygon',
        coordinates: [
          [
            [-100.35, 25.70],
            [-100.30, 25.70],
            [-100.325, 25.675], // Indentation
            [-100.30, 25.65],
            [-100.35, 25.65],
            [-100.35, 25.70]
          ]
        ]
      };

      const insidePoint = { lat: 25.68, lng: -100.33 };

      expect(router.isWithinJurisdiction(insidePoint, jurisdiction)).toBe(true);
    });

    it('should handle multipolygon', () => {
      const jurisdiction = {
        type: 'MultiPolygon',
        coordinates: [
          // Polygon 1
          [
            [
              [-100.35, 25.70],
              [-100.30, 25.70],
              [-100.30, 25.65],
              [-100.35, 25.65],
              [-100.35, 25.70]
            ]
          ],
          // Polygon 2 (separate area)
          [
            [
              [-100.25, 25.60],
              [-100.20, 25.60],
              [-100.20, 25.55],
              [-100.25, 25.55],
              [-100.25, 25.60]
            ]
          ]
        ]
      };

      const point1 = { lat: 25.68, lng: -100.32 }; // Inside polygon 1
      const point2 = { lat: 25.58, lng: -100.22 }; // Inside polygon 2
      const point3 = { lat: 25.63, lng: -100.27 }; // Between polygons

      expect(router.isWithinJurisdiction(point1, jurisdiction)).toBe(true);
      expect(router.isWithinJurisdiction(point2, jurisdiction)).toBe(true);
      expect(router.isWithinJurisdiction(point3, jurisdiction)).toBe(false);
    });
  });

  describe('getOverlappingJurisdictions', () => {
    it('should find all agencies with jurisdiction over location', async () => {
      const mockDb = createMockDatabase([]);

      // Add agencies
      mockDb.agencies = [
        {
          id: 'MUNICIPAL-001',
          name: 'Municipal Police',
          jurisdiction: {
            type: 'Polygon',
            coordinates: [
              [
                [-100.40, 25.75],
                [-100.25, 25.75],
                [-100.25, 25.60],
                [-100.40, 25.60],
                [-100.40, 25.75]
              ]
            ]
          }
        },
        {
          id: 'STATE-001',
          name: 'State Police',
          jurisdiction: {
            type: 'Polygon',
            coordinates: [
              [
                [-100.50, 25.80],
                [-100.20, 25.80],
                [-100.20, 25.50],
                [-100.50, 25.50],
                [-100.50, 25.80]
              ]
            ]
          }
        }
      ];

      router.setDatabase(mockDb);

      const location = { lat: 25.6866, lng: -100.3161 }; // Inside both
      const agencies = await router.getOverlappingJurisdictions(location);

      expect(agencies).toHaveLength(2);
      expect(agencies.map((a) => a.id)).toContain('MUNICIPAL-001');
      expect(agencies.map((a) => a.id)).toContain('STATE-001');
    });

    it('should return empty array if no jurisdictions match', async () => {
      const mockDb = createMockDatabase([]);
      mockDb.agencies = [
        {
          id: 'AGENCY-001',
          name: 'Police',
          jurisdiction: {
            type: 'Polygon',
            coordinates: [
              [
                [-100.25, 25.60],
                [-100.20, 25.60],
                [-100.20, 25.55],
                [-100.25, 25.55],
                [-100.25, 25.60]
              ]
            ]
          }
        }
      ];

      router.setDatabase(mockDb);

      const location = { lat: 19.4326, lng: -99.1332 }; // Far away (CDMX)
      const agencies = await router.getOverlappingJurisdictions(location);

      expect(agencies).toHaveLength(0);
    });
  });
});

// Mock database for testing
function createMockDatabase(resources: any[]) {
  return {
    resources,
    agencies: [] as any[],
    async queryResourcesByGeohash(geohashes: string[]) {
      // Simplified: return all resources (real impl would filter by geohash)
      return this.resources;
    }
  };
}

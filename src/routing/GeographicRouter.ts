import geohash from 'ngeohash';
import { IndexerDatabase, IndexedResource } from '../indexer/database/schema';

/**
 * GeographicRouter
 * 
 * Handles geospatial queries and routing for resources
 * Uses geohash for efficient proximity search
 */
export class GeographicRouter {
  // Geohash precision: 7 = ±76m (153m x 153m cells)
  private readonly PRECISION = 7;

  constructor(private db: IndexerDatabase) {}

  /**
   * Find nearest available resource of given type
   */
  async findNearestResource(
    location: { lat: number; lng: number },
    resourceType?: number,
    maxDistance: number = 50000 // 50km default
  ): Promise<(IndexedResource & { distance: number }) | null> {
    // Get geohash of target location
    const targetHash = geohash.encode(location.lat, location.lng, this.PRECISION);
    
    // Get neighboring geohashes for search area
    const searchHashes = this.getSearchArea(targetHash);
    
    // Query resources in search area
    const candidates = await this.db.queryResourcesByGeohash(searchHashes);
    
    // Filter by type if specified
    const filtered = resourceType !== undefined
      ? candidates.filter(r => r.resourceType === resourceType && r.status === 0)
      : candidates.filter(r => r.status === 0);
    
    if (filtered.length === 0) {
      return null;
    }
    
    // Calculate distances and sort
    const withDistances = filtered.map(resource => ({
      ...resource,
      distance: this.haversineDistance(
        location.lat,
        location.lng,
        resource.location.lat,
        resource.location.lng
      )
    }));
    
    // Filter by max distance and sort
    const inRange = withDistances
      .filter(r => r.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
    
    return inRange[0] || null;
  }

  /**
   * Find all resources within radius
   */
  async findResourcesInRadius(
    location: { lat: number; lng: number },
    radiusMeters: number,
    resourceType?: number
  ): Promise<Array<IndexedResource & { distance: number }>> {
    const targetHash = geohash.encode(location.lat, location.lng, this.PRECISION);
    const searchHashes = this.getExpandedSearchArea(targetHash, radiusMeters);
    
    const candidates = await this.db.queryResourcesByGeohash(searchHashes);
    
    const filtered = resourceType !== undefined
      ? candidates.filter(r => r.resourceType === resourceType)
      : candidates;
    
    const withDistances = filtered.map(resource => ({
      ...resource,
      distance: this.haversineDistance(
        location.lat,
        location.lng,
        resource.location.lat,
        resource.location.lng
      )
    }));
    
    return withDistances
      .filter(r => r.distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Get geohash for a location
   */
  encodeLocation(lat: number, lng: number): string {
    return geohash.encode(lat, lng, this.PRECISION);
  }

  /**
   * Decode geohash to lat/lng
   */
  decodeGeohash(hash: string): { lat: number; lng: number } {
    const coords = geohash.decode(hash);
    return { lat: coords.latitude, lng: coords.longitude };
  }

  /**
   * Get immediate neighboring geohashes (3x3 grid)
   */
  private getSearchArea(hash: string): string[] {
    const neighbors = geohash.neighbors(hash);
    return [
      hash,
      neighbors.n,
      neighbors.ne,
      neighbors.e,
      neighbors.se,
      neighbors.s,
      neighbors.sw,
      neighbors.w,
      neighbors.nw
    ];
  }

  /**
   * Get expanded search area based on radius
   */
  private getExpandedSearchArea(hash: string, radiusMeters: number): string[] {
    // Approximate: each precision 7 cell is ~153m
    // For 5km radius, need ~33 cells (5000/153)
    const cellsNeeded = Math.ceil(radiusMeters / 153);
    
    if (cellsNeeded <= 1) {
      return this.getSearchArea(hash);
    }
    
    // For larger areas, include multiple rings
    const hashes = new Set<string>([hash]);
    let currentRing = new Set([hash]);
    
    for (let ring = 0; ring < Math.ceil(cellsNeeded / 3); ring++) {
      const nextRing = new Set<string>();
      
      for (const h of currentRing) {
        const neighbors = geohash.neighbors(h);
        Object.values(neighbors).forEach(n => {
          if (!hashes.has(n)) {
            hashes.add(n);
            nextRing.add(n);
          }
        });
      }
      
      currentRing = nextRing;
    }
    
    return Array.from(hashes);
  }

  /**
   * Haversine distance between two points (meters)
   */
  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}

/**
 * JurisdictionEngine
 * 
 * Determines which agency has jurisdiction over a location
 */
export class JurisdictionEngine {
  constructor(private db: IndexerDatabase) {}

  /**
   * Find agency with jurisdiction over location
   */
  async getJurisdiction(
    location: { lat: number; lng: number }
  ): Promise<string | null> {
    const agencies = await this.db.queryAgencies();
    
    for (const agency of agencies) {
      if (agency.jurisdiction && this.pointInPolygon(location, agency.jurisdiction)) {
        return agency.agencyId;
      }
    }
    
    return null;
  }

  /**
   * Point-in-polygon test using ray casting algorithm
   * GeoJSON format: { type: 'Polygon', coordinates: [[[lng, lat], ...]] }
   */
  private pointInPolygon(
    point: { lat: number; lng: number },
    polygon: { type: 'Polygon'; coordinates: number[][][] }
  ): boolean {
    const coordinates = polygon.coordinates[0]; // Outer ring
    const x = point.lng;
    const y = point.lat;
    
    let inside = false;
    
    for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
      const xi = coordinates[i][0]; // lng
      const yi = coordinates[i][1]; // lat
      const xj = coordinates[j][0];
      const yj = coordinates[j][1];
      
      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      
      if (intersect) {
        inside = !inside;
      }
    }
    
    return inside;
  }
}

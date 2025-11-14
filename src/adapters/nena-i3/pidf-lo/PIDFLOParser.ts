import { parseString } from 'xml2js';

export interface Location {
  lat: number;
  lng: number;
  accuracy?: number;
  altitude?: number;
  civicAddress?: CivicAddress;
}

export interface CivicAddress {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export class PIDFLOParser {
  /**
   * Parse PIDF-LO XML document and extract location data
   */
  async parse(pidfloXml: string): Promise<Location | null> {
    try {
      const result = await this.parseXml(pidfloXml);
      
      // Try to extract geodetic coordinates (lat/lng)
      const geodetic = this.extractGeodetic(result);
      if (geodetic) {
        return geodetic;
      }
      
      // Try to extract civic address
      const civic = this.extractCivicAddress(result);
      if (civic) {
        // Geocode civic address (in production, use geocoding service)
        return {
          lat: 0,
          lng: 0,
          civicAddress: civic
        };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to parse PIDF-LO:', error);
      return null;
    }
  }

  /**
   * Parse XML string to JSON
   */
  private parseXml(xml: string): Promise<any> {
    return new Promise((resolve, reject) => {
      parseString(xml, { explicitArray: false }, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Extract geodetic coordinates (lat/lng) from parsed XML
   */
  private extractGeodetic(parsed: any): Location | null {
    try {
      // Navigate XML structure: presence -> tuple -> status -> geopriv -> location-info -> Point -> pos
      const presence = parsed.presence || parsed['presence:presence'];
      if (!presence) return null;

      const tuple = Array.isArray(presence.tuple) ? presence.tuple[0] : presence.tuple;
      if (!tuple) return null;

      const status = tuple.status;
      if (!status) return null;

      const geopriv = status.geopriv || status['gp:geopriv'];
      if (!geopriv) return null;

      const locationInfo = geopriv['location-info'] || geopriv['gp:location-info'];
      if (!locationInfo) return null;

      const point = locationInfo.Point || locationInfo['gml:Point'];
      if (!point) return null;

      const pos = point.pos || point['gml:pos'];
      if (!pos) return null;

      // Parse position string: "lat lng" or "lat lng altitude"
      const coords = pos.split(/\s+/).map((c: string) => parseFloat(c));
      
      if (coords.length >= 2) {
        const location: Location = {
          lat: coords[0],
          lng: coords[1]
        };

        if (coords.length >= 3) {
          location.altitude = coords[2];
        }

        // Try to extract accuracy/radius
        const locMethod = geopriv['method'] || geopriv['gp:method'];
        if (locMethod) {
          const accuracy = parseFloat(locMethod);
          if (!isNaN(accuracy)) {
            location.accuracy = accuracy;
          }
        }

        return location;
      }

      return null;
    } catch (error) {
      console.error('Failed to extract geodetic location:', error);
      return null;
    }
  }

  /**
   * Extract civic address from parsed XML
   */
  private extractCivicAddress(parsed: any): CivicAddress | null {
    try {
      const presence = parsed.presence || parsed['presence:presence'];
      if (!presence) return null;

      const tuple = Array.isArray(presence.tuple) ? presence.tuple[0] : presence.tuple;
      if (!tuple) return null;

      const status = tuple.status;
      if (!status) return null;

      const geopriv = status.geopriv || status['gp:geopriv'];
      if (!geopriv) return null;

      const locationInfo = geopriv['location-info'] || geopriv['gp:location-info'];
      if (!locationInfo) return null;

      const civicAddress = locationInfo.civicAddress || locationInfo['ca:civicAddress'];
      if (!civicAddress) return null;

      // Parse civic address components
      const civic: CivicAddress = {};

      // Street/Thoroughfare
      const street = civicAddress.A3 || civicAddress['ca:A3'];
      if (street) civic.street = street;

      // City
      const city = civicAddress.A4 || civicAddress['ca:A4'];
      if (city) civic.city = city;

      // State/Province
      const state = civicAddress.A1 || civicAddress['ca:A1'];
      if (state) civic.state = state;

      // Postal Code
      const postalCode = civicAddress.PC || civicAddress['ca:PC'];
      if (postalCode) civic.postalCode = postalCode;

      // Country
      const country = civicAddress.country || civicAddress['ca:country'];
      if (country) civic.country = country;

      return Object.keys(civic).length > 0 ? civic : null;
    } catch (error) {
      console.error('Failed to extract civic address:', error);
      return null;
    }
  }

  /**
   * Validate location has minimum required data
   */
  validate(location: Location): boolean {
    // Must have lat/lng or civic address
    if (location.lat !== 0 && location.lng !== 0) {
      // Validate coordinate ranges
      if (location.lat < -90 || location.lat > 90) return false;
      if (location.lng < -180 || location.lng > 180) return false;
      return true;
    }

    if (location.civicAddress) {
      // At minimum need street or city
      return !!(location.civicAddress.street || location.civicAddress.city);
    }

    return false;
  }
}

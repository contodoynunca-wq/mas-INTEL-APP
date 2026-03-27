export interface CouncilArea {
  name: string;
  type: 'city' | 'town' | 'district' | 'county';
  county: string;
  portalUrl: string;
  distanceFromCenter?: number; // Only for surrounding areas
}

export interface RegionMap {
  center: CouncilArea;
  surrounding: CouncilArea[];
}

export const UK_REGIONS: Record<string, RegionMap> = {
  PLYMOUTH: {
    center: {
      name: 'Plymouth',
      type: 'city',
      county: 'Devon',
      portalUrl: 'https://planning.plymouth.gov.uk/online-applications'
    },
    surrounding: [
      {
        name: 'South Hams',
        type: 'district',
        county: 'Devon',
        portalUrl: 'https://apps.southhams.gov.uk/planningdocuments',
        distanceFromCenter: 8
      },
      {
        name: 'West Devon',
        type: 'district',
        county: 'Devon',
        portalUrl: 'https://apps.westdevon.gov.uk/planningdocuments',
        distanceFromCenter: 12
      },
      {
        name: 'Cornwall',
        type: 'county',
        county: 'Cornwall',
        portalUrl: 'https://planning.cornwall.gov.uk/online-applications',
        distanceFromCenter: 10
      },
      {
        name: 'Torbay',
        type: 'district',
        county: 'Devon',
        portalUrl: 'https://www.torbay.gov.uk/planning',
        distanceFromCenter: 25
      },
       {
        name: 'Teignbridge',
        type: 'district',
        county: 'Devon',
        portalUrl: 'https://www.teignbridge.gov.uk/planning',
        distanceFromCenter: 30
      }
    ]
  },
  
  CORNWALL: {
    center: {
      name: 'Cornwall',
      type: 'county',
      county: 'Cornwall',
      portalUrl: 'https://planning.cornwall.gov.uk/online-applications'
    },
    surrounding: [] // Cornwall is the county, no surrounding areas needed
  }
};

/**
 * Helper function to get councils within a specified radius of a major location.
 * @param location The central location name (e.g., "Plymouth").
 * @param radiusMiles The search radius in miles.
 * @returns An array of CouncilArea objects within the radius.
 */
export function getCouncilsInRadius(
  location: string,
  radiusMiles: number
): CouncilArea[] {
  // Normalize location name to find a match in the config keys
  const normalizedLocation = location.toUpperCase().replace(/[^A-Z]/g, '');
  
  const regionEntry = Object.entries(UK_REGIONS).find(([key]) => 
    normalizedLocation.includes(key)
  );
  
  if (!regionEntry) {
    return []; // Location not found in our predefined regions
  }
  
  const region = regionEntry[1];
  
  // Start with the central council area
  const councils: CouncilArea[] = [region.center];
  
  // Add surrounding areas that are within the specified radius
  region.surrounding.forEach(area => {
    if (area.distanceFromCenter !== undefined && area.distanceFromCenter <= radiusMiles) {
      councils.push(area);
    }
  });
  
  return councils;
}

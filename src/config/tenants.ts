/**
 * Configuration multi-tenant LaCarotte
 */

export interface TenantConfig {
  canonicalName: string;
  displayName: string;
  city: string;
  region: string;
  coordinates: { lat: number; lng: number };
  deliveryRadiusKm: number;
  currency: string;
  timezone: string;
  language: string;
}

export const tenants: Record<string, TenantConfig> = {
  ".fr.la-carotte": {
    canonicalName: ".fr.la-carotte",
    displayName: "LaCarotte Poitiers",
    city: "Poitiers",
    region: "Nouvelle-Aquitaine",
    coordinates: { lat: 46.5802, lng: 0.3404 },
    deliveryRadiusKm: 30,
    currency: "EUR",
    timezone: "Europe/Paris",
    language: "fr",
  },
};

export function getTenantConfig(tenantId: string): TenantConfig {
  const tenant = tenants[tenantId];
  if (!tenant) {
    throw new Error(`Unknown tenant: ${tenantId}`);
  }
  return tenant;
}

export function getDefaultTenantId(): string {
  return ".fr.la-carotte";
}

/**
 * Cache des contrats LaCarotte
 *
 * Construit et met en cache deux maps à partir de Contract.conditions :
 *   - productToPartner : productId → partnerId
 *   - partnerToProducts : partnerId → productId[]
 *
 * Source : Product → Contract (via conditions[].productId) → Partner (via Contract.partnerId)
 */

import { getLaCarotteClient } from "./lacarotte-client.js";

interface ContractMaps {
  /** productId → partnerId */
  productToPartner: Map<string, string>;
  /** partnerId → productId[] */
  partnerToProducts: Map<string, string[]>;
}

interface CacheEntry extends ContractMaps {
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const cacheByTenant = new Map<string, CacheEntry>();

export async function getContractMaps(tenantId: string): Promise<ContractMaps> {
  const now = Date.now();
  const cached = cacheByTenant.get(tenantId);
  if (cached && now < cached.expiresAt) {
    return { productToPartner: cached.productToPartner, partnerToProducts: cached.partnerToProducts };
  }

  const client = getLaCarotteClient();
  const contracts = await client.getContracts(undefined, tenantId);

  const productToPartner = new Map<string, string>();
  const partnerToProducts = new Map<string, string[]>();

  for (const contract of contracts) {
    if (!contract.partnerId || contract.deleted) continue;
    for (const cond of contract.conditions ?? []) {
      if (!cond.productId) continue;
      productToPartner.set(cond.productId, contract.partnerId);
      const list = partnerToProducts.get(contract.partnerId) ?? [];
      list.push(cond.productId);
      partnerToProducts.set(contract.partnerId, list);
    }
  }

  cacheByTenant.set(tenantId, { productToPartner, partnerToProducts, expiresAt: now + TTL_MS });
  return { productToPartner, partnerToProducts };
}

export function invalidateContractCache(tenantId?: string): void {
  if (tenantId) {
    cacheByTenant.delete(tenantId);
  } else {
    cacheByTenant.clear();
  }
}

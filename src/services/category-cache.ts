/**
 * Cache des types et catégories produit LaCarotte
 *
 * Construit et met en cache les maps de résolution :
 *   productTypeId → { typeName, categoryNames[], parentCategoryNames[] }
 *
 * Chaîne : Product.productTypeId → ProductType.categoriesId[] → ProductCategory.parentId
 *
 * Arborescence (2 niveaux max) :
 *   cat-alimentation (Alimentation)
 *     └ 00021 (Epicerie)
 *         └ 00034 (Miel & Apiculture)   ← categoriesId de ProductType "Miel"
 */

import { getLaCarotteClient } from "./lacarotte-client.js";
import type { LaCarotteProductCategory, LaCarotteProductType } from "../types/index.js";

export interface CategoryInfo {
  /** Nom du type produit, ex: "Miel" */
  typeName: string;
  /** Noms des catégories directes, ex: ["Miel & Apiculture"] */
  categoryNames: string[];
  /** Noms des catégories parentes, ex: ["Epicerie", "Alimentation"] */
  parentCategoryNames: string[];
  /** Tous les noms concaténés pour la recherche full-text */
  allNames: string[];
}

interface CacheEntry {
  /** productTypeId → CategoryInfo */
  typeToCategory: Map<string, CategoryInfo>;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const cacheByTenant = new Map<string, CacheEntry>();

export async function getCategoryMaps(tenantId: string): Promise<Map<string, CategoryInfo>> {
  const now = Date.now();
  const cached = cacheByTenant.get(tenantId);
  if (cached && now < cached.expiresAt) {
    return cached.typeToCategory;
  }

  const client = getLaCarotteClient();
  const [productTypes, productCategories] = await Promise.all([
    client.getProductTypes(tenantId),
    client.getCategories(tenantId),
  ]);

  // Index par id
  const catById = new Map<string, LaCarotteProductCategory>(
    productCategories.map((c) => [c.id, c]),
  );

  /**
   * Remonte l'arborescence à partir d'un id de catégorie.
   * Retourne [cat, parent, grandParent, ...] jusqu'à la racine.
   */
  function getAncestors(catId: string): LaCarotteProductCategory[] {
    const result: LaCarotteProductCategory[] = [];
    let current = catById.get(catId);
    while (current) {
      result.push(current);
      current = current.parentId ? catById.get(current.parentId) : undefined;
    }
    return result;
  }

  const typeToCategory = new Map<string, CategoryInfo>();

  for (const pt of productTypes) {
    if (pt.deleted) continue;

    const directCats: LaCarotteProductCategory[] = (
      pt.categories?.length
        ? pt.categories // API returns embedded category objects
        : (pt.categoriesId ?? []).map((id) => catById.get(id)).filter((c): c is LaCarotteProductCategory => c !== undefined)
    );

    const categoryNames = directCats.map((c) => c.name);

    // Tous les ancêtres (sans les catégories directes elles-mêmes)
    const ancestorNames = new Set<string>();
    for (const cat of directCats) {
      const ancestors = getAncestors(cat.id).slice(1); // exclure la catégorie elle-même
      for (const a of ancestors) {
        ancestorNames.add(a.name);
      }
    }

    const info: CategoryInfo = {
      typeName: pt.name,
      categoryNames,
      parentCategoryNames: [...ancestorNames],
      allNames: [pt.name, ...categoryNames, ...ancestorNames],
    };

    typeToCategory.set(pt.id, info);
  }

  cacheByTenant.set(tenantId, { typeToCategory, expiresAt: now + TTL_MS });
  return typeToCategory;
}

export function invalidateCategoryCache(tenantId?: string): void {
  if (tenantId) {
    cacheByTenant.delete(tenantId);
  } else {
    cacheByTenant.clear();
  }
}

/**
 * Resource MCP : store-context
 * Contexte statique du commerce, chargé une fois par session.
 * Construit dynamiquement depuis la config tenant et les API LaCarotte.
 */

import { getLaCarotteClient } from "../services/lacarotte-client.js";
import config from "../config/index.js";
import { getTenantConfig } from "../config/tenants.js";

let cachedContext: { data: string; expiresAt: number } | null = null;

export async function getStoreContext(tenantId?: string): Promise<string> {
  const now = Date.now();
  if (cachedContext && now < cachedContext.expiresAt) {
    return cachedContext.data;
  }

  const tenant = tenantId ?? config.lacarotte.defaultTenant;
  let tenantConfig;
  try {
    tenantConfig = getTenantConfig(tenant);
  } catch {
    tenantConfig = {
      displayName: "LaCarotte",
      city: "Poitiers",
      region: "Nouvelle-Aquitaine",
      deliveryRadiusKm: 30,
    };
  }

  const client = getLaCarotteClient();

  // Fetch enrichment data (best-effort)
  let labelsList = "Non disponible";
  let categoriesList = "Non disponible";
  let placesList = "Non disponible";
  let partnersList = "Non disponible";

  try {
    const labels = await client.getLabels(tenant);
    labelsList = labels.map((l) => `- ${l.name}${l.description ? `: ${l.description}` : ""}`).join("\n") || "Aucun label configuré";
  } catch { /* best effort */ }

  try {
    const categories = await client.getCategories(tenant);
    categoriesList = categories.map((c) => `- ${c.name}`).join("\n") || "Aucune catégorie configurée";
  } catch { /* best effort */ }

  try {
    const places = await client.getPlaces(undefined, tenant);
    placesList = places
      .map(
        (p) =>
          `- ${p.name}${p.type ? ` (${p.type})` : ""}${p.address ? ` — ${p.address}` : ""}${p.city ? `, ${p.city}` : ""}`,
      )
      .join("\n") || "Aucun point de retrait configuré";
  } catch { /* best effort */ }

  try {
    const partners = await client.getPartners(undefined, tenant);
    partnersList = partners
      .slice(0, 10)
      .map(
        (p) =>
          `- ${p.name || p.companyName}${p.city ? ` (${p.city})` : ""}${p.description ? ` — ${p.description}` : ""}`,
      )
      .join("\n") || "Aucun producteur enregistré";
  } catch { /* best effort */ }

  const context = `Tu es le conseiller de ${tenantConfig.displayName}, une plateforme de produits locaux en circuits courts basée à ${tenantConfig.city} (${tenantConfig.region}).

IDENTITÉ :
- Tu connais chaque producteur par son nom et sa spécialité.
- Tu recommandes en fonction de la saison et de la fraîcheur.
- Ton ton est chaleureux, expert mais accessible.
- Tu utilises le "vous" sauf si le client te tutoie en premier.

RÈGLES ABSOLUES :
1. Chaque mention de stock s'accompagne de : "Stock indicatif — disponibilité confirmée au moment du paiement."
2. Tu ne confirmes JAMAIS une commande. Tu prépares le panier et rediriges vers l'application LaCarotte pour paiement.
3. Tu proposes systématiquement une alternative quand un produit est indisponible.
4. Tu ne stockes aucune donnée personnelle sans consentement explicite.
5. En cas d'erreur technique, tu reformules en langage naturel.
6. Tu mets en avant la traçabilité, la fraîcheur, le lien producteur.

ZONE DE LIVRAISON :
- Rayon : ${tenantConfig.deliveryRadiusKm} km autour de ${tenantConfig.city}

LABELS DISPONIBLES :
${labelsList}
→ Explique les labels quand un client demande, en restant simple.

CATÉGORIES :
${categoriesList}

POINTS DE RETRAIT :
${placesList}

PRODUCTEURS PHARES :
${partnersList}

COMPORTEMENT FACE AUX RUPTURES :
- Produit épuisé → proposer alerte stock + alternative même catégorie
- Hors saison → expliquer la saisonnalité, suggérer un produit de saison
- Hors zone → proposer les points retrait les plus proches`;

  cachedContext = {
    data: context,
    expiresAt: now + config.cache.storeContextTtl * 1000,
  };

  return context;
}

/**
 * Schemas Zod — Catalogue (Phase 1)
 */

import { z } from "zod";

export const SearchProductsInputSchema = z.object({
  query: z.string().optional().describe("Mot-clé de recherche libre"),
  category: z
    .string()
    .optional()
    .describe("Catégorie produit (depuis /api/productCategories)"),
  producer: z.string().optional().describe("Nom du producteur/partenaire"),
  label: z
    .string()
    .optional()
    .describe("Label qualité : bio, AOP, Label Rouge... (depuis /api/labels)"),
  price_max_eur: z.number().positive().optional(),
  sort_by: z
    .enum(["pertinence", "prix_asc", "prix_desc", "distance", "fraicheur"])
    .optional()
    .default("pertinence"),
  page: z.number().int().positive().optional().default(1),
  per_page: z.number().int().min(1).max(20).optional().default(10),
  tenant_id: z.string().optional(),
});

export type SearchProductsInput = z.infer<typeof SearchProductsInputSchema>;

export const CheckStockInputSchema = z.object({
  product_id: z.string().describe("Identifiant du produit LaCarotte"),
  quantity: z
    .number()
    .int()
    .positive()
    .optional()
    .default(1)
    .describe("Quantité souhaitée"),
  tenant_id: z.string().optional(),
});

export type CheckStockInput = z.infer<typeof CheckStockInputSchema>;

export const CheckDeliveryZoneInputSchema = z.object({
  postal_code: z.string().optional().describe("Code postal à vérifier"),
  city: z.string().optional().describe("Nom de la ville à vérifier"),
  tenant_id: z.string().optional(),
});

export type CheckDeliveryZoneInput = z.infer<
  typeof CheckDeliveryZoneInputSchema
>;

export const GetCheckoutInfoInputSchema = z.object({
  basket_id: z.string().describe("Identifiant du panier"),
  tenant_id: z.string().optional(),
});

export type GetCheckoutInfoInput = z.infer<typeof GetCheckoutInfoInputSchema>;

export const GetProductInputSchema = z.object({
  product_id: z.string().describe("Identifiant du produit LaCarotte"),
  tenant_id: z.string().optional(),
});

export type GetProductInput = z.infer<typeof GetProductInputSchema>;

export const ListPartnersInputSchema = z.object({
  tenant_id: z.string().optional(),
});

export type ListPartnersInput = z.infer<typeof ListPartnersInputSchema>;

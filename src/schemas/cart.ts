/**
 * Schemas Zod — Panier (Phase 2)
 */

import { z } from "zod";

export const CreateBasketInputSchema = z.object({
  label: z.string().max(100).optional().describe("Nom du panier"),
  tenant_id: z.string().optional(),
});

export type CreateBasketInput = z.infer<typeof CreateBasketInputSchema>;

export const AddToBasketInputSchema = z.object({
  basket_id: z.string().describe("Identifiant du panier"),
  product_id: z.string().describe("Identifiant du produit à ajouter"),
  quantity: z
    .number()
    .int()
    .positive()
    .default(1)
    .describe("Quantité à ajouter"),
  added_by: z
    .string()
    .max(50)
    .optional()
    .default("Client")
    .describe("Prénom du participant qui ajoute"),
  owner_token: z.string().optional().describe("Token propriétaire du panier"),
  tenant_id: z.string().optional(),
});

export type AddToBasketInput = z.infer<typeof AddToBasketInputSchema>;

export const GetBasketInputSchema = z.object({
  basket_id: z.string().describe("Identifiant du panier"),
  share_token: z
    .string()
    .optional()
    .describe("Token de partage (lecture seule)"),
  owner_token: z
    .string()
    .optional()
    .describe("Token propriétaire (lecture/écriture)"),
  tenant_id: z.string().optional(),
});

export type GetBasketInput = z.infer<typeof GetBasketInputSchema>;

export const RemoveFromBasketInputSchema = z.object({
  basket_id: z.string().describe("Identifiant du panier"),
  product_id: z.string().describe("Identifiant du produit à retirer"),
  owner_token: z.string().describe("Token propriétaire du panier"),
  tenant_id: z.string().optional(),
});

export type RemoveFromBasketInput = z.infer<typeof RemoveFromBasketInputSchema>;

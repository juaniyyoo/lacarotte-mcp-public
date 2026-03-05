/**
 * Schemas Zod — Partage (Phase 2)
 */

import { z } from "zod";

export const ShareBasketEmailInputSchema = z.object({
  basket_id: z.string().describe("Identifiant du panier à partager"),
  owner_token: z.string().describe("Token propriétaire du panier"),
  recipient_email: z.string().email().describe("Email du destinataire"),
  personal_message: z
    .string()
    .max(500)
    .optional()
    .describe("Message personnalisé"),
  consent_given: z
    .boolean()
    .describe(
      "Le client confirme avoir le consentement du destinataire pour l'envoi",
    ),
  tenant_id: z.string().optional(),
});

export type ShareBasketEmailInput = z.infer<typeof ShareBasketEmailInputSchema>;

export const ShareBasketSmsInputSchema = z.object({
  basket_id: z.string().describe("Identifiant du panier à partager"),
  owner_token: z.string().describe("Token propriétaire du panier"),
  recipient_phone: z
    .string()
    .regex(/^\+?[0-9]{10,15}$/)
    .describe("Numéro de téléphone du destinataire"),
  personal_message: z
    .string()
    .max(160)
    .optional()
    .describe("Message personnalisé (max 160 caractères)"),
  consent_given: z
    .boolean()
    .describe(
      "Le client confirme avoir le consentement du destinataire pour l'envoi",
    ),
  tenant_id: z.string().optional(),
});

export type ShareBasketSmsInput = z.infer<typeof ShareBasketSmsInputSchema>;

export const GetSharedBasketStatusInputSchema = z.object({
  basket_id: z.string().describe("Identifiant du panier"),
  owner_token: z.string().describe("Token propriétaire du panier"),
  tenant_id: z.string().optional(),
});

export type GetSharedBasketStatusInput = z.infer<
  typeof GetSharedBasketStatusInputSchema
>;

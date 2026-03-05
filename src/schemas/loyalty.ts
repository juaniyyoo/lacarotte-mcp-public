/**
 * Schemas Zod — Fidélisation (Phase 3)
 */

import { z } from "zod";

export const CreateSubscriptionInputSchema = z.object({
  frequency: z
    .enum(["weekly", "biweekly", "monthly"])
    .describe("Fréquence de livraison"),
  budget_eur: z.number().positive().optional().describe("Budget maximal en €"),
  budget_tolerance_pct: z
    .number()
    .min(0)
    .max(50)
    .optional()
    .default(10)
    .describe("Tolérance budgétaire en %"),
  preferred_day: z
    .enum([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ])
    .describe("Jour de livraison préféré"),
  products: z
    .array(
      z.object({
        product_id: z.string().optional(),
        category: z.string().optional(),
        priority: z.number().min(1).max(3).default(2),
        max_quantity: z.number().int().positive().default(1),
        notes: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .describe("Produits ou catégories souhaités"),
  notification_channel: z
    .enum(["email", "sms", "whatsapp", "both"])
    .default("email"),
  notification_contact: z
    .string()
    .describe("Email ou téléphone pour les notifications"),
  tenant_id: z.string().optional(),
});

export type CreateSubscriptionInput = z.infer<
  typeof CreateSubscriptionInputSchema
>;

export const RegisterStockAlertInputSchema = z.object({
  product_id: z.string().describe("Identifiant du produit à surveiller"),
  contact_type: z.enum(["email", "sms"]).describe("Canal de notification"),
  contact_value: z.string().describe("Email ou numéro de téléphone"),
  consent_given: z
    .boolean()
    .describe("Le client consent à être contacté pour cette alerte"),
  tenant_id: z.string().optional(),
});

export type RegisterStockAlertInput = z.infer<
  typeof RegisterStockAlertInputSchema
>;

export const ComposeSurpriseBasketInputSchema = z.object({
  budget_eur: z
    .number()
    .positive()
    .describe("Budget pour la composition surprise"),
  preferences: z
    .object({
      categories: z
        .array(z.string())
        .optional()
        .describe("Catégories préférées"),
      excluded_allergens: z
        .array(z.string())
        .optional()
        .describe("Allergènes à exclure"),
      producer_preference: z
        .string()
        .optional()
        .describe("Producteur préféré"),
    })
    .optional(),
  tenant_id: z.string().optional(),
});

export type ComposeSurpriseBasketInput = z.infer<
  typeof ComposeSurpriseBasketInputSchema
>;

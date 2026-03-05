/**
 * Schemas Zod — Analytics (Phase 3-4)
 */

import { z } from "zod";

export const GetDashboardDataInputSchema = z.object({
  start_date: z.string().describe("Date de début (ISO 8601)"),
  end_date: z.string().describe("Date de fin (ISO 8601)"),
  metrics: z
    .array(
      z.enum(["revenue", "orders", "users", "baskets", "categories"]),
    )
    .optional()
    .default(["revenue", "orders"]),
  group_by: z
    .enum(["day", "week", "month"])
    .optional()
    .default("day"),
  tenant_id: z.string().optional(),
});

export type GetDashboardDataInput = z.infer<typeof GetDashboardDataInputSchema>;

export const GetProducerDashboardInputSchema = z.object({
  producer_id: z.string().describe("Identifiant du producteur/partenaire"),
  start_date: z.string().describe("Date de début (ISO 8601)"),
  end_date: z.string().describe("Date de fin (ISO 8601)"),
  tenant_id: z.string().optional(),
});

export type GetProducerDashboardInput = z.infer<
  typeof GetProducerDashboardInputSchema
>;

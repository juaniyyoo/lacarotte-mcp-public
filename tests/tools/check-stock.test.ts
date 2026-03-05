/**
 * Tests unitaires — check_stock schema
 */

import { describe, it, expect } from "vitest";
import { CheckStockInputSchema } from "../../src/schemas/catalog.js";

describe("CheckStockInputSchema", () => {
  it("T09 — accepts valid product_id and quantity", () => {
    const result = CheckStockInputSchema.safeParse({
      product_id: "abc123",
      quantity: 2,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.product_id).toBe("abc123");
      expect(result.data.quantity).toBe(2);
    }
  });

  it("defaults quantity to 1", () => {
    const result = CheckStockInputSchema.safeParse({
      product_id: "abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantity).toBe(1);
    }
  });

  it("rejects missing product_id", () => {
    const result = CheckStockInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = CheckStockInputSchema.safeParse({
      product_id: "abc123",
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });
});

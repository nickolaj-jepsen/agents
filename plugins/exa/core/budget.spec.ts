import { describe, expect, test } from "vitest";

import { contextBudget, fetchPlan, MAX_PAGE_CHARS, resultCount, searchCap } from "./budget.ts";

describe("contextBudget", () => {
  test("takes a share of the window while the context is empty", () => {
    expect(contextBudget(200_000, 0).total).toBe(48_000);
  });

  test("takes a share of what is free when that is less", () => {
    // 10k free: 25% of it is 2.5k tokens, 10k chars, under the window's 6%.
    expect(contextBudget(200_000, 190_000).total).toBe(10_000);
  });

  test("never falls below the floor, even with the context full or over", () => {
    expect(contextBudget(200_000, 200_000).total).toBe(4_000);
    expect(contextBudget(200_000, 250_000).total).toBe(4_000);
  });

  test("never passes the ceiling on a huge window", () => {
    expect(contextBudget(2_000_000, 0).total).toBe(120_000);
  });

  test("an unknown usage counts half the window as free", () => {
    expect(contextBudget(200_000).total).toBe(contextBudget(200_000, 100_000).total);
    expect(contextBudget(200_000, null).total).toBe(contextBudget(200_000, 100_000).total);
  });
});

describe("resultCount", () => {
  test("asks for fewer results on a smaller window", () => {
    expect([32_000, 64_000, 150_000, 500_000].map(resultCount)).toEqual([3, 5, 8, 10]);
  });
});

describe("searchCap", () => {
  test("splits the total evenly, up to the default", () => {
    expect(searchCap(48_000, 3)).toBe(8_000);
    expect(searchCap(12_000, 4)).toBe(3_000);
  });

  test("a requested cap lowers it, but the total still holds it down", () => {
    expect(searchCap(48_000, 3, 500)).toBe(500);
    expect(searchCap(48_000, 3, 99_000)).toBe(16_000);
  });

  test("many results on a small budget stay at one char or more", () => {
    expect(searchCap(4_000, 100)).toBe(40);
    expect(searchCap(100, 1_000)).toBe(1);
  });
});

describe("fetchPlan", () => {
  test("one page may take the whole total, up to the page ceiling", () => {
    expect(fetchPlan(120_000, 1)).toEqual({ maxPages: 1, perPage: MAX_PAGE_CHARS });
  });

  test("reads every page when each still gets a useful share", () => {
    expect(fetchPlan(48_000, 3)).toEqual({ maxPages: 3, perPage: 16_000 });
  });

  test("a small budget reads fewer pages instead of cutting all of them thin", () => {
    // 4,000 chars at 1,500 a page is two pages out of ten.
    expect(fetchPlan(4_000, 10)).toEqual({ maxPages: 2, perPage: 2_000 });
  });

  test("a requested cap above the ceiling is held to it", () => {
    expect(fetchPlan(120_000, 1, 500_000).perPage).toBe(MAX_PAGE_CHARS);
  });

  test("never plans more than the pages it was given, or fewer than one", () => {
    expect(fetchPlan(120_000, 2).maxPages).toBe(2);
    expect(fetchPlan(1, 5).maxPages).toBe(1);
  });
});

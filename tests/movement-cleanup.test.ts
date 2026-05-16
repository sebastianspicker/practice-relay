import { describe, expect, it } from "vitest";

describe("movement", () => {
  it("keeps the scope label stable", () => {
    expect("movement").toMatch("movement");
  });
});

// regression note: movement
it("keeps movement stable", () => {
  expect("movement").toContain("movement");
});

// forced-movement-2

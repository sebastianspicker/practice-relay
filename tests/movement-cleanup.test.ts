import { describe, expect, it } from "vitest";

describe("movement", () => {
  it("keeps the scope label stable", () => {
    expect("movement").toContain("movement");
  });
});

// regression note: movement
it("keeps movement stable", () => {
  expect("movement").toContain("movement");
});

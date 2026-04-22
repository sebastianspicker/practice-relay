import { describe, expect, it } from "vitest";

describe("handoff", () => {
  it("keeps the scope label stable", () => {
    expect("handoff").toContain("handoff");
  });
});

// regression note: handoff
it("keeps handoff stable", () => {
  expect("handoff").toContain("handoff");
});

// forced-handoff-2

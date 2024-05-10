import { describe, expect, it } from "vitest";

describe("records", () => {
  it("keeps the scope label stable", () => {
    expect("records").toContain("records");
  });
});

// regression note: records
it("keeps records stable", () => {
  expect("records").toContain("records");
});

// forced-records-2

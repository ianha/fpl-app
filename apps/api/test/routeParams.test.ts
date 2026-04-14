import { describe, expect, it } from "vitest";
import { parseOptionalPositiveInt, parseRequiredPositiveInt, parseEnumValue } from "../src/routes/routeParams.js";

describe("routeParams", () => {
  it("parses required and optional positive ints", () => {
    expect(parseRequiredPositiveInt("12", "accountId")).toEqual({ value: 12 });
    expect(parseOptionalPositiveInt("7", "gw")).toEqual({ value: 7 });
    expect(parseOptionalPositiveInt(undefined, "gw")).toEqual({ value: undefined });
  });

  it("returns errors for invalid positive ints", () => {
    expect(parseRequiredPositiveInt("0", "accountId")).toEqual({
      error: { status: 400, message: "accountId must be a positive integer" },
    });
    expect(parseOptionalPositiveInt("0", "gw")).toEqual({
      error: { status: 400, message: "gw must be a positive integer when provided" },
    });
  });

  it("parses enum values with a custom validation message", () => {
    expect(parseEnumValue("h2h", ["classic", "h2h"], "type", "type must be classic or h2h")).toEqual({
      value: "h2h",
    });
    expect(parseEnumValue("bad", ["classic", "h2h"], "type", "type must be classic or h2h")).toEqual({
      error: { status: 400, message: "type must be classic or h2h" },
    });
  });
});

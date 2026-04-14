import { describe, expect, it } from "vitest";
import {
  hasFlag,
  parseOptionalPositiveIntegerArg,
  parseOptionalStringArg,
} from "../src/cli/argParsers.js";

describe("argParsers", () => {
  it("parses positive integers from positional and equals syntax", () => {
    expect(parseOptionalPositiveIntegerArg(["--gameweek", "12"], ["--gameweek", "-g"], "--gameweek")).toBe(12);
    expect(parseOptionalPositiveIntegerArg(["--gameweek=14"], ["--gameweek", "-g"], "--gameweek")).toBe(14);
    expect(parseOptionalPositiveIntegerArg(["-g", "9"], ["--gameweek", "-g"], "--gameweek")).toBe(9);
  });

  it("parses strings from positional and equals syntax", () => {
    expect(parseOptionalStringArg(["--email", "ian@fpl.local"], ["--email", "-e"], "--email")).toBe("ian@fpl.local");
    expect(parseOptionalStringArg(["--email=ian@fpl.local"], ["--email", "-e"], "--email")).toBe("ian@fpl.local");
  });

  it("returns undefined when an arg is not present", () => {
    expect(parseOptionalPositiveIntegerArg([], ["--gameweek", "-g"], "--gameweek")).toBeUndefined();
    expect(parseOptionalStringArg([], ["--email", "-e"], "--email")).toBeUndefined();
    expect(hasFlag([], ["--force", "-f"])).toBe(false);
  });

  it("throws for invalid positive integers and empty strings", () => {
    expect(() => parseOptionalPositiveIntegerArg(["--gameweek", "0"], ["--gameweek", "-g"], "--gameweek")).toThrow(
      "`--gameweek` must be followed by a positive integer.",
    );
    expect(() => parseOptionalPositiveIntegerArg(["--gameweek=0"], ["--gameweek", "-g"], "--gameweek")).toThrow(
      "`--gameweek` must be a positive integer.",
    );
    expect(() => parseOptionalStringArg(["--email", ""], ["--email", "-e"], "--email")).toThrow(
      "`--email` must be followed by a value.",
    );
  });
});

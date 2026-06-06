import { describe, expect, it } from "vitest";
import { getServerCapabilities, getToolNames } from "../../src/server-metadata.js";

describe("server capabilities", () => {
  it("advertises tools", () => {
    expect(getServerCapabilities()).toEqual({ tools: {} });
  });

  it("does not advertise sampling or other broad capabilities", () => {
    expect(getServerCapabilities()).not.toHaveProperty("sampling");
    expect(getServerCapabilities()).not.toHaveProperty("resources");
    expect(getServerCapabilities()).not.toHaveProperty("prompts");
  });
});

describe("tool metadata", () => {
  it("preserves Deep Research and upload workflow tools", () => {
    expect(getToolNames()).toEqual(
      expect.arrayContaining(["comet_mode", "comet_upload", "comet_ask"]),
    );
  });
});

import { readFileSync } from "fs";
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

  it("lets comet_upload checkOnly run without a staged file path", () => {
    const indexSource = readFileSync("src/index.ts", "utf8");
    const uploadToolBlock = indexSource.slice(
      indexSource.indexOf('name: "comet_upload"'),
      indexSource.indexOf('const server = new Server'),
    );

    expect(uploadToolBlock).not.toContain('required: ["filePath"]');
    expect(indexSource.indexOf("if (checkOnly)")).toBeLessThan(
      indexSource.indexOf("Error: filePath is required"),
    );
  });
});

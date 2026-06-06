import { describe, expect, it } from "vitest";
import {
  buildCometLaunchArgs,
  buildPowerShellArgumentListLiteral,
} from "../../src/cdp-client.js";
import type { CometConfig } from "../../src/config.js";

const baseConfig: CometConfig = {
  host: "127.0.0.1",
  port: 9223,
  cometPath: "/Applications/Comet.app/Contents/MacOS/Comet",
  userDataDir: "/Users/tester/Library/Application Support/comet-mcp-agent-profile",
  uploadDir: "/Users/tester/Library/Application Support/comet-mcp-uploads",
  browserUploadDir: "/Users/tester/Library/Application Support/comet-mcp-uploads",
  allowCometRestart: false,
};

describe("buildCometLaunchArgs", () => {
  it("forces CDP to bind to loopback only", () => {
    expect(buildCometLaunchArgs(baseConfig)).toContain(
      "--remote-debugging-address=127.0.0.1",
    );
  });

  it("uses the validated CDP port", () => {
    expect(buildCometLaunchArgs({ ...baseConfig, port: 9333 })).toContain(
      "--remote-debugging-port=9333",
    );
  });

  it("always launches with the dedicated user-data-dir", () => {
    expect(buildCometLaunchArgs(baseConfig)).toContain(
      `--user-data-dir=${baseConfig.userDataDir}`,
    );
  });

  it("does not include a wildcard bind address", () => {
    expect(buildCometLaunchArgs(baseConfig).join(" ")).not.toContain("0.0.0.0");
  });
});

describe("buildPowerShellArgumentListLiteral", () => {
  it("passes the same safe launch flags through WSL PowerShell", () => {
    const literal = buildPowerShellArgumentListLiteral(buildCometLaunchArgs(baseConfig));

    expect(literal).toContain("--remote-debugging-address=127.0.0.1");
    expect(literal).toContain("--remote-debugging-port=9223");
    expect(literal).toContain(`--user-data-dir=${baseConfig.userDataDir}`);
  });

  it("embeds double quotes around PowerShell launch args that contain spaces", () => {
    const literal = buildPowerShellArgumentListLiteral([
      "--remote-debugging-port=9223",
      "--user-data-dir=C:\\Users\\Jane Doe\\AppData\\Local\\comet-mcp-agent-profile",
    ]);

    expect(literal).toContain(
      "'\"--user-data-dir=C:\\Users\\Jane Doe\\AppData\\Local\\comet-mcp-agent-profile\"'",
    );
  });

  it("rejects control characters before building a PowerShell literal", () => {
    expect(() => buildPowerShellArgumentListLiteral(["--ok", "bad\narg"])).toThrow(
      /control characters/i,
    );
  });
});

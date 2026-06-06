import { describe, expect, it } from "vitest";
import { shouldRestartComet } from "../../src/cdp-client.js";
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

describe("shouldRestartComet", () => {
  it("refuses to restart an externally running Comet by default", () => {
    const decision = shouldRestartComet(baseConfig, {
      isCometRunning: true,
      hasDebugPort: false,
      hasManagedProcess: false,
    });

    expect(decision.action).toBe("refuse");
    expect(decision.message).toMatch(/close.*Comet/i);
    expect(decision.message).toMatch(/COMET_ALLOW_RESTART=1/i);
  });

  it("allows restart only when restart is enabled and the process is managed", () => {
    const decision = shouldRestartComet(
      { ...baseConfig, allowCometRestart: true },
      {
        isCometRunning: true,
        hasDebugPort: false,
        hasManagedProcess: true,
      },
    );

    expect(decision.action).toBe("restart-managed");
  });

  it("still refuses broad restarts even when restart is enabled but no managed process exists", () => {
    const decision = shouldRestartComet(
      { ...baseConfig, allowCometRestart: true },
      {
        isCometRunning: true,
        hasDebugPort: false,
        hasManagedProcess: false,
      },
    );

    expect(decision.action).toBe("refuse");
  });

  it("never returns a broad kill command", () => {
    const decisions = [
      shouldRestartComet(baseConfig, { isCometRunning: false, hasDebugPort: false, hasManagedProcess: false }),
      shouldRestartComet(baseConfig, { isCometRunning: true, hasDebugPort: true, hasManagedProcess: false }),
      shouldRestartComet({ ...baseConfig, allowCometRestart: true }, { isCometRunning: true, hasDebugPort: false, hasManagedProcess: true }),
    ];

    for (const decision of decisions) {
      expect(JSON.stringify(decision)).not.toMatch(/pkill|taskkill|comet\.exe|Comet\.app/i);
    }
  });
});

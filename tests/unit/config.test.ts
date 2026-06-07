import { describe, expect, it } from "vitest";
import { getCometConfig } from "../../src/config.js";

const platformInfo = {
  platform: "darwin" as const,
  homeDir: "/Users/tester",
  localAppData: "/Users/tester/Library/Application Support",
  appData: "/Users/tester/Library/Application Support",
};

function config(env: NodeJS.ProcessEnv = {}) {
  return getCometConfig(env, platformInfo);
}

describe("getCometConfig", () => {
  it("defaults host to 127.0.0.1", () => {
    expect(config().host).toBe("127.0.0.1");
  });

  it("rejects COMET_HOST=0.0.0.0", () => {
    expect(() => config({ COMET_HOST: "0.0.0.0" })).toThrow(/COMET_HOST/i);
  });

  it("rejects LAN IP host values", () => {
    expect(() => config({ COMET_HOST: "192.168.1.20" })).toThrow(/COMET_HOST/i);
    expect(() => config({ COMET_HOST: "10.0.0.3" })).toThrow(/COMET_HOST/i);
    expect(() => config({ COMET_HOST: "172.16.0.8" })).toThrow(/COMET_HOST/i);
  });

  it("accepts localhost only by normalizing it to 127.0.0.1", () => {
    expect(config({ COMET_HOST: "localhost" }).host).toBe("127.0.0.1");
  });

  it("accepts COMET_PORT=9223", () => {
    expect(config({ COMET_PORT: "9223" }).port).toBe(9223);
  });

  it.each(["abc", "0", "80", "65536"])(
    "rejects invalid COMET_PORT=%s",
    (COMET_PORT) => {
      expect(() => config({ COMET_PORT })).toThrow(/COMET_PORT/i);
    },
  );

  it("defaults userDataDir to an absolute non-browser-profile path", () => {
    const { userDataDir } = config();

    expect(userDataDir).toBe(
      "/Users/tester/Library/Application Support/comet-mcp-agent-profile",
    );
    expect(userDataDir).not.toMatch(/\/Default$/);
    expect(userDataDir).not.toContain("/Google/Chrome");
    expect(userDataDir).not.toContain("/Perplexity/Comet");
  });

  it("defaults WSL profile launch to Windows path and upload staging to WSL mount when Windows env vars are absent", () => {
    const wslConfig = getCometConfig({}, {
      platform: "wsl",
      homeDir: "/home/agent",
      localAppData: "",
      appData: "",
    });

    expect(wslConfig.userDataDir).toBe(
      "C:\\Users\\agent\\AppData\\Local\\comet-mcp-agent-profile",
    );
    expect(wslConfig.uploadDir).toBe(
      "/mnt/c/Users/agent/AppData/Local/comet-mcp-uploads",
    );
    expect(wslConfig.browserUploadDir).toBe(
      "C:\\Users\\agent\\AppData\\Local\\comet-mcp-uploads",
    );
    expect(wslConfig.userDataDir).not.toContain("/home/");
    expect(wslConfig.uploadDir).not.toContain("/home/");
  });

  it("uses LOCALAPPDATA for WSL profile defaults and a matching WSL-mounted upload directory", () => {
    const wslConfig = getCometConfig({}, {
      platform: "wsl",
      homeDir: "/home/agent",
      localAppData: "D:\\Users\\infra\\AppData\\Local",
      appData: "D:\\Users\\infra\\AppData\\Roaming",
    });

    expect(wslConfig.userDataDir).toBe(
      "D:\\Users\\infra\\AppData\\Local\\comet-mcp-agent-profile",
    );
    expect(wslConfig.uploadDir).toBe(
      "/mnt/d/Users/infra/AppData/Local/comet-mcp-uploads",
    );
    expect(wslConfig.browserUploadDir).toBe(
      "D:\\Users\\infra\\AppData\\Local\\comet-mcp-uploads",
    );
  });

  it("derives WSL defaults from the Windows user profile when available", () => {
    const wslConfig = getCometConfig({}, {
      platform: "wsl",
      homeDir: "/home/wslagent",
      localAppData: "",
      appData: "",
      windowsUserProfile: "C:\\Users\\Win User",
    });

    expect(wslConfig.userDataDir).toBe(
      "C:\\Users\\Win User\\AppData\\Local\\comet-mcp-agent-profile",
    );
    expect(wslConfig.uploadDir).toBe(
      "/mnt/c/Users/Win User/AppData/Local/comet-mcp-uploads",
    );
  });

  it("rejects non-Windows-visible WSL upload directories", () => {
    expect(() => getCometConfig({ COMET_UPLOAD_DIR: "/home/agent/uploads" }, {
      platform: "wsl",
      homeDir: "/home/agent",
      localAppData: "",
      appData: "",
    })).toThrow(/COMET_UPLOAD_DIR.*\/mnt/i);
  });

  it.each([
    "/",
    "/Users/tester",
    "/Users/tester/Library/Application Support/Google/Chrome",
    "/Users/tester/Library/Application Support/Google/Chrome/Default",
    "/Users/tester/Library/Application Support/Perplexity/Comet",
    "/Users/tester/Library/Application Support/Perplexity/Comet/Default",
  ])("rejects unsafe COMET_USER_DATA_DIR=%s", (COMET_USER_DATA_DIR) => {
    expect(() => config({ COMET_USER_DATA_DIR })).toThrow(
      /COMET_USER_DATA_DIR/i,
    );
  });

  it("requires uploadDir to be absolute and non-root", () => {
    expect(config({ COMET_UPLOAD_DIR: "/tmp/comet-mcp-uploads" }).uploadDir).toBe(
      "/tmp/comet-mcp-uploads",
    );
    expect(() => config({ COMET_UPLOAD_DIR: "relative/uploads" })).toThrow(
      /COMET_UPLOAD_DIR/i,
    );
    expect(() => config({ COMET_UPLOAD_DIR: "/" })).toThrow(/COMET_UPLOAD_DIR/i);
  });

  it("preserves a COMET_PATH override", () => {
    expect(config({ COMET_PATH: "/opt/comet/Comet" }).cometPath).toBe(
      "/opt/comet/Comet",
    );
  });

  it("defaults allowCometRestart to false and accepts 1/true", () => {
    expect(config().allowCometRestart).toBe(false);
    expect(config({ COMET_ALLOW_RESTART: "1" }).allowCometRestart).toBe(true);
    expect(config({ COMET_ALLOW_RESTART: "true" }).allowCometRestart).toBe(
      true,
    );
  });
});

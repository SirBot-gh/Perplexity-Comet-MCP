import { existsSync } from "fs";
import { homedir, platform as osPlatform } from "os";
import path from "path";

export const COMET_DEFAULT_HOST = "127.0.0.1";
export const COMET_DEFAULT_PORT = 9223;

type SupportedPlatform = NodeJS.Platform | "wsl";

export interface CometPlatformInfo {
  platform?: SupportedPlatform;
  homeDir?: string;
  localAppData?: string;
  appData?: string;
}

export interface CometConfig {
  host: "127.0.0.1";
  port: number;
  cometPath: string;
  userDataDir: string;
  uploadDir: string;
  browserUploadDir: string;
  allowCometRestart: boolean;
}

function currentPlatformInfo(): Required<CometPlatformInfo> {
  return {
    platform: osPlatform(),
    homeDir: homedir(),
    localAppData: process.env.LOCALAPPDATA ?? "",
    appData: process.env.APPDATA ?? "",
  };
}

function withDefaults(
  platformInfo: CometPlatformInfo | undefined,
): Required<CometPlatformInfo> {
  const current = currentPlatformInfo();
  return {
    platform: platformInfo?.platform ?? current.platform,
    homeDir: platformInfo?.homeDir ?? current.homeDir,
    localAppData: platformInfo?.localAppData ?? current.localAppData,
    appData: platformInfo?.appData ?? current.appData,
  };
}

function isWsl(): boolean {
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

function isWindowsLike(platformName: SupportedPlatform): boolean {
  return platformName === "win32" || platformName === "wsl";
}

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value);
}

function normalizeForComparison(value: string): string {
  return path.normalize(value).replace(/\\/g, "/").replace(/\/+$/, "");
}

function isRootPath(value: string): boolean {
  const normalized = path.normalize(value);
  const winNormalized = path.win32.normalize(value);
  return normalized === path.parse(normalized).root
    || winNormalized === path.win32.parse(winNormalized).root;
}

function requireAbsoluteNonRoot(
  envName: string,
  value: string,
): string {
  if (!isAbsolutePath(value)) {
    throw new Error(`${envName} must be an absolute path`);
  }
  if (isRootPath(value)) {
    throw new Error(`${envName} must not point at the filesystem root`);
  }
  return value;
}

function validateHost(env: NodeJS.ProcessEnv): "127.0.0.1" {
  const raw = env.COMET_HOST?.trim();
  if (!raw) return COMET_DEFAULT_HOST;
  if (raw === "127.0.0.1" || raw.toLowerCase() === "localhost") {
    return COMET_DEFAULT_HOST;
  }
  throw new Error("COMET_HOST must be 127.0.0.1 or localhost");
}

function validatePort(env: NodeJS.ProcessEnv): number {
  const raw = env.COMET_PORT?.trim();
  if (!raw) return COMET_DEFAULT_PORT;
  if (!/^\d+$/.test(raw)) {
    throw new Error("COMET_PORT must be an integer from 1024 to 65535");
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("COMET_PORT must be an integer from 1024 to 65535");
  }
  return port;
}

function defaultWindowsLocalAppData(platformInfo: Required<CometPlatformInfo>): string {
  if (platformInfo.localAppData) return platformInfo.localAppData;
  if (platformInfo.appData) return path.win32.join(platformInfo.appData, "..", "Local");

  const userName = path.basename(platformInfo.homeDir.replace(/\\/g, "/")) || "agent";
  return path.win32.join("C:\\Users", userName, "AppData", "Local");
}

function defaultAppSupportDir(platformInfo: Required<CometPlatformInfo>): string {
  if (isWindowsLike(platformInfo.platform)) {
    return defaultWindowsLocalAppData(platformInfo);
  }
  if (platformInfo.platform === "darwin") {
    return path.join(platformInfo.homeDir, "Library", "Application Support");
  }
  return path.join(platformInfo.homeDir, ".local", "share");
}

function defaultCometPath(platformInfo: Required<CometPlatformInfo>): string {
  if (platformInfo.platform === "darwin") {
    return "/Applications/Comet.app/Contents/MacOS/Comet";
  }

  if (isWindowsLike(platformInfo.platform)) {
    const possiblePaths = [
      platformInfo.localAppData
        ? path.win32.join(
            platformInfo.localAppData,
            "Perplexity",
            "Comet",
            "Application",
            "comet.exe",
          )
        : "",
      platformInfo.appData
        ? path.win32.join(
            platformInfo.appData,
            "Perplexity",
            "Comet",
            "Application",
            "comet.exe",
          )
        : "",
      "C:\\Program Files\\Perplexity\\Comet\\Application\\comet.exe",
      "C:\\Program Files (x86)\\Perplexity\\Comet\\Application\\comet.exe",
    ].filter(Boolean);

    for (const candidate of possiblePaths) {
      if (existsSync(candidate)) return candidate;
    }

    return possiblePaths[0] ?? "C:\\Program Files\\Perplexity\\Comet\\Application\\comet.exe";
  }

  return "/Applications/Comet.app/Contents/MacOS/Comet";
}

function isKnownPersonalBrowserProfile(
  value: string,
  homeDir: string,
): boolean {
  const normalized = normalizeForComparison(value).toLowerCase();
  const normalizedHome = normalizeForComparison(homeDir).toLowerCase();
  if (normalized === normalizedHome) return true;

  const browserProfileMarkers = [
    "/google/chrome",
    "/perplexity/comet",
    "/microsoft/edge",
    "/chromium",
    "/brave-browser",
  ];

  return browserProfileMarkers.some((marker) => normalized.includes(marker));
}

function scopedJoin(
  platformInfo: Required<CometPlatformInfo>,
  parent: string,
  child: string,
): string {
  return isWindowsLike(platformInfo.platform)
    ? path.win32.join(parent, child)
    : path.join(parent, child);
}

function validateUserDataDir(
  env: NodeJS.ProcessEnv,
  platformInfo: Required<CometPlatformInfo>,
): string {
  const defaultValue = scopedJoin(
    platformInfo,
    defaultAppSupportDir(platformInfo),
    "comet-mcp-agent-profile",
  );
  const value = env.COMET_USER_DATA_DIR?.trim() || defaultValue;
  requireAbsoluteNonRoot("COMET_USER_DATA_DIR", value);
  if (isKnownPersonalBrowserProfile(value, platformInfo.homeDir)) {
    throw new Error(
      "COMET_USER_DATA_DIR must be a dedicated agent profile, not a personal browser profile",
    );
  }
  return value;
}

function windowsPathToWslMount(value: string): string | undefined {
  const match = value.match(/^([a-zA-Z]):[\\/](.*)$/);
  if (!match) return undefined;

  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}

function wslMountToWindowsPath(value: string): string | undefined {
  const match = value.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (!match) return undefined;

  const drive = match[1].toUpperCase();
  const rest = match[2].replace(/\//g, "\\");
  return `${drive}:\\${rest}`;
}

function validateUploadDirs(
  env: NodeJS.ProcessEnv,
  platformInfo: Required<CometPlatformInfo>,
): Pick<CometConfig, "uploadDir" | "browserUploadDir"> {
  const defaultBrowserValue = scopedJoin(
    platformInfo,
    defaultAppSupportDir(platformInfo),
    "comet-mcp-uploads",
  );
  const defaultLocalValue = platformInfo.platform === "wsl"
    ? windowsPathToWslMount(defaultBrowserValue) ?? defaultBrowserValue
    : defaultBrowserValue;
  const uploadDir = requireAbsoluteNonRoot(
    "COMET_UPLOAD_DIR",
    env.COMET_UPLOAD_DIR?.trim() || defaultLocalValue,
  );
  const browserUploadDir = requireAbsoluteNonRoot(
    "COMET_UPLOAD_DIR browser path",
    platformInfo.platform === "wsl"
      ? wslMountToWindowsPath(uploadDir) ?? uploadDir
      : uploadDir,
  );

  return { uploadDir, browserUploadDir };
}

function validateAllowRestart(env: NodeJS.ProcessEnv): boolean {
  const raw = env.COMET_ALLOW_RESTART?.trim().toLowerCase();
  if (!raw) return false;
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  throw new Error("COMET_ALLOW_RESTART must be one of: 1, true, 0, false");
}

export function getCometConfig(
  env: NodeJS.ProcessEnv = process.env,
  platformInfo?: CometPlatformInfo,
): CometConfig {
  const resolvedPlatformInfo = withDefaults(
    platformInfo ?? { platform: isWsl() ? "wsl" : osPlatform() },
  );
  const uploadDirs = validateUploadDirs(env, resolvedPlatformInfo);

  return Object.freeze({
    host: validateHost(env),
    port: validatePort(env),
    cometPath: env.COMET_PATH?.trim() || defaultCometPath(resolvedPlatformInfo),
    userDataDir: validateUserDataDir(env, resolvedPlatformInfo),
    uploadDir: uploadDirs.uploadDir,
    browserUploadDir: uploadDirs.browserUploadDir,
    allowCometRestart: validateAllowRestart(env),
  });
}

export const COMET_DEFAULT_USER_DATA_DIR = getCometConfig({}).userDataDir;
export const COMET_DEFAULT_UPLOAD_DIR = getCometConfig({}).uploadDir;
export const cometConfig = getCometConfig();
export const DEFAULT_PORT = cometConfig.port;

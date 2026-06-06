import { existsSync, lstatSync, realpathSync, statSync } from "fs";
import path from "path";

export interface UploadPolicy {
  uploadDir: string;
}

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || path.win32.isAbsolute(value);
}

function normalizeForContainment(value: string): string {
  return path.normalize(value).replace(/\\/g, "/").replace(/\/+$/, "");
}

function isContainedWithin(child: string, parent: string): boolean {
  const normalizedChild = normalizeForContainment(child);
  const normalizedParent = normalizeForContainment(parent);
  return normalizedChild === normalizedParent || normalizedChild.startsWith(`${normalizedParent}/`);
}

export function resolveAllowedUploadPath(
  inputPath: string,
  policy: UploadPolicy,
): string {
  if (!inputPath || !isAbsolutePath(inputPath)) {
    throw new Error("Upload file path must be absolute");
  }
  if (!policy.uploadDir || !isAbsolutePath(policy.uploadDir)) {
    throw new Error("COMET_UPLOAD_DIR must be an absolute staging directory");
  }

  let realUploadDir: string;
  try {
    realUploadDir = realpathSync(policy.uploadDir);
  } catch {
    throw new Error(`COMET_UPLOAD_DIR staging directory not found: ${policy.uploadDir}`);
  }

  if (!existsSync(inputPath)) {
    throw new Error(`Upload file not found: ${inputPath}`);
  }

  const linkStat = lstatSync(inputPath);
  const realInputPath = realpathSync(inputPath);
  const realInputStat = statSync(realInputPath);

  if (!realInputStat.isFile()) {
    throw new Error(`Upload path must be a regular file: ${inputPath}`);
  }

  if (!isContainedWithin(realInputPath, realUploadDir)) {
    const symlinkNote = linkStat.isSymbolicLink() ? " Symlink targets must also stay inside staging." : "";
    throw new Error(
      `Upload file must be staged under COMET_UPLOAD_DIR.${symlinkNote} ` +
      `Resolved path: ${realInputPath}`,
    );
  }

  return realInputPath;
}

import { mkdtempSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { resolveAllowedUploadPath } from "../../src/upload-policy.js";

function fixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "comet-upload-policy-")));
  const uploadDir = path.join(root, "uploads");
  const outsideDir = path.join(root, "outside");
  mkdirSync(uploadDir);
  mkdirSync(outsideDir);
  const insideFile = path.join(uploadDir, "report with spaces.pdf");
  const outsideFile = path.join(outsideDir, "secret.txt");
  writeFileSync(insideFile, "report");
  writeFileSync(outsideFile, "secret");
  return { root, uploadDir, insideFile, outsideFile };
}

describe("resolveAllowedUploadPath", () => {
  it("accepts a regular file inside the staging directory", () => {
    const { uploadDir, insideFile } = fixture();

    expect(resolveAllowedUploadPath(insideFile, { uploadDir })).toBe(realpathSync(insideFile));
  });

  it("preserves valid filenames with spaces", () => {
    const { uploadDir, insideFile } = fixture();

    expect(resolveAllowedUploadPath(insideFile, { uploadDir })).toMatch(/report with spaces\.pdf$/);
  });

  it("rejects relative paths", () => {
    const { uploadDir } = fixture();

    expect(() => resolveAllowedUploadPath("relative.pdf", { uploadDir })).toThrow(/absolute/i);
  });

  it("rejects paths outside the staging directory", () => {
    const { uploadDir, outsideFile } = fixture();

    expect(() => resolveAllowedUploadPath(outsideFile, { uploadDir })).toThrow(/COMET_UPLOAD_DIR|staging/i);
  });

  it("rejects traversal escapes", () => {
    const { uploadDir, outsideFile } = fixture();
    const traversal = path.join(uploadDir, "..", "outside", path.basename(outsideFile));

    expect(() => resolveAllowedUploadPath(traversal, { uploadDir })).toThrow(/COMET_UPLOAD_DIR|staging/i);
  });

  it("rejects symlinks that escape the staging directory", () => {
    const { uploadDir, outsideFile } = fixture();
    const link = path.join(uploadDir, "escape.txt");
    symlinkSync(outsideFile, link);

    expect(() => resolveAllowedUploadPath(link, { uploadDir })).toThrow(/COMET_UPLOAD_DIR|staging/i);
  });

  it("rejects directories", () => {
    const { uploadDir } = fixture();

    expect(() => resolveAllowedUploadPath(uploadDir, { uploadDir })).toThrow(/regular file/i);
  });

  it("rejects missing files", () => {
    const { uploadDir } = fixture();

    expect(() => resolveAllowedUploadPath(path.join(uploadDir, "missing.pdf"), { uploadDir })).toThrow(/not found|missing/i);
  });
});

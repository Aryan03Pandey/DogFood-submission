// Team submission asset rules (SUBMISSIONS.md). One total cap per
// submission, no per-file limit: a single demo video may use most of the
// budget. Sizes are tracked alongside keys because seaweedfs is not asked.

export interface SubmissionAsset {
  key: string;
  name: string;
  sizeBytes: number;
  mime: string;
}

// 100 MB total per submission. Single knob: the spec mandates a total cap
// without giving a number.
export const SUBMISSION_ASSET_TOTAL_BYTES = 100 * 1024 * 1024;

export const SUBMISSION_ASSET_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/zip",
  "application/x-zip-compressed",
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export function submissionAssetsSize(assets: SubmissionAsset[]): number {
  return assets.reduce((total, asset) => total + asset.sizeBytes, 0);
}

// Null when the upload fits inside the remaining budget, otherwise the
// overflow in bytes for the error message.
export function submissionAssetOverflow(
  existing: SubmissionAsset[],
  nextSizeBytes: number,
): number | null {
  const over =
    submissionAssetsSize(existing) + nextSizeBytes - SUBMISSION_ASSET_TOTAL_BYTES;
  return over > 0 ? over : null;
}

// assetKeys predates objects (plain key strings); those carry no size and
// count zero toward the cap.
export function normalizeSubmissionAssets(value: unknown): SubmissionAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      return [{ key: entry, name: entry, sizeBytes: 0, mime: "" }];
    }
    if (typeof entry === "object" && entry !== null) {
      const asset = entry as Record<string, unknown>;
      if (typeof asset.key !== "string") return [];
      return [
        {
          key: asset.key,
          name: typeof asset.name === "string" ? asset.name : asset.key,
          sizeBytes: typeof asset.sizeBytes === "number" ? asset.sizeBytes : 0,
          mime: typeof asset.mime === "string" ? asset.mime : "",
        },
      ];
    }
    return [];
  });
}

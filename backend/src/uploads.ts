import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

// Local-disk storage for the MVP. Swap for an S3-compatible bucket (multer-s3, or
// upload directly from a signed URL) before going to production with more than one
// server instance — see README.md "Passer en production".
const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function storageFor(subdir: string) {
  const dir = path.join(UPLOADS_ROOT, subdir);
  ensureDir(dir);
  return multer.diskStorage({
    destination: dir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

function imageFileFilter(_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error("Only image uploads are allowed"));
    return;
  }
  cb(null, true);
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

export const uploadRequestPhoto = multer({
  storage: storageFor("requests"),
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
}).single("photo");

export const uploadIdDocument = multer({
  storage: storageFor("ids"),
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
}).single("document");

export function publicUrlFor(subdir: string, filename: string): string {
  return `/uploads/${subdir}/${filename}`;
}

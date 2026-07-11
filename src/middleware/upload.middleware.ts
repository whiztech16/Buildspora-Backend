import multer from 'multer';

// Use memory storage so we can stream the file buffer directly to Cloudinary
const storage = multer.memoryStorage();

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

// Magic byte signatures for allowed image formats
// These are validated against the actual file buffer, not just the client-provided mimetype.
// A malicious client can set mimetype to anything — the buffer doesn't lie.
const MAGIC_BYTES: { bytes: number[]; offset: number }[] = [
  { bytes: [0xff, 0xd8, 0xff], offset: 0 },               // JPEG
  { bytes: [0x89, 0x50, 0x4e, 0x47], offset: 0 },         // PNG
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },         // WebP (RIFF...)
  { bytes: [0x47, 0x49, 0x46], offset: 0 },               // GIF
];

function hasSupportedMagicBytes(buffer: Buffer): boolean {
  return MAGIC_BYTES.some(({ bytes, offset }) =>
    bytes.every((byte, i) => buffer[offset + i] === byte)
  );
}

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // First check: MIME type reported by the client
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed.'));
    return;
  }
  // Note: magic-byte validation happens post-upload in the controller
  // (buffer isn't available here yet — multer gives us the stream handle).
  // The MIME check here is the first gate; magic bytes are checked in uploadImage.
  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1,                  // max 1 file per request
  },
});

/**
 * Call this in the controller after multer populates req.file.buffer
 * to validate the actual file magic bytes before uploading to Cloudinary.
 */
export function validateImageBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 4) return false;
  return hasSupportedMagicBytes(buffer);
}

// Images pasted or attached to a room message. They're shrunk in the browser
// before upload (long edge 1600px, JPEG), which keeps each one to a few
// hundred KB -- Supabase's free-tier bandwidth, not storage space, is the
// real limit, so this is what keeps the feature cheap.
export const MESSAGE_IMAGE_BUCKET = "message-images";
export const MAX_MESSAGE_IMAGES = 4;

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;
const MAX_INPUT_BYTES = 20 * 1024 * 1024;

export async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't an image");
  if (file.size > MAX_INPUT_BYTES) throw new Error("That image is too large (20 MB at most)");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Couldn't read that image");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Couldn't process that image");
  }
  // JPEG has no transparency -- put it on white rather than black.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error("Couldn't process that image");
  return blob;
}

/**
 * The masked copy of a guest's government ID, which the guest entry form
 * says is attached.
 *
 * Picked on the form and put into the Gmail draft as a second attachment,
 * and nowhere else: never uploaded to the app's own server, never part of
 * what the form remembers. The one place it is written down is the phone's
 * own storage, for as long as the trip to Google's permission page takes —
 * the page is left and reloaded on the way back, and a picked file does not
 * survive that by itself. It is deleted when the draft is made, when it is
 * replaced or removed, and on any later visit that isn't that return.
 */

/** What the picker offers. */
export const ID_ACCEPT = "image/*,application/pdf";

/** The longest side a photo of an ID is kept at: every digit of an Aadhaar
 *  card still legible, at a few hundred kilobytes rather than a phone
 *  camera's several megabytes. */
const MAX_SIDE = 1800;

/**
 * The most a PDF copy may weigh. The draft goes to Gmail base64-encoded
 * twice over (once as an attachment, once as the message), and a request
 * much past five megabytes is refused.
 */
export const MAX_PDF_BYTES = 2 * 1024 * 1024;

export class IdCopyError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** The name the attachment goes by, whatever the file was called on the
 *  phone — "IMG_4031.HEIC" tells the office nothing. */
export const idCopyName = (type) => `Guest ID (masked).${type === "application/pdf" ? "pdf" : "jpg"}`;

/** Is this file something the ID copy can be made from? */
export function idCopyKind(file) {
  const type = String(file?.type ?? "");
  if (type === "application/pdf" || /\.pdf$/i.test(file?.name ?? "")) return "pdf";
  if (type.startsWith("image/")) return "image";
  return null;
}

/**
 * Turn the picked file into the attachment: a PDF as it is, if it is small
 * enough; a photo redrawn as a JPEG no larger than it needs to be. Throws an
 * IdCopyError — "type", "too-big" or "unreadable" — for the screen to word.
 */
export async function prepareIdCopy(file) {
  const kind = idCopyKind(file);
  if (!kind) throw new IdCopyError("type");
  if (kind === "pdf") {
    if (file.size > MAX_PDF_BYTES) throw new IdCopyError("too-big");
    return {
      name: idCopyName("application/pdf"),
      type: "application/pdf",
      bytes: new Uint8Array(await file.arrayBuffer()),
    };
  }

  // Through an <img> rather than createImageBitmap: browsers turn an <img>
  // upright by the photo's own orientation, as it looks in the gallery — a
  // sideways ID is the first thing an office sends back — and the bitmap's
  // option for that is missing on phones still in use.
  const url = URL.createObjectURL(file);
  let image;
  try {
    image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  } catch {
    throw new IdCopyError("unreadable");
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  if (!w || !h) throw new IdCopyError("unreadable");
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";                  // a transparent PNG turns black as a JPEG otherwise
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new IdCopyError("unreadable");
  return {
    name: idCopyName("image/jpeg"),
    type: "image/jpeg",
    bytes: new Uint8Array(await blob.arrayBuffer()),
  };
}

/* ---------- held across the trip to Google ---------- */

const DB = "iimpresent-mail";
const STORE = "files";
const KEY = "guest-id";
/** A copy older than this was not left for a trip still under way. */
const MAX_AGE_MS = 30 * 60_000;

function openDb() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB, 1);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, act) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = act(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Keep the copy on the phone, in case the page is left for Google. */
export async function holdIdCopy(copy) {
  try {
    await run("readwrite", (s) => s.put({ ...copy, at: Date.now() }, KEY));
  } catch {
    /* private mode: a trip to Google will need the ID picked again */
  }
}

/** The copy held for a trip, if it is recent; anything older is deleted. */
export async function heldIdCopy(now = Date.now()) {
  try {
    const got = await run("readonly", (s) => s.get(KEY));
    if (!got?.bytes || now - (got.at ?? 0) > MAX_AGE_MS) {
      await dropIdCopy();
      return null;
    }
    return { name: got.name, type: got.type, bytes: new Uint8Array(got.bytes) };
  } catch {
    return null;
  }
}

/** Delete the held copy. */
export async function dropIdCopy() {
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch {
    /* nothing held, or no storage to hold it in */
  }
}

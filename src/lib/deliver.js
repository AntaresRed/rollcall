/**
 * Handing a file to the student.
 *
 * Extracted from the calendar export, which learned all of this the hard way
 * and is now not the only screen that needs it.
 *
 * The share sheet is tried first because this app is installed to the Home
 * Screen on iOS more often than not, and there an ordinary download lands in
 * Files with no obvious route anywhere useful — whereas the share sheet
 * offers Mail, Files, WhatsApp and the rest directly. Everywhere else
 * `canShare` is false for files and it falls straight through to a download.
 *
 * Returns what actually happened, because the three outcomes want different
 * things said on screen: a share sheet that was dismissed is a decision, not
 * a failure, and telling somebody "saved" when they backed out would be a
 * small lie.
 */
export async function deliverFile(filename, text, type) {
  try {
    const file = new File([text], filename, { type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    }
  } catch (err) {
    // Dismissing the sheet is a decision — don't then shove a download at
    // someone who just backed out of one.
    if (err?.name === "AbortError") return "cancelled";
  }

  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: Safari reads the blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}

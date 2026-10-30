export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadText(content: string, filename: string, mime: string) {
  downloadBlob(new Blob([content], { type: mime }), filename);
}

export function canShareFiles(): boolean {
  try {
    const probe = new File(['x'], 'x.pdf', { type: 'application/pdf' });
    return typeof navigator.share === 'function' && !!navigator.canShare?.({ files: [probe] });
  } catch {
    return false;
  }
}

/** Abre el menú de compartir del sistema (WhatsApp, correo…). Devuelve false si no se pudo. */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (e) {
    // El usuario canceló el diálogo: no es un error.
    return e instanceof DOMException && e.name === 'AbortError';
  }
}

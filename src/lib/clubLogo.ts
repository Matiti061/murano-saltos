/** Escudo del club incluido en la app; se usa si no se ha subido otro en Ajustes. */
export const CLUB_LOGO_URL = './logo.jpg';

/** El escudo en data URL, para incrustarlo en el PDF. */
export async function loadClubLogo(): Promise<string | undefined> {
  try {
    const blob = await (await fetch(CLUB_LOGO_URL)).blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}

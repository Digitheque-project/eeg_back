/** "08:30" + 90 → "10:00" */
export function ajouterMinutes(
  heureDebut: string,
  dureeMinutes: number,
): string {
  const [h, m] = heureDebut.split(':').map(Number);
  const total = h * 60 + m + dureeMinutes;
  const heureFin = Math.floor(total / 60) % 24;
  const minuteFin = total % 60;
  return `${String(heureFin).padStart(2, '0')}:${String(minuteFin).padStart(2, '0')}`;
}

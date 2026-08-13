/**
 * Construit l'URL de base complète d'un service externe à partir de la valeur
 * brute d'une variable d'environnement et du chemin de l'API de ce service.
 *
 * La valeur d'env doit être UNIQUEMENT la base URL (protocole + hôte), sans
 * préfixe ni suffixe — ex. `https://acceuil-back.onrender.com`. Le chemin
 * (`/accueil`, `/prescriptions`, `/dossier-patient`…) est porté par le code,
 * pas par la configuration.
 *
 * Compatible avec une valeur qui contiendrait encore un chemin hérité : le
 * pathname est simplement remplacé, donc rien ne casse lors de la migration.
 */
export function withBasePath(rawBaseUrl: string, apiPath: string): string {
  const normalizedPath = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  if (!rawBaseUrl) return normalizedPath;

  try {
    const url = new URL(rawBaseUrl);
    url.pathname = normalizedPath;
    return url.toString().replace(/\/$/, '');
  } catch {
    return `${rawBaseUrl.replace(/\/+$/, '')}${normalizedPath}`;
  }
}

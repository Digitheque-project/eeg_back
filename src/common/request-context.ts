import { AsyncLocalStorage } from 'async_hooks';

// En-tête Authorization de la requête utilisateur en cours, pour le relayer
// aux services qui exigent un vrai utilisateur (ex. Accueil, qui vérifie le
// jeton auprès du service Users). Vide hors requête (tâches de fond).
export const requestContext = new AsyncLocalStorage<{ authorization?: string }>();

export function currentAuthorization(): string | undefined {
  return requestContext.getStore()?.authorization;
}

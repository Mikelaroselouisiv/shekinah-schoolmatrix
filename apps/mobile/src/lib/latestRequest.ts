import { useCallback, useRef } from 'react';

/**
 * Marque une requête comme périmée dès qu’une plus récente démarre.
 * Évite qu’une liste d’élèves d’une classe précédente remplace celle affichée.
 */
export function useLatestRequest() {
  const token = useRef(0);
  return useCallback(() => {
    token.current += 1;
    const mine = token.current;
    return () => mine === token.current;
  }, []);
}

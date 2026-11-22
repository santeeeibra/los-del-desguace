/**
 * Uniones rompibles de objetos del escenario (faro, postes, tapas). Quien las crea registra aquí cómo
 * soltarlas, para que la Amoladora (`3`) pueda cortarlas aunque no sean soldaduras del taller.
 */
const releasers = new Map<string, () => void>();

export function registerSceneJoint(id: string, release: () => void): () => void {
  releasers.set(id, release);
  return () => {
    if (releasers.get(id) === release) releasers.delete(id);
  };
}

export function hasSceneJoint(id: string): boolean {
  return releasers.has(id);
}

/** Suelta la unión del objeto `id`. Devuelve `false` si no tenía una. */
export function releaseSceneJoint(id: string): boolean {
  const release = releasers.get(id);
  if (!release) return false;
  release();
  return true;
}

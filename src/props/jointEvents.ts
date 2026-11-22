/** Aviso de que una unión rompible cedió (para chispas y sonido). */
export interface JointBrokenEvent {
  x: number;
  y: number;
  z: number;
}

type Listener = (event: JointBrokenEvent) => void;

const listeners = new Set<Listener>();

export function onJointBroken(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitJointBroken(event: JointBrokenEvent): void {
  for (const listener of listeners) listener(event);
}

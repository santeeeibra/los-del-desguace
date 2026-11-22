/**
 * Barreras de autos del Nivel 2 (El Callejón de los Autos).
 * Lógica pura y comprobable: distribución de las pilas, masas y umbrales de rotura.
 * La física y el dibujo viven en `src/environment/CarBarriers.tsx`.
 */

/** Tamaño de un auto entero (x, y, z) en metros; coincide con el pedido de arte. */
export const CAR_SIZE = [4.2, 1.5, 1.9] as const;
/** Gravedad del mundo (ver `<Physics gravity>` en DesguaceScene). */
export const WORLD_GRAVITY = 18;
/** Holgura entre autos apilados para que no nazcan solapados. */
const GAP = 0.02;
/** Cuántas piezas deja un auto al romperse. */
export const CAR_CHUNK_COUNT = 4;
/** Fracción de la masa del auto que conserva cada trozo (el total pesa menos que el auto entero). */
export const CHUNK_MASS_FRACTION = 0.2;

export type BarrierId = 'a' | 'b';

export interface BarrierDef {
  id: BarrierId;
  /** Centro de la barrera en z (local del nivel). */
  zCenter: number;
  /** Filas de profundidad (a lo largo del callejón). */
  rows: number;
  /** Autos apilados en altura. */
  high: number;
  /** Masa de cada auto, en kg. */
  mass: number;
  /** Cada cuántos autos hay uno débil (0 = ninguno). */
  weakEvery: number;
}

export const BARRIERS: Record<BarrierId, BarrierDef> = {
  // Liviana: la rompe y mueve un carrito básico con algo de velocidad.
  a: { id: 'a', zCenter: 37, rows: 2, high: 2, mass: 90, weakEvery: 0 },
  // Pesada: exige masa, firmeza y velocidad. Los autos con X amarilla son los puntos débiles.
  b: { id: 'b', zCenter: 65, rows: 3, high: 3, mass: 320, weakEvery: 3 },
};

export interface CarSpec {
  id: string;
  barrier: BarrierId;
  /** Centro del auto (local del nivel). */
  pos: [number, number, number];
  mass: number;
  weak: boolean;
  /** Carrocería (0..3: sedán, furgoneta, pickup, rural). */
  variant: number;
  /** Fuerza de contacto a partir de la cual el auto se parte. */
  breakForce: number;
}

/** Autos por fila: cubren casi todo el ancho de 17 m del callejón. */
export const CARS_PER_ROW = 4;

/**
 * Fuerza (N) a partir de la cual un auto se parte.
 * Tiene que superar la carga estática de la pila (peso de lo que tiene encima) con margen, y los
 * autos débiles se rompen a la mitad. Valores iniciales: hay que afinarlos jugando con máquinas reales.
 */
export function carBreakForce(mass: number, high: number, weak: boolean): number {
  const staticLoad = mass * WORLD_GRAVITY * Math.max(1, high - 1);
  const strong = Math.max(9000, staticLoad * 3.5);
  return weak ? strong * 0.5 : strong;
}

/** Distribuye todos los autos de una barrera (posiciones locales y propiedades). */
export function layoutBarrier(id: BarrierId): CarSpec[] {
  const def = BARRIERS[id];
  const cars: CarSpec[] = [];
  const [w, h, d] = CAR_SIZE;
  let index = 0;
  for (let level = 0; level < def.high; level++) {
    for (let row = 0; row < def.rows; row++) {
      for (let col = 0; col < CARS_PER_ROW; col++) {
        const x = (col - (CARS_PER_ROW - 1) / 2) * (w + GAP);
        const y = h / 2 + level * (h + GAP);
        const z = def.zCenter + (row - (def.rows - 1) / 2) * (d + GAP);
        const weak = def.weakEvery > 0 && index % def.weakEvery === 0;
        cars.push({
          id: `car-${id}-${index}`,
          barrier: id,
          pos: [x, y, z],
          mass: def.mass,
          weak,
          variant: index % 4,
          breakForce: carBreakForce(def.mass, def.high, weak),
        });
        index += 1;
      }
    }
  }
  return cars;
}

/** Los trozos que deja un auto: desplazamientos locales respecto de su centro y tamaños (x, y, z). */
export const CAR_CHUNKS: readonly {
  /** Nombre del nodo en `car-chunks-*.glb`. */
  name: 'roof' | 'hood' | 'door' | 'chassis';
  offset: readonly [number, number, number];
  size: readonly [number, number, number];
}[] = [
  { name: 'roof', offset: [0, 0.55, 0], size: [3.6, 0.35, 1.7] }, // techo
  { name: 'hood', offset: [1.4, 0.1, 0], size: [1.2, 0.5, 1.8] }, // capó
  { name: 'door', offset: [-0.4, -0.1, 0.9], size: [1.6, 0.9, 0.2] }, // puerta
  { name: 'chassis', offset: [0, -0.5, 0], size: [3.8, 0.4, 1.6] }, // chasis
];

/** Carrocerías en el orden de `CarSpec.variant`: sedán, furgoneta, pickup, rural. */
export const CAR_KINDS = ['sedan', 'van', 'pickup', 'wagon'] as const;

/** Total de autos de ambas barreras (para el tope de rendimiento). */
export function totalCars(): number {
  return layoutBarrier('a').length + layoutBarrier('b').length;
}

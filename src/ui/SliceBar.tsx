import { useEffect, type ReactNode } from 'react';
import { laserTableBridge } from '../invention/laserTableBridge';
import { sliceStore, useSlice, type SliceMode } from '../invention/sliceStore';
import { grabbableRegistry } from '../props/grabbableRegistry';
import { gameStore } from '../state/gameStore';

const MODES: ReadonlyArray<readonly [SliceMode, string, string]> = [
  ['horizontal', '⬌ Horizontal', 'Corta en capas: parte de arriba y parte de abajo'],
  ['right', '▮ Izq. / Der.', 'Corte vertical: mitad izquierda y mitad derecha'],
  ['forward', '▬ Frente / Atrás', 'Corte vertical: mitad de adelante y mitad de atrás'],
];

/** Barra de Rebanar: elegir el plano, deslizarlo por la pieza y cortar. */
export function SliceBar({ bolts, touch }: { bolts: ReactNode; touch: boolean }) {
  const slice = useSlice();

  const doCut = () => {
    const current = sliceStore.getState();
    if (!current.targetId) return;
    const result = laserTableBridge.get()?.slice(current.targetId, sliceStore.normal(), current.offset);
    if (!result) { sliceStore.setMessage('El taller no está listo'); return; }
    if (result.error) { sliceStore.setMessage(result.error); return; }
    sliceStore.stop();
    gameStore.setWireHint('¡Pieza rebanada! Los trozos y lo que tenía soldado quedan sueltos.');
  };

  useEffect(() => {
    if (!slice.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Enter') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') sliceStore.stop();
      else doCut();
    };
    window.addEventListener('keydown', onKey, true);
    // Si la pieza desaparece (la limpiaron o ya se cortó), se cierra sola.
    const timer = window.setInterval(() => {
      const id = sliceStore.getState().targetId;
      if (!id || !grabbableRegistry.getById(id)) sliceStore.stop();
    }, 500);
    return () => { window.removeEventListener('keydown', onKey, true); window.clearInterval(timer); };
  }, [slice.active]);

  if (!slice.active) return null;
  const limit = slice.radius * 0.9;
  const centimeters = Math.round(slice.offset * 100);
  return (
    <div className="slice-ui hud-interactive" role="region" aria-label="Rebanar pieza">
      <div className="slice-bar wood-sign">
        {bolts}
        <strong className="slice-title">Rebanar · {slice.label}</strong>
        <div className="slice-modes" role="group" aria-label="Dirección del corte">
          {MODES.map(([mode, label, hint]) => (
            <button key={mode} type="button" className="hud-button" title={hint}
              aria-pressed={slice.mode === mode} onClick={() => sliceStore.setMode(mode)}>{label}</button>
          ))}
        </div>
        <div className="slice-slider">
          <button type="button" className="hud-button" aria-label="Mover el corte hacia atrás"
            onClick={() => sliceStore.setOffset(slice.offset - 0.02)}>−</button>
          <input type="range" min={-limit} max={limit} step={0.005} value={slice.offset}
            aria-label="Posición del corte" onChange={(e) => sliceStore.setOffset(Number(e.target.value))} />
          <button type="button" className="hud-button" aria-label="Mover el corte hacia adelante"
            onClick={() => sliceStore.setOffset(slice.offset + 0.02)}>+</button>
          <span className="slice-offset">{centimeters > 0 ? '+' : ''}{centimeters} cm</span>
        </div>
        <p className="slice-status" role="status">
          {slice.message ?? `Deslizá el plano celeste por la pieza. Todo lo soldado a ella se soltará. ${touch ? '' : 'Enter corta · Esc cancela.'}`}
        </p>
        <div className="slice-actions">
          <button type="button" className="hud-button is-primary" onClick={doCut}>✂ Cortar</button>
          <button type="button" className="hud-button" onClick={() => sliceStore.stop()}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, type ReactNode } from 'react';
import { sceneCutStore, useCutPreview } from '../invention/sceneCut';
import { platformStore } from '../invention/platformStore';
import { STEER_DESIGN_MAX } from '../invention/platformShape';
import type { GrabbableKind } from '../props/grabbableRegistry';

const DEG = 180 / Math.PI;

/** Barra de Cortar en escena: deshacer, borrar punto, holograma de giro, cortar y salir. */
export function SceneCutBar({ bolts, labels, touch }: {
  bolts: ReactNode;
  labels: Partial<Record<GrabbableKind, string>>;
  touch: boolean;
}) {
  const { cut, info, preview } = useCutPreview();

  useEffect(() => {
    if (!cut.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') sceneCutStore.stop();
      else if (e.code === 'Backspace' || (e.code === 'KeyZ' && !e.ctrlKey)) sceneCutStore.removeLast();
      else if (e.code === 'Enter') document.querySelector<HTMLButtonElement>('.scene-cut-go')?.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cut.active]);

  if (!cut.active || !cut.platformId) return null;
  const steerers = info?.children.filter((c) => c.steer) ?? [];
  const sweepIndex = steerers.findIndex((c) => c.id === cut.sweepWheel);
  const sweepChild = sweepIndex >= 0 ? steerers[sweepIndex] : null;
  const name = (id: string) => {
    const kind = info?.children.find((c) => c.id === id)?.kind;
    return kind ? labels[kind] ?? kind : id;
  };
  const looseNames = preview?.loose.map(name) ?? [];
  const cutting = cut.phase === 'cutting';
  const status = cutting
    ? 'Cortando…'
    : cut.confirmLoose && cut.message
      ? cut.message
      : preview?.error
        ? preview.error
        : looseNames.length
          ? `Ojo: se soltará ${looseNames.join(', ')}.`
          : cut.points.length >= 3
            ? 'Listo para cortar. Arrastrá los puntos para corregir.'
            : cut.message ?? '';

  return (
    <div className="scene-cut-ui hud-interactive" role="region" aria-label="Cortar en escena">
      <div className="scene-cut-top wood-sign">
        <strong>Cortar en escena</strong>
        <span>{touch ? 'Tocá' : 'Hacé clic'} afuera del borde, marcá el recorte y terminá afuera. Arrastrá un punto para moverlo.</span>
      </div>
      <div className="scene-cut-bar wood-sign">
        {bolts}
        <p className={`scene-cut-status${looseNames.length || cut.confirmLoose ? ' is-warning' : ''}`} role="status">{status}</p>
        {sweepChild?.steer && (
          <p className="scene-cut-steer">
            Rueda de dirección: gira de <strong>{Math.round(sweepChild.steer.min * DEG)}°</strong> a{' '}
            <strong>+{Math.round(sweepChild.steer.max * DEG)}°</strong> de ±{Math.round(STEER_DESIGN_MAX * DEG)}°
          </p>
        )}
        <div className="scene-cut-actions">
          <button type="button" className="hud-button" disabled={cutting || !cut.points.length}
            onClick={() => sceneCutStore.removeLast()}>Borrar último</button>
          {steerers.length > 0 && (
            <button type="button" className="hud-button is-wire" aria-pressed={Boolean(sweepChild)} disabled={cutting}
              onClick={() => sceneCutStore.setSweepWheel(
                sweepIndex < 0 ? steerers[0].id : sweepIndex + 1 < steerers.length ? steerers[sweepIndex + 1].id : null)}>
              {sweepChild ? (steerers.length > 1 ? `Giro rueda ${sweepIndex + 1}` : 'Ocultar giro') : 'Ver giro de rueda'}
            </button>
          )}
          <button type="button" className="hud-button" aria-label="Girar vista a la izquierda" disabled={cutting}
            onClick={() => sceneCutStore.orbit(-Math.PI / 4)}>↶</button>
          <button type="button" className="hud-button" aria-label="Girar vista a la derecha" disabled={cutting}
            onClick={() => sceneCutStore.orbit(Math.PI / 4)}>↷</button>
          <button type="button" className="hud-button" disabled={cutting || !platformStore.canUndo(cut.platformId)}
            onClick={() => sceneCutStore.undo()}>Deshacer</button>
          <button type="button" className={`hud-button scene-cut-go ${looseNames.length ? 'is-danger' : 'is-primary'}`}
            disabled={cutting || !preview || Boolean(preview.error) || cut.points.length < 3}
            onClick={() => sceneCutStore.requestCut(preview, looseNames)}>
            {cut.confirmLoose ? 'Confirmar corte' : 'Cortar'}
          </button>
          <button type="button" className="hud-button" disabled={cutting} onClick={() => sceneCutStore.stop()}>Salir</button>
        </div>
      </div>
    </div>
  );
}

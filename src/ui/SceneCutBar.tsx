import { useEffect, type ReactNode } from 'react';
import { sceneCutStore, useCutPreview } from '../invention/sceneCut';
import { platformStore } from '../invention/platformStore';
import { STEER_DESIGN_MAX } from '../invention/platformShape';
import type { GrabbableKind } from '../props/grabbableRegistry';
import { ToolIcon } from './ToolIcons';

const DEG = 180 / Math.PI;

/** Traduce los errores técnicos del recorte a instrucciones de qué hacer. */
function friendlyCutError(error: string): string {
  switch (error) {
    case 'El corte partiría la plataforma en dos':
      return 'Así la chapa quedaría partida en dos pedazos. La línea debe sacar solo un trozo del borde: empezá y terminá afuera, del mismo lado, sin cruzar la chapa de punta a punta.';
    case 'El corte tiene que entrar desde el borde':
      return 'La línea tiene que cruzar el borde: empezá afuera de la chapa, entrá, y terminá afuera otra vez.';
    case 'El corte tiene que empezar y terminar afuera del borde':
      return 'El primer y el último punto tienen que estar AFUERA de la chapa (sobre el piso, fuera del borde).';
    case 'El corte tiene bordes cruzados':
      return 'Las líneas se cruzan entre sí. Tocá "Borrar último" y marcá de nuevo sin cruzarlas.';
    case 'El corte no toca material':
      return 'La línea no toca la chapa. Marcá puntos que pasen por encima de la parte que querés sacar.';
    case 'Quedaría muy poco material':
      return 'Quedaría muy poca chapa. Elegí un trozo más chico para cortar.';
    default:
      return error;
  }
}

/** Dibujito de ejemplo: la línea entra desde afuera, rodea una esquina y sale afuera. */
function CutExample() {
  return (
    <svg className="scene-cut-example" viewBox="0 0 120 84" role="img"
      aria-label="Ejemplo: tres puntos, el primero y el último afuera de la chapa, rodean una esquina que se corta">
      <rect x="30" y="16" width="60" height="52" rx="3" fill="#d9a35a" stroke="#2c1607" strokeWidth="2.4" />
      <rect x="68" y="16" width="22" height="22" fill="#df6e50" opacity="0.8" />
      <path d="M68 6V38H100" fill="none" stroke="#b14027" strokeWidth="2.6" strokeDasharray="5 4" strokeLinejoin="round" />
      {([[68, 6, '1'], [68, 38, '2'], [100, 38, '3']] as const).map(([x, y, n]) => (
        <g key={n}>
          <circle cx={x} cy={y} r="7" fill="#ffe074" stroke="#2c1607" strokeWidth="2" />
          <text x={x} y={y + 3.6} textAnchor="middle" fontSize="10" fontWeight="800" fill="#2c1607">{n}</text>
        </g>
      ))}
    </svg>
  );
}

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
  const pointCount = cut.points.length;
  const ready = !cutting && Boolean(preview) && !preview?.error && pointCount >= 3;
  const status = cutting
    ? 'Cortando…'
    : cut.confirmLoose && cut.message
      ? cut.message
      : preview?.error && pointCount >= 3
        ? friendlyCutError(preview.error)
        : looseNames.length
          ? `Ojo: se soltará ${looseNames.join(', ')}. Tocá Cortar y después Confirmar.`
          : ready
            ? '③ Listo: lo rojo es lo que se corta. Si te gusta, tocá ✂ Cortar. Podés arrastrar un punto para corregir.'
            : pointCount === 0
              ? cut.message ?? `① ${touch ? 'Tocá' : 'Hacé clic'} AFUERA de la chapa, al lado del borde, para empezar la línea.`
              : pointCount < 3
                ? `② Seguí marcando puntos alrededor del trozo que querés sacar (mínimo 3). El último tiene que quedar afuera de la chapa.`
                : friendlyCutError(preview?.error ?? '');

  return (
    <div className="scene-cut-ui hud-interactive" role="region" aria-label="Cortar en escena">
      <div className="scene-cut-top wood-sign">
        <strong>Cortar en escena · cómo se usa</strong>
        <div className="scene-cut-help">
          <CutExample />
          <ol>
            <li><b>1.</b> {touch ? 'Tocá' : 'Clic'} <b>afuera</b> de la chapa, junto al borde.</li>
            <li><b>2.</b> Marcá puntos alrededor del trozo que querés sacar.</li>
            <li><b>3.</b> El último punto también va <b>afuera</b>. Se pinta de rojo lo que se corta.</li>
            <li><b>4.</b> Tocá <b>✂ Cortar</b>. Arrastrá un punto para moverlo.</li>
          </ol>
        </div>
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
          <button type="button" className="hud-button" disabled={cutting}
            title="Muesca en U en el borde de adelante (se puede ajustar arrastrando los puntos)"
            onClick={() => sceneCutStore.notch('u')}>Muesca en U</button>
          <button type="button" className="hud-button" disabled={cutting}
            title="Hueco de horquilla para una rueda (triciclo): después soldá la rueda en el hueco"
            onClick={() => sceneCutStore.notch('fork')}>Horquilla</button>
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
            title={ready ? 'Cortar la chapa' : 'Marcá al menos 3 puntos (el primero y el último afuera de la chapa)'}
            data-suggested={(!cutting && preview && !preview.error && cut.points.length >= 3) || undefined}
            onClick={() => sceneCutStore.requestCut(preview, looseNames)}>
            <ToolIcon tool="slice" />{cut.confirmLoose ? 'Confirmar corte' : 'Cortar'}
          </button>
          <button type="button" className="hud-button" disabled={cutting} onClick={() => sceneCutStore.stop()}>Salir</button>
        </div>
      </div>
    </div>
  );
}

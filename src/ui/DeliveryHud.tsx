import { useEffect, useState, type ReactNode } from 'react';
import { DELIVERY_RULES } from '../modes/delivery/deliveryMatch';
import { deliveryStore, useDeliveryStore } from '../modes/delivery/deliveryStore';
import { gameModeStore } from '../modes/gameModes';

function clock(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Texto corto para la placa de estado superior. */
export function useDeliveryStatusText() {
  const phase = useDeliveryStore((s) => s.match.phase);
  const remaining = useDeliveryStore((s) => s.match.remainingSec);
  const integrity = useDeliveryStore((s) => s.match.integrity);
  if (phase === 'build') return `Armado · ${clock(remaining)}`;
  if (phase === 'run') return `Entrega · ${clock(remaining)} · Carga ${Math.round(integrity)} %`;
  return 'Entrega Delicada';
}

/**
 * HUD de Entrega Delicada: objetivo y «Listo» al armar, reloj e integridad en
 * el recorrido, y resultado con revancha. Los carteles siguen el estilo de madera.
 */
export function DeliveryHud({ bolts, hidden }: { bolts: ReactNode; hidden: boolean }) {
  const match = useDeliveryStore((s) => s.match);
  const lastHit = useDeliveryStore((s) => s.lastHit);
  const [hitVisible, setHitVisible] = useState(false);

  useEffect(() => {
    if (!lastHit) return;
    setHitVisible(true);
    const t = setTimeout(() => setHitVisible(false), 1100);
    return () => clearTimeout(t);
  }, [lastHit]);

  if (hidden) return null;

  if (match.phase === 'result') {
    const score = deliveryStore.score();
    const hostLeft = match.end === 'host-left';
    return (
      <div className="hud-menu-backdrop hud-interactive" role="dialog" aria-modal="true" aria-label="Resultado de la entrega">
        <div className="hud-menu-card wood-sign">
          {bolts}
          <div className="hud-menu-header">
            <div>
              <div className="hud-menu-kicker">ENTREGA DELICADA</div>
              <h2>{hostLeft ? 'RONDA TERMINADA' : match.end === 'delivered' ? '¡ENTREGADA!' : '¡SE ACABÓ EL TIEMPO!'}</h2>
            </div>
          </div>
          <p className="hud-flow-lead">{score.message}</p>
          {!hostLeft && (
            <div className="hud-finish-stats">
              <div className="hud-finish-stat">
                <span>Estrellas</span>
                <strong aria-label={`${score.stars} de 3 estrellas`}>{'★'.repeat(score.stars)}{'☆'.repeat(3 - score.stars)}</strong>
              </div>
              <div className="hud-finish-stat">
                <span>Carga</span>
                <strong>{Math.round(match.integrity)} %</strong>
              </div>
              <div className="hud-finish-stat">
                <span>Tiempo sobrante</span>
                <strong>{clock(match.end === 'delivered' ? match.remainingSec : 0)}</strong>
              </div>
              <div className="hud-finish-stat">
                <span>Puntaje</span>
                <strong>{score.total}</strong>
              </div>
              {match.worstHit > 0 && (
                <div className="hud-finish-stat">
                  <span>Peor golpe</span>
                  <strong>−{Math.round(match.worstHit)} %</strong>
                </div>
              )}
            </div>
          )}
          <div className="hud-flow-footer">
            <button type="button" className="hud-button" onClick={() => gameModeStore.setMode('sandbox')}>
              Volver al Taller
            </button>
            {!hostLeft && (
              <button type="button" className="hud-button is-accent" onClick={() => deliveryStore.rematch()}>
                Revancha
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const integrity = Math.round(match.integrity);
  const low = integrity < 40;
  return (
    <>
      <div className="hud-delivery-panel wood-sign hud-interactive" role="status" aria-live="polite">
        {match.phase === 'build' ? (
          <>
            <div className="hud-delivery-row">
              <strong>Armá el carrito</strong>
              <span className="hud-delivery-clock">{clock(match.remainingSec)}</span>
            </div>
            <div className="hud-delivery-goal">
              Después llevá la caja marcada hasta el aro amarillo del final de la pista. Cada golpe la daña.
            </div>
            <button type="button" className="hud-button is-accent" onClick={() => deliveryStore.ready()}>
              ¡Listo! (el tiempo que sobra se suma)
            </button>
          </>
        ) : (
          <>
            <div className="hud-delivery-row">
              <strong>Llevá la caja al aro</strong>
              <span className="hud-delivery-clock">{clock(match.remainingSec)}</span>
            </div>
            {match.carriedOverSec > 0 && match.runElapsedSec < 4 && (
              <div className="hud-delivery-goal">+{match.carriedOverSec} s del armado</div>
            )}
            <div
              className="hud-delivery-bar"
              role="meter"
              aria-label="Integridad de la carga"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={integrity}
            >
              <div className={`hud-delivery-fill${low ? ' is-low' : ''}`} style={{ width: `${integrity}%` }} />
              <span>Carga {integrity} %</span>
            </div>
          </>
        )}
      </div>
      {hitVisible && lastHit && (
        <div className="hud-impact" aria-hidden="true">−{Math.round(lastHit.damage)} %</div>
      )}
    </>
  );
}

/** Reglas visibles para el cartel de bienvenida. */
export const DELIVERY_DESCRIPTION = `Armá un carrito en ${DELIVERY_RULES.buildSec / 60} min y llevá una carga frágil hasta la meta en ${DELIVERY_RULES.runSec / 60} min. Cada golpe la daña.`;

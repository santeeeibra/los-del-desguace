import { useRef, useState } from 'react';
import type { QualityLevel } from '../config/visualConfig';
import { playerInput } from '../controls/playerInput';
import { gameStore, useGameStore, type TouchOverlayMode } from '../state/gameStore';

function VirtualJoystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });
  const maxRadius = 42;

  const updateFromClient = (clientX: number, clientY: number) => {
    const el = baseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);
    const kx = Math.cos(angle) * clamped;
    const ky = Math.sin(angle) * clamped;
    setKnobOffset({ x: kx, y: ky });

    // Ecctrl expects +Y forward (up on screen = negative screen dy) and +X right
    const normX = kx / maxRadius;
    const normY = -ky / maxRadius;
    const deadzone = 0.12;
    const mag = Math.hypot(normX, normY);
    if (mag < deadzone) {
      playerInput.setTouchJoystick(0, 0);
    } else {
      playerInput.setTouchJoystick(normX, normY);
    }
  };

  const resetStick = () => {
    pointerIdRef.current = null;
    setKnobOffset({ x: 0, y: 0 });
    playerInput.setTouchJoystick(0, 0);
  };

  return (
    <div
      ref={baseRef}
      className="hud-interactive"
      aria-label="Joystick de movimiento"
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        pointerIdRef.current = e.pointerId;
        updateFromClient(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pointerIdRef.current !== e.pointerId) return;
        e.stopPropagation();
        updateFromClient(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        if (pointerIdRef.current !== e.pointerId) return;
        e.stopPropagation();
        resetStick();
      }}
      onPointerCancel={(e) => {
        if (pointerIdRef.current !== e.pointerId) return;
        e.stopPropagation();
        resetStick();
      }}
      style={{
        width: 118,
        height: 118,
        borderRadius: '50%',
        background: 'rgba(24, 21, 19, 0.56)',
        border: '2px solid rgba(245, 185, 66, 0.48)',
        backdropFilter: 'blur(4px)',
        position: 'relative',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 20px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: '50%',
          background: 'linear-gradient(145deg, #f5b942, #d47b27)',
          border: '2px solid #fff3d6',
          transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
          boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

const ITEM_LABELS: Record<'crate' | 'wheel' | 'canister', string> = {
  crate: 'Caja',
  wheel: 'Rueda',
  canister: 'Bidón',
};

export function HudOverlay() {
  const quality = useGameStore((s) => s.quality);
  const touchMode = useGameStore((s) => s.touchMode);
  const isTouchDevice = useGameStore((s) => s.isTouchDevice);
  const nearbyTargetKind = useGameStore((s) => s.nearbyTargetKind);
  const carriedKind = useGameStore((s) => s.carriedKind);
  const impactFeedback = useGameStore((s) => s.impactFeedback);
  const showHelp = useGameStore((s) => s.showHelp);
  const sceneReady = useGameStore((s) => s.sceneReady);

  const flashText = impactFeedback === 'bump' ? '¡PUM!' : impactFeedback === 'land' ? '¡PLAF!' : null;

  const showTouchControls = touchMode === 'on' || (touchMode === 'auto' && isTouchDevice);

  const cycleTouchMode = () => {
    const order: TouchOverlayMode[] = ['auto', 'on', 'off'];
    const next = order[(order.indexOf(touchMode) + 1) % order.length];
    gameStore.setTouchMode(next);
  };

  return (
    <div className="hud-layer" data-scene-ready={sceneReady ? 'true' : 'false'}>
      {/* TOP BAR */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        {/* Title & diegetic status badge */}
        <div
          className="hud-interactive"
          style={{
            background: 'var(--panel-bg)',
            border: '1px solid var(--panel-border)',
            borderRadius: 12,
            padding: '8px 14px',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: sceneReady ? '#55d88a' : '#f5b942',
                boxShadow: sceneReady ? '0 0 8px #55d88a' : 'none',
                display: 'inline-block',
              }}
            />
            <strong style={{ fontSize: 15, letterSpacing: 0.4, color: '#ffe5a3' }}>
              LOS DEL DESGUACE
            </strong>
            <span
              style={{
                fontSize: 11,
                padding: '2px 7px',
                borderRadius: 99,
                background: 'rgba(230, 106, 44, 0.28)',
                border: '1px solid rgba(230, 106, 44, 0.55)',
                color: '#ffd2b8',
              }}
            >
              Taller El Yunke
            </span>
          </div>

          <div style={{ marginTop: 5, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10, alignItems: 'center' }}>
            {carriedKind ? (
              <span style={{ color: '#8ff0b8', fontWeight: 600 }}>
                Llevando: {ITEM_LABELS[carriedKind]} (E / Soltar)
              </span>
            ) : nearbyTargetKind ? (
              <span style={{ color: '#ffe066', fontWeight: 600 }}>
                Cerca: {ITEM_LABELS[nearbyTargetKind]} (E / Agarrar)
              </span>
            ) : (
              <span>Manos libres · Explorá el taller y el carrito</span>
            )}
            {flashText && (
              <span
                style={{
                  color: '#ffba49',
                  fontWeight: 800,
                  letterSpacing: 0.5,
                }}
              >
                {flashText}
              </span>
            )}
          </div>
        </div>

        {/* Quality, Touch & Reset controls */}
        <div
          className="hud-interactive"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
            background: 'var(--panel-bg)',
            border: '1px solid var(--panel-border)',
            borderRadius: 12,
            padding: '6px 10px',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.28)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>Calidad:</span>
          {(['low', 'medium', 'high'] as QualityLevel[]).map((lvl) => {
            const active = quality === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => gameStore.setQuality(lvl)}
                style={{
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  padding: '4px 9px',
                  borderRadius: 8,
                  border: active ? '1px solid #f5b942' : '1px solid rgba(255,255,255,0.14)',
                  background: active ? 'rgba(245, 185, 66, 0.25)' : 'rgba(255,255,255,0.06)',
                  color: active ? '#ffe8ad' : '#ded6c8',
                }}
              >
                {lvl === 'low' ? 'Baja' : lvl === 'medium' ? 'Media' : 'Alta'}
              </button>
            );
          })}

          <button
            type="button"
            onClick={cycleTouchMode}
            title="Alternar controles táctiles en pantalla"
            style={{
              fontSize: 12,
              padding: '4px 9px',
              borderRadius: 8,
              border: '1px solid rgba(62, 168, 160, 0.5)',
              background: showTouchControls ? 'rgba(62, 168, 160, 0.28)' : 'rgba(255,255,255,0.06)',
              color: '#d4faf6',
            }}
          >
            Táctil: {touchMode === 'auto' ? 'Auto' : touchMode === 'on' ? 'Sí' : 'No'}
          </button>

          <button
            type="button"
            onClick={() => gameStore.triggerReset()}
            style={{
              fontSize: 12,
              padding: '4px 9px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(255,255,255,0.08)',
              color: '#f7f1e3',
            }}
          >
            Reiniciar
          </button>

          {!showTouchControls && (
            <button
              type="button"
              onClick={() => gameStore.toggleHelp()}
              style={{
                fontSize: 12,
                padding: '4px 8px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.08)',
                color: '#f7f1e3',
              }}
            >
              {showHelp ? 'Ocultar guía' : 'Guía'}
            </button>
          )}
        </div>
      </div>

      {/* BOTTOM AREA: Controls hint + Optional Touch Joystick / Buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        {showTouchControls ? (
          <VirtualJoystick />
        ) : (
          <div />
        )}

        {showHelp && !showTouchControls && (
          <div
            style={{
              background: 'var(--panel-bg)',
              border: '1px solid var(--panel-border)',
              borderRadius: 10,
              padding: '7px 13px',
              fontSize: 12,
              color: 'var(--text-muted)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              backdropFilter: 'blur(4px)',
            }}
          >
            <span><strong style={{ color: '#ffe5a3' }}>WASD</strong> Mover</span>
            <span><strong style={{ color: '#ffe5a3' }}>Shift</strong> Correr</span>
            <span><strong style={{ color: '#ffe5a3' }}>Espacio</strong> Saltar</span>
            <span><strong style={{ color: '#ffe5a3' }}>E / F</strong> Agarrar · Soltar</span>
            <span><strong style={{ color: '#ffe5a3' }}>Arrastrar / Rueda</strong> Cámara</span>
          </div>
        )}

        {showTouchControls ? (
          <div
            className="hud-interactive"
            style={{ display: 'flex', gap: 12, alignItems: 'center', touchAction: 'none' }}
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                playerInput.triggerInteract();
              }}
              style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                border: `2px solid ${carriedKind || nearbyTargetKind ? '#ffe066' : 'rgba(255,255,255,0.35)'}`,
                background: carriedKind
                  ? 'rgba(72, 184, 122, 0.85)'
                  : nearbyTargetKind
                    ? 'rgba(245, 185, 66, 0.88)'
                    : 'rgba(42, 38, 35, 0.72)',
                color: carriedKind || nearbyTargetKind ? '#1e1915' : '#f7f1e3',
                fontWeight: 800,
                fontSize: 12,
                boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
              }}
            >
              {carriedKind ? 'SOLTAR' : 'AGARRAR'}
            </button>

            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                playerInput.setTouchJump(true);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                playerInput.setTouchJump(false);
              }}
              onPointerCancel={(e) => {
                e.stopPropagation();
                playerInput.setTouchJump(false);
              }}
              onPointerLeave={() => playerInput.setTouchJump(false)}
              style={{
                width: 82,
                height: 82,
                borderRadius: '50%',
                border: '2px solid #ffd29c',
                background: 'rgba(230, 106, 44, 0.88)',
                color: '#fff8ec',
                fontWeight: 800,
                fontSize: 13,
                boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
              }}
            >
              SALTAR
            </button>
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

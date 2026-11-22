import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { laserTableBridge, type PlatformChildInfo, type PlatformInfo } from '../invention/laserTableBridge';
import { cutRefund, fabricateCost, laserEconomy } from '../invention/laserEconomy';
import { platformStore } from '../invention/platformStore';
import { useGameModeStore } from '../modes/gameModes';
import {
  clampPoint,
  clonePoints,
  cutFromEdge,
  emptyGrid,
  gridToRects,
  notchAt,
  PLATFORM_LIMIT,
  PLATFORM_TEMPLATES,
  rasterize,
  STEER_DESIGN_MAX,
  validateOutline,
  wheelFootprintCorners,
  type PlatformGrid,
  type PlatformTemplate,
  type Pt,
  type Rect,
} from '../invention/platformShape';
import { steerSweepHits, unsupportedAfterCut, weldPoint, wheelFootprintFromPose } from '../invention/platformRules';
import type { GrabbableKind } from '../props/grabbableRegistry';

const VIEW = PLATFORM_LIMIT + 0.15;
const SNAP = 0.02;
const DEG = 180 / Math.PI;
const TEMPLATE_ORDER: PlatformTemplate[] = ['rect', 'triangle', 't', 'u'];
type Edge = 'front' | 'back' | 'left' | 'right';
const EDGE_LABEL: Record<Edge, string> = { front: 'Frente', back: 'Atrás', left: 'Izquierda', right: 'Derecha' };

function svgPoints(points: readonly Pt[]) {
  return points.map((p) => `${p.x.toFixed(3)},${(-p.z).toFixed(3)}`).join(' ');
}

function cellsGrid(base: PlatformGrid, cells: Iterable<number>): PlatformGrid {
  const grid = { ...emptyGrid(), cell: base.cell, x0: base.x0, z0: base.z0, nx: base.nx, nz: base.nz };
  grid.data = new Uint8Array(base.data.length);
  for (const idx of cells) grid.data[idx] = 1;
  return grid;
}

function RectsLayer({ rects, className }: { rects: Rect[]; className: string }) {
  return (
    <g className={className}>
      {rects.map((r, i) => (
        <rect key={i} x={r.x - r.hx} y={-r.z - r.hz} width={r.hx * 2} height={r.hz * 2} />
      ))}
    </g>
  );
}

/** Puntos grandes arrastrables (mouse y dedo). */
function useDragPoints(points: Pt[], onChange: (next: Pt[]) => void) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);
  const toLocal = (clientX: number, clientY: number): Pt | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return clampPoint({ x: Math.round(pt.x / SNAP) * SNAP, z: Math.round(-pt.y / SNAP) * SNAP });
  };
  const handles = (className: string) => points.map((p, index) => (
    <g key={index} className={className}
      onPointerDown={(e) => {
        dragging.current = index;
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (dragging.current !== index) return;
        const local = toLocal(e.clientX, e.clientY);
        if (!local) return;
        const next = clonePoints(points);
        next[index] = local;
        onChange(next);
      }}
      onPointerUp={() => { dragging.current = null; }}
      onPointerCancel={() => { dragging.current = null; }}
    >
      <circle className="laser-handle-hit" cx={p.x} cy={-p.z} r={0.16} />
      <circle className="laser-handle" cx={p.x} cy={-p.z} r={0.065} />
    </g>
  ));
  return { svgRef, handles };
}

function BoardSvg({ svgRef, children, label }: { svgRef: React.RefObject<SVGSVGElement | null>; children: ReactNode; label: string }) {
  return (
    <svg ref={svgRef} className="laser-board" viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`} role="img" aria-label={label}>
      <defs>
        <pattern id="laser-grid" width="0.1" height="0.1" patternUnits="userSpaceOnUse">
          <path d="M 0.1 0 L 0 0 0 0.1" className="laser-grid-line" />
        </pattern>
      </defs>
      <rect x={-VIEW} y={-VIEW} width={VIEW * 2} height={VIEW * 2} fill="url(#laser-grid)" />
      <line className="laser-axis" x1={0} y1={-VIEW} x2={0} y2={VIEW} />
      <line className="laser-axis" x1={-VIEW} y1={0} x2={VIEW} y2={0} />
      <text className="laser-front" x={0} y={-VIEW + 0.1} textAnchor="middle">▲ FRENTE</text>
      {children}
    </svg>
  );
}

function FabricateTab({ onMessage }: { onMessage: (text: string) => void }) {
  const econ = useSyncExternalStore(laserEconomy.subscribe, laserEconomy.get, laserEconomy.get);
  const unlimited = useGameModeStore((s) => s.mode === 'sandbox');
  const [template, setTemplate] = useState<PlatformTemplate>('triangle');
  const [points, setPoints] = useState<Pt[]>(() => clonePoints(PLATFORM_TEMPLATES.triangle.points));
  const error = validateOutline(points);
  const rects = useMemo(() => (error ? [] : gridToRects(rasterize(points))), [points, error]);
  const cost = useMemo(() => fabricateCost(rects), [rects]);
  const cantAfford = !unlimited && econ.scrap < cost;
  const { svgRef, handles } = useDragPoints(points, setPoints);
  return (
    <div className="laser-tab">
      <div className="laser-row" role="group" aria-label="Bases">
        {TEMPLATE_ORDER.map((t) => (
          <button key={t} type="button" className="hud-button" aria-pressed={template === t}
            onClick={() => { setTemplate(t); setPoints(clonePoints(PLATFORM_TEMPLATES[t].points)); }}>
            {PLATFORM_TEMPLATES[t].label}
          </button>
        ))}
      </div>
      <BoardSvg svgRef={svgRef} label="Vista desde arriba de la plataforma">
        <RectsLayer rects={rects} className="laser-material" />
        <polygon className={`laser-outline${error ? ' is-invalid' : ''}`} points={svgPoints(points)} />
        {handles('laser-point')}
      </BoardSvg>
      <p className="laser-hint" role="status">
        {error
          ?? (cantAfford
            ? `Falta chapa: necesitás ${cost} u (tenés ${econ.scrap} u). Recortá piezas para recuperar.`
            : `Arrastrá los puntos para darle forma. Costo: ${cost} u · Chapa: ${unlimited ? '∞ (Taller Libre)' : `${econ.scrap} u`}.`)}
      </p>
      <div className="laser-row">
        <button type="button" className="hud-button is-primary" disabled={Boolean(error) || cantAfford} data-suggested={(!error && !cantAfford) || undefined}
          onClick={() => {
            const result = laserTableBridge.get()?.fabricate(template, points);
            onMessage(result?.error ?? 'Plataforma fabricada: está frente a vos, lista para soldarle piezas.');
          }}>Fabricar plataforma ({cost} u)</button>
      </div>
    </div>
  );
}

function childName(kind: GrabbableKind, labels: Partial<Record<GrabbableKind, string>>) {
  return labels[kind] ?? kind;
}

function CutTab({ platforms, labels, onMessage }: {
  platforms: string[];
  labels: Partial<Record<GrabbableKind, string>>;
  onMessage: (text: string) => void;
}) {
  const nonce = useSyncExternalStore(platformStore.subscribe, platformStore.getNonce);
  const [selected, setSelected] = useState<string | null>(() => laserTableBridge.get()?.aimed() ?? platforms[platforms.length - 1] ?? null);
  const [edge, setEdge] = useState<Edge>('front');
  const [cut, setCut] = useState<Pt[] | null>(null);
  const [wheel, setWheel] = useState<string | null>(null);
  const [info, setInfo] = useState<PlatformInfo | null>(null);
  const record = selected ? platformStore.get(selected) : undefined;

  useEffect(() => {
    if (selected && !platforms.includes(selected)) setSelected(platforms[platforms.length - 1] ?? null);
    if (!selected && platforms.length) setSelected(platforms[platforms.length - 1]);
  }, [platforms, selected]);

  // Datos vivos de la creación (ángulo real de la dirección, piezas soldadas).
  useEffect(() => {
    if (!selected) { setInfo(null); return; }
    const read = () => setInfo(laserTableBridge.get()?.info(selected) ?? null);
    read();
    const timer = window.setInterval(read, 250);
    return () => window.clearInterval(timer);
  }, [selected, nonce]);

  useEffect(() => {
    if (record) setCut(notchAt(record.grid, edge));
    // Reiniciar el corte al cambiar de plataforma, de borde o después de cortar/deshacer.
  }, [selected, edge, record?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const children = info?.children ?? [];
  const steerers = children.filter((c) => c.steer);
  useEffect(() => {
    if (wheel && !steerers.some((c) => c.id === wheel)) setWheel(null);
    if (!wheel && steerers.length) setWheel(steerers[0].id);
  }, [steerers, wheel]);

  const preview = useMemo(() => {
    if (!record || !cut) return null;
    const result = cutFromEdge(record.grid, cut);
    const loose = result.error ? [] : unsupportedAfterCut(record.grid, result.grid, children);
    return { result, loose, removed: gridToRects(cellsGrid(record.grid, result.removed)) };
  }, [record, cut, children]);

  const { svgRef, handles } = useDragPoints(cut ?? [], (next) => setCut(next));

  if (!platforms.length || !record || !selected) {
    return <p className="laser-hint">Todavía no hay plataformas: fabricá una en la pestaña Fabricar.</p>;
  }
  const materialRects = record.rects;
  const selectedWheel = steerers.find((c) => c.id === wheel) ?? null;
  const sweep = selectedWheel ? gridToRects(cellsGrid(record.grid, steerSweepHits(record.grid, selectedWheel.pose))) : [];
  const footprintAt = (child: PlatformChildInfo, angle: number) => wheelFootprintCorners(wheelFootprintFromPose(child.pose, record.grid), angle);
  const looseSet = new Set(preview?.loose ?? []);
  const sweepAngles: number[] = [];
  for (let a = -STEER_DESIGN_MAX; a <= STEER_DESIGN_MAX + 1e-6; a += STEER_DESIGN_MAX / 4) sweepAngles.push(a);

  return (
    <div className="laser-tab">
      <div className="laser-row">
        <label className="laser-select">
          <span>Plataforma</span>
          <select value={selected} onChange={(e) => setSelected(e.currentTarget.value)}>
            {platforms.map((id, i) => <option key={id} value={id}>{`Plataforma ${i + 1}${laserTableBridge.get()?.info(id)?.inAssembly ? ' · montada' : ''}`}</option>)}
          </select>
        </label>
        <button type="button" className="hud-button" disabled={!platformStore.canUndo(selected)}
          onClick={() => {
            const result = laserTableBridge.get()?.undo(selected);
            onMessage(result?.error ?? `Corte deshecho${result?.restored ? ` · ${result.restored} pieza(s) resoldada(s)` : ''}`);
          }}>Deshacer</button>
      </div>
      <div className="laser-row" role="group" aria-label="Borde del corte">
        {(Object.keys(EDGE_LABEL) as Edge[]).map((e) => (
          <button key={e} type="button" className="hud-button" aria-pressed={edge === e} onClick={() => setEdge(e)}>
            Muesca {EDGE_LABEL[e]}
          </button>
        ))}
      </div>
      <BoardSvg svgRef={svgRef} label="Plataforma vista desde arriba con el corte">
        <RectsLayer rects={materialRects} className="laser-material" />
        <RectsLayer rects={sweep} className="laser-sweep-hit" />
        {preview && !preview.result.error && <RectsLayer rects={preview.removed} className="laser-removed" />}
        {selectedWheel && sweepAngles.map((a) => (
          <polygon key={a} className="laser-sweep" points={svgPoints(footprintAt(selectedWheel, a))} />
        ))}
        {selectedWheel?.steer && (
          <>
            <polygon className="laser-steer-limit" points={svgPoints(footprintAt(selectedWheel, selectedWheel.steer.min))} />
            <polygon className="laser-steer-limit" points={svgPoints(footprintAt(selectedWheel, selectedWheel.steer.max))} />
          </>
        )}
        {children.map((child) => {
          const weld = weldPoint(record.grid, child.pose) ?? { x: child.pose.position.x, z: child.pose.position.z };
          const isWheel = child.kind === 'wheel';
          const loose = looseSet.has(child.id);
          return (
            <g key={child.id} className={`laser-part${loose ? ' is-loose' : ''}${child.steer ? ' is-steer' : ''}${child.id === wheel ? ' is-selected' : ''}`}
              onPointerDown={() => { if (child.steer) setWheel(child.id); }}>
              {isWheel
                ? <polygon points={svgPoints(footprintAt(child, child.steer?.angle ?? 0))} />
                : <circle cx={child.pose.position.x} cy={-child.pose.position.z} r={0.12} />}
              <circle className="laser-weld" cx={weld.x} cy={-weld.z} r={0.045} />
            </g>
          );
        })}
        {cut && <polygon className={`laser-cut${preview?.result.error ? ' is-invalid' : ''}`} points={svgPoints(cut)} />}
        {handles('laser-point is-cut')}
      </BoardSvg>
      {selectedWheel?.steer && (
        <p className="laser-steer-readout" role="status">
          Rueda de dirección: gira de <strong>{Math.round(selectedWheel.steer.min * DEG)}°</strong> a{' '}
          <strong>+{Math.round(selectedWheel.steer.max * DEG)}°</strong> (diseño ±{Math.round(STEER_DESIGN_MAX * DEG)}°).
          {sweep.length > 0 ? ' Lo rojo es chapa que invade su espacio de giro.' : ' Espacio de giro libre.'}
        </p>
      )}
      {steerers.length > 1 && (
        <div className="laser-row" role="group" aria-label="Ruedas de dirección">
          {steerers.map((c, i) => (
            <button key={c.id} type="button" className="hud-button" aria-pressed={wheel === c.id} onClick={() => setWheel(c.id)}>
              Dirección {i + 1}
            </button>
          ))}
        </div>
      )}
      <p className={`laser-hint${preview?.loose.length ? ' is-warning' : ''}`} role="status">
        {info?.released ? 'La creación está suelta: fijala en el taller para recortar.'
          : preview?.result.error ? preview.result.error
            : preview?.loose.length ? `Ojo: se soltará ${preview.loose.map((id) => childName(children.find((c) => c.id === id)!.kind, labels)).join(', ')}.`
              : 'Arrastrá los puntos del corte. Lo rojo se recorta; las piezas apoyadas quedan soldadas.'}
      </p>
      <div className="laser-row">
        <button type="button" className={`hud-button${preview?.loose.length ? ' is-danger' : ' is-primary'}`}
          disabled={!preview || Boolean(preview.result.error) || Boolean(info?.released)}
          data-suggested={(preview && !preview.result.error && !info?.released) || undefined}
          onClick={() => {
            if (!cut) return;
            const refund = preview && !preview.result.error ? cutRefund(preview.result.removed.length, record.grid.cell) : 0;
            const result = laserTableBridge.get()?.cut(selected, cut);
            if (result?.error) onMessage(result.error);
            else onMessage(result?.released?.length
              ? `Corte hecho · se soltaron ${result.released.length} pieza(s)${refund > 0 ? ` · +${refund} u chapa` : ''}`
              : `Corte hecho${refund > 0 ? ` · +${refund} u chapa` : ''}`);
          }}>
          {preview?.loose.length ? 'Cortar y soltar piezas' : 'Cortar'}
        </button>
      </div>
    </div>
  );
}

export function LaserTable({ open, onClose, bolts, labels }: {
  open: boolean;
  onClose: () => void;
  bolts: ReactNode;
  labels: Partial<Record<GrabbableKind, string>>;
}) {
  const nonce = useSyncExternalStore(platformStore.subscribe, platformStore.getNonce);
  const [tab, setTab] = useState<'make' | 'cut'>('make');
  const [message, setMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    if (laserTableBridge.get()?.aimed()) setTab('cut');
    const timer = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(timer);
  }, [open]);
  const platforms = useMemo(
    () => platformStore.ids().filter((id) => laserTableBridge.get()?.info(id)),
    [nonce, tick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!open) return null;
  return (
    <div className="hud-menu-backdrop hud-interactive laser-overlay" role="dialog" aria-modal="true" aria-labelledby="laser-title">
      <div className="hud-menu-card wood-sign laser-card">
        {bolts}
        <div className="hud-menu-header">
          <h2 id="laser-title">Mesa de Corte Láser</h2>
          <button type="button" className="hud-button" onClick={onClose}>Cerrar</button>
        </div>
        <div className="hud-menu-tabs laser-tabs" role="tablist">
          <button type="button" role="tab" className="hud-button" aria-selected={tab === 'make'} aria-pressed={tab === 'make'}
            onClick={() => setTab('make')}>Fabricar</button>
          <button type="button" role="tab" className="hud-button" aria-selected={tab === 'cut'} aria-pressed={tab === 'cut'}
            onClick={() => setTab('cut')}>Recortar</button>
        </div>
        {tab === 'make'
          ? <FabricateTab onMessage={setMessage} />
          : <CutTab platforms={platforms} labels={labels} onMessage={setMessage} />}
        {message && <p className="hud-workshop-status laser-message" role="status">{message}</p>}
      </div>
    </div>
  );
}

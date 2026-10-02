"use client";
import { useRef, type PointerEvent, type MouseEvent } from "react";
import type { Point, Zone } from "@/lib/azumi-types";

type Props = { zones: Zone[]; point?: Point | null; onPoint?: (point: Point) => void; selected?: string; onSelectZone?: (id: string) => void; vertices?: Point[]; onVertices?: (points: Point[]) => void };
export function DeliveryMap({ zones, point, onPoint, selected, onSelectZone, vertices, onVertices }: Props) {
  const dragging = useRef<number | null>(null), moved = useRef(false);
  function coordinate(event: MouseEvent<SVGSVGElement> | PointerEvent<SVGSVGElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(600, (event.clientX - bounds.left) / bounds.width * 600)), Math.max(0, Math.min(340, (event.clientY - bounds.top) / bounds.height * 340))];
  }
  return <div className={`delivery-map ${vertices ? "editing-map" : ""}`}><span className="map-caption">Mapa ilustrativo · cobertura Azumi</span><svg viewBox="0 0 600 340" preserveAspectRatio="none" aria-label={vertices ? "Editor de polígono de cobertura" : "Mapa de cobertura de delivery"} role="img" tabIndex={onPoint ? 0 : undefined}
    onClick={e => { if (moved.current) { moved.current = false; return; } const p = coordinate(e); if (onVertices) onVertices([...(vertices || []), p]); else onPoint?.(p); }}
    onPointerMove={e => { if (dragging.current !== null && onVertices && vertices) { moved.current = true; const position = coordinate(e); onVertices(vertices.map((p, i) => i === dragging.current ? position : p)); } }}
    onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}
    onKeyDown={e => { if (!onPoint) return; const deltas: Record<string, Point> = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }; const delta = deltas[e.key]; if (delta) { e.preventDefault(); const start = point || [270, 210]; onPoint([Math.max(0, Math.min(600, start[0] + delta[0])), Math.max(0, Math.min(340, start[1] + delta[1]))]); } }}>
    <rect width="600" height="340" fill="#e5eee6" /><path d="M0 285Q130 250 235 285T600 270V340H0Z" fill="#c0e5e7" /><g stroke="#fff" strokeWidth="14"><path d="M0 78 600 120M0 195 600 205M0 250 600 250M110 0 130 300M215 0 260 290M375 0 410 285M530 0 555 280" /></g>
    {zones.filter(z => z.active || onSelectZone).map(z => <polygon key={z.id} points={z.points.map(p => p.join(",")).join(" ")} fill={z.type === "restricted" ? "#e95146" : "#098c83"} fillOpacity={z.type === "restricted" ? .32 : .1} stroke={z.type === "restricted" ? "#e95146" : "#098c83"} strokeOpacity={z.active ? 1 : .3} strokeWidth={selected === z.id ? 4 : 2} onClick={e => { if (onSelectZone && !onVertices) { e.stopPropagation(); onSelectZone(z.id); } }} />)}
    <g className="map-label"><text x="70" y="180">Obarrio</text><text x="215" y="85">San Francisco</text><text x="445" y="185">Costa del Este</text><text x="390" y="318">Bahía de Panamá</text><text x="273" y="184">Azumi</text></g><circle cx="260" cy="180" r="7" fill="#242a2c" />
    {vertices && <><polygon points={vertices.map(p => p.join(",")).join(" ")} fill="#e95146" fillOpacity=".15" stroke="#e95146" strokeWidth="3" />{vertices.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="7" fill="#fff" stroke="#e95146" strokeWidth="3" onPointerDown={e => { e.preventDefault(); e.stopPropagation(); dragging.current = i; moved.current = false; e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId); }} onClick={e => e.stopPropagation()} />)}</>}
    {point && <g><circle cx={point[0]} cy={point[1]} r="11" fill="#e95146" stroke="white" strokeWidth="3" /><circle cx={point[0]} cy={point[1]} r="3" fill="white" /></g>}
  </svg></div>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { Point, Zone } from "@/lib/azumi-types";
import { latLng, restaurantPoint } from "@/lib/delivery-geo";
import { Button, Icon, Notice } from "./ui";
import { useAzumi } from "./azumi-provider";

type Props = { zones: Zone[]; point?: Point | null; onPoint?: (point: Point) => void; selected?: string; onSelectZone?: (id: string) => void; vertices?: Point[]; onVertices?: (points: Point[]) => void; onAddress?: (address: string) => void };
type SearchResult = { label: string; point: Point };

export function DeliveryMap(props: Props) {
  const { catalog } = useAzumi();
  const restaurant = catalog.settings.restaurantPoint || restaurantPoint;
  const initialRestaurant = useRef(restaurant);
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<{ map: Leaflet.Map; layers: Leaflet.LayerGroup; L: typeof Leaflet } | null>(null);
  const current = useRef(props);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [results, setResults] = useState<SearchResult[]>([]), [busy, setBusy] = useState(false);
  useEffect(() => { current.current = props; });
  useEffect(() => {
    let disposed = false;
    void import("leaflet").then(L => {
      if (disposed || !container.current) return;
      const map = L.map(container.current, { scrollWheelZoom: false }).setView(latLng(initialRestaurant.current), 13);
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      tiles.on("tileerror", () => setError("No se pudieron cargar algunas calles. Comprueba tu conexión."));
      map.on("click", (event: Leaflet.LeafletMouseEvent) => {
        const p: Point = [event.latlng.lng, event.latlng.lat];
        if (current.current.onVertices) current.current.onVertices([...(current.current.vertices || []), p]);
        else current.current.onPoint?.(p);
      });
      instance.current = { map, layers: L.layerGroup().addTo(map), L };
      setLoaded(true);
    }).catch(() => setError("No pudimos cargar el mapa. Recarga la página para intentarlo de nuevo."));
    return () => { disposed = true; instance.current?.map.remove(); instance.current = null; };
  }, []);
  useEffect(() => {
    const state = instance.current;
    if (!loaded || !state) return;
    const { L, layers, map } = state;
    layers.clearLayers();
    const icon = (kind: string, label: string) => L.divIcon({ className: "map-marker-wrapper", html: `<span class="map-marker ${kind}" role="img" aria-label="${label}"></span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    L.marker(latLng(restaurant), { icon: icon("restaurant", "Azumi") }).bindTooltip(catalog.settings.restaurantPoint ? "Azumi · Restaurante" : "Azumi · San Francisco (referencia)").addTo(layers);
    for (const zone of props.zones.filter(z => z.active || props.onSelectZone)) {
      const polygon = L.polygon(zone.points.map(latLng), { color: zone.type === "restricted" ? "#dc4e43" : "#098c83", fillOpacity: zone.active ? 0.12 : 0.04, weight: props.selected === zone.id ? 4 : 2, interactive: !!props.onSelectZone && !props.onVertices }).addTo(layers);
      polygon.bindTooltip(zone.name);
      if (props.onSelectZone && !props.onVertices) polygon.on("click", () => { current.current.onSelectZone?.(zone.id); });
    }
    if (props.vertices) {
      L.polygon(props.vertices.map(latLng), { color: "#dc4e43", interactive: false }).addTo(layers);
      props.vertices.forEach((p, index) => {
        const marker = L.marker(latLng(p), { draggable: true, icon: icon("vertex", `Vértice ${index + 1}`) }).addTo(layers);
        marker.on("dragend", () => { const value = marker.getLatLng(); current.current.onVertices?.((current.current.vertices || []).map((v, i) => i === index ? [value.lng, value.lat] : v)); });
      });
    }
    if (props.point) {
      const marker = L.marker(latLng(props.point), { draggable: !!props.onPoint, icon: icon("destination", "Entrega") }).bindTooltip("Punto de entrega").addTo(layers);
      marker.on("dragend", () => { const value = marker.getLatLng(); current.current.onPoint?.([value.lng, value.lat]); });
      const location = L.latLng(latLng(props.point));
      if (!map.getBounds().pad(-0.15).contains(location)) map.panTo(location);
    }
    const selected = props.zones.find(z => z.id === props.selected);
    if (selected && !props.onPoint) map.fitBounds(L.latLngBounds(selected.points.map(latLng)), { padding: [25, 25], maxZoom: 15 });
  }, [loaded, props.zones, props.point, props.selected, props.vertices, props.onPoint, props.onSelectZone, props.onVertices, restaurant, catalog.settings.restaurantPoint]);

  async function search() {
    if (query.trim().length < 3 || busy) return;
    setBusy(true); setError(""); setResults([]);
    try {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResults(data.results);
      if (!data.results.length) setError("No encontramos ese lugar. Prueba con el nombre de la calle o selecciona un punto.");
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos buscar esa dirección."); }
    finally { setBusy(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setError("Tu navegador no permite consultar la ubicación."); return; }
    setBusy(true); setError("");
    navigator.geolocation.getCurrentPosition(position => {
      const p: Point = [position.coords.longitude, position.coords.latitude];
      current.current.onPoint?.(p);
      instance.current?.map.setView(latLng(p), 16);
      setBusy(false);
    }, () => { setError("No pudimos obtener tu ubicación. Permite el GPS o selecciona el lugar en el mapa."); setBusy(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }
  return <div className="map-section">
    {props.onPoint && <div className="map-tools">
      <label className="map-search"><span className="sr-only">Buscar calle o lugar en Panamá</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar calle o lugar en Panamá" maxLength={150} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} /></label>
      <Button className="secondary map-tool" title="Buscar dirección" aria-label="Buscar dirección" disabled={busy} onClick={() => void search()}><Icon name="search" /></Button>
      <Button className="secondary" disabled={busy || !loaded} onClick={locate}><Icon name="pin" />Mi ubicación</Button>
    </div>}
    {!!results.length && <ul className="map-results">{results.map((result, index) => <li key={index}><button type="button" onClick={() => { const p = result.point; props.onPoint?.(p); props.onAddress?.(result.label.slice(0, 250)); instance.current?.map.setView(latLng(p), 16); setResults([]); }}>{result.label}</button></li>)}</ul>}
    {error && <Notice error>{error}</Notice>}
    <div className="delivery-map"><div ref={container} className="leaflet-surface" aria-label="Mapa de cobertura de delivery" />{!loaded && <div className="map-loading" role="status">Cargando mapa…</div>}</div>
    {props.point && <p className="helper-text">Latitud {props.point[1].toFixed(6)} · Longitud {props.point[0].toFixed(6)}</p>}
  </div>;
}

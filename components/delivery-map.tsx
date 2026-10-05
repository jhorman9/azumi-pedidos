"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { Point, Zone } from "@/lib/azumi-types";
import { latLng, restaurantPoint } from "@/lib/delivery-geo";
import { Button, Icon, Notice } from "./ui";
import { useAzumi } from "./azumi-provider";
import type { LocationResult } from "@/lib/location-results";

export type DeliveryMapProps = { zones: Zone[]; point?: Point | null; onPoint?: (point: Point) => void; selected?: string; onSelectZone?: (id: string) => void; vertices?: Point[]; onVertices?: (points: Point[]) => void; onAddress?: (address: string) => void; onBuilding?: (building: string) => void };

export function DeliveryMap(props: DeliveryMapProps) {
  const { catalog } = useAzumi();
  const restaurant = catalog.settings.restaurantPoint || restaurantPoint;
  const initialRestaurant = useRef(restaurant);
  const container = useRef<HTMLDivElement>(null);
  const instance = useRef<{ map: Leaflet.Map; layers: Leaflet.LayerGroup; L: typeof Leaflet } | null>(null);
  const current = useRef(props);
  const [loaded, setLoaded] = useState(false), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [results, setResults] = useState<LocationResult[]>([]), [busy, setBusy] = useState(false);
  const [autocomplete, setAutocomplete] = useState(false), [searching, setSearching] = useState(false), [activeResult, setActiveResult] = useState(-1);
  const requestRef = useRef<AbortController | null>(null), searchVersion = useRef(0), selectedQuery = useRef("");
  const resultsId = useId(), searchable = !!props.onPoint;
  const cancelSearch = useCallback(() => { requestRef.current?.abort(); searchVersion.current++; setSearching(false); }, []);
  const search = useCallback(async (input: string, mode = "search") => {
    if (input.trim().length < 3) return;
    requestRef.current?.abort();
    const controller = new AbortController(), version = ++searchVersion.current;
    requestRef.current = controller; setSearching(true); setError(""); setResults([]); setActiveResult(-1);
    try {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(input.trim())}&mode=${mode}`, { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (version !== searchVersion.current) return;
      if (!response.ok) throw new Error(data.error);
      setResults(data.results); setAutocomplete(data.provider === "geoapify");
      if (!data.results.length) setError("No encontramos ese lugar. Prueba con el nombre del PH, la calle o selecciona un punto.");
    } catch (e) { if (!controller.signal.aborted && version === searchVersion.current) setError(e instanceof Error ? e.message : "No pudimos buscar esa dirección."); }
    finally { if (version === searchVersion.current) setSearching(false); }
  }, []);
  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    void fetch("/api/locations?mode=config", { signal: controller.signal, cache: "no-store" }).then(response => response.ok ? response.json() : null).then(data => { if (!controller.signal.aborted) setAutocomplete(!!data?.autocomplete); }).catch(() => {});
    return () => controller.abort();
  }, [searchable]);
  useEffect(() => {
    if (!searchable || !autocomplete || query.trim().length < 3 || selectedQuery.current === query) return;
    const timer = setTimeout(() => { if (selectedQuery.current !== query) void search(query, "autocomplete"); }, 750);
    return () => { clearTimeout(timer); cancelSearch(); };
  }, [query, searchable, autocomplete, search, cancelSearch]);
  useEffect(() => () => cancelSearch(), [cancelSearch]);
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

  function selectResult(result: LocationResult) {
    cancelSearch();
    selectedQuery.current = result.label.slice(0, 150); setQuery(selectedQuery.current);
    current.current.onPoint?.(result.point); current.current.onAddress?.(result.label); current.current.onBuilding?.(result.building || "");
    instance.current?.map.setView(latLng(result.point), 16); setResults([]); setActiveResult(-1); setError("");
  }
  function locate() {
    cancelSearch(); setResults([]); selectedQuery.current = query;
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
      <label className="map-search"><span className="sr-only">Buscar PH, calle o lugar en Panamá</span><input value={query} role="combobox" aria-autocomplete="list" aria-expanded={!!results.length} aria-controls={resultsId} aria-activedescendant={activeResult >= 0 ? `${resultsId}-${activeResult}` : undefined} autoComplete="off" onChange={e => { cancelSearch(); selectedQuery.current = ""; setResults([]); setActiveResult(-1); setError(""); setQuery(e.target.value); }} placeholder="Buscar PH, calle o lugar en Panamá" maxLength={150} onKeyDown={e => {
        if (e.key === "ArrowDown" && results.length) { e.preventDefault(); setActiveResult(index => (index + 1) % results.length); }
        else if (e.key === "ArrowUp" && results.length) { e.preventDefault(); setActiveResult(index => index <= 0 ? results.length - 1 : index - 1); }
        else if (e.key === "Enter") { e.preventDefault(); if (activeResult >= 0 && results[activeResult]) selectResult(results[activeResult]); else { selectedQuery.current = query; void search(query); } }
        else if (e.key === "Escape") { cancelSearch(); selectedQuery.current = query; setResults([]); setActiveResult(-1); }
      }} /></label>
      <Button className="secondary map-tool" title="Buscar dirección" aria-label="Buscar dirección" disabled={busy || searching || query.trim().length < 3} onClick={() => { selectedQuery.current = query; void search(query); }}><Icon name="search" /></Button>
      <Button className="secondary" disabled={busy || !loaded} onClick={locate}><Icon name="pin" />Mi ubicación</Button>
    </div>}
    {searching && <p className="helper-text" role="status">Buscando direcciones…</p>}
    {!!results.length && <ul id={resultsId} className="map-results" role="listbox" aria-label="Direcciones encontradas">{results.map((result, index) => <li key={result.id} id={`${resultsId}-${index}`} role="option" aria-selected={activeResult === index}><button type="button" onClick={() => selectResult(result)}>{result.label}</button></li>)}</ul>}
    {props.onPoint && autocomplete && <p className="geocoder-credit"><a href="https://www.geoapify.com/" target="_blank" rel="noopener noreferrer">Powered by Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>}
    {error && <Notice error>{error}</Notice>}
    <div className="delivery-map"><div ref={container} className="leaflet-surface" aria-label="Mapa de cobertura de delivery" />{!loaded && <div className="map-loading" role="status">Cargando mapa…</div>}</div>
    {props.point && <p className="helper-text">Latitud {props.point[1].toFixed(6)} · Longitud {props.point[0].toFixed(6)}</p>}
  </div>;
}

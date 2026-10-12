import React, { useEffect, useMemo, useRef, useState } from 'react';
import { STATUS } from '../data/constants.js';
import { runs } from '../lib/engine.js';
import { subPolyline, pointAt } from '../lib/geo.js';

const P = (pts) => pts.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join(' ');

export default function MapView({ net, defects = [], selected, onSelect, picking, onPick, coverage, covSince, covColor = 'var(--st-closed)', highlight = [], track, me, vehicles = [], height = 520, legend = true, focus, hint }) {
  const b = net.bounds;
  const base = useMemo(() => ({ x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY }), [net.id]);
  const [view, setView] = useState(base);
  const svg = useRef(null), wrap = useRef(null), drag = useRef(null);
  const [px, setPx] = useState(800);
  useEffect(() => { setView(base); }, [base]);
  useEffect(() => {
    if (!wrap.current) return undefined;
    const ro = new ResizeObserver(([e]) => setPx(e.contentRect.width || 800));
    ro.observe(wrap.current); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!focus) return;
    const w = base.w / (net.id === 'city' ? 3 : 5), h = (w * base.h) / base.w;
    setView({ x: focus[0] - w / 2, y: focus[1] - h / 2, w, h });
  }, [focus && focus[0], focus && focus[1]]);
  const u = Math.max(view.w / px, view.h / height);
  const toSvg = (e) => { const el = svg.current; const pt = el.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const r = pt.matrixTransform(el.getScreenCTM().inverse()); return [r.x, r.y]; };
  const zoomAt = (v, [x, y], f) => { const w = Math.min(base.w * 1.6, Math.max(base.w / 80, v.w * f)); const k = w / v.w; return { x: x - (x - v.x) * k, y: y - (y - v.y) * k, w, h: v.h * k }; };
  useEffect(() => {
    const el = svg.current; if (!el) return undefined;
    const h = (e) => { e.preventDefault(); const p = toSvg(e); setView((v) => zoomAt(v, p, e.deltaY < 0 ? 0.8 : 1.25)); };
    el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h);
  });
  const down = (e) => { drag.current = { sx: e.clientX, sy: e.clientY, v: view, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.moved) setView({ ...d.v, x: d.v.x - dx * u, y: d.v.y - dy * u });
  };
  const up = (e) => {
    const d = drag.current; drag.current = null;
    if (!d || d.moved) return;
    const [x, y] = toSvg(e);
    if (picking && onPick) { onPick([x, y]); return; }
    if (!onSelect) return;
    let best = null;
    for (const df of defects) { if (df.x == null) continue; const dist = Math.hypot(df.x - x, df.y - y); if (dist < 9 * u && (!best || dist < best.dist)) best = { df, dist }; }
    if (best) onSelect(best.df);
  };

  const zoomed = view.w < base.w / 1.6;
  const covLines = coverage ? net.roads.flatMap((r) => (coverage[r.id] ? runs(coverage[r.id], covSince, r.len).map(([a2, b2]) => ({ id: `${r.id}-${a2}`, pts: subPolyline(r, a2, b2) })) : [])) : [];
  const sorted = [...defects].filter((d) => d.x != null).sort((a, b2) => (a.id === selected ? 1 : b2.id === selected ? -1 : 0));
  const statuses = [...new Set(defects.map((d) => d.status))];
  return (
    <div className="map" ref={wrap} style={{ height }}>
      <svg ref={svg} className={picking ? 'picking' : ''} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet" onPointerDown={down} onPointerMove={move} onPointerUp={up} role="img" aria-label={`Карта: ${net.name}`}>
        <rect x={base.x - base.w} y={base.y - base.h} width={base.w * 3} height={base.h * 3} fill="var(--map-bg)" />
        {net.roads.map((r) => <polyline key={`c${r.id}`} points={P(r.pts)} fill="none" stroke={r.cat === 'main' ? 'var(--road-main-casing)' : 'var(--road-casing)'} strokeWidth={r.cat === 'main' ? 6 : 4.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
        {net.roads.map((r) => <polyline key={`f${r.id}`} points={P(r.pts)} fill="none" stroke={r.cat === 'main' ? 'var(--road-main)' : 'var(--road)'} strokeWidth={r.cat === 'main' ? 3.5 : 2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
        {covLines.map((l) => <polyline key={l.id} points={P(l.pts)} fill="none" stroke={covColor} strokeWidth="4" strokeLinecap="round" opacity="0.85" vectorEffect="non-scaling-stroke" />)}
        {net.roads.filter((r) => highlight.includes(r.id)).map((r) => <polyline key={`h${r.id}`} points={P(r.pts)} fill="none" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" opacity="0.8" vectorEffect="non-scaling-stroke" />)}
        {track && track.length > 1 && <polyline points={P(track)} fill="none" stroke="var(--accent)" strokeWidth="3" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
        {net.towns.map((t) => (
          <g key={t.name}>
            <circle cx={t.x} cy={t.y} r={(t.name === 'Областной центр' ? 6 : 4) * u} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5 * u} />
            <text x={t.x + 8 * u} y={t.y - 6 * u} fontSize={12 * u} fill="var(--map-label)" fontWeight="600" style={{ paintOrder: 'stroke', stroke: 'var(--map-bg)', strokeWidth: 3 * u }}>{t.name}</text>
          </g>
        ))}
        {(zoomed || net.id === 'oblast') && net.roads.map((r) => {
          const m = pointAt(r, r.len * (net.id === 'city' ? 0.12 + (Number(r.id.slice(1)) * 0.37 % 0.76) : 0.5));
          return <text key={`l${r.id}`} x={m[0]} y={m[1] - 5 * u} fontSize={(net.id === 'oblast' ? 10 : 10.5) * u} textAnchor="middle" fill="var(--map-label)" style={{ paintOrder: 'stroke', stroke: 'var(--map-bg)', strokeWidth: 3 * u }}>{r.short}</text>;
        })}
        {vehicles.map((v) => <g key={v.id}><rect x={v.x - 5 * u} y={v.y - 5 * u} width={10 * u} height={10 * u} rx={2 * u} fill="var(--amber)" stroke="var(--ink)" strokeWidth={1.2 * u} /><text x={v.x + 8 * u} y={v.y + 4 * u} fontSize={10.5 * u} fill="var(--ink)" fontWeight="600" style={{ paintOrder: 'stroke', stroke: 'var(--map-bg)', strokeWidth: 3 * u }}>{v.label}</text></g>)}
        {sorted.map((d) => (
          <circle key={d.id} cx={d.x} cy={d.y} r={(d.id === selected ? 8 : 5) * u} fill={STATUS[d.status]?.color || 'var(--muted)'} stroke={d.id === selected ? 'var(--ink)' : '#fff'} strokeWidth={(d.id === selected ? 2.5 : 1.3) * u} />
        ))}
        {me && <g><circle cx={me[0]} cy={me[1]} r={14 * u} fill="var(--accent)" opacity="0.2" /><circle cx={me[0]} cy={me[1]} r={6.5 * u} fill="var(--accent)" stroke="#fff" strokeWidth={2 * u} /></g>}
      </svg>
      <div className="map-ctl">
        <button type="button" aria-label="Приблизить" onClick={() => setView((v) => zoomAt(v, [v.x + v.w / 2, v.y + v.h / 2], 0.7))}>+</button>
        <button type="button" aria-label="Отдалить" onClick={() => setView((v) => zoomAt(v, [v.x + v.w / 2, v.y + v.h / 2], 1.4))}>−</button>
        <button type="button" aria-label="Вся карта" onClick={() => setView(base)} style={{ fontSize: '0.7rem' }}>⤢</button>
      </div>
      {hint && <div className="map-hint">{hint}</div>}
      {legend && (statuses.length > 0 || coverage) && (
        <div className="map-legend">
          {statuses.map((s) => <span key={s}><i className="dotst" style={{ background: STATUS[s].color }} />{STATUS[s].name}</span>)}
          {coverage && <span><i style={{ width: 18, height: 4, background: covColor, borderRadius: 2, display: 'inline-block' }} />{legend === true ? 'покрыто' : legend}</span>}
          <span className="muted">демо-координаты</span>
        </div>
      )}
    </div>
  );
}

import React from 'react';
import { DEFECTS } from '../data/constants.js';
import { hash } from '../lib/format.js';
import { fmtKm } from '../lib/geo.js';

/** Procedural dash-cam frame used where no real photo exists (demo data). */
export default function Frame({ d, after = false, roadName }) {
  if (!after && d.photo) return <img className="frame" src={d.photo} alt={`Фото дефекта ${d.id}`} />;
  if (after && d.fixPhoto) return <img className="frame" src={d.fixPhoto} alt={`Фото после устранения ${d.id}`} />;
  const h = hash(d.id || 'x');
  const cx = 130 + h * 70, cy = 128 + ((h * 997) % 1) * 38;
  const t = new Date(after ? d.fixedAt || Date.now() : d.createdAt);
  const stamp = `${t.toLocaleDateString('ru-RU')} ${t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  const src = d.src === 'camera' ? `CAM ${d.vehicle || ''}` : d.src === 'inspector' ? 'INSPECTOR' : 'ЕКЦ 109';
  const dash = [];
  for (let i = 0; i < 6; i++) { const y1 = 70 + i * i * 4.2 + i * 6, y2 = y1 + 6 + i * 2.2, w1 = 0.6 + i * 0.55, w2 = w1 + 0.5; dash.push(`160,${y1} ${160 + w1},${y1} ${160 + w2},${y2} ${160 - w2},${y2} ${160 - w1},${y1}`); }
  let box = null, art = null;
  const type = d.type;
  if (type === 'pothole') {
    art = after ? <rect x={cx - 34} y={cy - 12} width={68} height={24} fill="#3B3E41" stroke="#2A2C2E" /> : <g><ellipse cx={cx} cy={cy} rx={28} ry={10} fill="#5B5F63" /><ellipse cx={cx + 2} cy={cy + 1} rx={21} ry={7} fill="#1F2123" /></g>;
    box = [cx - 34, cy - 15, 68, 30];
  } else if (type === 'marking') {
    art = <rect x={140} y={62} width={40} height={138} fill="#4A4D50" opacity={after ? 0 : 0.85} />;
    box = [138, 110, 44, 80];
  } else if (type === 'sign') {
    const tilt = after ? 0 : 18;
    art = <g transform={`rotate(${tilt} 276 190)`}><rect x={274} y={96} width={4} height={94} fill="#9AA0A3" /><polygon points="276,70 296,104 256,104" fill={after ? '#F5F5F5' : '#D9D4C7'} stroke="#C2361F" strokeWidth={after ? 5 : 2} /></g>;
    box = [248, 64, 58, 128];
  } else if (type === 'crack') {
    art = after ? null : <polyline points={`${cx - 40},${cy} ${cx - 22},${cy - 6} ${cx - 8},${cy + 4} ${cx + 10},${cy - 5} ${cx + 30},${cy + 3} ${cx + 44},${cy - 2}`} fill="none" stroke="#1C1E20" strokeWidth="2" />;
    box = [cx - 46, cy - 14, 94, 28];
  } else if (type === 'rut') {
    art = after ? null : <g opacity="0.7"><polygon points="118,200 132,200 152,70 148,70" fill="#2C2F31" /><polygon points="190,200 204,200 172,70 168,70" fill="#2C2F31" /></g>;
    box = [112, 90, 98, 108];
  } else if (type === 'barrier') {
    art = <g><polyline points="20,150 70,118 110,94" fill="none" stroke="#B9BEC1" strokeWidth="5" />{!after && <polyline points="70,118 84,140" stroke="#B9BEC1" strokeWidth="5" />}{after && <polyline points="20,150 110,94" stroke="#E2E5E7" strokeWidth="5" />}</g>;
    box = [16, 88, 100, 66];
  } else {
    art = after ? null : <polygon points={`248,200 262,170 250,150 266,128 255,110 270,95 285,200`} fill="#6E6A5E" />;
    box = [244, 92, 46, 108];
  }
  const label = `${DEFECTS[type]?.short?.toLowerCase() || type}${d.conf ? ` ${d.conf.toFixed(2).replace('.', ',')}` : ''}`;
  return (
    <svg className="frame" viewBox="0 0 320 200" role="img" aria-label={`${after ? 'После устранения' : 'Кадр'}: ${DEFECTS[type]?.name}`}>
      <rect width="320" height="62" fill="#9DB2C3" />
      <rect y="62" width="320" height="138" fill="#7C8A6B" />
      <polygon points="40,200 280,200 186,62 134,62" fill="#4A4D50" />
      <polyline points="40,200 134,62" stroke="#E8E8E2" strokeWidth="2" fill="none" />
      <polyline points="280,200 186,62" stroke="#E8E8E2" strokeWidth="2" fill="none" />
      {dash.map((p, i) => <polygon key={i} points={p} fill="#E8E8E2" />)}
      {art}
      {!after && d.src === 'camera' && box && (
        <g>
          <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} fill="none" stroke="#F2B705" strokeWidth="2" />
          <rect x={box[0]} y={box[1] - 14} width={Math.max(54, label.length * 6.4)} height="14" fill="#F2B705" />
          <text x={box[0] + 4} y={box[1] - 3.5} fontSize="10" fontFamily="JetBrains Mono, monospace" fill="#1B1F22">{label}</text>
        </g>
      )}
      <rect x="0" y="182" width="320" height="18" fill="rgba(0,0,0,.45)" />
      <text x="6" y="194.5" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill="#fff">{after ? 'ПОСЛЕ РЕМОНТА' : src} · {stamp}</text>
      {d.km != null && <text x="314" y="194.5" fontSize="9.5" fontFamily="JetBrains Mono, monospace" fill="#fff" textAnchor="end">{roadName ? `${roadName} ` : ''}{fmtKm(d.km)}</text>}
    </svg>
  );
}

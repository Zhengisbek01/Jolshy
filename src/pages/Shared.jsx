import React from 'react';
import { DEFECTS, SEV, SOURCES, STATUS, OPEN } from '../data/constants.js';
import { roadOf, contractorName, slaLabel, kpis, dur, hoursFmt, dailyBySource, H } from '../lib/engine.js';
import { fmtKm, fmtLL } from '../lib/geo.js';
import { dt, f0, f1, pct } from '../lib/format.js';
import { Pill, Tag, Kpi, Grid, Card, LineChart, Seg } from '../ui.jsx';
import Frame from '../components/Frame.jsx';

export const StatusPill = ({ s }) => <Pill kind={STATUS[s]?.cls}>{STATUS[s]?.name || s}</Pill>;
export const SrcTag = ({ s }) => <Tag>{SOURCES[s]?.name || s}</Tag>;
export const SevPill = ({ s }) => <Pill kind={SEV[s]?.cls}>{SEV[s]?.name}</Pill>;
export const Sla = ({ d }) => { const l = slaLabel(d); return l ? <Pill kind={l.cls}>{l.text}</Pill> : <span className="muted">—</span>; };
export const NetSeg = ({ value, onChange }) => <Seg value={value} onChange={onChange} items={[['oblast', 'Областные дороги'], ['city', 'Улицы города']]} />;
export const where = (s, d) => {
  if (d.road == null) return d.addr || 'адрес не указан';
  const r = roadOf(s, d.road);
  return `${r.net === 'oblast' ? r.code : r.name}, ${r.net === 'oblast' ? fmtKm(d.km) : `${f1(d.km)} км от начала`}`;
};

export function Timeline({ s, d }) {
  const rows = [
    [d.createdAt, d.src === 'camera' ? `Обнаружен камерой ${s.vehicles.find((v) => v.id === d.vehicle)?.name || ''}, уверенность ${f0((d.conf || 0) * 100)}%` : d.src === 'inspector' ? `Зафиксирован инспектором ${s.users.find((u) => u.id === d.inspector)?.name || ''}` : `Обращение в ЕКЦ 109 № ${d.t109}`],
    [d.geoAt, `Геопривязка вручную: ${d.geoBy}`],
    [d.rejectedAt, `Отклонён: ${d.rejectReason} (${d.rejectedBy})`],
    [d.confirmedAt, `Подтверждён: ${d.confirmedBy}`],
    [d.assignedAt, `Передан подрядчику ${contractorName(s, d.contractor)}${d.confirmedAt ? ` через ${dur(d.assignedAt - (d.src === 'inspector' ? d.createdAt : d.confirmedAt))}` : ''}`],
    [d.assignedAt && d.t109 && d.src !== 'c109' ? d.assignedAt : null, `Создана заявка в ЕКЦ 109 № ${d.t109}`],
    [d.startedAt, 'Подрядчик начал работы'],
    [d.fixedAt, `Подрядчик сообщил об устранении${d.fixNote ? `: ${d.fixNote}` : ''}`],
    [d.returnedAt, `Возвращён на доработку: ${d.returnNote} (${d.returnedBy})`],
    [d.verifiedAt, `Принят инспектором ${d.verifiedBy}`],
  ].filter((r) => r[0]).sort((a, b) => a[0] - b[0]);
  return (
    <div className="timeline">{rows.map(([t, text], i) => (
      <div className="tl-item" key={i}><span className="tl-dot" /><div><div className="small">{text}</div><div className="small muted">{dt(new Date(t).toISOString())}</div></div></div>
    ))}{d.deadline && OPEN.includes(d.status) && <div className="tl-item"><span className="tl-dot off" /><div><div className="small">Срок устранения</div><div className="small muted">{dt(new Date(d.deadline).toISOString())}</div></div></div>}</div>
  );
}

export function DefectCard({ s, d, children }) {
  const r = d.road ? roadOf(s, d.road) : null;
  return (
    <div className="form" style={{ gap: 12 }}>
      <div className="btns" style={{ justifyContent: 'space-between' }}><b className="mono">{d.id}</b><StatusPill s={d.status} /></div>
      <div className="grid" style={{ gridTemplateColumns: d.fixedAt ? '1fr 1fr' : '1fr', gap: 8 }}>
        <Frame d={d} roadName={r?.net === 'oblast' ? r.code : ''} />
        {d.fixedAt && <Frame d={d} after roadName={r?.net === 'oblast' ? r.code : ''} />}
      </div>
      <dl className="kv">
        <dt>Дефект</dt><dd>{DEFECTS[d.type].name} · <SevPill s={d.sev} /></dd>
        <dt>Источник</dt><dd><SrcTag s={d.src} />{d.t109 && <span className="mono small"> · {d.t109}</span>}</dd>
        <dt>Место</dt><dd>{where(s, d)}{d.addr && d.road != null && <span className="sub">из обращения: {d.addr}</span>}</dd>
        <dt>Координаты</dt><dd className="mono small">{fmtLL(d.ll)}</dd>
        {d.contractor && <><dt>Подрядчик</dt><dd>{contractorName(s, d.contractor)}</dd></>}
        {d.deadline && <><dt>Срок</dt><dd><Sla d={d} /></dd></>}
        {d.note && <><dt>Комментарий</dt><dd>{d.note}</dd></>}
      </dl>
      {children}
      <details><summary className="small">История</summary><Timeline s={s} d={d} /></details>
    </div>
  );
}

export function StackBars({ data, keys, colors, labels, h = 220 }) {
  const W = 640, Hh = h, L = 34, Rr = 8, T = 12, B = 26, iw = W - L - Rr, ih = Hh - T - B;
  const max = Math.max(1, ...data.map((d) => keys.reduce((s, k) => s + d[k], 0))) * 1.12;
  const bw = iw / data.length, y = (v) => T + ih * (1 - v / max);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${Hh}`} role="img">
      <g className="grid">{[0, 1, 2, 3].map((k) => { const v = (max * k) / 3; return <g key={k}><line x1={L} x2={W - Rr} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end">{f0(v)}</text></g>; })}</g>
      {data.map((d, i) => { let acc = 0; return (
        <g key={i}>{keys.map((k, j) => { const v = d[k]; const y1 = y(acc + v), y0 = y(acc); acc += v; return v ? <rect key={k} x={L + i * bw + 1.5} y={y1} width={bw - 3} height={y0 - y1} fill={colors[j]} /> : null; })}
          {i % 5 === 0 && <text x={L + i * bw + bw / 2} y={Hh - 8} textAnchor="middle">{labels[i]}</text>}</g>
      ); })}
    </svg>
  );
}

export function KpiBoard({ s, compact }) {
  const k = kpis(s);
  const daily = dailyBySource(s, 30);
  const camTrend = [...s.camHistory.map((x) => x.km), Math.round(k.camKm)];
  const camLabels = [...s.camHistory.map((x) => new Date(x.week).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })), 'сейчас'];
  return (
    <>
      <h2 style={{ fontSize: '1rem' }}>Дороги: видеофиксация и заявки в 109</h2>
      <Grid min={240}>
        <Kpi title="Дефекты с геопривязкой" value={f1(k.geo * 100)} unit="%" progress={k.geo} target={0.9} ok={k.geo >= 0.9} foot={`${k.geoMissing} обращений без координат`} right="цель ≥ 90%" />
        <Kpi title="Заявки в 109 за 30 дней" value={f0(s.defects.filter((d) => d.t109 && d.src !== 'c109' && d.assignedAt >= Date.now() - 30 * 24 * H).length)} status={false} foot="созданы автоматически" right="с привязкой к карте" />
      </Grid>
      <h2 style={{ fontSize: '1rem' }}>Дороги области: приложение инспектора</h2>
      <Grid min={240}>
        <Kpi title="Передача в работу (медиана)" value={k.twInsp == null ? '—' : f1(k.twInsp)} unit="мин" progress={k.twInsp == null ? 0 : Math.min(1, k.twInsp / 10)} target={0.5} ok={k.twInsp != null && k.twInsp <= 5} foot={`${pct(k.twInspShare)} за 5 минут и быстрее`} right="цель ≤ 5 мин" />
        <Kpi title="Дефекты устранены в срок" value={f1(k.onTime * 100)} unit="%" progress={k.onTime} target={0.95} ok={k.onTime >= 0.95} foot={`${k.overdue} просрочено сейчас`} right="цель ≥ 95%" />
        <Kpi title="Сеть объехана в этом месяце" value={f1(k.cov * 100)} unit="%" progress={k.cov} target={k.plan} ok={k.cov >= k.plan} foot={`${f0(k.covKm)} из ${f0(k.totalKm)} км · план на сегодня ${pct(k.plan)}`} right="цель 100% за месяц" />
      </Grid>
      <h2 style={{ fontSize: '1rem' }}>ИИ-мониторинг с камер транспорта</h2>
      <Grid min={240}>
        <Kpi title="Километров под мониторингом" value={f0(k.camKm)} unit="км" status={false} foot="проезд камер за 7 дней" right={`${pct(k.camShare)} всей сети`} />
        <Kpi title="От выявления до устранения" value={hoursFmt(k.camFixH)} status={false} foot="медиана, дефекты с камер" right={`все источники: ${hoursFmt(k.allFixH)}`} />
      </Grid>
      {!compact && (
        <Grid min={420}>
          <Card title="Новые дефекты по дням" aside={<span className="legend"><span><i className="dot" style={{ background: 'var(--st-detected)' }} />камеры</span><span><i className="dot" style={{ background: 'var(--st-closed)' }} />инспекторы</span><span><i className="dot" style={{ background: 'var(--st-assigned)' }} />109</span></span>}>
            <StackBars data={daily} keys={['camera', 'inspector', 'c109']} colors={['var(--st-detected)', 'var(--st-closed)', 'var(--st-assigned)']} labels={daily.map((d) => new Date(d.day).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }))} />
          </Card>
          <Card title="Километры под мониторингом камер" aside="по неделям, по мере оснащения транспорта">
            <LineChart labels={camLabels} series={[{ values: camTrend, color: 'var(--accent)', area: true, end: `${f0(k.camKm)} км` }]} yFmt={(v) => f0(v)} />
          </Card>
        </Grid>
      )}
    </>
  );
}

export const BASELINE = [
  ['Геопривязка дефектов', 'дефекты выявляются поздно и вручную', (k) => pct(k.geo), '≥ 90% объектов', (k) => k.geo >= 0.9],
  ['Передача дефекта в работу', 'блокноты и мессенджеры', (k) => (k.twInsp == null ? '—' : `${f1(k.twInsp)} мин`), '≤ 5 минут', (k) => k.twInsp != null && k.twInsp <= 5],
  ['Устранение в срок', 'контроль подрядчиков вручную', (k) => pct(k.onTime), '≥ 95%', (k) => k.onTime >= 0.95],
  ['Объезд сети за месяц', 'маршрут инспектора не проверить', (k) => `${pct(k.cov)} (план ${pct(k.plan)})`, '100% сети', (k) => k.cov >= k.plan],
  ['Км под ИИ-мониторингом', 'только жалобы и обследования', (k) => `${f0(k.camKm)} км`, 'рост, по согласованию', () => null],
  ['От выявления до устранения', 'не измеряется', (k) => hoursFmt(k.camFixH), 'снижение, по согласованию', () => null],
];

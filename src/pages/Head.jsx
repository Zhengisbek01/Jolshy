import React, { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { DEFECTS, SOURCES, STATUS, OPEN, ROLES } from '../data/constants.js';
import { kpis, contractorStats, isOverdue, hoursFmt, roadOf, coverShare, D } from '../lib/engine.js';
import { monthStart } from '../data/generate.js';
import { f0, f1, pct, dt } from '../lib/format.js';
import { exportXlsx, printHtml } from '../lib/files.js';
import { Page, Card, Btn, Pill, Table, Field, Note, Stats, Chips, Tag, Empty, Seg } from '../ui.jsx';
import MapView from '../components/MapView.jsx';
import { KpiBoard, BASELINE, DefectCard, NetSeg, where } from './Shared.jsx';

export function KpiPage() {
  const { state } = useStore();
  const k = kpis(state);
  return (
    <Page title="KPI пилота" lead="Показатели трёх задач акимата: видеофиксация с заявками в 109, приложение инспектора и ИИ-мониторинг с камер транспорта. Пересчитываются после каждого действия.">
      <KpiBoard s={state} />
      <Card title="До пилота и сейчас">
        <Table keyOf={(r) => r[0]} cols={[
          { h: 'Показатель', r: (r) => r[0] }, { h: 'До пилота', r: (r) => <span className="small muted">{r[1]}</span> },
          { h: 'Сейчас', num: true, r: (r) => r[2](k) }, { h: 'Цель', num: true, r: (r) => r[3] },
          { h: 'Статус', r: (r) => (r[4](k) == null ? <Pill kind="neutral">цель согласуется</Pill> : <Pill kind={r[4](k) ? 'ok' : 'warn'}>{r[4](k) ? 'в цели' : 'ниже цели'}</Pill>) },
        ]} rows={BASELINE} />
        <Note>«До пилота» — формулировки проблем из задач акимата. Количественная база фиксируется в первые две недели пилота.</Note>
      </Card>
      <Card title="Объезд сети по месяцам">
        <Table keyOf={(r) => r.month} cols={[{ h: 'Месяц', r: (r) => r.month }, { h: 'Объехано', num: true, r: (r) => pct(r.pct) }, { h: '', r: (r) => <Pill kind={r.pct >= 0.999 ? 'ok' : 'warn'}>{r.pct >= 0.999 ? 'вся сеть' : 'не вся сеть'}</Pill> }]}
          rows={[...state.covHistory, { month: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')} (текущий)`, pct: k.cov }]} />
      </Card>
    </Page>
  );
}

export function Overview() {
  const { state } = useStore();
  const [net, setNet] = useState('oblast');
  const [layer, setLayer] = useState('open');
  const [sel, setSel] = useState(null);
  const t = Date.now();
  const defects = state.defects.filter((d) => d.net === net && (layer === 'overdue' ? isOverdue(d, t) : layer === 'open' ? OPEN.includes(d.status) || d.status === 'fixed' : false));
  const d = state.defects.find((x) => x.id === sel);
  const cov = layer === 'cov' ? { store: state.cov, since: monthStart(t), label: 'объехано инспекторами в этом месяце' } : layer === 'cam' ? { store: state.cam, since: t - 7 * D, label: 'проверено камерами за 7 дней' } : null;
  return (
    <Page title="Карта сети" lead="Открытые дефекты, просрочки и покрытие сети объездами и камерами." actions={<NetSeg value={net} onChange={(v) => { setNet(v); setSel(null); }} />}>
      <Chips value={layer} onChange={setLayer} items={[['open', 'Открытые дефекты'], ['overdue', 'Просрочены'], ['cov', 'Объезд инспекторов'], ['cam', 'Покрытие камерами']]} />
      <div className="split">
        <MapView net={state.nets[net]} defects={defects} selected={sel} onSelect={(x) => setSel(x.id)} coverage={cov?.store} covSince={cov?.since} legend={cov ? cov.label : true} height={600} />
        <Card>{d ? <DefectCard s={state} d={d} /> : <Empty title="Выберите точку на карте" text={cov ? cov.label : `${defects.length} дефектов на карте`} />}</Card>
      </div>
    </Page>
  );
}

export function Contractors() {
  const { state } = useStore();
  const rows = contractorStats(state).sort((a, b) => b.onTime - a.onTime);
  return (
    <Page title="Рейтинг подрядчиков" lead="Сроки устранения, просрочки и возвраты по каждому подрядчику за 30 дней. Основание для претензий по контракту.">
      <Table keyOf={(r) => r.c.id} cols={[
        { h: 'Подрядчик', r: (r) => <>{r.c.name}<span className="sub">{r.c.net === 'city' ? 'улицы города' : 'областные дороги'} · {f0(r.km)} км</span></> },
        { h: 'В срок', num: true, r: (r) => <Pill kind={r.onTime >= 0.95 ? 'ok' : r.onTime >= 0.85 ? 'warn' : 'bad'}>{pct(r.onTime)}</Pill> },
        { h: 'Нарядов со сроком', num: true, r: (r) => r.dueN }, { h: 'Открыто', num: true, r: (r) => r.open },
        { h: 'Просрочено', num: true, r: (r) => (r.overdue ? <Pill kind="bad">{r.overdue}</Pill> : 0) }, { h: 'Возвраты', num: true, r: (r) => r.returns },
        { h: 'Медиана устранения', num: true, r: (r) => hoursFmt(r.fixH) },
      ]} rows={rows} />
    </Page>
  );
}

export function Report() {
  const { state, act } = useStore();
  const k = kpis(state);
  const cs = contractorStats(state);
  const excel = () => {
    exportXlsx('jolshy_otchet.xlsx', {
      'KPI': BASELINE.map((r) => ({ 'Показатель': r[0], 'До пилота': r[1], 'Сейчас': r[2](k), 'Цель': r[3], 'Статус': r[4](k) == null ? 'цель согласуется' : r[4](k) ? 'в цели' : 'ниже цели' })),
      'Подрядчики': cs.map((r) => ({ 'Подрядчик': r.c.name, 'В срок, %': +(r.onTime * 100).toFixed(1), 'Открыто': r.open, 'Просрочено': r.overdue, 'Возвраты': r.returns })),
      'Дороги': state.nets.oblast.roads.map((r) => ({ 'Дорога': r.name, 'Км': +r.len.toFixed(1), 'Объехано в месяце, %': +(coverShare(state, state.cov, [r], monthStart(Date.now())).share * 100).toFixed(1), 'Открытых дефектов': state.defects.filter((d) => d.road === r.id && OPEN.includes(d.status)).length })),
    });
    act('Выгрузка отчёта', 'Отчёт по дорогам', 'Excel');
  };
  const pdf = () => {
    printHtml('Отчёт Jolshy', `<h1>Пилот Jolshy · мониторинг дорог</h1><p class="muted">Сформировано ${new Date().toLocaleString('ru-RU')}. Демо-данные.</p>
      <h2>Показатели</h2><table><tr><th>Показатель</th><th>До пилота</th><th>Сейчас</th><th>Цель</th></tr>${BASELINE.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="r">${r[2](k)}</td><td>${r[3]}</td></tr>`).join('')}</table>
      <h2>Подрядчики</h2><table><tr><th>Подрядчик</th><th>В срок</th><th>Открыто</th><th>Просрочено</th></tr>${cs.map((r) => `<tr><td>${r.c.name}</td><td class="r">${pct(r.onTime)}</td><td class="r">${r.open}</td><td class="r">${r.overdue}</td></tr>`).join('')}</table>`);
    act('Выгрузка отчёта', 'Отчёт по дорогам', 'PDF');
  };
  return (
    <Page title="Отчёт" lead="Отчёт для акима собирается из данных платформы за минуты.">
      <Card>
        <Stats items={[{ v: pct(k.onTime), l: 'устранено в срок' }, { v: pct(k.cov), l: 'сети объехано в месяце' }, { v: `${f0(k.camKm)} км`, l: 'под ИИ-мониторингом' }, { v: k.overdue, l: 'просрочено сейчас' }]} />
        <div className="btns" style={{ marginTop: 14 }}><Btn kind="pri" onClick={excel}>Скачать Excel</Btn><Btn onClick={pdf}>Сохранить PDF</Btn></div>
        <Note>Для PDF откроется окно печати: выберите «Сохранить как PDF».</Note>
      </Card>
    </Page>
  );
}

export function Journal() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const actions = useMemo(() => [...new Set(state.audit.map((a) => a.action))].sort(), [state.audit]);
  const list = state.audit.filter((a) => (!action || a.action === action) && (!q || `${a.user} ${a.object} ${a.details}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Page title="Журнал действий" lead="Кто, когда и что сделал: фиксация дефектов, передача подрядчикам, приёмка, изменения нормативов и доступа." actions={<Btn onClick={() => exportXlsx('jolshy_journal.xlsx', { 'Журнал': list.map((a) => ({ 'Время': dt(a.at), 'Пользователь': a.user, 'Роль': ROLES[a.role]?.name || a.role, 'Действие': a.action, 'Объект': a.object, 'Подробности': a.details })) })}>Выгрузить</Btn>}>
      <div className="row"><Field label="Поиск"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="пользователь, дефект, дорога" /></Field><Field label="Действие"><select value={action} onChange={(e) => setAction(e.target.value)}><option value="">Все действия</option>{actions.map((a) => <option key={a}>{a}</option>)}</select></Field></div>
      <Table keyOf={(a) => a.id} cols={[
        { h: 'Время', r: (a) => <span className="mono small">{dt(a.at)}</span> }, { h: 'Пользователь', r: (a) => <>{a.user}<span className="sub">{ROLES[a.role]?.name || 'система'}</span></> },
        { h: 'Действие', r: (a) => <Tag>{a.action}</Tag> }, { h: 'Объект', r: (a) => a.object }, { h: 'Подробности', r: (a) => <span className="desc">{a.details}</span> },
      ]} rows={list.slice(0, 300)} />
    </Page>
  );
}

export function AkimatSummary() {
  const { state } = useStore();
  const k = kpis(state);
  return (
    <Page title="Сводка по дорогам" lead="Пилот мониторинга дорог: областная сеть 1 588 км и улицы областного центра.">
      <KpiBoard s={state} compact />
      <Card title="До пилота и сейчас">
        <Table keyOf={(r) => r[0]} cols={[{ h: 'Показатель', r: (r) => r[0] }, { h: 'Сейчас', num: true, r: (r) => r[2](k) }, { h: 'Цель', num: true, r: (r) => r[3] }, { h: 'Статус', r: (r) => (r[4](k) == null ? <Pill kind="neutral">цель согласуется</Pill> : <Pill kind={r[4](k) ? 'ok' : 'warn'}>{r[4](k) ? 'в цели' : 'ниже цели'}</Pill>) }]} rows={BASELINE} />
      </Card>
    </Page>
  );
}

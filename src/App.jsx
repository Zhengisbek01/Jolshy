import React, { useEffect, useState } from 'react';
import { useStore } from './store.jsx';
import { isOverdue } from './lib/engine.js';
import Login, { Gauge, ChangePassword } from './pages/Login.jsx';
import { Modal } from './ui.jsx';
import { IDLE_MS } from './lib/auth.js';
import * as Dsp from './pages/Dispatcher.jsx';
import * as Ins from './pages/Inspector.jsx';
import * as Con from './pages/Contractor.jsx';
import * as Hd from './pages/Head.jsx';
import * as Adm from './pages/Admin.jsx';

const NAV = {
  dispatcher: [
    ['map', 'Карта дефектов', Dsp.MapPage],
    ['ai', 'Проверка ИИ', Dsp.AiQueue, (s) => s.defects.filter((d) => d.status === 'detected').length],
    ['nogeo', 'Без геопривязки', Dsp.NoGeo, (s) => s.defects.filter((d) => d.status === 'nogeo').length],
    ['defects', 'Реестр дефектов', Dsp.Defects, (s) => s.defects.filter((d) => isOverdue(d)).length],
    ['t109', 'Заявки 109', Dsp.Tickets109],
    ['fleet', 'Камеры и транспорт', Dsp.Fleet],
  ],
  inspector: [
    ['patrol', 'Объезд', Ins.Patrol],
    ['accept', 'Приёмка работ', Ins.Accept, (s, u) => s.defects.filter((d) => d.status === 'fixed' && u.zone.includes(d.contractor)).length],
    ['routes', 'Мои объезды', Ins.Routes],
  ],
  contractor: [
    ['orders', 'Наряды', Con.Orders, (s, u) => s.defects.filter((d) => d.contractor === u.org && isOverdue(d)).length],
    ['zone', 'Карта зоны', Con.ZoneMap],
    ['stats', 'Показатели', Con.MyStats],
  ],
  head: [
    ['kpi', 'KPI пилота', Hd.KpiPage], ['map', 'Карта сети', Hd.Overview], ['contractors', 'Подрядчики', Hd.Contractors],
    ['report', 'Отчёт', Hd.Report], ['journal', 'Журнал', Hd.Journal],
  ],
  akimat: [['summary', 'Сводка', Hd.AkimatSummary], ['map', 'Карта сети', Hd.Overview], ['report', 'Отчёт', Hd.Report]],
  admin: [['users', 'Пользователи', Adm.Users], ['norms', 'Нормативы', Adm.Norms], ['zones', 'Зоны обслуживания', Adm.Zones], ['journal', 'Журнал', Hd.Journal]],
};

function useHashPage(def) {
  const read = () => location.hash.replace(/^#\/?/, '') || def;
  const [p, setP] = useState(read);
  useEffect(() => { const h = () => setP(read()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); });
  const go = (x) => { location.hash = `/${x}`; setP(x); window.scrollTo(0, 0); };
  return [p, go];
}

export default function App() {
  const { user, state, session, logout, touch, reset, roleName } = useStore();
  const items = user ? NAV[user.role] : [];
  const [page, go] = useHashPage(items[0]?.[0] || '');
  const [pwd, setPwd] = useState(false);
  useEffect(() => {
    if (!session) return undefined;
    const ev = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    ev.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = setInterval(() => { if (Date.now() - session.last > IDLE_MS) logout('Сессия завершена после 30 минут бездействия'); }, 15000);
    return () => { ev.forEach((e) => window.removeEventListener(e, touch)); clearInterval(t); };
  });
  if (!user) return <Login />;
  if (user.mustChange) return <ChangePassword forced />;
  const cur = items.find((i) => i[0] === page) || items[0];
  const Comp = cur[2];
  const org = state.orgs.find((o) => o.id === user.org);
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><div className="brand-mark"><Gauge /></div><div><b>Jolshy</b><small>Мониторинг дорог · пилот</small></div></div>
        <div className="who"><b>{user.name}</b><span>{roleName(user.role)}</span>{org && <span>{org.name}</span>}</div>
        <nav className="nav" aria-label="Разделы">
          {items.map(([k, label, , badge]) => {
            const n = badge ? badge(state, user) : 0;
            return <button key={k} type="button" aria-current={cur[0] === k ? 'page' : undefined} onClick={() => go(k)}><span>{label}</span>{n > 0 && <span className="pill bad">{n}</span>}</button>;
          })}
        </nav>
        <div className="side-foot">
          <div className="testbar">Тестовая версия · демо-данные</div>
          <button type="button" onClick={() => setPwd(true)}>Сменить пароль</button>
          <button type="button" onClick={() => { logout(); location.hash = ''; }}>Выйти</button>
          <button type="button" onClick={() => { if (window.confirm('Сбросить все изменения и вернуть демо-данные к исходным?')) reset(); }}>Сбросить демо</button>
        </div>
      </aside>
      <main><Comp go={go} key={`${user.id}-${cur[0]}`} /></main>
      {pwd && <Modal title="Смена пароля" onClose={() => setPwd(false)}><ChangePassword onDone={() => setPwd(false)} /></Modal>}
    </div>
  );
}

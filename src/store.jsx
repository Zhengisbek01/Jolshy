import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { generate } from './data/generate.js';
import { ROLES } from './data/constants.js';
import { uid } from './lib/format.js';
import { IDLE_MS } from './lib/auth.js';

const KEY = 'jolshy-state-v1';
const SKEY = 'jolshy-session-v1';
const Ctx = createContext(null);

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s.version === 1) return s; } } catch (e) { /* storage unavailable */ }
  return generate();
}
function loadSession() {
  try { const s = JSON.parse(localStorage.getItem(SKEY)); if (s && Date.now() - (s.last || 0) < IDLE_MS) return s; } catch (e) { /* ignore */ }
  return null;
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(load);
  const [session, setSession] = useState(loadSession);
  const [toasts, setToasts] = useState([]);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* keep working in memory */ } }, [state]);
  useEffect(() => { try { session ? localStorage.setItem(SKEY, JSON.stringify(session)) : localStorage.removeItem(SKEY); } catch (e) { /* ignore */ } }, [session]);

  const user = useMemo(() => {
    if (!session) return null;
    const u = state.users.find((x) => x.id === session.userId);
    return u && u.active ? u : null;
  }, [session, state.users]);

  const toast = (text, kind = 'ok') => {
    const id = uid('t');
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  };
  const write = (who, action, object, details, fn, silent) => {
    setState((prev) => {
      const d = structuredClone(prev);
      const res = fn ? fn(d) : undefined;
      if (res === false) return prev;
      if (!silent) {
        d.audit.unshift({ id: uid('a'), at: new Date().toISOString(), user: who.name, userId: who.id, role: who.role, action, object, details });
        if (d.audit.length > 2000) d.audit.length = 2000;
      }
      return d;
    });
  };
  /** Change state as the signed-in user; every change goes to the audit log unless silent. */
  const act = (action, object, details, fn, silent) => write({ name: user?.name || 'система', id: user?.id, role: user?.role || 'system' }, action, object, details, fn, silent);
  const sysAct = (who, action, object, details, fn) => write(who, action, object, details, fn);
  const login = (sess) => setSession({ ...sess, at: Date.now(), last: Date.now() });
  const touch = () => setSession((s) => (s && Date.now() - s.last > 15000 ? { ...s, last: Date.now() } : s));
  const logout = (reason) => {
    if (user) act('Выход из системы', 'Логин организации', reason || 'Пользователь вышел');
    setSession(null);
    if (reason) toast(reason);
  };
  const reset = () => { setState(generate()); setSession(null); toast('Демо-данные сброшены к исходному состоянию'); };

  const value = { state, user, session, act, sysAct, login, logout, touch, reset, toast, roleName: (r) => ROLES[r]?.name || r };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
    </Ctx.Provider>
  );
}
export const useStore = () => useContext(Ctx);

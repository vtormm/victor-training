const CFG = window.APP_CONFIG, sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
const $app = document.getElementById('app'), tz = 'Europe/Madrid';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const fd = d => new Date(d).toLocaleDateString('es-ES', { timeZone: tz });
const dn = d => new Date(d).toLocaleDateString('es-ES', { timeZone: tz, weekday: 'long' });
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: tz });
let me = null, rec = false;
const html = h => { $app.innerHTML = h; };
const ok = async p => { const r = await p; if (r.error) throw r.error; return r.data; };
const fail = e => { console.error(e); html('<div class="card"><p>No se han podido cargar los datos. Comprueba tu conexión e inténtalo de nuevo.</p><button onclick="route()">Reintentar</button></div>'); };
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 3500); };
const aerr = e => ({ 'Invalid login credentials': 'Email o contraseña incorrectos.', 'User already registered': 'Ya existe una cuenta con ese email.' }[e.message] || (/password/i.test(e.message) ? 'La contraseña debe tener al menos 8 caracteres.' : 'No se ha podido completar la acción. Inténtalo de nuevo.'));
function modal(h) {
  const o = document.createElement('div'); o.className = 'ov';
  o.innerHTML = `<div class="card mod">${h}<button class="ghost" data-x>Cerrar</button></div>`;
  o.onclick = e => { if (e.target === o || e.target.dataset.x !== undefined) o.remove(); };
  document.body.append(o); return o;
}
const curWeek = ws => { const s = [...ws].sort((a, b) => b.week_number - a.week_number); return s.find(w => w.week_start <= today()) || s[s.length - 1]; };
const stat = (ws, ses, wk) => {
  const w = wk || curWeek(ws); if (!w) return {};
  const days = [...w.workout_days].sort((a, b) => a.day_order - b.day_order), done = new Set(ses.map(s => s.workout_day_id));
  return { w, days, done: days.filter(d => done.has(d.id)).length, next: days.find(d => !done.has(d.id)), last: ses[0], doneSet: done };
};

const CATS = { superior: ['Tren superior', 'k-sup'], inf_anterior: ['Tren inferior · anterior', 'k-ant'], inf_posterior: ['Tren inferior · posterior', 'k-pos'], funcional: ['Funcional (sin máquina)', 'k-fun'] };
const cc = c => (CATS[c] || ['', 'k-otro'])[1];
const exOpts = (lib, sel) => Object.entries({ ...CATS, '': ['Otros'] }).map(([k, [n]]) => { const l = lib.filter(e => (e.category || '') === k); return l.length ? `<optgroup label="${n}">${l.map(e => `<option value="${e.id}" ${sel === e.id ? 'selected' : ''}>${esc(e.name)}${e.muscle_group ? ' · ' + esc(e.muscle_group) : ''}</option>`).join('')}</optgroup>` : ''; }).join('');
const RPE = [['😴', 'Muy fácil'], ['😄', 'Fácil'], ['🙂', 'Cómodo'], ['😌', 'Llevadero'], ['😐', 'Moderado'], ['😅', 'Exigente'], ['😓', 'Duro'], ['😩', 'Muy duro'], ['🥵', 'Casi al límite'], ['🤯', 'Máximo']];
// ---------- AUTH ----------
function authView(mode) {
  const reg = mode === 'reg';
  html(`<div class="auth"><h1>Víctor Martínez</h1><p class="muted c">Entrenamiento</p><form id="f" class="card">
    ${reg ? '<input name="n" placeholder="Nombre" required maxlength="80"><input name="a" placeholder="Apellidos" required maxlength="120">' : ''}
    <input name="e" type="email" placeholder="Email" required autocomplete="email">
    ${mode === 'forgot' ? '' : '<input name="p" type="password" placeholder="Contraseña (mín. 8 caracteres)" minlength="8" required>'}
    <button>${{ login: 'Entrar', reg: 'Crear cuenta', forgot: 'Enviar enlace' }[mode]}</button><p id="m" class="err"></p></form>
    <p class="c">${mode === 'login' ? '<a href="#/registro">Crear cuenta</a> · <a href="#/olvido">¿Has olvidado tu contraseña?</a>' : '<a href="#/">Volver a entrar</a>'}</p></div>`);
  document.getElementById('f').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target), m = document.getElementById('m'); m.textContent = ''; m.className = 'err';
    try {
      if (mode === 'login') await ok(sb.auth.signInWithPassword({ email: f.get('e'), password: f.get('p') }));
      else if (mode === 'reg') {
        const r = await ok(sb.auth.signUp({ email: f.get('e'), password: f.get('p'), options: { data: { nombre: f.get('n').trim(), apellidos: f.get('a').trim() } } }));
        if (!r.session) html('<div class="card"><p>Revisa tu email para confirmar la cuenta y después inicia sesión.</p><a href="#/">Ir a entrar</a></div>');
      } else { await ok(sb.auth.resetPasswordForEmail(f.get('e'), { redirectTo: location.origin + location.pathname })); m.className = 'ok'; m.textContent = 'Si el email existe, recibirás un enlace para recuperar la contraseña.'; }
    } catch (e) { console.error(e); m.textContent = aerr(e); }
  };
}
function recView() {
  html('<div class="auth"><h1>Nueva contraseña</h1><form id="f" class="card"><input name="p" type="password" minlength="8" placeholder="Nueva contraseña (mín. 8)" required><button>Guardar</button><p id="m" class="err"></p></form></div>');
  document.getElementById('f').onsubmit = async ev => {
    ev.preventDefault();
    try { await ok(sb.auth.updateUser({ password: new FormData(ev.target).get('p') })); rec = false; toast('Contraseña actualizada'); location.hash = '#/'; me = null; boot(); }
    catch (e) { console.error(e); document.getElementById('m').textContent = aerr(e); }
  };
}
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') { rec = true; recView(); return; }
  if (ev === 'SIGNED_OUT') { me = null; setTimeout(route, 0); }
  else if (ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') setTimeout(boot, 0);
});
const q = new URLSearchParams(location.search).get('invite'); if (q) localStorage.setItem('inv', q);
async function boot() {
  try {
    if (rec) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { me = null; return route(); }
    if (me && me.id === session.user.id) return;
    const inv = localStorage.getItem('inv');
    if (inv) { const r = await sb.rpc('accept_invitation', { p_code: inv }); if (r.error) toast('La invitación no es válida o ha caducado.'); localStorage.removeItem('inv'); }
    me = await ok(sb.from('profiles').select('*').eq('id', session.user.id).single());
    route();
  } catch (e) { fail(e); }
}

// ---------- ROUTER ----------
function nav() {
  document.body.dataset.role = me ? me.role : '';
  document.getElementById('top').style.display = me ? 'flex' : 'none';
  const el = document.getElementById('nav'); if (!me) { el.style.display = 'none'; return; }
  const t = me.role === 'TRAINER', l = t ? [['', 'Clientes'], ['seg', 'Seguimiento'], ['ej', 'Ejercicios'], ['perfil', 'Perfil']] : [['', 'Inicio'], ['hist', 'Historial'], ['ej', 'Ejercicios'], ['perfil', 'Perfil']];
  el.style.display = 'flex'; el.innerHTML = l.map(([k, n]) => `<a href="#/${k}" class="${(location.hash.split('/')[1] || '') === k ? 'on' : ''}">${n}</a>`).join('');
}
async function route() {
  if (rec) return; $app.onclick = null;
  const h = location.hash.slice(2).split('/');
  if (!me) { nav(); return authView(h[0] === 'registro' ? 'reg' : h[0] === 'olvido' ? 'forgot' : 'login'); }
  nav(); html('<p class="c muted">Cargando...</p>');
  const V = me.role === 'TRAINER' ? T : C, fn = V[h[0] || 'home'] || (h[0] === 'ver' ? ver : h[0] === 'perfil' ? perfil : V.home);
  try { await fn(h); } catch (e) { fail(e); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ---------- COMPARTIDAS ----------
async function perfil() {
  html(`<h2>Perfil</h2><div class="card"><b>${esc(me.nombre + ' ' + me.apellidos)}</b><br>${esc(me.email)}<br><small class="muted">${me.role === 'TRAINER' ? 'Entrenador' : me.trainer_id ? 'Cliente' : 'Cliente · sin entrenador asignado'}</small></div><button id="lo" class="ghost">Cerrar sesión</button>`);
  document.getElementById('lo').onclick = () => sb.auth.signOut();
}
async function ver(h) {
  const s = await ok(sb.from('workout_sessions').select('*,profiles(nombre,apellidos),workout_days(day_name,title,workout_exercises(id,exercise_order,sets,reps_min,reps_max,exercises(name))),set_logs(*)').eq('id', h[1]).single());
  const ex = [...s.workout_days.workout_exercises].sort((a, b) => a.exercise_order - b.exercise_order);
  const can = me.role === 'CLIENT' && s.completed && Date.now() - new Date(s.completed_at) < 3 * 864e5;
  html(`<a href="javascript:history.back()">← Volver</a><h2>${esc(s.workout_days.day_name)} — ${esc(s.workout_days.title)}</h2>
   <p class="muted">${me.role === 'TRAINER' ? esc(s.profiles.nombre + ' ' + s.profiles.apellidos) + ' · ' : ''}${s.completed_at ? fd(s.completed_at) : 'En curso'} · RPE ${s.rpe ?? '—'}/10</p>
   ${can ? `<a class="btn" href="#/sesion/${s.workout_day_id}">✏️ Editar sesión</a><p class="muted c"><small>Editable hasta el ${fd(new Date(s.completed_at).getTime() + 3 * 864e5)}</small></p>` : ''}
   ${s.observations ? `<div class="card">“${esc(s.observations)}”</div>` : ''}
   ${ex.map(x => `<div class="card"><b>${esc(x.exercises.name)}</b> <small class="muted">${x.sets} × ${x.reps_min}–${x.reps_max}</small>${s.set_logs.filter(l => l.workout_exercise_id === x.id).sort((a, b) => a.set_number - b.set_number).map(l => `<div class="set">Serie ${l.set_number}: <b>${+l.weight} kg</b> × ${l.reps}</div>`).join('') || '<div class="muted">Sin registros</div>'}</div>`).join('')}`);
}
async function exView(cid, back) {
  const L = await ok(sb.from('set_logs').select('weight,reps,workout_exercises(exercise_id,exercises(name)),workout_sessions!inner(started_at,client_id,completed)').eq('workout_sessions.client_id', cid).eq('workout_sessions.completed', true));
  const g = {};
  L.forEach(l => { const x = l.workout_exercises, k = x.exercise_id, d = l.workout_sessions.started_at; g[k] ??= { n: x.exercises.name, by: {} }; g[k].by[d] = Math.max(g[k].by[d] || 0, +l.weight); });
  const items = Object.values(g).sort((a, b) => a.n.localeCompare(b.n)).map(e => {
    const ds = Object.keys(e.by).sort(), vals = ds.map(d => e.by[d]), max = Math.max(...vals), min = Math.min(...vals);
    const pts = vals.map((v, i) => `${vals.length > 1 ? i * 200 / (vals.length - 1) : 100},${max === min ? 20 : 38 - (v - min) / (max - min) * 34}`).join(' ');
    return `<details class="card"><summary><b>${esc(e.n)}</b><br><small>Último: ${vals[vals.length - 1]} kg · Mejor: ${max} kg · ${fd(ds[ds.length - 1])}</small></summary>
     <svg viewBox="0 0 200 40" class="spark"><polyline fill="none" stroke="#1d4ed8" stroke-width="2" points="${pts}"/></svg>
     ${ds.slice().reverse().map(d => `<div class="set">${fd(d)} — ${e.by[d]} kg</div>`).join('')}</details>`;
  });
  html(`${back ? `<a href="${back}">← Volver</a>` : ''}<h2>Ejercicios</h2>${items.join('') || '<p class="muted">Todavía no hay registros.</p>'}`);
}

// ---------- ENTRENADOR ----------
const T = {
  async home() {
    const [cl, ws, ses] = await Promise.all([
      ok(sb.from('profiles').select('id,nombre,apellidos,email').eq('trainer_id', me.id).order('nombre')),
      ok(sb.from('workout_weeks').select('id,client_id,week_number,week_start,workout_days(id,day_name,title,day_order)')),
      ok(sb.from('workout_sessions').select('client_id,workout_day_id,completed_at,workout_days(day_name,title)').eq('completed', true).order('completed_at', { ascending: false }).limit(500))]);
    html(`<h2>Hola, ${esc(me.nombre)}</h2><div class="row"><h3>Mis clientes</h3><button id="inv">+ Invitar</button></div>
     ${cl.map(c => {
       const my = ses.filter(s => s.client_id === c.id), st = stat(ws.filter(w => w.client_id === c.id), my);
       return `<a class="card link" href="#/c/${c.id}"><b>${esc(c.nombre + ' ' + c.apellidos)}</b><br>${st.w ? `Semana ${st.w.week_number} · ${st.done}/${st.days.length} sesiones` : 'Sin programación'}
        <br><small>Última: ${my[0] ? esc(dn(my[0].completed_at) + ' · ' + my[0].workout_days.title) : '—'}</small><br><small>Próxima: ${st.next ? esc(st.next.day_name + ' · ' + st.next.title) : '—'}</small></a>`;
     }).join('') || '<p class="muted">Aún no tienes clientes. Pulsa “Invitar” y envía el enlace.</p>'}`);
    document.getElementById('inv').onclick = async () => {
      try {
        const r = await ok(sb.from('invitations').insert({ trainer_id: me.id }).select().single());
        const u = location.origin + location.pathname + '?invite=' + r.code;
        const m = modal(`<h3>Enlace de invitación</h3><p class="muted">Un solo uso, caduca en 7 días. El cliente debe abrirlo, crear su cuenta o entrar.</p><input readonly value="${u}" onclick="this.select()"><button id="cp">Copiar</button>`);
        m.querySelector('#cp').onclick = () => navigator.clipboard.writeText(u).then(() => toast('Copiado'));
      } catch (e) { console.error(e); toast('No se ha podido crear la invitación.'); }
    };
  },
  async c(h) {
    const id = h[1]; if (h[2] === 'ej') return exView(id, '#/c/' + id);
    const [p, ws, ses] = await Promise.all([
      ok(sb.from('profiles').select('*').eq('id', id).single()),
      ok(sb.from('workout_weeks').select('*,workout_days(id,day_name,title,day_order)').eq('client_id', id).order('week_number', { ascending: false })),
      ok(sb.from('workout_sessions').select('id,workout_day_id,completed_at,rpe,observations,workout_days(day_name,title)').eq('client_id', id).eq('completed', true).order('completed_at', { ascending: false }).limit(30))]);
    const st = stat(ws, ses), rp = ses.slice(0, 3).map(s => s.rpe).filter(Boolean), ra = rp.length ? rp.reduce((a, b) => a + b, 0) / rp.length : 0;
    const pct = st.days?.length ? Math.round(st.done / st.days.length * 100) : 0, ini = ((p.nombre[0] || '') + (p.apellidos[0] || '')).toUpperCase(), rc = v => `hsl(${130 - (v - 1) * 13} 55% 85%)`, cm = ses.filter(s => s.observations).slice(0, 3);
    html(`<a href="#/">← Clientes</a><div class="hero pf"><div class="av">${esc(ini)}</div><div><h2>${esc(p.nombre + ' ' + p.apellidos)}</h2><small>${esc(p.email)}</small></div></div>
     <div class="tiles"><div class="tile"><small>Semana</small><b>${st.w ? st.w.week_number : '—'}</b></div>
      <div class="tile"><small>Sesiones</small><b>${st.w ? st.done + '/' + st.days.length : '—'}</b><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="tile" ${ra ? `style="background:${rc(ra)}"` : ''}><small>RPE reciente</small><b>${ra ? ra.toFixed(1) : '—'}</b></div>
      <div class="tile"><small>Última sesión</small><b>${ses[0] ? fd(ses[0].completed_at).slice(0, 5) : '—'}</b></div></div>
     ${st.w ? `<div class="chips">${st.days.map(d => `<span class="chip ${st.doneSet.has(d.id) ? 'done' : 'pend'}">${esc(d.day_name)}</span>`).join('')}</div>` : ''}
     ${st.next ? `<div class="card next"><small class="muted">Próxima sesión</small><br><b>${esc(st.next.day_name)} · ${esc(st.next.title)}</b></div>` : ''}
     ${cm.length ? '<h3>💬 Últimos comentarios</h3>' + cm.map(s => `<div class="card cmt"><small class="muted">${fd(s.completed_at)} · ${esc(s.workout_days.title)}</small><br>“${esc(s.observations)}”</div>`).join('') : ''}
     <div class="row"><h3>📅 Programación</h3><span><button data-a="new">+ Semana</button>${ws[0] ? ' <button data-a="copy" class="ghost">Copiar última</button>' : ''}</span></div>
     ${ws.map(w => `<a class="card link" href="#/w/${w.id}"><b>Semana ${w.week_number}</b> <small class="muted">· desde ${fd(w.week_start + 'T12:00:00')} · ${w.workout_days.length} días</small></a>`).join('') || '<p class="muted">Crea la primera semana.</p>'}
     <div class="row"><h3>📈 Sesiones</h3><a href="#/c/${id}/ej">Historial de ejercicios →</a></div>
     ${ses.map(s => `<a class="card link" href="#/ver/${s.id}"><span class="rpe-dot" style="background:${rc(s.rpe)}">${s.rpe}</span><b>${fd(s.completed_at)}</b> · ${esc(s.workout_days.day_name + ' — ' + s.workout_days.title)}${s.observations ? `<br><small class="muted">${esc(s.observations.slice(0, 90))}</small>` : ''}</a>`).join('') || '<p class="muted">Sin sesiones completadas.</p>'}`);
    $app.onclick = async e => {
      const a = e.target.dataset.a; if (!a) return;
      try {
        if (a === 'new') { const w = await ok(sb.from('workout_weeks').insert({ client_id: id, week_number: (ws[0]?.week_number || 0) + 1, week_start: today() }).select().single()); location.hash = '#/w/' + w.id; }
        if (a === 'copy') { const nid = await ok(sb.rpc('copy_week', { p_week: ws[0].id })); location.hash = '#/w/' + nid; }
      } catch (er) { console.error(er); toast('No se ha podido completar la acción.'); }
    };
  },
  async w(h) {
    const id = h[1];
    const [w, lib, tpls] = await Promise.all([
      ok(sb.from('workout_weeks').select('*,profiles(nombre,apellidos),workout_days(*,workout_exercises(*,exercises(name,category)))').eq('id', id).single()),
      ok(sb.from('exercises').select('id,name,category,muscle_group').order('muscle_group').order('name')), ok(sb.from('session_templates').select('id,name').order('name'))]);
    const days = w.workout_days.sort((a, b) => a.day_order - b.day_order); days.forEach(d => d.workout_exercises.sort((a, b) => a.exercise_order - b.exercise_order));
    const dnSet = new Set((await ok(sb.from('workout_sessions').select('workout_day_id').eq('client_id', w.client_id).eq('completed', true))).map(s => s.workout_day_id));
    const wks = await ok(sb.from('workout_weeks').select('id,week_number').eq('client_id', w.client_id).order('week_number')), wi = wks.findIndex(x => x.id === id), pv = wks[wi - 1], nx = wks[wi + 1];
    html(`<a href="#/c/${w.client_id}">← ${esc(w.profiles.nombre)}</a><div class="row"><span class="wk"><a class="${pv ? '' : 'off'}" href="#/w/${(pv || w).id}">‹</a><b>Semana ${w.week_number}</b><a class="${nx ? '' : 'off'}" href="#/w/${(nx || w).id}">›</a></span><button data-a="addday">+ Día</button></div>
     ${days.map(d => `<div class="card ${dnSet.has(d.id) ? 'done' : 'pend'}"><div class="row"><b>${esc(d.day_name)} — ${esc(d.title)}</b><small>${dnSet.has(d.id) ? '✓ Completada' : 'Pendiente'}</small></div><div class="row"><button class="ghost sm" data-a="tpl" data-d="${d.id}">Guardar como sesión base</button><button class="ghost sm" data-a="delday" data-id="${d.id}">Eliminar día</button></div>
      ${d.workout_exercises.map((x, i) => `<div class="ex ${cc(x.exercises.category)}"><div><b>${i + 1}. ${esc(x.exercises.name)}</b><br><small>${x.sets} × ${x.reps_min}–${x.reps_max} · RIR ${x.rir_min}–${x.rir_max}${x.trainer_notes ? ' · ' + esc(x.trainer_notes) : ''}</small></div>
       <div class="acts"><button class="sm ghost" data-a="up" data-id="${x.id}" data-d="${d.id}">↑</button><button class="sm ghost" data-a="dn" data-id="${x.id}" data-d="${d.id}">↓</button><button class="sm ghost" data-a="ed" data-id="${x.id}" data-d="${d.id}">Editar</button><button class="sm ghost" data-a="del" data-id="${x.id}">✕</button></div></div>`).join('')}
      <button data-a="addex" data-d="${d.id}">+ Ejercicio</button></div>`).join('') || '<p class="muted">Añade los días de entrenamiento.</p>'}`);
    const find = did => days.find(d => d.id === did);
    $app.onclick = async e => {
      const b = e.target.closest('[data-a]'); if (!b) return; const { a, id: xid, d: did } = b.dataset;
      try {
        if (a === 'tpl') { const nm = prompt('Nombre de la sesión base (ej. Pierna A)'); if (nm && nm.trim()) { await ok(sb.rpc('save_day_as_template', { p_day: did, p_name: nm.trim() })); toast('Sesión base guardada'); } return; }
        if (a === 'addday') return dayForm();
        if (a === 'delday') { if (confirm('¿Eliminar este día y sus ejercicios?')) { await ok(sb.from('workout_days').delete().eq('id', xid)); route(); } return; }
        if (a === 'addex') return exForm(find(did));
        if (a === 'ed') return exForm(find(did), find(did).workout_exercises.find(x => x.id === xid));
        if (a === 'del') { if (confirm('¿Eliminar ejercicio?')) { await ok(sb.from('workout_exercises').delete().eq('id', xid)); route(); } return; }
        if (a === 'up' || a === 'dn') {
          const l = find(did).workout_exercises, i = l.findIndex(x => x.id === xid), j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= l.length) return;
          await ok(sb.from('workout_exercises').update({ exercise_order: l[j].exercise_order }).eq('id', l[i].id));
          await ok(sb.from('workout_exercises').update({ exercise_order: l[i].exercise_order }).eq('id', l[j].id)); route();
        }
      } catch (er) { console.error(er); toast('No se ha podido completar la acción.'); }
    };
    function dayForm() {
      const m = modal(`<form id="df"><h3>Nuevo día</h3><select name="n">${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(x => `<option>${x}</option>`).join('')}</select><select name="tp"><option value="">Sesión vacía</option>${tpls.map(t => `<option value="${t.id}">Sesión base: ${esc(t.name)}</option>`).join('')}</select><input name="t" placeholder="Título (solo si es vacía)" maxlength="80"><button>Crear</button></form>`);
      m.querySelector('#df').onsubmit = async ev => {
        ev.preventDefault(); const f = new FormData(ev.target), tp = f.get('tp'), t = f.get('t').trim();
        if (!tp && !t) return toast('Escribe un título o elige una sesión base.');
        try {
          if (tp) await ok(sb.rpc('add_day_from_template', { p_week: id, p_template: tp, p_day_name: f.get('n') }));
          else await ok(sb.from('workout_days').insert({ week_id: id, day_name: f.get('n'), title: t, day_order: days.length + 1 }));
          m.remove(); route();
        } catch (er) { console.error(er); toast('No se ha podido crear el día.'); }
      };
    }
    function exForm(d, x) {
      if (!lib.length) return toast('Primero crea ejercicios en la pestaña Ejercicios.');
      const n = (k, l, v, mn, mx) => `<label>${l}<input name="${k}" type="number" inputmode="numeric" min="${mn}" max="${mx}" required value="${v}"></label>`;
      const m = modal(`<form id="xf"><h3>${x ? 'Editar' : 'Añadir'} ejercicio</h3><select name="ex">${exOpts(lib, x?.exercise_id)}</select>
       <div class="g">${n('s', 'Series', x?.sets ?? 3, 1, 20)}${n('r1', 'Reps mín', x?.reps_min ?? 8, 1, 100)}${n('r2', 'Reps máx', x?.reps_max ?? 10, 1, 100)}${n('i1', 'RIR mín', x?.rir_min ?? 1, 0, 10)}${n('i2', 'RIR máx', x?.rir_max ?? 2, 0, 10)}</div>
       <textarea name="nt" placeholder="Notas del entrenador" maxlength="500">${esc(x?.trainer_notes || '')}</textarea><button>Guardar</button><p class="err" id="xe"></p></form>`);
      m.querySelector('#xf').onsubmit = async ev => {
        ev.preventDefault(); const f = new FormData(ev.target), v = k => +f.get(k);
        if (v('r2') < v('r1') || v('i2') < v('i1')) return (m.querySelector('#xe').textContent = 'El máximo no puede ser menor que el mínimo.');
        const row = { exercise_id: f.get('ex'), sets: v('s'), reps_min: v('r1'), reps_max: v('r2'), rir_min: v('i1'), rir_max: v('i2'), trainer_notes: f.get('nt').trim() || null };
        try {
          if (x) await ok(sb.from('workout_exercises').update(row).eq('id', x.id));
          else await ok(sb.from('workout_exercises').insert({ ...row, workout_day_id: d.id, exercise_order: Math.max(0, ...d.workout_exercises.map(y => y.exercise_order)) + 1 }));
          m.remove(); route();
        } catch (er) { console.error(er); m.querySelector('#xe').textContent = 'No se ha podido guardar. Revisa los datos.'; }
      };
    }
  },
  async seg() {
    const s = await ok(sb.from('workout_sessions').select('id,completed_at,rpe,observations,profiles(nombre,apellidos),workout_days(day_name,title)').eq('completed', true).order('completed_at', { ascending: false }).limit(60));
    html(`<h2>Seguimiento</h2>${s.map(x => `<a class="card link" href="#/ver/${x.id}"><b>${esc(x.profiles.nombre + ' ' + x.profiles.apellidos)}</b> · ${fd(x.completed_at)}<br>${esc(x.workout_days.day_name + ' — ' + x.workout_days.title)} · RPE ${x.rpe}/10${x.observations ? `<p class="quote">“${esc(x.observations)}”</p>` : ''}</a>`).join('') || '<p class="muted">Aún no hay sesiones completadas.</p>'}`);
  },
  async ej() {
    const L = await ok(sb.from('exercises').select('*').order('muscle_group').order('name'));
    const mg = ['Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Cuádriceps', 'Isquios', 'Glúteo', 'Gemelo', 'Core', 'Cuerpo completo'];
    const cats = x => Object.entries(CATS).map(([k, [n]]) => `<option value="${k}" ${x?.category === k ? 'selected' : ''}>${n}</option>`).join('');
    const row = x => `<div class="card row it ${cc(x.category)}"><div><b>${esc(x.name)}</b> <small class="muted">${esc(x.muscle_group || '')}</small>${x.video_url ? ` <a href="${esc(x.video_url)}" target="_blank" rel="noopener">vídeo</a>` : ''}${x.description ? `<br><small>${esc(x.description)}</small>` : ''}</div><div class="acts"><button class="sm ghost" data-ed="${x.id}">Editar</button><button class="sm ghost" data-id="${x.id}">✕</button></div></div>`;
    html(`<h2>Biblioteca de ejercicios</h2><form id="ef" class="card"><input name="n" placeholder="Nombre" required maxlength="80"><select name="c">${cats()}</select><input name="g" list="mg" placeholder="Músculo (ej. Pecho)" maxlength="40"><datalist id="mg">${mg.map(x => `<option value="${x}">`).join('')}</datalist><textarea name="d" placeholder="Descripción / instrucciones" maxlength="1000"></textarea><input name="v" type="url" placeholder="URL de vídeo (opcional)"><button>Crear ejercicio</button></form>
     ${L.length ? '' : '<button id="sd">Cargar ejercicios básicos</button>'}
     ${Object.entries({ ...CATS, '': ['Otros', 'k-otro'] }).map(([k, [n, c]]) => { const l = L.filter(x => (x.category || '') === k); return l.length ? `<h3 class="cat ${c}">${n}</h3>${l.map(row).join('')}` : ''; }).join('')}`);
    const vals = f => ({ name: f.get('n').trim(), category: f.get('c'), muscle_group: f.get('g').trim() || null, description: f.get('d').trim() || null, video_url: f.get('v').trim() || null });
    document.getElementById('ef').onsubmit = async ev => { ev.preventDefault(); try { await ok(sb.from('exercises').insert({ trainer_id: me.id, ...vals(new FormData(ev.target)) })); route(); } catch (e) { console.error(e); toast('No se ha podido crear (¿nombre repetido?).'); } };
    const sd = document.getElementById('sd'); if (sd) sd.onclick = async () => { try { await ok(sb.rpc('seed_default_exercises')); route(); } catch (e) { console.error(e); toast('No se han podido cargar.'); } };
    const edit = x => {
      const m = modal(`<form id="edf"><h3>Editar ejercicio</h3><input name="n" required maxlength="80" value="${esc(x.name)}"><select name="c">${cats(x)}</select><input name="g" list="mg" maxlength="40" value="${esc(x.muscle_group || '')}" placeholder="Músculo"><textarea name="d" maxlength="1000" placeholder="Descripción">${esc(x.description || '')}</textarea><input name="v" type="url" placeholder="URL de vídeo" value="${esc(x.video_url || '')}"><button>Guardar</button></form>`);
      m.querySelector('#edf').onsubmit = async ev => { ev.preventDefault(); try { await ok(sb.from('exercises').update(vals(new FormData(ev.target))).eq('id', x.id)); m.remove(); route(); } catch (er) { console.error(er); toast('No se ha podido guardar (¿nombre repetido?).'); } };
    };
    $app.onclick = async e => {
      if (e.target.dataset.ed) return edit(L.find(y => y.id === e.target.dataset.ed));
      const id = e.target.dataset.id; if (!id || !confirm('¿Eliminar ejercicio?')) return;
      try { await ok(sb.from('exercises').delete().eq('id', id)); route(); } catch (er) { console.error(er); toast('No se puede eliminar: está en uso en alguna programación.'); }
    };
  }
};

// ---------- CLIENTE ----------
const C = {
  async home(h) {
    const hr = +new Date().toLocaleString('es-ES', { timeZone: tz, hour: 'numeric', hour12: false }), sal = hr < 13 ? 'Buenos días' : hr < 21 ? 'Buenas tardes' : 'Buenas noches';
    if (!me.trainer_id) return html(`<div class="hero"><small>${sal}</small><h2>${esc(me.nombre)} 👋</h2><p>Aún no tienes entrenador asignado. Abre el enlace de invitación que te ha enviado Víctor.</p></div>`);
    const [ws, ses] = await Promise.all([
      ok(sb.from('workout_weeks').select('*,workout_days(id,day_name,title,day_order)').eq('client_id', me.id)),
      ok(sb.from('workout_sessions').select('id,workout_day_id,completed_at').eq('client_id', me.id).eq('completed', true).order('completed_at', { ascending: false }))]);
    const wn = h && h[0] === 'sem' ? +h[1] : 0, sorted = [...ws].sort((a, b) => a.week_number - b.week_number);
    const st = stat(ws, ses, wn ? ws.find(x => x.week_number === wn) : null), sid = Object.fromEntries(ses.map(s => [s.workout_day_id, s.id]));
    const i = sorted.findIndex(x => x.id === st.w?.id), pv = sorted[i - 1], nx = sorted[i + 1], pct = st.days?.length ? Math.round(st.done / st.days.length * 100) : 0;
    html(`<div class="hero"><small>${sal}</small><h2>${esc(me.nombre)} 👋</h2>${st.w ? `<div class="wk"><a class="${pv ? '' : 'off'}" href="#/sem/${(pv || st.w).week_number}">‹</a><b>Semana ${st.w.week_number}</b><a class="${nx ? '' : 'off'}" href="#/sem/${(nx || st.w).week_number}">›</a></div><div class="bar"><i style="width:${pct}%"></i></div><p>${st.done} de ${st.days.length} sesiones completadas</p>` : '<p>Tu entrenador aún no ha programado tu semana.</p>'}</div>
     ${st.next ? `<div class="card next"><small class="muted">Próxima sesión</small><h3>${esc(st.next.day_name)} · ${esc(st.next.title)}</h3><a class="btn" href="#/sesion/${st.next.id}">EMPEZAR SESIÓN</a></div>` : st.w ? '<div class="card done">¡Semana completada! 💪</div>' : ''}
     ${st.w ? '<h3>Tus sesiones</h3>' + st.days.map(d => sid[d.id] ? `<a class="card link done" href="#/ver/${sid[d.id]}"><b>✓ ${esc(d.day_name)}</b> — ${esc(d.title)}</a>` : `<a class="card link pend" href="#/sesion/${d.id}"><b>${esc(d.day_name)}</b> — ${esc(d.title)}</a>`).join('') : ''}`);
  },
  sem(h) { return C.home(h); },
  async hist() {
    const s = await ok(sb.from('workout_sessions').select('id,completed_at,rpe,workout_days(day_name,title)').eq('client_id', me.id).eq('completed', true).order('completed_at', { ascending: false }));
    html(`<h2>Historial</h2>${s.map(x => `<a class="card link" href="#/ver/${x.id}">${fd(x.completed_at)}<br>✓ ${esc(x.workout_days.day_name + ' — ' + x.workout_days.title)}<br><small>RPE ${x.rpe}/10</small></a>`).join('') || '<p class="muted">Aún no has completado sesiones.</p>'}`);
  },
  async ej() { return exView(me.id); },
  async sesion(h) {
    const d = await ok(sb.from('workout_days').select('*,workout_exercises(*,exercises(name,description,video_url))').eq('id', h[1]).single());
    const s = await ok(sb.from('workout_sessions').select('*,set_logs(*)').eq('workout_day_id', d.id).eq('client_id', me.id).maybeSingle());
    if (s?.completed && Date.now() - new Date(s.completed_at) > 3 * 864e5) { location.hash = '#/ver/' + s.id; return; }
    const ex = d.workout_exercises.sort((a, b) => a.exercise_order - b.exercise_order), lg = (x, n) => s?.set_logs.find(l => l.workout_exercise_id === x.id && l.set_number === n);
    html(`<a href="#/">← Inicio</a><h2>${esc(d.day_name)} — ${esc(d.title)}</h2>${s?.completed ? '<div class="card">✏️ Estás editando una sesión ya completada (se puede hasta 3 días después).</div>' : ''}<form id="sf">
     ${ex.map(x => `<div class="card"><b>${esc(x.exercises.name)}</b><br><small>${x.sets} × ${x.reps_min}–${x.reps_max} · RIR objetivo: ${x.rir_min}–${x.rir_max}</small>
      ${x.trainer_notes ? `<p class="quote">${esc(x.trainer_notes)}</p>` : ''}${x.exercises.video_url ? `<a href="${esc(x.exercises.video_url)}" target="_blank" rel="noopener">Ver vídeo</a>` : ''}
      ${Array.from({ length: x.sets }, (_, i) => `<div class="setrow"><span>Serie ${i + 1}</span><input name="w_${x.id}_${i + 1}" inputmode="decimal" placeholder="kg" value="${lg(x, i + 1)?.weight ?? ''}"><input name="r_${x.id}_${i + 1}" inputmode="numeric" placeholder="reps" value="${lg(x, i + 1)?.reps ?? ''}"></div>`).join('')}</div>`).join('')}
     <div class="card"><b>¿Cómo te has sentido?</b><div class="rpe">${Array.from({ length: 10 }, (_, i) => `<label><input type="radio" name="rpe" value="${i + 1}" ${s?.rpe === i + 1 ? 'checked' : ''}><span style="--h:${130 - i * 13}">${RPE[i][0]}<small>${i + 1}</small></span></label>`).join('')}</div><p id="rl" class="rl muted">Toca cómo ha sido de duro</p></div>
     <div class="card"><b>Observaciones</b><textarea name="obs" maxlength="2000" placeholder="¿Cómo ha ido?">${esc(s?.observations || '')}</textarea></div>
     <p class="err" id="se"></p><button>FINALIZAR SESIÓN</button></form>`);
    const sf = document.getElementById('sf');
    sf.addEventListener('input', e => {
      const t = e.target, m = t.name && t.name.match(/^([wr])_([^_]+)_(\d+)$/); if (!m) return; t.dataset.auto = '0';
      for (let n = +m[3] + 1; n <= 20; n++) { const o = sf.elements[`${m[1]}_${m[2]}_${n}`]; if (!o) break; if (o.value === '' || o.dataset.auto === '1') { o.value = t.value; o.dataset.auto = '1'; } }
    });
    sf.addEventListener('change', e => { if (e.target.name === 'rpe') document.getElementById('rl').textContent = RPE[e.target.value - 1].join(' ') + ' (' + e.target.value + '/10)'; });
    const key = `draft:${me.id}:${d.id}`, save = () => { try { const o = {}; new FormData(sf).forEach((v, k) => { if (v !== '') o[k] = v; }); localStorage.setItem(key, JSON.stringify(o)); } catch (er) { console.error(er); } };
    try {
      const dr = JSON.parse(localStorage.getItem(key) || 'null');
      if (dr) { Object.entries(dr).forEach(([k, v]) => { const el = sf.elements[k]; if (el) el.value = v; }); if (dr.rpe) document.getElementById('rl').textContent = RPE[dr.rpe - 1].join(' ') + ' (' + dr.rpe + '/10)'; toast('Hemos recuperado lo que habías escrito'); }
    } catch (er) { console.error(er); }
    sf.addEventListener('input', save); sf.addEventListener('change', save);
    document.getElementById('sf').onsubmit = async ev => {
      ev.preventDefault(); const f = new FormData(ev.target), rows = [], E = document.getElementById('se'); let bad = '';
      ex.forEach(x => { for (let n = 1; n <= x.sets; n++) {
        const w = f.get(`w_${x.id}_${n}`).trim().replace(',', '.'), r = f.get(`r_${x.id}_${n}`).trim(); if (!w && !r) continue;
        if (!w || !r || isNaN(w) || +w < 0 || +w > 1000 || !/^\d+$/.test(r) || +r > 200) bad = 'Revisa peso y repeticiones: usa números y rellena ambos campos en cada serie.';
        rows.push({ workout_exercise_id: x.id, set_number: n, weight: +w, reps: +r }); } });
      const rpe = +f.get('rpe'); if (!rows.length) bad = 'Registra al menos una serie.'; else if (!bad && !rpe) bad = 'Indica tu RPE (1–10).';
      if (bad) { E.textContent = bad; return; } E.textContent = '';
      const btn = ev.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Guardando...';
      try {
        const se = s || await ok(sb.from('workout_sessions').upsert({ client_id: me.id, workout_day_id: d.id, started_at: s?.started_at || new Date().toISOString(), completed: false }, { onConflict: 'client_id,workout_day_id' }).select().single());
        await ok(sb.from('set_logs').upsert(rows.map(r => ({ ...r, session_id: se.id })), { onConflict: 'session_id,workout_exercise_id,set_number' }));
        const gone = (s?.set_logs || []).filter(l => !rows.some(r => r.workout_exercise_id === l.workout_exercise_id && r.set_number === l.set_number)).map(l => l.id);
        if (gone.length) await ok(sb.from('set_logs').delete().in('id', gone));
        await ok(sb.from('workout_sessions').update({ completed: true, completed_at: s?.completed_at || new Date().toISOString(), rpe, observations: f.get('obs').trim() || null }).eq('id', se.id));
        try { localStorage.removeItem(key); } catch (er) { console.error(er); } toast('Sesión guardada'); location.hash = '#/hist';
      } catch (er) { console.error(er); E.textContent = 'No se ha podido guardar la sesión. Comprueba tu conexión e inténtalo de nuevo.'; btn.disabled = false; btn.textContent = 'FINALIZAR SESIÓN'; }
    };
  }
};

if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(console.error);

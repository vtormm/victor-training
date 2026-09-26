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
const dOf = ts => new Date(ts).toLocaleDateString('sv-SE', { timeZone: tz });
const adherence = (ws, ses) => {
  const t0 = today(), days = [];
  [...ws].sort((a, b) => a.week_number - b.week_number).forEach(w => { if (w.week_start <= t0) [...w.workout_days].sort((a, b) => a.day_order - b.day_order).forEach(d => days.push(d.id)); });
  const done = new Set(ses.map(s => s.workout_day_id)), total = days.length, hecho = days.filter(id => done.has(id)).length;
  let streak = 0; for (let i = days.length - 1; i >= 0; i--) { if (done.has(days[i])) streak++; else break; }
  let best = 0, cur = 0; days.forEach(id => { if (done.has(id)) { cur++; best = Math.max(best, cur); } else cur = 0; });
  return { pct: total ? Math.round(hecho / total * 100) : null, total, hecho, streak, best };
};
const fmtTime = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`; };
const volumeCard = L => {
  if (!L.length) return '';
  const buckets = {};
  L.forEach(l => {
    const wk = monday(dOf(l.workout_sessions.started_at)), cat = l.workout_exercises.exercises.category || '';
    buckets[wk] ??= { kg: 0, time: 0, cats: {} }; buckets[wk].cats[cat] ??= { kg: 0, time: 0 };
    if (l.duration_seconds != null) { buckets[wk].time += l.duration_seconds; buckets[wk].cats[cat].time += l.duration_seconds; }
    else if (l.weight != null && l.reps != null) { const v = +l.weight * l.reps; buckets[wk].kg += v; buckets[wk].cats[cat].kg += v; }
  });
  const curW = monday(today()), prevW = monday(new Date(new Date(curW + 'T12:00:00').getTime() - 7 * 864e5).toLocaleDateString('sv-SE'));
  const cur = buckets[curW] || { kg: 0, time: 0, cats: {} }, prev = buckets[prevW] || { kg: 0, time: 0, cats: {} };
  if (!cur.kg && !cur.time && !prev.kg && !prev.time) return '';
  const deltaKg = prev.kg ? Math.round((cur.kg - prev.kg) / prev.kg * 100) : null;
  const headline = cur.kg ? `${Math.round(cur.kg).toLocaleString('es-ES')} kg` : cur.time ? fmtTime(cur.time) : '0 kg';
  const rows = Object.entries(cur.cats).sort((a, b) => (b[1].kg || b[1].time) - (a[1].kg || a[1].time)).map(([k, v]) => {
    const ref = cur.kg || cur.time || 1, pct = Math.round(((v.kg || v.time) / ref) * 100);
    return `<div class="volbar ${cc(k)}"><i style="width:${pct}%"></i><span>${CATS[k] ? CATS[k][0] : 'Otros'}</span><b>${v.kg ? Math.round(v.kg).toLocaleString('es-ES') + ' kg' : fmtTime(v.time)}</b></div>`;
  }).join('');
  return `<div class="card"><b>📦 Volumen esta semana</b><br><span class="big">${headline}</span> ${cur.kg && deltaKg !== null ? `<span class="tag ${deltaKg < 0 ? 'neg' : ''}">${deltaKg > 0 ? '+' : ''}${deltaKg}% vs. semana anterior</span>` : ''}
   ${rows}</div>`;
};
const stat = (ws, ses, wk) => {
  const w = wk || curWeek(ws); if (!w) return {};
  const days = [...w.workout_days].sort((a, b) => a.day_order - b.day_order), done = new Set(ses.map(s => s.workout_day_id));
  return { w, days, done: days.filter(d => done.has(d.id)).length, next: days.find(d => !done.has(d.id)), last: ses[0], doneSet: done };
};

const CATS = { sup_anterior: ['Tren superior · anterior', 'k-sup'], sup_posterior: ['Tren superior · posterior', 'k-sp'], inf_anterior: ['Tren inferior · anterior', 'k-ant'], inf_posterior: ['Tren inferior · posterior', 'k-pos'], funcional: ['Funcional (sin máquina)', 'k-fun'], movilidad: ['Movilidad', 'k-mov'], cardio: ['Cardio', 'k-car'] };
const GROUPS = [['Tren superior', ['sup_anterior', 'sup_posterior']], ['Tren inferior', ['inf_anterior', 'inf_posterior']], ['Funcional', ['funcional']], ['Cardio', ['cardio']]];
const OPEN = new Set(), PHONE = '645181229';
const CLIENT_TAGS = { gris: '#64748b', ambar: '#d97706', esmeralda: '#059669', cian: '#0891b2', indigo: '#4f46e5', granate: '#9f1239', lima: '#65a30d', magenta: '#a21caf' };
const EMOJIS = ['💪', '🔥', '⭐', '🎯', '🚀', '🐯', '🦁', '🥊', '⚡', '🏆', '🎽', '🐺'];
const tagBadge = p => (p.client_color || p.client_emoji) ? `<span class="ctag" style="background:${CLIENT_TAGS[p.client_color] || '#cbd5e1'}">${p.client_emoji ? esc(p.client_emoji) : ''}</span>` : '';
const THEMES = { azul: ['Azul', '#1e3a8a', '#2563eb', '#38bdf8', '#1d4ed8', '#e3edff'], verde: ['Verde', '#14532d', '#16a34a', '#4ade80', '#15803d', '#e4f5ea'], morado: ['Morado', '#4c1d95', '#7c3aed', '#a78bfa', '#6d28d9', '#eee8fd'], naranja: ['Naranja', '#9a3412', '#ea580c', '#fb923c', '#c2410c', '#fdeee0'], grafito: ['Grafito', '#111827', '#374151', '#6b7280', '#374151', '#eceff3'], rosa: ['Rosa', '#9d174d', '#db2777', '#f472b6', '#be185d', '#fde6f0'] };
const applyTheme = k => { const t = THEMES[k] || THEMES.azul, r = document.documentElement.style; ['--p1', '--p2', '--p3', '--b', '--bg1'].forEach((v, i) => r.setProperty(v, t[i + 1])); document.querySelector('meta[name=theme-color]').content = t[2]; };
function ytId(u) { const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/); return m ? m[1] : null; }
function driveId(u) { const m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || u.match(/[?&]id=([\w-]+)/); return m ? m[1] : null; }
function videoBtn(url) {
  if (!url) return '';
  const yt = ytId(url), dr = !yt && driveId(url);
  if (!yt && !dr) return `<a href="${esc(url)}" target="_blank" rel="noopener">Ver vídeo</a>`;
  const src = yt ? `https://www.youtube.com/embed/${yt}?autoplay=1&playsinline=1` : `https://drive.google.com/file/d/${dr}/preview`;
  return `<button type="button" class="linklike" data-video="${esc(src)}">▶️ Ver vídeo</button>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-video]'); if (!b) return;
  const m = modal(`<div class="vwrap"><iframe src="${b.dataset.video}" allow="autoplay; encrypted-media" allowfullscreen frameborder="0"></iframe></div>`);
  m.classList.add('vmodal');
});
const monday = d => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x.toLocaleDateString('sv-SE'); };
const plus7 = d => new Date(new Date(d + 'T12:00:00').getTime() + 7 * 864e5).toLocaleDateString('sv-SE');
const cc = c => (CATS[c] || ['', 'k-otro'])[1];
function exModal(lib, x, save) {
  if (!lib.length) return toast('Primero crea ejercicios en la pestaña Ejercicios.');
  const isTime = x?.track_mode === 'time';
  const n = (k, l, v, mn, mx) => `<label>${l}<input name="${k}" type="number" inputmode="numeric" min="${mn}" max="${mx}" required value="${v}"></label>`;
  const repsHtml = `<div class="g">${n('r1', 'Reps mín', x?.reps_min ?? 8, 1, 100)}${n('r2', 'Reps máx', x?.reps_max ?? 10, 1, 100)}${n('i1', 'RIR mín', x?.rir_min ?? 1, 0, 10)}${n('i2', 'RIR máx', x?.rir_max ?? 2, 0, 10)}</div>`;
  const timeHtml = `${n('dt', 'Tiempo objetivo (segundos)', x?.duration_target ?? 30, 1, 3600)}<p class="muted"><small>El cliente verá un cronómetro con cuenta atrás para cada serie.</small></p>`;
  const m = modal(`<form id="xf"><h3>${x ? 'Editar' : 'Añadir'} ejercicio</h3><select name="ex">${exOpts(lib, x?.exercise_id)}</select>
   <div class="seg2"><label><input type="radio" name="mode" value="reps" ${!isTime ? 'checked' : ''}> Por repeticiones</label><label><input type="radio" name="mode" value="time" ${isTime ? 'checked' : ''}> Por tiempo (cronómetro)</label></div>
   ${n('s', 'Series', x?.sets ?? 3, 1, 20)}
   <div id="repsBlock" style="${isTime ? 'display:none' : ''}">${repsHtml}</div>
   <div id="timeBlock" style="${isTime ? '' : 'display:none'}">${timeHtml}</div>
   <textarea name="nt" placeholder="Notas del entrenador" maxlength="500">${esc(x?.trainer_notes || '')}</textarea><button>Guardar</button><p class="err" id="xe"></p></form>`);
  m.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => {
    const t = r.value === 'time'; m.querySelector('#repsBlock').style.display = t ? 'none' : ''; m.querySelector('#timeBlock').style.display = t ? '' : 'none';
  });
  m.querySelector('#xf').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target), v = k => +f.get(k), mode = f.get('mode'), nt = f.get('nt').trim() || null, s2 = v('s'), exId = f.get('ex');
    let row;
    if (mode === 'time') {
      const dt = v('dt'); if (!dt || dt < 1 || dt > 3600) return (m.querySelector('#xe').textContent = 'El tiempo debe estar entre 1 y 3600 segundos.');
      row = { exercise_id: exId, sets: s2, track_mode: 'time', duration_target: dt, reps_min: 1, reps_max: 1, rir_min: 0, rir_max: 0, trainer_notes: nt };
    } else {
      if (v('r2') < v('r1') || v('i2') < v('i1')) return (m.querySelector('#xe').textContent = 'El máximo no puede ser menor que el mínimo.');
      row = { exercise_id: exId, sets: s2, track_mode: 'reps', duration_target: null, reps_min: v('r1'), reps_max: v('r2'), rir_min: v('i1'), rir_max: v('i2'), trainer_notes: nt };
    }
    try { await save(row); m.remove(); route(); }
    catch (er) { console.error(er); m.querySelector('#xe').textContent = 'No se ha podido guardar. Revisa los datos.'; }
  };
}
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
const q = new URLSearchParams(location.search).get('invite'); if (q) { localStorage.setItem('inv', q); history.replaceState(null, '', location.pathname + location.hash); }
async function boot() {
  try {
    if (rec) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { me = null; return route(); }
    if (me && me.id === session.user.id) return;
    const pid = session.user.id, load = () => ok(sb.from('profiles').select('*').eq('id', pid).single());
    me = await load();
    const inv = localStorage.getItem('inv'); localStorage.removeItem('inv');
    if (inv && me.role === 'CLIENT' && !me.trainer_id) {
      const r = await sb.rpc('accept_invitation', { p_code: inv });
      if (!r.error) me = await load();
      else if (/caducada/.test(r.error.message)) toast('Esta invitación ya se ha usado o ha caducado. Pide un enlace nuevo a Víctor.');
      else { console.error(r.error); localStorage.setItem('inv', inv); toast('No se ha podido usar la invitación. Comprueba tu conexión e inténtalo de nuevo.'); }
    }
    applyTheme(me.theme);
    route();
  } catch (e) { fail(e); }
}

// ---------- ROUTER ----------
function nav() {
  document.body.dataset.role = me ? me.role : '';
  document.getElementById('top').style.display = me ? 'flex' : 'none';
  const el = document.getElementById('nav'); if (!me) { el.style.display = 'none'; return; }
  const t = me.role === 'TRAINER', l = t ? [['', 'Clientes'], ['seg', 'Seguimiento'], ['ej', 'Ejercicios'], ['bases', 'Bases'], ['perfil', 'Perfil']] : [['', 'Inicio'], ['hist', 'Historial'], ['ej', 'Ejercicios'], ['perfil', 'Perfil']];
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
const TUTORIAL = `<div class="card"><b>📖 Tutorial</b><p class="muted">Toca una sección para ver cómo funciona</p>
 <details class="tut2"><summary><span class="ic" style="background:#dbeafe">🏠</span>Inicio</summary><div><p>Aquí ves tu <b>semana actual</b> y cuántas sesiones has completado. Con las flechas ‹ › cambias de semana. Las sesiones pendientes salen en gris y las hechas en verde.</p><p>Pulsa <b>EMPEZAR SESIÓN</b> (o toca cualquier sesión pendiente) y sigue estos pasos:</p><ol class="steps"><li>Cada ejercicio muestra las <b>series</b>, las <b>repeticiones</b> y el <b>RIR</b> objetivo (las repeticiones que te tienen que quedar en reserva). Lee también las notas de tu entrenador.</li><li>Después de <b>cada serie</b>, apunta el <b>peso (kg)</b> y las <b>repeticiones</b> que has hecho. Al rellenar la serie 1, las de abajo se rellenan solas; cámbialas si has hecho algo distinto.</li><li>Si el ejercicio es <b>por tiempo</b> (por ejemplo una plancha o un sprint), en vez de peso y repeticiones verás un botón ▶ con una cuenta atrás. Pulsa para empezar; si aguantas hasta el final se marca solo, y si no llegas, pulsa el mismo botón para pararla y que guarde el tiempo real.</li><li>Si el ejercicio tiene vídeo, pulsa <b>▶️ Ver vídeo</b> para verlo dentro de la propia app.</li><li>Al terminar, toca la cara que mejor describa <b>cómo te has sentido</b> (RPE, de 1 fácil a 10 máximo) y, si quieres, escribe una observación.</li><li>Pulsa <b>FINALIZAR SESIÓN</b>. Hasta que no lo pulses, tu entrenador no verá la sesión.</li></ol><p>Si sales a mitad, lo escrito se guarda en tu móvil y lo recuperas al volver. Puedes editar una sesión hasta 3 días después de terminarla.</p></div></details>
 <details class="tut2"><summary><span class="ic" style="background:#dcfce7">🕘</span>Historial</summary><div>Todas las sesiones que has completado, agrupadas por semana. El círculo de color junto a la fecha es tu RPE de esa sesión (verde, esfuerzo bajo; rojo, esfuerzo máximo). Toca una para ver los pesos y repeticiones que apuntaste (y editarla si han pasado menos de 3 días).</div></details>
 <details class="tut2"><summary><span class="ic" style="background:#fef3c7">🏋️</span>Ejercicios</summary><div>Cada ejercicio que has hecho, con tu último peso, tu mejor peso y la diferencia desde la primera vez. Tócalo para ver la gráfica de tu progresión y el historial. (Los ejercicios por tiempo, como planchas o sprints, no aparecen aquí todavía.)</div></details>
 <details class="tut2"><summary><span class="ic" style="background:#fce7f3">👤</span>Perfil</summary><div>El color de la app, este tutorial, el contacto de tu entrenador y el botón para cerrar sesión.</div></details></div>`;
async function perfil() {
  const t = me.role === 'TRAINER';
  html(`<div class="hero pf"><div class="av">${esc(((me.nombre[0] || '') + (me.apellidos[0] || '')).toUpperCase())}</div><div><h2>${esc(me.nombre + ' ' + me.apellidos)}</h2><small>${esc(me.email)}</small></div></div>
   <div class="card"><b>Personalizar</b><p class="muted">Elige el color de la app</p><div class="sw">${Object.entries(THEMES).map(([k, v]) => `<button class="swb ${(me.theme || 'azul') === k ? 'on' : ''}" data-t="${k}" title="${v[0]}" style="background:linear-gradient(135deg,${v[1]},${v[3]})"></button>`).join('')}</div></div>
   ${t ? '' : TUTORIAL}
   ${t ? '' : `<div class="card"><b>Contacta con tu entrenador</b><p class="muted">Víctor Martínez</p><a class="btn" href="https://wa.me/34${PHONE}" target="_blank" rel="noopener">💬 Escribir por WhatsApp</a><a class="btn ghost" href="tel:+34${PHONE}">📞 Llamar · ${PHONE}</a></div>`}
   <button id="lo" class="ghost">Cerrar sesión</button>`);
  $app.onclick = async e => {
    const k = e.target.dataset.t; if (!k) return; me.theme = k; applyTheme(k);
    document.querySelectorAll('.swb').forEach(b => b.classList.toggle('on', b.dataset.t === k));
    try { await ok(sb.from('profiles').update({ theme: k }).eq('id', me.id)); } catch (er) { console.error(er); toast('No se ha podido guardar el color.'); }
  };
  document.getElementById('lo').onclick = () => sb.auth.signOut();
}
async function ver(h) {
  const s = await ok(sb.from('workout_sessions').select('*,profiles(nombre,apellidos),workout_days(day_name,title,workout_exercises(id,exercise_order,sets,reps_min,reps_max,track_mode,duration_target,exercises(name))),set_logs(*)').eq('id', h[1]).single());
  const ex = [...s.workout_days.workout_exercises].sort((a, b) => a.exercise_order - b.exercise_order);
  const can = me.role === 'CLIENT' && s.completed && Date.now() - new Date(s.completed_at) < 3 * 864e5;
  html(`<a href="javascript:history.back()">← Volver</a><h2>${esc(s.workout_days.day_name)} — ${esc(s.workout_days.title)}</h2>
   <p class="muted">${me.role === 'TRAINER' ? esc(s.profiles.nombre + ' ' + s.profiles.apellidos) + ' · ' : ''}${s.completed_at ? fd(s.completed_at) : 'En curso'} · RPE ${s.rpe ?? '—'}/10</p>
   ${can ? `<a class="btn" href="#/sesion/${s.workout_day_id}">✏️ Editar sesión</a><p class="muted c"><small>Editable hasta el ${fd(new Date(s.completed_at).getTime() + 3 * 864e5)}</small></p>` : ''}
   ${s.observations ? `<div class="card">“${esc(s.observations)}”</div>` : ''}
   ${ex.map(x => `<div class="card"><b>${esc(x.exercises.name)}</b> <small class="muted">${x.track_mode === 'time' ? `${x.sets} × ${x.duration_target} seg` : `${x.sets} × ${x.reps_min}–${x.reps_max}`}</small>${s.set_logs.filter(l => l.workout_exercise_id === x.id).sort((a, b) => a.set_number - b.set_number).map(l => `<div class="set">Serie ${l.set_number}: ${x.track_mode === 'time' ? `<b>${l.duration_seconds} seg</b>` : `<b>${+l.weight} kg</b> × ${l.reps}`}</div>`).join('') || '<div class="muted">Sin registros</div>'}</div>`).join('')}`);
}
async function exView(cid, back) {
  const L = await ok(sb.from('set_logs').select('weight,reps,workout_exercises(exercise_id,exercises(name,category)),workout_sessions!inner(started_at,client_id,completed)').eq('workout_sessions.client_id', cid).eq('workout_sessions.completed', true));
  const g = {};
  L.forEach(l => { if (l.weight == null || l.reps == null) return; const x = l.workout_exercises, k = x.exercise_id, d = l.workout_sessions.started_at, w = +l.weight, rm = w * (1 + l.reps / 30); g[k] ??= { n: x.exercises.name, c: x.exercises.category, by: {}, rm: 0 }; const o = g[k].by[d]; if (!o || w > o.w || (w === o.w && l.reps > o.r)) g[k].by[d] = { w, r: l.reps }; if (rm > g[k].rm) g[k].rm = rm; });
  const chart = pts => {
    const W = 300, H = 140, l = 34, r = 10, t = 16, b = 24, v = pts.map(p => p.w), hi = Math.max(...v), lo = Math.min(...v), pad = hi === lo ? 5 : (hi - lo) * .15, mx = hi + pad, mn = Math.max(0, lo - pad);
    const X = i => l + (pts.length > 1 ? i * (W - l - r) / (pts.length - 1) : (W - l - r) / 2), Y = w => t + (mx - w) / (mx - mn) * (H - t - b);
    const grid = [mn, (mn + mx) / 2, mx].map(w => `<line x1="${l}" x2="${W - r}" y1="${Y(w)}" y2="${Y(w)}" stroke="#e5eaf3"/><text x="${l - 4}" y="${Y(w) + 3}" text-anchor="end" font-size="9" fill="#6b7280">${Math.round(w * 10) / 10}</text>`).join('');
    const dots = pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.w)}" r="4" style="fill:var(--b)"><title>${fd(p.d)}: ${p.w} kg × ${p.r}</title></circle>${pts.length <= 8 ? `<text x="${X(i)}" y="${Y(p.w) - 8}" text-anchor="middle" font-size="9" fill="#1f2937">${p.w}</text>` : ''}`).join('');
    const xl = pts.map((p, i) => pts.length <= 6 || i === 0 || i === pts.length - 1 ? `<text x="${X(i)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="#6b7280">${fd(p.d).slice(0, 5)}</text>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart">${grid}<polyline fill="none" style="stroke:var(--b)" stroke-width="2.5" points="${pts.map((p, i) => X(i) + ',' + Y(p.w)).join(' ')}"/>${dots}${xl}</svg>`;
  };
  const items = Object.values(g).sort((a, b) => a.n.localeCompare(b.n)).map(e => {
    const pts = Object.keys(e.by).sort().map(d => ({ d, ...e.by[d] })), last = pts[pts.length - 1], best = Math.max(...pts.map(p => p.w)), dl = Math.round((last.w - pts[0].w) * 10) / 10;
    return `<details class="card it ${cc(e.c)}"><summary><b>${esc(e.n)}</b> ${pts.length > 1 ? `<span class="tag ${dl < 0 ? 'neg' : ''}">${dl > 0 ? '+' : ''}${dl} kg</span>` : ''}<br><small>Último: ${last.w} kg · Mejor: ${best} kg · 1RM est.: ${Math.round(e.rm)} kg · ${fd(last.d)}</small></summary>${chart(pts)}${pts.slice().reverse().map(p => `<div class="set">${fd(p.d)} — <b>${p.w} kg</b> × ${p.r}</div>`).join('')}</details>`;
  });
  html(`${back ? `<a href="${back}">← Volver</a>` : ''}<h2>Progresión por ejercicio</h2><p class="muted">Cada punto es el mejor peso de una sesión.</p>${items.join('') || '<p class="muted">Todavía no hay registros.</p>'}`);
}

// ---------- ENTRENADOR ----------
const T = {
  async home() {
    const [cl, ws, ses] = await Promise.all([
      ok(sb.from('profiles').select('id,nombre,apellidos,email,client_color,client_emoji').eq('trainer_id', me.id).order('nombre')),
      ok(sb.from('workout_weeks').select('id,client_id,week_number,week_start,workout_days(id,day_name,title,day_order)')),
      ok(sb.from('workout_sessions').select('client_id,workout_day_id,completed_at,workout_days(day_name,title)').eq('completed', true).order('completed_at', { ascending: false }).limit(500))]);
    html(`<h2>Hola, ${esc(me.nombre)}</h2><div class="row"><h3>Mis clientes</h3><button id="inv">+ Invitar</button></div>
     ${cl.map(c => {
       const cws = ws.filter(w => w.client_id === c.id), my = ses.filter(s => s.client_id === c.id), st = stat(cws, my), ad = adherence(cws, my);
       return `<a class="card link" href="#/c/${c.id}"><div class="row"><span>${tagBadge(c)}<b>${esc(c.nombre + ' ' + c.apellidos)}</b></span>${ad.pct !== null ? `<span class="tag ${ad.pct < 70 ? 'neg' : ''}">${ad.pct}%${ad.streak >= 2 ? ' · 🔥' + ad.streak : ''}</span>` : ''}</div>${st.w ? `Semana ${st.w.week_number} · ${st.done}/${st.days.length} sesiones` : 'Sin programación'}
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
      ok(sb.from('workout_sessions').select('id,workout_day_id,completed_at,rpe,observations,workout_days(day_name,title)').eq('client_id', id).eq('completed', true).order('completed_at', { ascending: false }).limit(200))]);
    const vol = await ok(sb.from('set_logs').select('weight,reps,workout_exercises(exercises(category)),workout_sessions!inner(client_id,completed,started_at)').eq('workout_sessions.client_id', id).eq('workout_sessions.completed', true));
    const ad = adherence(ws, ses);
    const cw = curWeek(ws), sw = h[2] === 's' ? ws.find(x => x.week_number === +h[3]) : null, st = stat(ws, ses, sw), rp = ses.slice(0, 3).map(s => s.rpe).filter(Boolean), ra = rp.length ? rp.reduce((a, b) => a + b, 0) / rp.length : 0;
    const pct = st.days?.length ? Math.round(st.done / st.days.length * 100) : 0, ini = ((p.nombre[0] || '') + (p.apellidos[0] || '')).toUpperCase(), rc = v => `hsl(${130 - (v - 1) * 13} 55% 85%)`, cm = ses.filter(s => s.observations).slice(0, 3);
    html(`<a href="#/">← Clientes</a><div class="hero pf"><div class="av" ${p.client_color ? `style="background:${CLIENT_TAGS[p.client_color]}"` : ''}>${p.client_emoji ? esc(p.client_emoji) : esc(ini)}<button class="avedit" data-a="tagedit" title="Identificar a este cliente">✏️</button></div><div><h2>${esc(p.nombre + ' ' + p.apellidos)}</h2><small>${esc(p.email)}</small></div></div>
     <div class="wsel">${ws.slice().reverse().map(w => `<a class="wp ${w.id === st.w?.id ? 'on' : ''}" href="#/c/${id}/s/${w.week_number}">S${w.week_number}${w.id === cw?.id ? '<i></i>' : ''}</a>`).join('')}</div>${ws.length ? '<small class="muted">● semana actual · toca una semana para verla arriba</small>' : ''}
     <div class="tiles"><div class="tile"><small>Semana${st.w && st.w.id === cw?.id ? ' · actual' : ''}</small><b>${st.w ? st.w.week_number : '—'}</b></div>
      <div class="tile"><small>Sesiones</small><b>${st.w ? st.done + '/' + st.days.length : '—'}</b><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="tile" ${ra ? `style="background:${rc(ra)}"` : ''}><small>RPE reciente</small><b>${ra ? ra.toFixed(1) : '—'}</b></div>
      <div class="tile"><small>Última sesión</small><b>${ses[0] ? fd(ses[0].completed_at).slice(0, 5) : '—'}</b></div>
      <div class="tile" ${ad.pct !== null && ad.pct < 70 ? 'style="background:#fbe4e4"' : ''}><small>Cumplimiento</small><b>${ad.pct !== null ? ad.pct + '%' : '—'}</b></div>
      <div class="tile"><small>Racha actual</small><b>${ad.streak ? '🔥 ' + ad.streak : '—'}</b></div></div>
     ${volumeCard(vol)}
     ${st.w ? `<div class="chips">${st.days.map(d => `<span class="chip ${st.doneSet.has(d.id) ? 'done' : 'pend'}">${esc(d.day_name)}</span>`).join('')}</div>` : ''}
     ${st.next ? `<div class="card next"><small class="muted">Próxima sesión</small><br><b>${esc(st.next.day_name)} · ${esc(st.next.title)}</b></div>` : ''}
     ${cm.length ? '<h3>💬 Últimos comentarios</h3>' + cm.map(s => `<div class="card cmt"><small class="muted">${fd(s.completed_at)} · ${esc(s.workout_days.title)}</small><br>“${esc(s.observations)}”</div>`).join('') : ''}
     <div class="row"><h3>📅 Programación</h3><span><button data-a="new">+ Semana</button>${ws[0] ? ' <button data-a="copy" class="ghost">Copiar última</button>' : ''}</span></div>
     ${ws.map(w => `<div class="card row ${w.id === cw?.id ? 'cur' : ''}"><a class="grow" href="#/w/${w.id}"><b>Semana ${w.week_number}</b>${w.id === cw?.id ? ' <span class="tag">actual</span>' : ''} <small class="muted">· desde ${fd(w.week_start + 'T12:00:00')} · ${w.workout_days.length} días</small></a><button class="sm ghost" data-del="${w.id}" title="Eliminar semana">🗑</button></div>`).join('') || '<p class="muted">Crea la primera semana.</p>'}
     <div class="row"><h3>📈 Sesiones</h3><a href="#/c/${id}/ej">📊 Progresión por ejercicio →</a></div>
     ${ses.map(s => `<a class="card link" href="#/ver/${s.id}"><span class="rpe-dot" style="background:${rc(s.rpe)}">${s.rpe}</span><b>${fd(s.completed_at)}</b> · ${esc(s.workout_days.day_name + ' — ' + s.workout_days.title)}${s.observations ? `<br><small class="muted">${esc(s.observations.slice(0, 90))}</small>` : ''}</a>`).join('') || '<p class="muted">Sin sesiones completadas.</p>'}`);
    $app.onclick = async e => {
      if (e.target.closest('[data-a="tagedit"]')) {
        const m = modal(`<h3>Identificar a ${esc(p.nombre)}</h3><p class="muted">Solo lo ves tú, te ayuda a reconocerlo rápido en tus listas.</p>
         <div class="sw">${Object.entries(CLIENT_TAGS).map(([k, hex]) => `<button class="swb ${p.client_color === k ? 'on' : ''}" data-tag="client_color" data-v="${k}" style="background:${hex}"></button>`).join('')}</div>
         <div class="emo">${EMOJIS.map(em => `<button class="emob ${p.client_emoji === em ? 'on' : ''}" data-tag="client_emoji" data-v="${em}">${em}</button>`).join('')}</div>`);
        m.addEventListener('click', async ev => {
          const tg = ev.target.dataset.tag; if (!tg) return;
          try { await ok(sb.from('profiles').update({ [tg]: ev.target.dataset.v }).eq('id', id)); m.remove(); route(); } catch (er) { console.error(er); toast('No se ha podido guardar la etiqueta.'); }
        });
        return;
      }
      const tg = e.target.dataset.tag;
      if (tg) { try { await ok(sb.from('profiles').update({ [tg]: e.target.dataset.v }).eq('id', id)); route(); } catch (er) { console.error(er); toast('No se ha podido guardar la etiqueta.'); } return; }
      const dl = e.target.dataset.del;
      if (dl) {
        const w = ws.find(x => x.id === dl), n = ses.filter(x => w.workout_days.some(d => d.id === x.workout_day_id)).length;
        if (!confirm(n ? `La semana ${w.week_number} tiene ${n} sesión(es) registradas por el cliente y se borrarán con ella para siempre. ¿Eliminar igualmente?` : `¿Eliminar la semana ${w.week_number}?`)) return;
        try { await ok(sb.from('workout_weeks').delete().eq('id', dl)); route(); } catch (er) { console.error(er); toast('No se ha podido eliminar la semana.'); }
        return;
      }
      const a = e.target.dataset.a; if (!a) return;
      try {
        if (a === 'new') { const w = await ok(sb.from('workout_weeks').insert({ client_id: id, week_number: (ws[0]?.week_number || 0) + 1, week_start: ws[0] ? plus7(ws[0].week_start) : monday(today()) }).select().single()); location.hash = '#/w/' + w.id; }
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
     ${days.map(d => `<div class="card ${dnSet.has(d.id) ? 'done' : 'pend'}"><div class="row"><b>${esc(d.day_name)} — ${esc(d.title)}</b><small>${dnSet.has(d.id) ? '✓ Completada' : 'Pendiente'}</small></div><div class="row wrap"><button class="ghost sm" data-a="tpl" data-d="${d.id}">Guardar como sesión base</button><button class="ghost sm" data-a="edday" data-d="${d.id}">Editar día</button><button class="ghost sm" data-a="delday" data-id="${d.id}">Eliminar día</button></div>
      ${d.workout_exercises.map((x, i) => `<div class="ex ${cc(x.exercises.category)}"><div><b>${i + 1}. ${esc(x.exercises.name)}</b><br><small>${x.track_mode === 'time' ? `${x.sets} series × ${x.duration_target} seg` : `${x.sets} × ${x.reps_min}–${x.reps_max} · RIR ${x.rir_min}–${x.rir_max}`}${x.trainer_notes ? ' · ' + esc(x.trainer_notes) : ''}</small></div>
       <div class="acts"><button class="sm ghost" data-a="up" data-id="${x.id}" data-d="${d.id}">↑</button><button class="sm ghost" data-a="dn" data-id="${x.id}" data-d="${d.id}">↓</button><button class="sm ghost" data-a="ed" data-id="${x.id}" data-d="${d.id}">Editar</button><button class="sm ghost" data-a="del" data-id="${x.id}">✕</button></div></div>`).join('')}
      <button data-a="addex" data-d="${d.id}">+ Ejercicio</button></div>`).join('') || '<p class="muted">Añade los días de entrenamiento.</p>'}`);
    const find = did => days.find(d => d.id === did);
    $app.onclick = async e => {
      const b = e.target.closest('[data-a]'); if (!b) return; const { a, id: xid, d: did } = b.dataset;
      try {
        if (a === 'edday') {
          const d0 = find(did), m = modal(`<form id="ed"><h3>Editar día</h3><select name="n">${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(x => `<option ${x === d0.day_name ? 'selected' : ''}>${x}</option>`).join('')}</select><input name="t" value="${esc(d0.title)}" maxlength="80" required placeholder="Título (ej. Pierna + empuje)"><button>Guardar</button></form>`);
          m.querySelector('#ed').onsubmit = async ev => { ev.preventDefault(); const f = new FormData(ev.target); try { await ok(sb.from('workout_days').update({ day_name: f.get('n'), title: f.get('t').trim() }).eq('id', did)); m.remove(); route(); } catch (er) { console.error(er); toast('No se ha podido guardar.'); } };
          return;
        }
        if (a === 'tpl') { const nm = prompt('Nombre de la sesión base (ej. Pierna A)'); if (nm && nm.trim()) { await ok(sb.rpc('save_day_as_template', { p_day: did, p_name: nm.trim() })); toast('Sesión base guardada'); } return; }
        if (a === 'addday') return dayForm();
        if (a === 'delday') { if (confirm('¿Eliminar este día y sus ejercicios?')) { await ok(sb.from('workout_days').delete().eq('id', xid)); route(); } return; }
        if (a === 'addex') { const d0 = find(did); return exModal(lib, null, r => ok(sb.from('workout_exercises').insert({ ...r, workout_day_id: d0.id, exercise_order: Math.max(0, ...d0.workout_exercises.map(y => y.exercise_order)) + 1 }))); }
        if (a === 'ed') { const xx = find(did).workout_exercises.find(x => x.id === xid); return exModal(lib, xx, r => ok(sb.from('workout_exercises').update(r).eq('id', xx.id))); }
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
  },
  async seg(h) {
    const cid = h && h[1];
    const avatarOf = c => `<div class="av ${cid ? '' : 'sm'}" ${c.client_color ? `style="background:${CLIENT_TAGS[c.client_color]}"` : ''}>${c.client_emoji ? esc(c.client_emoji) : esc(((c.nombre[0] || '') + (c.apellidos[0] || '')).toUpperCase())}</div>`;
    if (!cid) {
      const cl = await ok(sb.from('profiles').select('id,nombre,apellidos,client_color,client_emoji').eq('trainer_id', me.id).order('nombre'));
      html(`<h2>Seguimiento</h2><div class="tiles cats">${cl.map(c => `<a class="tile clientTile" href="#/seg/${c.id}">${avatarOf(c)}<b>${esc(c.nombre + ' ' + c.apellidos)}</b></a>`).join('') || '<p class="muted">Aún no tienes clientes.</p>'}</div>`);
      return;
    }
    const [p, s] = await Promise.all([
      ok(sb.from('profiles').select('nombre,apellidos,client_color,client_emoji').eq('id', cid).single()),
      ok(sb.from('workout_sessions').select('id,completed_at,rpe,observations,workout_days(day_name,title)').eq('client_id', cid).eq('completed', true).order('completed_at', { ascending: false }).limit(60))
    ]);
    const rc = v => `hsl(${130 - (v - 1) * 13} 55% 85%)`;
    html(`<a href="#/seg">← Seguimiento</a><div class="hero pf">${avatarOf(p)}<div><h2>${esc(p.nombre + ' ' + p.apellidos)}</h2></div></div>
     ${s.map(x => `<a class="card link" href="#/ver/${x.id}"><span class="rpe-dot" style="background:${rc(x.rpe)}">${x.rpe}</span><b>${fd(x.completed_at)}</b> · ${esc(x.workout_days.day_name + ' — ' + x.workout_days.title)}${x.observations ? `<p class="quote">“${esc(x.observations)}”</p>` : ''}</a>`).join('') || '<p class="muted">Aún no hay sesiones completadas.</p>'}`);
  },
  async ej(h) {
    const L = await ok(sb.from('exercises').select('*').order('muscle_group').order('name'));
    const mg = ['Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Cuádriceps', 'Isquios', 'Glúteo', 'Gemelo', 'Core', 'Cuerpo completo'];
    const cats = (x, def) => Object.entries(CATS).map(([k, [n]]) => `<option value="${k}" ${(x ? x.category === k : k === def) ? 'selected' : ''}>${n}</option>`).join('');
    const row = x => `<div class="card row it ${cc(x.category)}"><div><b>${esc(x.name)}</b> <small class="muted">${esc(x.muscle_group || '')}</small>${x.video_url ? ` ${videoBtn(x.video_url)}` : ''}${x.description ? `<br><small>${esc(x.description)}</small>` : ''}</div><div class="acts"><button class="sm ghost" data-ed="${x.id}">Editar</button><button class="sm ghost" data-id="${x.id}">✕</button></div></div>`;
    const vals = f => ({ name: f.get('n').trim(), category: f.get('c'), muscle_group: f.get('g').trim() || null, description: f.get('d').trim() || null, video_url: f.get('v').trim() || null });
    const errMsg = e => e?.code === '23505' ? 'Ya tienes un ejercicio con ese nombre.' : e?.code === '23514' ? 'Esa categoría no es válida. Recarga la página e inténtalo de nuevo.' : 'No se ha podido guardar el ejercicio. Inténtalo de nuevo.';
    const key = h && h[1];
    if (!key) {
      const otros = L.filter(x => !x.category).length;
      html(`<h2>Biblioteca de ejercicios</h2>${L.length ? '' : '<button id="sd">Cargar ejercicios básicos</button>'}
       <div class="tiles cats">${Object.entries(CATS).map(([k, [n, c]]) => { const cnt = L.filter(x => x.category === k).length; return `<a class="tile catTile ${c}" href="#/ej/${k}"><b>${n}</b><small>${cnt} ejercicio${cnt === 1 ? '' : 's'}</small></a>`; }).join('')}${otros ? `<a class="tile catTile k-otro" href="#/ej/otros"><b>Sin categoría</b><small>${otros} ejercicios</small></a>` : ''}</div>`);
      const sd = document.getElementById('sd'); if (sd) sd.onclick = async () => { try { await ok(sb.rpc('seed_default_exercises')); route(); } catch (e) { console.error(e); toast('No se han podido cargar.'); } };
      return;
    }
    const list = key === 'otros' ? L.filter(x => !x.category) : L.filter(x => x.category === key);
    const label = key === 'otros' ? 'Sin categoría' : CATS[key]?.[0];
    if (label === undefined) { location.hash = '#/ej'; return; }
    html(`<a href="#/ej">← Categorías</a><h2>${esc(label)}</h2><form id="ef" class="card"><input name="n" placeholder="Nombre" required maxlength="80"><select name="c">${cats(null, key === 'otros' ? Object.keys(CATS)[0] : key)}</select><input name="g" list="mg" placeholder="Músculo (ej. Pecho)" maxlength="40"><datalist id="mg">${mg.map(x => `<option value="${x}">`).join('')}</datalist><textarea name="d" placeholder="Descripción / instrucciones" maxlength="1000"></textarea><input name="v" type="url" placeholder="URL de vídeo (opcional)"><button>Crear ejercicio</button></form>
     ${list.map(row).join('') || '<p class="muted">Sin ejercicios en esta categoría todavía.</p>'}`);
    document.getElementById('ef').onsubmit = async ev => { ev.preventDefault(); try { await ok(sb.from('exercises').insert({ trainer_id: me.id, ...vals(new FormData(ev.target)) })); route(); } catch (e) { console.error(e); toast(errMsg(e)); } };
    const edit = x => {
      const m = modal(`<form id="edf"><h3>Editar ejercicio</h3><input name="n" required maxlength="80" value="${esc(x.name)}"><select name="c">${cats(x)}</select><input name="g" list="mg" maxlength="40" value="${esc(x.muscle_group || '')}" placeholder="Músculo"><textarea name="d" maxlength="1000" placeholder="Descripción">${esc(x.description || '')}</textarea><input name="v" type="url" placeholder="URL de vídeo" value="${esc(x.video_url || '')}"><button>Guardar</button></form>`);
      m.querySelector('#edf').onsubmit = async ev => { ev.preventDefault(); try { await ok(sb.from('exercises').update(vals(new FormData(ev.target))).eq('id', x.id)); m.remove(); route(); } catch (er) { console.error(er); toast(errMsg(er)); } };
    };
    $app.onclick = async e => {
      if (e.target.dataset.ed) return edit(L.find(y => y.id === e.target.dataset.ed));
      const id = e.target.dataset.id; if (!id || !confirm('¿Eliminar ejercicio?')) return;
      try { await ok(sb.from('exercises').delete().eq('id', id)); route(); } catch (er) { console.error(er); toast('No se puede eliminar: está en uso en alguna programación.'); }
    };
  },
  async bases() {
    const L = await ok(sb.from('session_templates').select('id,name,template_exercises(id)').order('name'));
    html(`<div class="row"><h2>Sesiones base</h2><button id="nb">+ Nueva</button></div><p class="muted">Plantillas para crear días rápido con “+ Día”. Al crear un día desde una, se copia: puedes cambiar series, reps y RIR de ese cliente sin tocar la base.</p>
     ${L.map(t => `<a class="card link" href="#/base/${t.id}"><b>${esc(t.name)}</b> <small class="muted">· ${t.template_exercises.length} ejercicios</small></a>`).join('') || '<p class="muted">Aún no tienes sesiones base. Crea una con “+ Nueva” o desde un día con “Guardar como sesión base”.</p>'}`);
    document.getElementById('nb').onclick = async () => {
      const nm = prompt('Nombre de la sesión base (ej. Pierna A)'); if (!nm || !nm.trim()) return;
      try { const t = await ok(sb.from('session_templates').insert({ trainer_id: me.id, name: nm.trim() }).select().single()); location.hash = '#/base/' + t.id; } catch (e) { console.error(e); toast('No se ha podido crear (¿nombre repetido?).'); }
    };
  },
  async base(h) {
    const id = h[1];
    const [t, lib] = await Promise.all([
      ok(sb.from('session_templates').select('*,template_exercises(*,exercises(name,category))').eq('id', id).single()),
      ok(sb.from('exercises').select('id,name,category,muscle_group').order('muscle_group').order('name'))]);
    const ex = t.template_exercises.sort((a, b) => a.exercise_order - b.exercise_order);
    html(`<a href="#/bases">← Sesiones base</a><div class="row"><h2>${esc(t.name)}</h2><span><button class="sm ghost" data-a="ren">Renombrar</button> <button class="sm ghost" data-a="delb">Eliminar</button></span></div>
     <div class="card">${ex.map((x, i) => `<div class="ex ${cc(x.exercises.category)}"><div><b>${i + 1}. ${esc(x.exercises.name)}</b><br><small>${x.track_mode === 'time' ? `${x.sets} series × ${x.duration_target} seg` : `${x.sets} × ${x.reps_min}–${x.reps_max} · RIR ${x.rir_min}–${x.rir_max}`}${x.trainer_notes ? ' · ' + esc(x.trainer_notes) : ''}</small></div><div class="acts"><button class="sm ghost" data-a="up" data-id="${x.id}">↑</button><button class="sm ghost" data-a="dn" data-id="${x.id}">↓</button><button class="sm ghost" data-a="ed" data-id="${x.id}">Editar</button><button class="sm ghost" data-a="del" data-id="${x.id}">✕</button></div></div>`).join('') || '<p class="muted">Sin ejercicios todavía.</p>'}<button data-a="add">+ Ejercicio</button></div>
     <p class="muted"><small>Los cambios aquí solo afectan a los días que crees a partir de ahora, no a los ya creados.</small></p>`);
    $app.onclick = async e => {
      const b = e.target.closest('[data-a]'); if (!b) return; const { a, id: xid } = b.dataset;
      try {
        if (a === 'add') return exModal(lib, null, r => ok(sb.from('template_exercises').insert({ ...r, template_id: id, exercise_order: Math.max(0, ...ex.map(y => y.exercise_order)) + 1 })));
        if (a === 'ed') return exModal(lib, ex.find(x => x.id === xid), r => ok(sb.from('template_exercises').update(r).eq('id', xid)));
        if (a === 'del') { if (confirm('¿Quitar este ejercicio de la sesión base?')) { await ok(sb.from('template_exercises').delete().eq('id', xid)); route(); } return; }
        if (a === 'up' || a === 'dn') {
          const i = ex.findIndex(x => x.id === xid), j = a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= ex.length) return;
          await ok(sb.from('template_exercises').update({ exercise_order: ex[j].exercise_order }).eq('id', ex[i].id));
          await ok(sb.from('template_exercises').update({ exercise_order: ex[i].exercise_order }).eq('id', ex[j].id)); route(); return;
        }
        if (a === 'ren') { const nm = prompt('Nuevo nombre', t.name); if (nm && nm.trim()) { await ok(sb.from('session_templates').update({ name: nm.trim() }).eq('id', id)); route(); } return; }
        if (a === 'delb') { if (confirm('¿Eliminar esta sesión base? Los días ya creados con ella no se borran.')) { await ok(sb.from('session_templates').delete().eq('id', id)); location.hash = '#/bases'; } return; }
      } catch (er) { console.error(er); toast('No se ha podido completar la acción (¿nombre repetido?).'); }
    };
  }
};

// ---------- CLIENTE ----------
const C = {
  async home(h) {
    const hr = +new Date().toLocaleString('es-ES', { timeZone: tz, hour: 'numeric', hour12: false }), sal = hr < 13 ? 'Buenos días' : hr < 21 ? 'Buenas tardes' : 'Buenas noches';
    if (!me.trainer_id) return html(`<div class="hero"><small>${sal}</small><h2>${esc(me.nombre)} 👋</h2><p>Aún no tienes entrenador asignado. Abre el enlace de invitación que te ha enviado Víctor.</p></div>`);
    const [ws, ses, vol] = await Promise.all([
      ok(sb.from('workout_weeks').select('*,workout_days(id,day_name,title,day_order)').eq('client_id', me.id)),
      ok(sb.from('workout_sessions').select('id,workout_day_id,completed_at').eq('client_id', me.id).eq('completed', true).order('completed_at', { ascending: false })),
      ok(sb.from('set_logs').select('weight,reps,workout_exercises(exercises(category)),workout_sessions!inner(client_id,completed,started_at)').eq('workout_sessions.client_id', me.id).eq('workout_sessions.completed', true))]);
    const cw = curWeek(ws), wn = h && h[0] === 'sem' ? +h[1] : 0, sorted = [...ws].sort((a, b) => a.week_number - b.week_number), ad = adherence(ws, ses);
    const st = stat(ws, ses, wn ? ws.find(x => x.week_number === wn) : null), sid = Object.fromEntries(ses.map(s => [s.workout_day_id, s.id]));
    const i = sorted.findIndex(x => x.id === st.w?.id), pv = sorted[i - 1], nx = sorted[i + 1], pct = st.days?.length ? Math.round(st.done / st.days.length * 100) : 0;
    html(`<div class="hero"><small>${sal}</small><h2>${esc(me.nombre)} 👋</h2>${st.w ? `<div class="wk"><a class="${pv ? '' : 'off'}" href="#/sem/${(pv || st.w).week_number}">‹</a><b>Semana ${st.w.week_number}${st.w.id === cw?.id ? ' <span class="tag">actual</span>' : ''}</b><a class="${nx ? '' : 'off'}" href="#/sem/${(nx || st.w).week_number}">›</a></div><div class="bar"><i style="width:${pct}%"></i></div><p>${st.done} de ${st.days.length} sesiones completadas</p>${st.w.id !== cw?.id ? '<a class="back" href="#/">Volver a la semana actual</a>' : ''}` : '<p>Tu entrenador aún no ha programado tu semana.</p>'}
     ${ad.pct !== null ? `<div class="wk"><span>✅ Cumplimiento: <b>${ad.pct}%</b></span>${ad.streak >= 2 ? `<span>🔥 Racha: <b>${ad.streak}</b></span>` : ''}</div>` : ''}</div>
     ${volumeCard(vol)}
     ${st.next ? `<div class="card next"><small class="muted">Próxima sesión</small><h3>${esc(st.next.day_name)} · ${esc(st.next.title)}</h3><a class="btn" href="#/sesion/${st.next.id}">EMPEZAR SESIÓN</a></div>` : st.w ? '<div class="card done">¡Semana completada! 💪</div>' : ''}
     ${st.w ? '<h3>Tus sesiones</h3>' + st.days.map(d => sid[d.id] ? `<a class="card link done" href="#/ver/${sid[d.id]}"><b>✓ ${esc(d.day_name)}</b> — ${esc(d.title)}</a>` : `<a class="card link pend" href="#/sesion/${d.id}"><b>${esc(d.day_name)}</b> — ${esc(d.title)}</a>`).join('') : ''}`);
  },
  sem(h) { return C.home(h); },
  async hist() {
    const s = await ok(sb.from('workout_sessions').select('id,completed_at,rpe,workout_days(day_name,title,workout_weeks(week_number))').eq('client_id', me.id).eq('completed', true).order('completed_at', { ascending: false }));
    const rc = v => `hsl(${130 - (v - 1) * 13} 55% 85%)`, g = {};
    s.forEach(x => { const wn = x.workout_days.workout_weeks?.week_number ?? '—'; (g[wn] ??= []).push(x); });
    const weeks = Object.keys(g).sort((a, b) => b - a);
    html(`<h2>Historial</h2>${weeks.map(wn => `<h3>Semana ${wn}</h3>${g[wn].map(x => `<a class="card link" href="#/ver/${x.id}"><span class="rpe-dot" style="background:${rc(x.rpe)}">${x.rpe}</span><b>${fd(x.completed_at)}</b> · ${esc(x.workout_days.day_name + ' — ' + x.workout_days.title)}</a>`).join('')}`).join('') || '<p class="muted">Aún no has completado sesiones.</p>'}`);
  },
  async ej() { return exView(me.id); },
  async sesion(h) {
    const d = await ok(sb.from('workout_days').select('*,workout_exercises(*,exercises(name,description,video_url))').eq('id', h[1]).single());
    const s = await ok(sb.from('workout_sessions').select('*,set_logs(*)').eq('workout_day_id', d.id).eq('client_id', me.id).maybeSingle());
    if (s?.completed && Date.now() - new Date(s.completed_at) > 3 * 864e5) { location.hash = '#/ver/' + s.id; return; }
    const ex = d.workout_exercises.sort((a, b) => a.exercise_order - b.exercise_order);
    const lg = (x, n) => s?.set_logs.find(l => l.workout_exercise_id === x.id && l.set_number === n);
    const lgT = (x, n) => lg(x, n)?.duration_seconds;
    html(`<a href="#/">← Inicio</a><h2>${esc(d.day_name)} — ${esc(d.title)}</h2>${s?.completed ? '<div class="card">✏️ Estás editando una sesión ya completada (se puede hasta 3 días después).</div>' : ''}<form id="sf">
     ${ex.map(x => x.track_mode === 'time' ? `<div class="card"><b>${esc(x.exercises.name)}</b><br><small>${x.sets} × ${x.duration_target} seg</small>
      ${x.trainer_notes ? `<p class="quote">${esc(x.trainer_notes)}</p>` : ''}${videoBtn(x.exercises.video_url)}
      ${Array.from({ length: x.sets }, (_, i) => { const n = i + 1, key = `${x.id}_${n}`, done = lgT(x, n); return `<div class="timerow"><span>Serie ${n}</span><span class="tcount" id="tc_${key}">${done ? done + 's ✓' : x.duration_target + 's'}</span><button type="button" class="sm ${done ? '' : 'start'}" data-start="${key}" data-target="${x.duration_target}" ${done ? 'disabled' : ''}>${done ? '✓' : '▶'}</button><input type="hidden" name="t_${key}" value="${done ?? ''}"></div>`; }).join('')}</div>`
       : `<div class="card"><b>${esc(x.exercises.name)}</b><br><small>${x.sets} × ${x.reps_min}–${x.reps_max} · RIR objetivo: ${x.rir_min}–${x.rir_max}</small>
      ${x.trainer_notes ? `<p class="quote">${esc(x.trainer_notes)}</p>` : ''}${videoBtn(x.exercises.video_url)}
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
    const timers = {};
    function finishTimer(tkey, secs, btn) {
      const inp = sf.elements['t_' + tkey]; if (inp) inp.value = secs;
      const tc = document.getElementById('tc_' + tkey); if (tc) tc.textContent = secs + 's ✓';
      btn.textContent = '✓'; btn.disabled = true; btn.classList.remove('start');
      save();
    }
    sf.addEventListener('click', e => {
      const b = e.target.closest('[data-start]'); if (!b) return; e.preventDefault();
      const tkey = b.dataset.start, target = +b.dataset.target;
      if (timers[tkey]) {
        clearInterval(timers[tkey]); delete timers[tkey];
        finishTimer(tkey, target - (+b.dataset.remaining || 0), b);
        return;
      }
      let remaining = target; b.dataset.remaining = remaining; b.textContent = '⏸ ' + remaining + 's';
      timers[tkey] = setInterval(() => {
        remaining--; b.dataset.remaining = remaining; b.textContent = '⏸ ' + remaining + 's';
        const tc = document.getElementById('tc_' + tkey); if (tc) tc.textContent = remaining + 's';
        if (remaining <= 0) { clearInterval(timers[tkey]); delete timers[tkey]; try { navigator.vibrate?.(200); } catch (er) { } finishTimer(tkey, target, b); }
      }, 1000);
    });
    try {
      const dr = JSON.parse(localStorage.getItem(key) || 'null');
      if (dr) {
        Object.entries(dr).forEach(([k, v]) => {
          const el = sf.elements[k]; if (el) el.value = v;
          const tm = k.match(/^t_(.+)$/);
          if (tm) { const tc = document.getElementById('tc_' + tm[1]); if (tc) tc.textContent = v + 's ✓'; const bt = sf.querySelector(`[data-start="${tm[1]}"]`); if (bt) { bt.textContent = '✓'; bt.disabled = true; bt.classList.remove('start'); } }
        });
        if (dr.rpe) document.getElementById('rl').textContent = RPE[dr.rpe - 1].join(' ') + ' (' + dr.rpe + '/10)';
        toast('Hemos recuperado lo que habías escrito');
      }
    } catch (er) { console.error(er); }
    sf.addEventListener('input', save); sf.addEventListener('change', save);
    document.getElementById('sf').onsubmit = async ev => {
      ev.preventDefault(); const f = new FormData(ev.target), rows = [], E = document.getElementById('se'); let bad = '';
      ex.forEach(x => {
        if (x.track_mode === 'time') {
          for (let n = 1; n <= x.sets; n++) {
            const t = f.get(`t_${x.id}_${n}`); if (!t) continue;
            const secs = +t; if (!Number.isFinite(secs) || secs <= 0 || secs > 3600) bad = 'Hay un tiempo no válido en ' + x.exercises.name + '.';
            rows.push({ workout_exercise_id: x.id, set_number: n, duration_seconds: secs });
          }
        } else {
          for (let n = 1; n <= x.sets; n++) {
            const w = f.get(`w_${x.id}_${n}`).trim().replace(',', '.'), r = f.get(`r_${x.id}_${n}`).trim(); if (!w && !r) continue;
            if (!w || !r || isNaN(w) || +w < 0 || +w > 1000 || !/^\d+$/.test(r) || +r > 200) bad = 'Revisa peso y repeticiones: usa números y rellena ambos campos en cada serie.';
            rows.push({ workout_exercise_id: x.id, set_number: n, weight: +w, reps: +r });
          }
        }
      });
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

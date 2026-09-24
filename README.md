# Víctor Martínez — Entrenamiento

App estática (HTML + JS, sin build) + Supabase (Auth, PostgreSQL, RLS). Hosting gratuito en Vercel.

## Puesta en marcha

1. **Supabase**: crea un proyecto en supabase.com (plan gratuito).
2. **SQL**: SQL Editor → pega todo `supabase.sql` → Run.
3. **Auth**: Authentication → Providers → Email activado. Contraseña mínima 8 (Auth → Policies).
4. **Claves**: Project Settings → API. Copia la *Project URL* y la clave *anon/publishable* en `config.js`. **Nunca** la `service_role`.
5. **Local**: en la carpeta ejecuta `npx serve .` (o `python3 -m http.server 8000`) y abre la URL.
6. **Vercel**: sube la carpeta a un repositorio de GitHub → vercel.com → Add New Project → importa el repo → Framework "Other" → Deploy. No hacen falta variables de entorno (la clave pública va en `config.js`).
7. **URLs de Auth**: Supabase → Authentication → URL Configuration: *Site URL* = tu URL de Vercel y añade la misma en *Redirect URLs* (necesario para recuperar contraseña y confirmar email).
8. **Primer entrenador**: regístrate en la app con tu email y, en SQL Editor, ejecuta:
   ```sql
   update public.profiles set role='TRAINER' where email='TU_EMAIL';
   ```
   Recarga la app. Pestaña **Ejercicios** → "Cargar ejercicios básicos".
9. **Primer cliente**: en **Clientes** pulsa "+ Invitar", copia el enlace y envíaselo. Al abrirlo, crea su cuenta (o entra) y queda asignado automáticamente. El enlace es de un solo uso y caduca en 7 días.

## Prueba de seguridad (hazla antes de usarla con clientes)

Crea dos clientes (A y B) invitados por ti, con una semana programada cada uno. Con la sesión de A abierta, en la consola del navegador:

```js
(await sb.from('workout_weeks').select('*')).data            // solo debe salir la semana de A
(await sb.from('profiles').select('*')).data                 // solo el perfil de A
(await sb.from('workout_weeks').update({week_number:99}).neq('id','0')).data // no debe modificar nada
(await sb.from('profiles').update({role:'TRAINER'}).eq('id',me.id)).error   // debe dar error de permisos
```
Si algún resultado contiene datos de B o el cambio de rol funciona, no la uses y revisa el SQL.

## Notas
- Cambios respecto a tu spec: `target_rir` se divide en `rir_min`/`rir_max`; hay una sesión por día programado (evita duplicados); la asignación es por invitación (opción B) vía función `accept_invitation`.
- Fechas en `Europe/Madrid`. Los datos de salud/entrenamiento de clientes reales están sujetos al RGPD: añade política de privacidad y consentimiento.
- Para poner la app en otra URL, revisa el paso 7.

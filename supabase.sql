-- VÍCTOR MARTÍNEZ — ENTRENAMIENTO · Esquema Supabase (ejecutar entero en SQL Editor)
create extension if not exists pgcrypto;

create table public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default '', apellidos text not null default '', email text not null,
  role text not null default 'CLIENT' check (role in ('TRAINER','CLIENT')),
  trainer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (trainer_id is null or trainer_id <> id));
create index on public.profiles(trainer_id);

-- Todo usuario nuevo es CLIENT. El primer TRAINER se asigna a mano (ver README).
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,nombre,apellidos)
  values(new.id,new.email,left(coalesce(new.raw_user_meta_data->>'nombre',''),80),left(coalesce(new.raw_user_meta_data->>'apellidos',''),120));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.invitations(
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique default encode(gen_random_bytes(12),'hex'),
  used_by uuid references public.profiles(id), used_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now());

create table public.exercises(
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name))>0), muscle_group text, description text, video_url text,
  created_at timestamptz not null default now(), unique(trainer_id,name));

create table public.workout_weeks(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  week_number int not null check (week_number>0), week_start date not null,
  created_at timestamptz not null default now(), unique(client_id,week_number));
create index on public.workout_weeks(client_id);

create table public.workout_days(
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.workout_weeks(id) on delete cascade,
  day_name text not null, title text not null default '', day_order int not null check (day_order>0));
create index on public.workout_days(week_id);

create table public.workout_exercises(
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  exercise_order int not null check (exercise_order>0),
  sets int not null check (sets between 1 and 20),
  reps_min int not null check (reps_min between 1 and 100),
  reps_max int not null check (reps_max between 1 and 100),
  rir_min int not null check (rir_min between 0 and 10),
  rir_max int not null check (rir_max between 0 and 10),
  trainer_notes text,
  check (reps_max>=reps_min), check (rir_max>=rir_min));
create index on public.workout_exercises(workout_day_id);
create index on public.workout_exercises(exercise_id);

create table public.workout_sessions(
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  started_at timestamptz not null default now(), completed_at timestamptz,
  rpe int check (rpe between 1 and 10), observations text check (length(observations)<=2000),
  completed boolean not null default false,
  unique(client_id,workout_day_id),
  check (not completed or (rpe is not null and completed_at is not null)));
create index on public.workout_sessions(client_id,completed_at desc);

create table public.set_logs(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_number int not null check (set_number between 1 and 20),
  weight numeric(6,2) not null check (weight between 0 and 1000),
  reps int not null check (reps between 0 and 200),
  created_at timestamptz not null default now(),
  unique(session_id,workout_exercise_id,set_number));
create index on public.set_logs(session_id);
create index on public.set_logs(workout_exercise_id);

-- Funciones auxiliares (security definer para evitar recursión de RLS)
create function public.is_trainer() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id=auth.uid() and role='TRAINER') $$;
create function public.is_trainer_of(c uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles where id=c and trainer_id=auth.uid()) and public.is_trainer() $$;
create function public.my_trainer() returns uuid language sql stable security definer set search_path=public as $$
  select trainer_id from profiles where id=auth.uid() $$;
create function public.client_of_week(w uuid) returns uuid language sql stable security definer set search_path=public as $$
  select client_id from workout_weeks where id=w $$;
create function public.client_of_day(d uuid) returns uuid language sql stable security definer set search_path=public as $$
  select ww.client_id from workout_days wd join workout_weeks ww on ww.id=wd.week_id where wd.id=d $$;
create function public.client_of_session(s uuid) returns uuid language sql stable security definer set search_path=public as $$
  select client_id from workout_sessions where id=s $$;
create function public.client_of_wex(x uuid) returns uuid language sql stable security definer set search_path=public as $$
  select ww.client_id from workout_exercises we join workout_days wd on wd.id=we.workout_day_id join workout_weeks ww on ww.id=wd.week_id where we.id=x $$;

-- RLS
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_weeks enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.set_logs enable row level security;

-- profiles: leer el propio y los de mis clientes. Solo se puede editar nombre/apellidos (role y trainer_id bloqueados).
create policy p_sel on public.profiles for select to authenticated using (id=auth.uid() or trainer_id=auth.uid());
create policy p_upd on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update(nombre,apellidos) on public.profiles to authenticated;

-- invitations
create policy i_sel on public.invitations for select to authenticated using (trainer_id=auth.uid());
create policy i_ins on public.invitations for insert to authenticated with check (trainer_id=auth.uid() and public.is_trainer());
revoke insert, update, delete on public.invitations from anon, authenticated;
grant insert(trainer_id) on public.invitations to authenticated;

-- exercises
create policy e_tr on public.exercises for all to authenticated using (trainer_id=auth.uid() and public.is_trainer()) with check (trainer_id=auth.uid() and public.is_trainer());
create policy e_cl on public.exercises for select to authenticated using (trainer_id=public.my_trainer());

-- programación: entrenador todo; cliente solo lectura
create policy w_tr on public.workout_weeks for all to authenticated using (public.is_trainer_of(client_id)) with check (public.is_trainer_of(client_id));
create policy w_cl on public.workout_weeks for select to authenticated using (client_id=auth.uid());
create policy d_tr on public.workout_days for all to authenticated using (public.is_trainer_of(public.client_of_week(week_id))) with check (public.is_trainer_of(public.client_of_week(week_id)));
create policy d_cl on public.workout_days for select to authenticated using (public.client_of_week(week_id)=auth.uid());
create policy x_tr on public.workout_exercises for all to authenticated using (public.is_trainer_of(public.client_of_day(workout_day_id)))
  with check (public.is_trainer_of(public.client_of_day(workout_day_id)) and exists(select 1 from public.exercises e where e.id=exercise_id and e.trainer_id=auth.uid()));
create policy x_cl on public.workout_exercises for select to authenticated using (public.client_of_day(workout_day_id)=auth.uid());

-- registros: el cliente escribe los suyos; el entrenador solo lee
create policy s_cl_sel on public.workout_sessions for select to authenticated using (client_id=auth.uid());
create policy s_cl_ins on public.workout_sessions for insert to authenticated with check (client_id=auth.uid() and public.client_of_day(workout_day_id)=auth.uid());
create policy s_cl_upd on public.workout_sessions for update to authenticated using (client_id=auth.uid()) with check (client_id=auth.uid() and public.client_of_day(workout_day_id)=auth.uid());
create policy s_tr on public.workout_sessions for select to authenticated using (public.is_trainer_of(client_id));
create policy l_cl on public.set_logs for all to authenticated using (public.client_of_session(session_id)=auth.uid())
  with check (public.client_of_session(session_id)=auth.uid() and public.client_of_wex(workout_exercise_id)=auth.uid());
create policy l_tr on public.set_logs for select to authenticated using (public.is_trainer_of(public.client_of_session(session_id)));

-- Invitaciones: el cliente canjea un código y queda asignado (no puede elegir trainer_id)
create function public.accept_invitation(p_code text) returns void language plpgsql security definer set search_path=public as $$
declare i invitations;
begin
  select * into i from invitations where code=p_code and used_at is null and expires_at>now() for update;
  if not found then raise exception 'Invitación no válida o caducada'; end if;
  update profiles set trainer_id=i.trainer_id where id=auth.uid() and role='CLIENT' and trainer_id is null;
  if not found then raise exception 'La cuenta ya tiene entrenador'; end if;
  update invitations set used_by=auth.uid(), used_at=now() where id=i.id;
end $$;

-- Copiar semana → nueva semana (mismos días y ejercicios)
create function public.copy_week(p_week uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare w workout_weeks; nw uuid; d record; nd uuid;
begin
  select * into w from workout_weeks where id=p_week;
  if not found or not public.is_trainer_of(w.client_id) then raise exception 'No permitido'; end if;
  insert into workout_weeks(client_id,week_number,week_start)
  values(w.client_id,(select max(week_number)+1 from workout_weeks where client_id=w.client_id),w.week_start+7) returning id into nw;
  for d in select * from workout_days where week_id=p_week order by day_order loop
    insert into workout_days(week_id,day_name,title,day_order) values(nw,d.day_name,d.title,d.day_order) returning id into nd;
    insert into workout_exercises(workout_day_id,exercise_id,exercise_order,sets,reps_min,reps_max,rir_min,rir_max,trainer_notes)
      select nd,exercise_id,exercise_order,sets,reps_min,reps_max,rir_min,rir_max,trainer_notes from workout_exercises where workout_day_id=d.id;
  end loop;
  return nw;
end $$;

-- Biblioteca inicial de ejercicios
create function public.seed_default_exercises() returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_trainer() then raise exception 'No permitido'; end if;
  insert into exercises(trainer_id,name,muscle_group)
  select auth.uid(),n,g from (values ('Sentadilla','Pierna'),('Sentadilla búlgara','Pierna'),('Peso muerto','Pierna'),('Peso muerto rumano','Pierna'),
   ('Prensa','Pierna'),('Zancadas','Pierna'),('Curl femoral','Pierna'),('Hip thrust','Glúteo'),('Press banca','Pecho'),('Press inclinado','Pecho'),
   ('Aperturas de pecho','Pecho'),('Jalón al pecho','Espalda'),('Remo bilateral','Espalda'),('Curl de bíceps','Brazo'),('Extensión de tríceps','Brazo'),
   ('Fondos','Brazo')) v(n,g) on conflict do nothing;
end $$;

revoke execute on function public.accept_invitation, public.copy_week, public.seed_default_exercises from public, anon;
grant execute on function public.accept_invitation, public.copy_week, public.seed_default_exercises to authenticated;

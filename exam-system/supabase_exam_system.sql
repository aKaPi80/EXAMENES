-- BSKF Exam System schema, RLS and token RPCs.
-- Run this in Supabase SQL Editor for project zipfwmmwcawfbqofhwmc.

create extension if not exists pgcrypto;

create table if not exists public.professors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  club_name text not null,
  phone text,
  logo_url text,
  created_at timestamptz not null default now()
);

alter table public.professors add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.professors add column if not exists phone text;
alter table public.professors add column if not exists logo_url text;
create unique index if not exists professors_user_id_uidx on public.professors(user_id);
create unique index if not exists professors_email_uidx on public.professors(lower(email));

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professors(id) on delete cascade,
  title text not null,
  grade text not null check (grade in ('5kyu','4kyu','3kyu','2kyu','1kyu','shodan','nidan','sandan','yondan','godan')),
  techniques jsonb not null default '[]'::jsonb,
  pass_percentage integer not null default 65 check (pass_percentage between 40 and 90),
  status text not null default 'draft' check (status in ('draft','active','completed')),
  created_at timestamptz not null default now()
);

alter table public.exams add column if not exists professor_id uuid references public.professors(id) on delete cascade;
alter table public.exams add column if not exists title text;
alter table public.exams add column if not exists grade text;
alter table public.exams add column if not exists techniques jsonb not null default '[]'::jsonb;
alter table public.exams add column if not exists pass_percentage integer not null default 65;
alter table public.exams add column if not exists status text not null default 'draft';
alter table public.exams add column if not exists created_at timestamptz not null default now();
alter table public.exams alter column techniques type jsonb using techniques::jsonb;
create index if not exists exams_professor_id_idx on public.exams(professor_id);

create table if not exists public.exam_students (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_name text not null,
  student_belt_color text not null,
  order_number integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists exam_students_exam_id_idx on public.exam_students(exam_id);

create table if not exists public.examiners (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid not null references public.professors(id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists examiners_professor_email_uidx
on public.examiners(professor_id, lower(email));

create table if not exists public.exam_examiners (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  examiner_id uuid not null references public.examiners(id) on delete cascade,
  access_token text not null unique,
  access_url text,
  created_at timestamptz not null default now()
);

create index if not exists exam_examiners_exam_id_idx on public.exam_examiners(exam_id);
create index if not exists exam_examiners_examiner_id_idx on public.exam_examiners(examiner_id);

create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.exam_students(id) on delete cascade,
  exam_examiner_id uuid not null references public.exam_examiners(id) on delete cascade,
  examiner_id uuid not null references public.examiners(id) on delete cascade,
  technique_evaluations jsonb not null default '[]'::jsonb,
  technique_scores jsonb not null default '[]'::jsonb,
  total_score integer not null default 0,
  percentage numeric(5,2) not null default 0,
  passed boolean not null default false,
  submitted_at timestamptz not null default now()
);

alter table public.evaluations add column if not exists exam_id uuid references public.exams(id) on delete cascade;
alter table public.evaluations add column if not exists student_id uuid references public.exam_students(id) on delete cascade;
alter table public.evaluations add column if not exists exam_examiner_id uuid references public.exam_examiners(id) on delete cascade;
alter table public.evaluations add column if not exists examiner_id uuid references public.examiners(id) on delete cascade;
alter table public.evaluations add column if not exists technique_evaluations jsonb not null default '[]'::jsonb;
alter table public.evaluations add column if not exists technique_scores jsonb not null default '[]'::jsonb;
alter table public.evaluations add column if not exists total_score integer not null default 0;
alter table public.evaluations add column if not exists percentage numeric(5,2) not null default 0;
alter table public.evaluations add column if not exists passed boolean not null default false;
alter table public.evaluations add column if not exists submitted_at timestamptz not null default now();
alter table public.evaluations alter column technique_evaluations type jsonb using technique_evaluations::jsonb;
alter table public.evaluations alter column technique_scores type jsonb using technique_scores::jsonb;
create unique index if not exists evaluations_once_per_exam_student_examiner_uidx
on public.evaluations(exam_id, student_id, examiner_id);
create unique index if not exists evaluations_once_per_exam_student_link_uidx
on public.evaluations(exam_id, student_id, exam_examiner_id);
create index if not exists evaluations_exam_id_idx on public.evaluations(exam_id);

create or replace function public.handle_new_professor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.professors (user_id, email, name, club_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'club_name', 'Club BSKF')
  )
  on conflict (user_id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_professor on auth.users;
create trigger on_auth_user_created_create_professor
after insert on auth.users
for each row execute function public.handle_new_professor();

alter table public.professors enable row level security;
alter table public.exams enable row level security;
alter table public.exam_students enable row level security;
alter table public.examiners enable row level security;
alter table public.exam_examiners enable row level security;
alter table public.evaluations enable row level security;

drop policy if exists "professors_select_own" on public.professors;
drop policy if exists "professors_insert_own" on public.professors;
drop policy if exists "professors_update_own" on public.professors;
create policy "professors_select_own" on public.professors
for select to authenticated using (user_id = auth.uid());
create policy "professors_insert_own" on public.professors
for insert to authenticated with check (user_id = auth.uid());
create policy "professors_update_own" on public.professors
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "exams_professor_crud" on public.exams;
create policy "exams_professor_crud" on public.exams
for all to authenticated
using (exists (
  select 1 from public.professors p
  where p.id = exams.professor_id and p.user_id = auth.uid()
))
with check (exists (
  select 1 from public.professors p
  where p.id = exams.professor_id and p.user_id = auth.uid()
));

drop policy if exists "exam_students_professor_crud" on public.exam_students;
create policy "exam_students_professor_crud" on public.exam_students
for all to authenticated
using (exists (
  select 1 from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = exam_students.exam_id and p.user_id = auth.uid()
))
with check (exists (
  select 1 from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = exam_students.exam_id and p.user_id = auth.uid()
));

drop policy if exists "examiners_professor_crud" on public.examiners;
create policy "examiners_professor_crud" on public.examiners
for all to authenticated
using (exists (
  select 1 from public.professors p
  where p.id = examiners.professor_id and p.user_id = auth.uid()
))
with check (exists (
  select 1 from public.professors p
  where p.id = examiners.professor_id and p.user_id = auth.uid()
));

drop policy if exists "exam_examiners_professor_crud" on public.exam_examiners;
create policy "exam_examiners_professor_crud" on public.exam_examiners
for all to authenticated
using (exists (
  select 1 from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = exam_examiners.exam_id and p.user_id = auth.uid()
))
with check (exists (
  select 1 from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = exam_examiners.exam_id and p.user_id = auth.uid()
));

drop policy if exists "evaluations_professor_select" on public.evaluations;
create policy "evaluations_professor_select" on public.evaluations
for select to authenticated
using (exists (
  select 1 from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = evaluations.exam_id and p.user_id = auth.uid()
));

create or replace function public.get_examiner_exam_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.exam_examiners%rowtype;
  v_exam public.exams%rowtype;
  v_examiner public.examiners%rowtype;
  v_students jsonb;
  v_submitted boolean;
begin
  select * into v_link
  from public.exam_examiners
  where access_token = p_token;

  if not found then
    return null;
  end if;

  select * into v_exam from public.exams where id = v_link.exam_id and status = 'active';
  if not found then
    return null;
  end if;

  select * into v_examiner from public.examiners where id = v_link.examiner_id;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.order_number), '[]'::jsonb)
  into v_students
  from public.exam_students s
  where s.exam_id = v_exam.id;

  select exists (
    select 1 from public.evaluations
    where exam_id = v_exam.id
    and (examiner_id = v_examiner.id or exam_examiner_id = v_link.id)
  ) into v_submitted;

  return jsonb_build_object(
    'exam', jsonb_build_object(
      'id', v_exam.id,
      'title', v_exam.title,
      'grade', v_exam.grade,
      'techniques', v_exam.techniques,
      'pass_percentage', v_exam.pass_percentage
    ),
    'examiner', jsonb_build_object(
      'id', v_examiner.id,
      'name', v_examiner.name,
      'email', v_examiner.email
    ),
    'students', v_students,
    'submitted', v_submitted
  );
end;
$$;

create or replace function public.submit_examiner_evaluation(p_token text, p_evaluations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.exam_examiners%rowtype;
  v_exam public.exams%rowtype;
  v_item jsonb;
  v_techs jsonb;
  v_total integer;
  v_max integer;
  v_percentage numeric(5,2);
  v_passed boolean;
  v_student_id uuid;
begin
  select * into v_link
  from public.exam_examiners
  where access_token = p_token;

  if not found then
    raise exception 'Token inválido.';
  end if;

  select * into v_exam from public.exams where id = v_link.exam_id and status = 'active';
  if not found then
    raise exception 'El examen no está activo.';
  end if;

  if exists (
    select 1 from public.evaluations
    where exam_id = v_exam.id
    and (examiner_id = v_link.examiner_id or exam_examiner_id = v_link.id)
  ) then
    raise exception 'Esta evaluación ya fue enviada.';
  end if;

  for v_item in select * from jsonb_array_elements(p_evaluations)
  loop
    v_student_id := (v_item->>'student_id')::uuid;
    v_techs := coalesce(v_item->'technique_evaluations', '[]'::jsonb);

    if not exists (
      select 1 from public.exam_students
      where id = v_student_id and exam_id = v_exam.id
    ) then
      raise exception 'Estudiante inválido.';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(v_techs) t
      where coalesce((t->>'skipped')::boolean, false) = false
      and (
        t->>'score' is null
        or (t->>'score')::integer not in (0, 5, 10)
      )
    ) then
      raise exception 'Puntuación inválida.';
    end if;

    select
      coalesce(sum((t->>'score')::integer) filter (where coalesce((t->>'skipped')::boolean, false) = false), 0),
      count(*) filter (where coalesce((t->>'skipped')::boolean, false) = false) * 10
    into v_total, v_max
    from jsonb_array_elements(v_techs) t;

    v_percentage := case when v_max > 0 then round((v_total::numeric / v_max::numeric) * 100, 2) else 0 end;
    v_passed := v_percentage >= v_exam.pass_percentage;

    insert into public.evaluations (
      exam_id,
      student_id,
      exam_examiner_id,
      examiner_id,
      technique_evaluations,
      technique_scores,
      total_score,
      percentage,
      passed
    ) values (
      v_exam.id,
      v_student_id,
      v_link.id,
      v_link.examiner_id,
      v_techs,
      v_techs,
      v_total,
      v_percentage,
      v_passed
    );
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.get_examiner_exam_payload(text) to anon, authenticated;
grant execute on function public.submit_examiner_evaluation(text, jsonb) to anon, authenticated;

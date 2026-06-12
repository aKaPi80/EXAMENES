-- DAN tribunal final review support.
-- Run this in Supabase SQL Editor for project zipfwmmwcawfbqofhwmc.

create table if not exists public.tribunal_reviews (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references public.exam_students(id) on delete cascade,
  base_percentage numeric(6,2) not null default 0,
  adjustment_points numeric(6,2) not null default 0,
  adjustment_reason text,
  final_percentage numeric(6,2) not null default 0,
  final_passed boolean not null default false,
  reviewed_by uuid references public.professors(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_id, student_id)
);

alter table public.tribunal_reviews add column if not exists exam_id uuid references public.exams(id) on delete cascade;
alter table public.tribunal_reviews add column if not exists student_id uuid references public.exam_students(id) on delete cascade;
alter table public.tribunal_reviews add column if not exists base_percentage numeric(6,2) not null default 0;
alter table public.tribunal_reviews add column if not exists adjustment_points numeric(6,2) not null default 0;
alter table public.tribunal_reviews add column if not exists adjustment_reason text;
alter table public.tribunal_reviews add column if not exists final_percentage numeric(6,2) not null default 0;
alter table public.tribunal_reviews add column if not exists final_passed boolean not null default false;
alter table public.tribunal_reviews add column if not exists reviewed_by uuid references public.professors(id) on delete set null;
alter table public.tribunal_reviews add column if not exists reviewed_at timestamptz not null default now();
alter table public.tribunal_reviews add column if not exists created_at timestamptz not null default now();
alter table public.tribunal_reviews add column if not exists updated_at timestamptz not null default now();

create unique index if not exists tribunal_reviews_exam_student_uidx
on public.tribunal_reviews(exam_id, student_id);

create index if not exists tribunal_reviews_exam_id_idx
on public.tribunal_reviews(exam_id);

alter table public.tribunal_reviews enable row level security;

drop policy if exists "tribunal_reviews_professor_select" on public.tribunal_reviews;
drop policy if exists "tribunal_reviews_professor_insert" on public.tribunal_reviews;
drop policy if exists "tribunal_reviews_professor_update" on public.tribunal_reviews;

create policy "tribunal_reviews_professor_select" on public.tribunal_reviews
for select to authenticated
using (exists (
  select 1
  from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = tribunal_reviews.exam_id
    and p.user_id = auth.uid()
));

create policy "tribunal_reviews_professor_insert" on public.tribunal_reviews
for insert to authenticated
with check (exists (
  select 1
  from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = tribunal_reviews.exam_id
    and p.user_id = auth.uid()
));

create policy "tribunal_reviews_professor_update" on public.tribunal_reviews
for update to authenticated
using (exists (
  select 1
  from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = tribunal_reviews.exam_id
    and p.user_id = auth.uid()
))
with check (exists (
  select 1
  from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = tribunal_reviews.exam_id
    and p.user_id = auth.uid()
));

create or replace function public.upsert_tribunal_review(
  p_exam_id uuid,
  p_student_id uuid,
  p_base_percentage numeric,
  p_adjustment_points numeric,
  p_final_percentage numeric,
  p_final_passed boolean,
  p_adjustment_reason text
)
returns public.tribunal_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_professor_id uuid;
  v_review public.tribunal_reviews;
begin
  select p.id
  into v_professor_id
  from public.exams e
  join public.professors p on p.id = e.professor_id
  where e.id = p_exam_id
    and p.user_id = auth.uid();

  if v_professor_id is null then
    raise exception 'No tienes permiso para revisar este tribunal.';
  end if;

  if not exists (
    select 1
    from public.exam_students s
    where s.id = p_student_id
      and s.exam_id = p_exam_id
  ) then
    raise exception 'El alumno no pertenece a este examen.';
  end if;

  insert into public.tribunal_reviews (
    exam_id,
    student_id,
    base_percentage,
    adjustment_points,
    adjustment_reason,
    final_percentage,
    final_passed,
    reviewed_by,
    reviewed_at,
    updated_at
  )
  values (
    p_exam_id,
    p_student_id,
    greatest(0, least(100, coalesce(p_base_percentage, 0))),
    coalesce(p_adjustment_points, 0),
    nullif(trim(coalesce(p_adjustment_reason, '')), ''),
    greatest(0, least(100, coalesce(p_final_percentage, 0))),
    coalesce(p_final_passed, false),
    v_professor_id,
    now(),
    now()
  )
  on conflict (exam_id, student_id)
  do update set
    base_percentage = excluded.base_percentage,
    adjustment_points = excluded.adjustment_points,
    adjustment_reason = excluded.adjustment_reason,
    final_percentage = excluded.final_percentage,
    final_passed = excluded.final_passed,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = now(),
    updated_at = now()
  returning * into v_review;

  return v_review;
end;
$$;

grant execute on function public.upsert_tribunal_review(uuid, uuid, numeric, numeric, numeric, boolean, text)
to authenticated;

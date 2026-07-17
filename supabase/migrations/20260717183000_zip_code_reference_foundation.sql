create extension if not exists postgis with schema extensions;

create table ref.zip_code (
  zip_code text primary key,
  preferred_city text not null,
  state_code text not null,
  classification text not null,
  population integer,
  latitude double precision not null,
  longitude double precision not null,
  centroid extensions.geography(point, 4326)
    generated always as (
      extensions.st_setsrid(extensions.st_point(longitude, latitude), 4326)::extensions.geography
    ) stored,
  coordinate_source text not null,
  coordinate_method text not null,
  vendor_source_present boolean not null default true,
  hud_source_present boolean not null default false,
  source_coverage_date date,
  imported_at timestamptz not null default now(),
  constraint zip_code_format_ck check (zip_code ~ '^[0-9]{5}$'),
  constraint zip_code_state_ck check (state_code ~ '^[A-Z]{2}$'),
  constraint zip_code_classification_ck check (classification in ('STANDARD', 'PO_BOX', 'UNIQUE', 'MILITARY')),
  constraint zip_code_latitude_ck check (latitude between -90 and 90),
  constraint zip_code_longitude_ck check (longitude between -180 and 180),
  constraint zip_code_coordinate_source_ck check (coordinate_source in ('HUD', 'ZIP_CODES_COM')),
  constraint zip_code_coordinate_method_ck check (
    coordinate_method in ('POPULATION_WEIGHTED_RESIDENTIAL', 'VENDOR_CENTROID')
  )
);

comment on table ref.zip_code is
  'Canonical US ZIP reference. HUD population-weighted residential coordinates take precedence; vendor coordinates fill ZIPs outside HUD coverage.';

create index zip_code_centroid_gix on ref.zip_code using gist (centroid);
create index zip_code_state_city_idx on ref.zip_code (state_code, preferred_city);

create table ref.zip_city_alias (
  zip_code text not null references ref.zip_code(zip_code) on delete cascade,
  city text not null,
  state_code text not null,
  is_preferred boolean not null default false,
  source text not null default 'ZIP_CODES_COM',
  imported_at timestamptz not null default now(),
  primary key (zip_code, city, state_code),
  constraint zip_city_alias_state_ck check (state_code ~ '^[A-Z]{2}$'),
  constraint zip_city_alias_source_ck check (source in ('HUD', 'ZIP_CODES_COM'))
);

comment on table ref.zip_city_alias is
  'Mailing-city aliases are modeled separately so one ZIP remains one canonical spatial record.';

create unique index zip_city_alias_one_preferred_idx
  on ref.zip_city_alias (zip_code)
  where is_preferred;

alter table ref.zip_code enable row level security;
alter table ref.zip_city_alias enable row level security;

create policy zip_code_authenticated_read
  on ref.zip_code for select to authenticated using (true);

create policy zip_city_alias_authenticated_read
  on ref.zip_city_alias for select to authenticated using (true);

revoke all on ref.zip_code from anon, authenticated;
revoke all on ref.zip_city_alias from anon, authenticated;
grant select on ref.zip_code to authenticated;
grant select on ref.zip_city_alias to authenticated;
grant all on ref.zip_code to service_role;
grant all on ref.zip_city_alias to service_role;


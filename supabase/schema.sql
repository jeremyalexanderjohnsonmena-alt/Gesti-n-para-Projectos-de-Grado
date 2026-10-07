CREATE TABLE IF NOT EXISTS public.usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'docente' CHECK (role IN ('estudiante', 'docente')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'docente';

CREATE TABLE IF NOT EXISTS public.usuario_proyectos (
  username TEXT PRIMARY KEY REFERENCES public.usuarios(username) ON DELETE CASCADE,
  projects JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(projects) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuario_proyectos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.usuarios FROM anon, authenticated;
REVOKE ALL ON TABLE public.usuario_proyectos FROM anon, authenticated;
GRANT ALL ON TABLE public.usuarios, public.usuario_proyectos TO service_role;

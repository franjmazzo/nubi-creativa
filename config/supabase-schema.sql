-- Nubi Creativa — Supabase schema
-- Run in: Supabase Dashboard → SQL Editor → New Query → Paste & Run

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id              SERIAL PRIMARY KEY,
  slug            TEXT UNIQUE NOT NULL,
  order_index     INTEGER NOT NULL DEFAULT 0,
  gradient        TEXT NOT NULL DEFAULT 'linear-gradient(135deg,#1F67B0,#00D4FF)',
  category        TEXT NOT NULL DEFAULT 'diseno',
  published       BOOLEAN NOT NULL DEFAULT true,
  -- Spanish content
  es_tag          TEXT NOT NULL DEFAULT '',
  es_title        TEXT NOT NULL DEFAULT '',
  es_description  TEXT NOT NULL DEFAULT '',
  es_client       TEXT,
  es_year         TEXT,
  es_duration     TEXT,
  es_deliverables TEXT NOT NULL DEFAULT '[]',
  -- English content
  en_tag          TEXT NOT NULL DEFAULT '',
  en_title        TEXT NOT NULL DEFAULT '',
  en_description  TEXT NOT NULL DEFAULT '',
  en_client       TEXT,
  en_year         TEXT,
  en_duration     TEXT,
  en_deliverables TEXT NOT NULL DEFAULT '[]',
  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rate-limiting table (stores hashed IPs per hour)
CREATE TABLE IF NOT EXISTS rate_limits (
  id         SERIAL PRIMARY KEY,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contact form submissions log
CREATE TABLE IF NOT EXISTS contact_submissions (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  apellido   TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL,
  service    TEXT,
  message    TEXT NOT NULL,
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRM client database (deduplicated, upserted from contact form)
CREATE TABLE IF NOT EXISTS clientes (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  apellido   TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  servicio   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_created
  ON rate_limits (ip_hash, created_at);

CREATE INDEX IF NOT EXISTS idx_projects_published_order
  ON projects (published, order_index);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes            ENABLE ROW LEVEL SECURITY;

-- Public (anon key): can only read published projects
CREATE POLICY "Public read published projects"
  ON projects FOR SELECT
  USING (published = true);

-- Public (anon key): can insert rate_limits and contact_submissions
CREATE POLICY "Public insert rate_limits"
  ON rate_limits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public insert contact_submissions"
  ON contact_submissions FOR INSERT
  WITH CHECK (true);

-- Public: can read rate_limits (needed for rate-limit check query)
CREATE POLICY "Public read rate_limits"
  ON rate_limits FOR SELECT
  USING (true);

-- clientes: service key only (no public access)
CREATE POLICY "Service key clientes access"
  ON clientes USING (true) WITH CHECK (true);

-- Note: SUPABASE_SERVICE_KEY bypasses RLS — used by admin.js and contact.js for full access

-- ============================================================
-- SEED DATA (matches frontend fallback PROJECTS array)
-- ============================================================

INSERT INTO projects (
  slug, order_index, gradient, category,
  es_tag, es_title, es_description, es_client, es_year, es_duration, es_deliverables,
  en_tag, en_title, en_description, en_client, en_year, en_duration, en_deliverables
) VALUES
(
  'rebrand-identidad', 0,
  'linear-gradient(135deg,#0f1c35 0%,#16305a 45%,#1a4a7a 100%)', 'diseno',
  'Diseño', 'Rebrand Identidad Corporativa',
  'Transformación completa de la identidad visual de una marca consolidada del sector servicios. Desarrollamos un sistema de marca sólido: nuevo logo, paleta cromática, tipografía y lineamientos de uso para todos los puntos de contacto.',
  'Marca de Servicios', '2024', '6 semanas',
  '["Logo principal","Manual de marca","Paleta cromática","Tipografía","Papelería corporativa","Aplicaciones digitales"]',
  'Design', 'Corporate Identity Rebrand',
  'Complete visual identity transformation for an established services brand. We developed a solid brand system: new logo, color palette, typography and usage guidelines for all touchpoints.',
  'Services Brand', '2024', '6 weeks',
  '["Primary logo","Brand manual","Color palette","Typography","Corporate stationery","Digital applications"]'
),
(
  'campana-digital-360', 1,
  'linear-gradient(135deg,#0d1b2a 0%,#1a3f6e 45%,#1f67b0 100%)', 'marketing',
  'Marketing', 'Campaña Digital 360',
  'Estrategia integral de comunicación para el lanzamiento de un nuevo producto. Diseñamos y ejecutamos campañas en Meta Ads y Google Ads con contenido adaptado para cada plataforma y audiencia.',
  'Marca de Consumo', '2024', '3 meses',
  '["Estrategia de contenido","Piezas para Meta Ads","Campañas Google","Copywriting","Reportes de performance","Optimización continua"]',
  'Marketing', '360 Digital Campaign',
  'Comprehensive communication strategy for a new product launch. We designed and executed campaigns on Meta Ads and Google Ads with content tailored for each platform and audience.',
  'Consumer Brand', '2024', '3 months',
  '["Content strategy","Meta Ads creatives","Google campaigns","Copywriting","Performance reports","Ongoing optimization"]'
),
(
  'ecommerce-premium', 2,
  'linear-gradient(135deg,#0d1b2a 0%,#162032 45%,#1e2d42 100%)', 'web',
  'Web', 'E-commerce Premium',
  'Desarrollo de tienda online de alto rendimiento para marca de indumentaria premium. Diseño UX/UI orientado a conversión, integración con pasarela de pagos y optimización SEO completa.',
  'Marca de Moda', '2025', '10 semanas',
  '["Diseño UX/UI","Desarrollo frontend","Integración de pagos","Panel de administración","SEO técnico","Testing QA"]',
  'Web', 'Premium E-commerce',
  'High-performance online store development for a premium clothing brand. Conversion-oriented UX/UI design, payment gateway integration and full SEO optimization.',
  'Fashion Brand', '2025', '10 weeks',
  '["UX/UI Design","Frontend development","Payment integration","Admin panel","Technical SEO","QA Testing"]'
),
(
  'serie-contenido-video', 3,
  'linear-gradient(135deg,#1a0d2e 0%,#2d1b50 45%,#1f0d3a 100%)', 'audiovisual',
  'Audiovisual', 'Serie de Contenido Video',
  'Producción de serie de 12 episodios para redes sociales de una marca de fitness. Incluye preproducción, dirección creativa, filmación, edición y postproducción con motion graphics.',
  'Marca Fitness', '2024', '8 semanas',
  '["Guión y storyboard","Dirección creativa","Filmación","Edición y color","Motion graphics","Formatos para cada red"]',
  'Audiovisual', 'Video Content Series',
  'Production of a 12-episode series for a fitness brand''s social media. Includes pre-production, creative direction, filming, editing and post-production with motion graphics.',
  'Fitness Brand', '2024', '8 weeks',
  '["Script & storyboard","Creative direction","Filming","Editing & color grading","Motion graphics","Platform formats"]'
),
(
  'packaging-system', 4,
  'linear-gradient(135deg,#0a2218 0%,#0f3828 45%,#1a5c3e 100%)', 'diseno',
  'Diseño', 'Packaging System',
  'Sistema de packaging para línea de productos gourmet con 8 SKUs. Desarrollamos estructura, selección de materiales y diseño gráfico manteniendo coherencia visual en toda la línea.',
  'Marca Gourmet', '2025', '5 semanas',
  '["Concepto creativo","Diseño de packaging","Sistema de colores por línea","Archivos para impresión","Mockups de presentación","Guía de materiales"]',
  'Design', 'Packaging System',
  'Packaging system for a gourmet product line with 8 SKUs. We developed structure, material selection and graphic design maintaining visual consistency throughout the line.',
  'Gourmet Brand', '2025', '5 weeks',
  '["Creative concept","Packaging design","Color system per line","Print-ready files","Presentation mockups","Materials guide"]'
),
(
  'saas-landing-page', 5,
  'linear-gradient(135deg,#0d1b2a 0%,#0f2640 45%,#123552 100%)', 'web',
  'Web', 'SaaS Landing Page',
  'Landing page de alta conversión para producto SaaS B2B. Diseño orientado a leads con secciones de prueba social, pricing claro y demos interactivas. Tasa de conversión: 8.4%.',
  'Startup Tech', '2025', '3 semanas',
  '["Diseño UI","Copywriting","Desarrollo web","Animaciones GSAP","Optimización de velocidad","Configuración A/B testing"]',
  'Web', 'SaaS Landing Page',
  'High-conversion landing page for a B2B SaaS product. Lead-oriented design with social proof sections, clear pricing and interactive demos. Conversion rate: 8.4%.',
  'Tech Startup', '2025', '3 weeks',
  '["UI Design","Copywriting","Web development","GSAP animations","Speed optimization","A/B testing setup"]'
);

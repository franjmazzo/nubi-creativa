// Public read-only endpoint — returns published projects from Supabase
// Transforms DB rows to the frontend PROJECTS array format
// Env vars: SUPABASE_URL, SUPABASE_ANON_KEY

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'CMS not configured' }),
    };
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/projects?published=eq.true&order=order_index.asc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );

    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Database error' }),
      };
    }

    const rows = await res.json();

    const projects = rows.map(row => ({
      slug:     row.slug,
      gradient: row.gradient,
      category: row.category,
      es: {
        tag:         row.es_tag,
        title:       row.es_title,
        description: row.es_description,
        client:      row.es_client,
        year:        row.es_year,
        duration:    row.es_duration,
        deliverables: JSON.parse(row.es_deliverables || '[]'),
      },
      en: {
        tag:         row.en_tag,
        title:       row.en_title,
        description: row.en_description,
        client:      row.en_client,
        year:        row.en_year,
        duration:    row.en_duration,
        deliverables: JSON.parse(row.en_deliverables || '[]'),
      },
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
      body: JSON.stringify({ projects }),
    };
  } catch (err) {
    console.error('Projects fetch error:', err);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal error' }),
    };
  }
};

// Admin CRUD for projects — protected by ADMIN_SECRET header
// GET (list all), POST (create), PUT (update, body must include id), DELETE (?id=...), PATCH (reorder [{id,order_index}])
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, ADMIN_SECRET

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

function jsonRes(code, data) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

function supaHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function supaFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...supaHeaders(), ...(opts.headers || {}) },
  });
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' } };
  }

  // Auth check
  if (!ADMIN_SECRET || event.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return jsonRes(401, { error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return jsonRes(503, { error: 'Database not configured' });
  }

  const method   = event.httpMethod;
  const resource = event.queryStringParameters?.resource || 'projects';
  let body;
  if (event.body) {
    try { body = JSON.parse(event.body); }
    catch { return jsonRes(400, { error: 'Invalid JSON' }); }
  }

  try {
    // Clientes — read-only CRM list
    if (resource === 'clientes') {
      if (method !== 'GET') return jsonRes(405, { error: 'Method Not Allowed' });
      const res = await supaFetch('clientes?order=created_at.desc&select=*');
      return jsonRes(res.ok ? 200 : 502, await res.json());
    }

    // GET — list all projects (ordered)
    if (method === 'GET') {
      const res = await supaFetch('projects?order=order_index.asc');
      return jsonRes(res.ok ? 200 : 502, await res.json());
    }

    // POST — create project
    if (method === 'POST') {
      const orderRes = await supaFetch(
        'projects?select=order_index&order=order_index.desc&limit=1'
      );
      const orderRows = await orderRes.json();
      const newOrder = ((Array.isArray(orderRows) ? orderRows[0]?.order_index : null) ?? -1) + 1;
      const res = await supaFetch('projects', {
        method: 'POST',
        body: JSON.stringify({ ...body, order_index: newOrder }),
      });
      const data = await res.json();
      return jsonRes(res.ok ? 201 : 502, Array.isArray(data) ? data[0] : data);
    }

    // PUT — update project (body must include id)
    if (method === 'PUT') {
      const { id, ...updates } = body || {};
      if (!id) return jsonRes(400, { error: 'Missing id' });
      updates.updated_at = new Date().toISOString();
      const res = await supaFetch(`projects?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      return jsonRes(res.ok ? 200 : 502, Array.isArray(data) ? data[0] : data);
    }

    // DELETE — delete project by id query param
    if (method === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return jsonRes(400, { error: 'Missing id query param' });
      await supaFetch(`projects?id=eq.${id}`, { method: 'DELETE' });
      return jsonRes(200, { ok: true });
    }

    // PATCH — reorder: body = [{id, order_index}, ...]
    if (method === 'PATCH') {
      if (!Array.isArray(body)) {
        return jsonRes(400, { error: 'Expected array [{id, order_index}]' });
      }
      await Promise.all(
        body.map(({ id, order_index }) =>
          supaFetch(`projects?id=eq.${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ order_index }),
          })
        )
      );
      return jsonRes(200, { ok: true });
    }

    return jsonRes(405, { error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Admin error:', err);
    return jsonRes(500, { error: 'Internal server error' });
  }
};

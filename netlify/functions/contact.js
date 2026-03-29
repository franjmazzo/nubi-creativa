// Contact form handler
// Validates inputs, checks honeypot + rate limit via Supabase, stores submission, sends emails via Resend
// Env vars: RESEND_API_KEY, AGENCY_EMAIL, RESEND_FROM, SUPABASE_URL, SUPABASE_SERVICE_KEY, IP_SALT

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const AGENCY_EMAIL = process.env.AGENCY_EMAIL || 'nubicreativa@gmail.com';

function sanitize(val) {
  return String(val ?? '').trim().slice(0, 2000).replace(/<[^>]*>/g, '');
}

function jsonRes(code, data) {
  return {
    statusCode: code,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
}

async function hashIP(ip) {
  const salt = process.env.IP_SALT || 'nubi-salt-2025';
  const buf = new TextEncoder().encode(ip + salt);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

async function dbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...(opts.headers || {}),
    },
  });
  return res;
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) return;
  const from = process.env.RESEND_FROM || 'Nubi Creativa <onboarding@resend.dev>';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return jsonRes(400, { error: 'Invalid JSON' }); }

  // Honeypot: bots fill hidden fields, humans don't see them
  if (body._trap || body._website) {
    return jsonRes(200, { ok: true }); // silent success for bots
  }

  const name = sanitize(body.name);
  const apellido = sanitize(body.apellido);
  const email = sanitize(body.email);
  const service = sanitize(body.service);
  const message = sanitize(body.message);
  const phoneRaw = sanitize(body.phone);
  const phone = phoneRaw ? phoneRaw.replace(/[^\d\s+\-()]/g, '').trim() || null : null;

  if (!name || name.length < 2) return jsonRes(400, { error: 'Nombre inv\u00e1lido' });
  if (!apellido || apellido.length < 2) return jsonRes(400, { error: 'Apellido inv\u00e1lido' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonRes(400, { error: 'Email inv\u00e1lido' });
  if (!message || message.length < 10) return jsonRes(400, { error: 'Mensaje demasiado corto' });

  // Rate limiting via Supabase
  if (SUPABASE_URL && SUPABASE_KEY) {
    const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const ipHash = await hashIP(ip);
    const cutoff = new Date(Date.now() - 3_600_000).toISOString();

    const checkRes = await dbFetch(`rate_limits?ip_hash=eq.${ipHash}&created_at=gt.${cutoff}&select=id`);
    if (checkRes.ok) {
      const recent = await checkRes.json();
      if (Array.isArray(recent) && recent.length >= 3) {
        return jsonRes(429, { error: 'Demasiadas solicitudes. Intent\u00e1 m\u00e1s tarde.' });
      }
    }

    await Promise.all([
      dbFetch('rate_limits', { method: 'POST', body: JSON.stringify({ ip_hash: ipHash }) }),
      dbFetch('contact_submissions', {
        method: 'POST',
        body: JSON.stringify({ name, apellido, email, service: service || null, message, phone, ip_hash: ipHash }),
      }),
      dbFetch('clientes', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ nombre: name, apellido, email, servicio: service || null, phone, updated_at: new Date().toISOString() }),
      }),
    ]);
  }

  const serviceLabels = {
    diseno: 'Dise\u00f1o Gr\u00e1fico', marketing: 'Marketing Digital', web: 'Desarrollo Web',
    audiovisual: 'Producci\u00f3n Audiovisual', redes: 'Redes Sociales', otro: 'Otro',
  };
  const serviceLabel = serviceLabels[service] || service || '\u2014';

  // WhatsApp helpers
  const waNumber = phone ? phone.replace(/\D/g, '') : '';
  const waRow = phone
    ? `<tr><td style="padding:10px 12px;font-weight:600;background:#f8f9fa;border:1px solid #e0e0e0">Tel\u00e9fono</td><td style="padding:10px 12px;border:1px solid #e0e0e0"><a href="https://wa.me/${waNumber}" style="color:#25d366;font-weight:600">${phone}</a></td></tr>`
    : `<tr><td style="padding:10px 12px;font-weight:600;background:#f8f9fa;border:1px solid #e0e0e0">Tel\u00e9fono</td><td style="padding:10px 12px;border:1px solid #e0e0e0;color:#aaa">\u2014</td></tr>`;
  const waButton = phone
    ? `<a href="https://wa.me/${waNumber}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#25d366;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px">&#128172; WhatsApp cliente</a>`
    : `<span style="display:inline-block;margin-top:20px;padding:12px 24px;background:#ccc;color:#fff;border-radius:6px;font-weight:600;font-size:15px;cursor:not-allowed">&#128172; WhatsApp cliente</span>`;

  const agencyHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#1f67b0;margin-bottom:20px">Nuevo mensaje \u2014 nubicreativa.com</h2>
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        <tr><td style="padding:10px 12px;font-weight:600;width:110px;background:#f8f9fa;border:1px solid #e0e0e0">Nombre</td><td style="padding:10px 12px;border:1px solid #e0e0e0">${name} ${apellido}</td></tr>
        <tr><td style="padding:10px 12px;font-weight:600;background:#f8f9fa;border:1px solid #e0e0e0">Email</td><td style="padding:10px 12px;border:1px solid #e0e0e0"><a href="mailto:${email}" style="color:#1f67b0">${email}</a></td></tr>
        ${waRow}
        <tr><td style="padding:10px 12px;font-weight:600;background:#f8f9fa;border:1px solid #e0e0e0">Servicio</td><td style="padding:10px 12px;border:1px solid #e0e0e0">${serviceLabel}</td></tr>
        <tr><td style="padding:10px 12px;font-weight:600;vertical-align:top;background:#f8f9fa;border:1px solid #e0e0e0">Mensaje</td><td style="padding:10px 12px;white-space:pre-wrap;border:1px solid #e0e0e0">${message}</td></tr>
      </table>
      ${waButton}
    </div>`;

  const clientHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#1f67b0">\u00a1Recibimos tu mensaje, ${name}!</h2>
      <p style="color:#444;line-height:1.7;margin:16px 0">Gracias por escribirnos. Revisamos tu consulta y te respondemos en menos de 24 horas.</p>
      <p style="color:#444;line-height:1.7">Mientras tanto, pod\u00e9s explorar nuestro trabajo en
        <a href="https://nubicreativa.com" style="color:#1f67b0">nubicreativa.com</a>
        o seguirnos en
        <a href="https://instagram.com/nubi_creativa" style="color:#1f67b0">@nubi_creativa</a>.
      </p>
      <p style="color:#888;margin-top:28px;font-size:14px">\u2014 El equipo de Nubi Creativa</p>
    </div>`;

  await Promise.all([
    sendEmail(AGENCY_EMAIL, `Nuevo contacto: ${name} \u2014 ${serviceLabel}`, agencyHtml),
    sendEmail(email, `Recibimos tu mensaje, ${name} \u2713`, clientHtml),
  ]);

  return jsonRes(200, { ok: true });
};

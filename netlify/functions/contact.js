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

  const name     = sanitize(body.name);
  const apellido = sanitize(body.apellido);
  const email    = sanitize(body.email);
  const phone    = sanitize(body.phone).replace(/[^\d+\s\-().]/g, '').slice(0, 30);
  const service  = sanitize(body.service);
  const message  = sanitize(body.message);

  if (!name || name.length < 2)                              return jsonRes(400, { error: 'Nombre inválido' });
  if (!apellido || apellido.length < 2)                      return jsonRes(400, { error: 'Apellido inválido' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))  return jsonRes(400, { error: 'Email inválido' });
  if (!message || message.length < 10)                       return jsonRes(400, { error: 'Mensaje demasiado corto' });

  // Rate limiting via Supabase
  if (SUPABASE_URL && SUPABASE_KEY) {
    const ip = (event.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
    const ipHash = await hashIP(ip);
    const cutoff = new Date(Date.now() - 3_600_000).toISOString();

    const checkRes = await dbFetch(`rate_limits?ip_hash=eq.${ipHash}&created_at=gt.${cutoff}&select=id`);
    if (checkRes.ok) {
      const recent = await checkRes.json();
      if (Array.isArray(recent) && recent.length >= 3) {
        return jsonRes(429, { error: 'Demasiadas solicitudes. Intentá más tarde.' });
      }
    }

    await Promise.all([
      dbFetch('rate_limits', { method: 'POST', body: JSON.stringify({ ip_hash: ipHash }) }),
      dbFetch('contact_submissions', {
        method: 'POST',
        body: JSON.stringify({ name, apellido, email, phone: phone || null, service: service || null, message, ip_hash: ipHash }),
      }),
      dbFetch('clientes', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ nombre: name, apellido, email, phone: phone || null, servicio: service || null, updated_at: new Date().toISOString() }),
      }),
    ]);
  }

  const serviceLabels = {
    diseno: 'Diseño Gráfico', marketing: 'Marketing Digital', web: 'Desarrollo Web',
    audiovisual: 'Producción Audiovisual', redes: 'Redes Sociales', otro: 'Otro',
  };
  const serviceLabel = serviceLabels[service] || service || '—';

  const now = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const agencyHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#0D1B2A 0%,#1F67B0 60%,#00D4FF 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center">
        <div style="display:inline-block;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.35);border-radius:50px;padding:5px 16px;margin-bottom:14px">
          <span style="font-size:11px;font-weight:700;color:#00D4FF;text-transform:uppercase;letter-spacing:0.12em">🔔 Nueva consulta</span>
        </div>
        <div style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;margin-bottom:4px">Nubi<span style="color:#00D4FF">Creativa</span></div>
        <div style="font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:0.12em;text-transform:uppercase">Panel de notificaciones</div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:36px 40px 32px">

        <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#0D1B2A">Nuevo cliente potencial</h1>
        <p style="margin:0 0 24px;font-size:14px;color:#8a9ab0">${now} · Recibido desde nubicreativa.com</p>

        <!-- Contact card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px">
          <tr><td style="padding:20px 24px">
            <div style="font-size:11px;font-weight:700;color:#1F67B0;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px">Datos del contacto</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px 0;width:110px;font-size:12px;font-weight:700;color:#8a9ab0;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top">Nombre</td>
                <td style="padding:8px 0;font-size:15px;font-weight:700;color:#0D1B2A">${name} ${apellido}</td>
              </tr>
              <tr><td colspan="2" style="border-top:1px solid #e2e8f0"></td></tr>
              <tr>
                <td style="padding:8px 0;font-size:12px;font-weight:700;color:#8a9ab0;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top">Email</td>
                <td style="padding:8px 0">
                  <a href="mailto:${email}" style="font-size:15px;color:#1F67B0;font-weight:600;text-decoration:none">${email}</a>
                </td>
              </tr>
              <tr><td colspan="2" style="border-top:1px solid #e2e8f0"></td></tr>
              <tr>
                <td style="padding:8px 0;font-size:12px;font-weight:700;color:#8a9ab0;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top">Teléfono</td>
                <td style="padding:8px 0">
                  ${phone
                    ? `<a href="https://wa.me/${phone.replace(/[^\d]/g,'')}" style="font-size:15px;color:#25D366;font-weight:600;text-decoration:none">${phone}</a>`
                    : '<span style="color:#8a9ab0;font-size:14px">—</span>'
                  }
                </td>
              </tr>
              <tr><td colspan="2" style="border-top:1px solid #e2e8f0"></td></tr>
              <tr>
                <td style="padding:8px 0;font-size:12px;font-weight:700;color:#8a9ab0;text-transform:uppercase;letter-spacing:0.06em;vertical-align:top">Servicio</td>
                <td style="padding:8px 0">
                  ${serviceLabel !== '—' ? `<span style="display:inline-block;background:#e8f4ff;color:#1F67B0;padding:3px 12px;border-radius:20px;font-size:13px;font-weight:700">${serviceLabel}</span>` : '<span style="color:#8a9ab0;font-size:14px">—</span>'}
                </td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- Message -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px">
          <tr><td style="background:#0D1B2A;border-radius:12px;padding:20px 24px">
            <div style="font-size:11px;font-weight:700;color:#00D4FF;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px">Mensaje</div>
            <div style="font-size:15px;color:rgba(255,255,255,0.85);line-height:1.75;white-space:pre-wrap">${message}</div>
          </td></tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding-right:8px">
              <a href="mailto:${email}?subject=Re: tu consulta en Nubi Creativa" style="display:block;text-align:center;background:linear-gradient(135deg,#1F67B0,#00D4FF);color:#0D1B2A;font-weight:700;font-size:15px;padding:13px 20px;border-radius:50px;text-decoration:none">Responder ahora →</a>
            </td>
            <td style="padding-left:8px;width:160px">
              ${phone
                ? `<a href="https://wa.me/${phone.replace(/[^\d]/g,'')}?text=Hola%20${encodeURIComponent(name)}%2C%20te%20contactamos%20de%20Nubi%20Creativa..." style="display:block;text-align:center;background:#25D366;color:#ffffff;font-weight:700;font-size:14px;padding:13px 20px;border-radius:50px;text-decoration:none">WhatsApp cliente</a>`
                : `<a href="https://wa.me/5491132378410" style="display:block;text-align:center;background:rgba(37,211,102,0.15);color:#25D366;border:1px solid rgba(37,211,102,0.35);font-weight:700;font-size:14px;padding:13px 20px;border-radius:50px;text-decoration:none">Sin teléfono</a>`
              }
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0D1B2A;border-radius:0 0 16px 16px;padding:22px 40px;text-align:center">
        <div style="font-size:13px;color:rgba(255,255,255,0.3)">Nubi Creativa · Notificación interna · <a href="https://nubicreativa.com" style="color:#00D4FF;text-decoration:none">nubicreativa.com</a></div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  const clientHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:40px 0">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#0D1B2A 0%,#1F67B0 60%,#00D4FF 100%);border-radius:16px 16px 0 0;padding:40px 40px 36px;text-align:center">
        <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;margin-bottom:4px">Nubi<span style="color:#00D4FF">Creativa</span></div>
        <div style="font-size:12px;color:rgba(255,255,255,0.55);letter-spacing:0.15em;text-transform:uppercase">Agencia Digital · Buenos Aires</div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:40px 40px 32px">

        <!-- Greeting -->
        <h1 style="margin:0 0 8px;font-size:26px;font-weight:800;color:#0D1B2A;line-height:1.2">¡Hola, ${name}!</h1>
        <p style="margin:0 0 24px;font-size:16px;color:#1F67B0;font-weight:600">Recibimos tu mensaje. ✓</p>
        <p style="margin:0 0 28px;font-size:15px;color:#4a5568;line-height:1.75">
          Gracias por contactarnos. Ya tenemos tu consulta y nos ponemos a trabajar para darte la mejor respuesta posible.<br>
          <strong style="color:#0D1B2A">Te respondemos en menos de 24 horas.</strong>
        </p>

        <!-- Summary card -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8faff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:32px">
          <tr><td style="padding:20px 24px 16px">
            <div style="font-size:11px;font-weight:700;color:#1F67B0;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px">Resumen de tu consulta</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:7px 0;font-size:13px;color:#8a9ab0;font-weight:600;width:100px;vertical-align:top">Nombre</td>
                <td style="padding:7px 0;font-size:14px;color:#0D1B2A;font-weight:600">${name} ${apellido}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top:1px solid #e2e8f0"></td>
              </tr>
              <tr>
                <td style="padding:7px 0;font-size:13px;color:#8a9ab0;font-weight:600;vertical-align:top">Servicio</td>
                <td style="padding:7px 0;font-size:14px;color:#0D1B2A">${serviceLabel !== '—' ? `<span style="display:inline-block;background:#e8f4ff;color:#1F67B0;padding:2px 10px;border-radius:20px;font-size:13px;font-weight:600">${serviceLabel}</span>` : '<span style="color:#8a9ab0">—</span>'}</td>
              </tr>
              <tr>
                <td colspan="2" style="border-top:1px solid #e2e8f0"></td>
              </tr>
              <tr>
                <td style="padding:7px 0;font-size:13px;color:#8a9ab0;font-weight:600;vertical-align:top">Mensaje</td>
                <td style="padding:7px 0;font-size:14px;color:#4a5568;line-height:1.6;white-space:pre-wrap">${message}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- What happens next -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
          <tr>
            <td style="padding:0 0 12px">
              <div style="font-size:11px;font-weight:700;color:#1F67B0;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:14px">¿Qué pasa ahora?</div>
            </td>
          </tr>
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px">
                    <div style="width:28px;height:28px;background:linear-gradient(135deg,#1F67B0,#00D4FF);border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#0D1B2A">1</div>
                  </td>
                  <td style="padding:0 0 16px 10px;font-size:14px;color:#4a5568;line-height:1.6">Revisamos tu consulta y preparamos una respuesta personalizada.</td>
                </tr>
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px">
                    <div style="width:28px;height:28px;background:linear-gradient(135deg,#1F67B0,#00D4FF);border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#0D1B2A">2</div>
                  </td>
                  <td style="padding:0 0 16px 10px;font-size:14px;color:#4a5568;line-height:1.6">Te contactamos a <strong style="color:#0D1B2A">${email}</strong> con propuesta y próximos pasos.</td>
                </tr>
                <tr>
                  <td style="width:36px;vertical-align:top;padding-top:2px">
                    <div style="width:28px;height:28px;background:linear-gradient(135deg,#1F67B0,#00D4FF);border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#0D1B2A">3</div>
                  </td>
                  <td style="padding:0 0 0 10px;font-size:14px;color:#4a5568;line-height:1.6">Arrancamos a construir tu marca juntos. 🚀</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px">
          <tr>
            <td align="center">
              <a href="https://nubicreativa.com" style="display:inline-block;background:linear-gradient(135deg,#1F67B0,#00D4FF);color:#0D1B2A;font-weight:700;font-size:15px;padding:14px 36px;border-radius:50px;text-decoration:none;letter-spacing:0.02em">Ver nuestro portfolio →</a>
            </td>
          </tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#0D1B2A;border-radius:0 0 16px 16px;padding:28px 40px;text-align:center">
        <div style="font-size:16px;font-weight:800;color:#ffffff;margin-bottom:4px">Nubi<span style="color:#00D4FF">Creativa</span></div>
        <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:16px">Agencia digital en Buenos Aires</div>
        <table align="center" cellpadding="0" cellspacing="0" style="margin-bottom:16px">
          <tr>
            <td style="padding:0 8px">
              <a href="https://nubicreativa.com" style="font-size:13px;color:#00D4FF;text-decoration:none">nubicreativa.com</a>
            </td>
            <td style="color:rgba(255,255,255,0.2);font-size:13px">·</td>
            <td style="padding:0 8px">
              <a href="https://instagram.com/nubi_creativa" style="font-size:13px;color:#00D4FF;text-decoration:none">@nubi_creativa</a>
            </td>
            <td style="color:rgba(255,255,255,0.2);font-size:13px">·</td>
            <td style="padding:0 8px">
              <a href="mailto:nubicreativa@gmail.com" style="font-size:13px;color:#00D4FF;text-decoration:none">nubicreativa@gmail.com</a>
            </td>
          </tr>
        </table>
        <div style="font-size:11px;color:rgba(255,255,255,0.2)">Este email fue enviado porque completaste el formulario de contacto en nubicreativa.com</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  await Promise.all([
    sendEmail(AGENCY_EMAIL, `Nuevo contacto: ${name} — ${serviceLabel}`, agencyHtml),
    sendEmail(email, `Recibimos tu mensaje, ${name} ✓`, clientHtml),
  ]);

  return jsonRes(200, { ok: true });
};

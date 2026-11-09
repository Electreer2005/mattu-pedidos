import { env } from 'cloudflare:workers';
import { getTeamUser } from '../../team-auth';

const allowedStatuses = ['Recibido', 'Presupuestando', 'Aprobado', 'En elaboración', 'Preparando', 'Listo', 'Enviado', 'Entregado', 'Cancelado'];

async function notifyCustomerStatus(order: any) {
  try {
    const mail = env as unknown as { RESEND_API_KEY?: string; MAIL_FROM?: string; PUBLIC_ORIGIN?: string };
    if (!mail.RESEND_API_KEY || !mail.MAIL_FROM) return;
    const customer: any = await env.DB!.prepare(
      'SELECT u.email,u.name FROM customer_users u JOIN customer_order_links l ON l.user_id=u.id WHERE l.order_id=?'
    ).bind(order.id).first();
    if (!customer?.email) return;

    const origin = mail.PUBLIC_ORIGIN || 'https://mattu-app.vercel.app';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + mail.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mail.MAIL_FROM,
        to: [customer.email],
        subject: 'Tu pedido ' + (order.number || order.id) + ' cambió de estado',
        text: 'Hola ' + customer.name + '. El estado de tu pedido ' + (order.number || order.id) + ' ahora es: ' + order.status + '. Podés consultar el seguimiento en ' + origin + '/mis-pedidos.',
        html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#29231f"><h1 style="color:#72533d">Actualización de tu pedido</h1><p>Hola ' + String(customer.name).replace(/[&<>"']/g, (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)) + '.</p><p>El estado de tu pedido <strong>' + String(order.number || order.id) + '</strong> cambió a:</p><p style="font-size:20px"><strong>' + String(order.status) + '</strong></p><p><a href="' + origin + '/mis-pedidos" style="display:inline-block;padding:12px 18px;background:#72533d;color:#fff;text-decoration:none;border-radius:8px">Ver mis pedidos</a></p></div>',
      }),
    });
    if (!response.ok) console.error('No se pudo enviar el aviso de estado de pedido.');
  } catch (error) {
    console.error('Falló el aviso de estado de pedido:', error);
  }
}

export async function GET(req: Request) {
  if (!await getTeamUser()) return Response.json({ error: 'Iniciá sesión para sincronizar.' }, { status: 401 });
  const includeArchived = new URL(req.url).searchParams.get('includeArchived') === '1';
  const rows = await env.DB!.prepare('SELECT * FROM orders ORDER BY updated_at DESC').all();
  const orders = rows.results.map((row: any) => ({ ...JSON.parse(row.data), revision: row.revision }));
  return Response.json(includeArchived ? orders : orders.filter((order: any) => !order.deletedAt), {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function POST(req: Request) {
  const user = await getTeamUser();
  if (!user) return Response.json({ error: 'Iniciá sesión para sincronizar.' }, { status: 401 });

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Datos inválidos' }, { status: 400 }); }

  const order = body.order;
  if (
    !order || typeof order.id !== 'string' || order.id.length > 100 ||
    typeof order.customer !== 'string' || !order.customer.trim() ||
    !Array.isArray(order.items) || !order.items.length || order.items.length > 100 ||
    !allowedStatuses.includes(order.status) ||
    order.items.some((item: any) => !item.description?.trim() || !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.price) || item.price < 0) ||
    !Number.isFinite(order.deposit) || order.deposit < 0 ||
    order.deposit > order.items.reduce((sum: number, item: any) => sum + item.qty * item.price, 0) ||
    !Array.isArray(order.history)
  ) {
    return Response.json({ error: 'Revisá los datos de la orden.' }, { status: 400 });
  }

  const previousRow: any = await env.DB!.prepare('SELECT data FROM orders WHERE id=?').bind(order.id).first();
  const previousOrder = previousRow?.data ? JSON.parse(previousRow.data) : null;
  if (previousOrder?.deletedAt) return Response.json({ error: 'Este pedido está archivado y no puede modificarse desde la sincronización.' }, { status: 410 });
  const timestamp = new Date().toISOString();
  if (order.history.length) order.history[order.history.length - 1].actor = user.email;
  const data = JSON.stringify({ ...order, updatedAt: timestamp, updatedBy: user.email, pending: false });
  if (data.length > 150000) return Response.json({ error: 'Orden demasiado grande' }, { status: 400 });

  let result: any;
  if (body.base === 0) {
    result = await env.DB!.prepare('INSERT INTO orders(id,data,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(id) DO NOTHING')
      .bind(order.id, data, timestamp).run();
  } else {
    result = await env.DB!.prepare('UPDATE orders SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
      .bind(data, timestamp, order.id, body.base).run();
  }

  if (!result.meta.changes) {
    return Response.json({ error: 'Este pedido cambió en otro dispositivo. Revisá ambas versiones.' }, { status: 409 });
  }

  if (previousOrder && previousOrder.status !== order.status) {
    await notifyCustomerStatus({ ...order, updatedAt: timestamp });
  }

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getTeamUser();
  if (!user) return Response.json({ error: 'Iniciá sesión para eliminar pedidos.' }, { status: 401 });
  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'Solicitud inválida.' }, { status: 400 }); }
  if (typeof body.id !== 'string' || !body.id.trim() || body.id.length > 100) {
    return Response.json({ error: 'Identificador de pedido inválido.' }, { status: 400 });
  }
  const row: any = await env.DB!.prepare('SELECT data,revision FROM orders WHERE id=?').bind(body.id).first();
  if (!row) return Response.json({ error: 'El pedido no existe.' }, { status: 404 });
  const order = JSON.parse(row.data);
  if (order.deletedAt) return Response.json({ ok: true, archived: true });
  const timestamp = new Date().toISOString();
  const archived = { ...order, deletedAt: timestamp, deletedBy: user.email, updatedAt: timestamp, updatedBy: user.email };
  const result = await env.DB!.prepare('UPDATE orders SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
    .bind(JSON.stringify(archived), timestamp, body.id, row.revision).run();
  if (!result.meta.changes) return Response.json({ error: 'El pedido cambió en otro dispositivo. Actualizá e intentá nuevamente.' }, { status: 409 });
  return Response.json({ ok: true, archived: true });
}

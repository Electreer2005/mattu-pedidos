import { env } from 'cloudflare:workers';
import { getTeamUser } from '../../../../team-auth';

export async function GET() {
  if (!await getTeamUser()) return Response.json({ error: 'Iniciá sesión.' }, { status: 401 });
  const rows = await env.DB!.prepare('SELECT id,data FROM catalog_products WHERE active=1 ORDER BY updated_at DESC').all();
  return Response.json({ products: rows.results.map((row: any) => {
    const product = JSON.parse(row.data);
    return { id: row.id, name: product.name || product.title || 'Producto', price: Number(product.price) || 0 };
  }) }, { headers: { 'Cache-Control': 'no-store' } });
}

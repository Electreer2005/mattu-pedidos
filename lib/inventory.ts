type D1 = any;
const stamp = () => new Date().toISOString();
const id = () => crypto.randomUUID();

export async function inventoryStatements(db: D1, order: any, previous: any, actor: string, at: string) {
  const statements: any[] = [];
  const lines = Array.isArray(order.items) ? order.items : [];
  const oldLines = new Map<string, any>();
  const existing = await db.prepare('SELECT * FROM inventory_order_lines WHERE order_id=?').bind(order.id).all();
  for (const row of existing.results || []) oldLines.set(row.line_key, row);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const productId = typeof line.productId === 'string' ? line.productId : '';
    if (!productId) continue; // Free-text/custom work never consumes stock automatically.
    const lineKey = typeof line.id === 'string' && line.id ? line.id : productId + ':' + index;
    let tracked = oldLines.get(lineKey);
    const qty = Number(line.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    if (order.status === 'Aprobado' && !tracked) {
      const stock = await db.prepare('SELECT on_hand,reserved FROM inventory_finished_stock WHERE product_id=?').bind(productId).first();
      const onHand = Number(stock?.on_hand || 0), reserved = Number(stock?.reserved || 0);
      const canReserve = onHand - reserved >= qty;
      const state = canReserve ? 'reserved' : 'planned';
      if (canReserve) {
        statements.push(db.prepare('INSERT INTO inventory_finished_stock(product_id,on_hand,reserved,updated_at) VALUES(?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET reserved=inventory_finished_stock.reserved+excluded.reserved,updated_at=excluded.updated_at').bind(productId, onHand, qty, at));
        statements.push(db.prepare("INSERT INTO inventory_movements(id,entity_type,entity_id,movement_type,quantity,reference_type,reference_id,note,created_by,created_at) VALUES(?,'finished_product',?,'reservation',?,'order',?,?,?,?)").bind(id(), productId, qty, order.id, 'Reserva de pedido ' + (order.number || order.id), actor, at));
      }
      statements.push(db.prepare('INSERT INTO inventory_order_lines(order_id,line_key,product_id,quantity,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(order.id, lineKey, productId, qty, state, at, at));
      tracked = { status: state, quantity: qty, product_id: productId };
    }

    if (!tracked) continue;
    if (order.status === 'Cancelado' && ['reserved','planned','consumed','produced'].includes(tracked.status)) {
      if (tracked.status === 'reserved') {
        statements.push(db.prepare('UPDATE inventory_finished_stock SET reserved=MAX(0,reserved-?),updated_at=? WHERE product_id=?').bind(tracked.quantity, at, productId));
        statements.push(db.prepare("INSERT INTO inventory_movements(id,entity_type,entity_id,movement_type,quantity,reference_type,reference_id,note,created_by,created_at) VALUES(?,'finished_product',?,'release',?,'order',?,?,?,?)").bind(id(), productId, tracked.quantity, order.id, 'Liberación por cancelación ' + (order.number || order.id), actor, at));
      }
      statements.push(db.prepare("UPDATE inventory_order_lines SET status='released',updated_at=? WHERE order_id=? AND line_key=?").bind(at, order.id, lineKey));
      continue;
    }

    if (order.status === 'En elaboración' && tracked.status === 'planned') {
      const recipe = await db.prepare('SELECT id,output_quantity FROM inventory_recipes WHERE product_id=?').bind(productId).first();
      if (recipe) {
        const parts = await db.prepare('SELECT material_id,quantity FROM inventory_recipe_items WHERE recipe_id=?').bind(recipe.id).all();
        const needs = (parts.results || []).map((part: any) => ({...part, required: Number(part.quantity) * qty / Number(recipe.output_quantity)}));
        for (const part of needs) {
          const material = await db.prepare('SELECT name,stock_quantity,unit FROM inventory_materials WHERE id=? AND active=1').bind(part.material_id).first();
          if (!material || Number(material.stock_quantity) < part.required) throw new Error('Stock insuficiente de ' + (material?.name || 'una materia prima') + ' para fabricar ' + (line.description || 'el producto') + '.');
        }
        for (const part of needs) {
          statements.push(db.prepare('UPDATE inventory_materials SET stock_quantity=stock_quantity-?,updated_at=? WHERE id=? AND stock_quantity>=?').bind(part.required, at, part.material_id, part.required));
          statements.push(db.prepare("INSERT INTO inventory_movements(id,entity_type,entity_id,movement_type,quantity,reference_type,reference_id,note,created_by,created_at) VALUES(?,'material',?,'consumption',?,'order',?,?,?,?)").bind(id(), part.material_id, part.required, order.id, 'Consumo para pedido ' + (order.number || order.id), actor, at));
        }
      }
      statements.push(db.prepare("UPDATE inventory_order_lines SET status='consumed',updated_at=? WHERE order_id=? AND line_key=? AND status='planned'").bind(at, order.id, lineKey));
      tracked.status = 'consumed';
    }

    if (order.status === 'Listo' && ['planned','consumed'].includes(tracked.status)) {
      const stock = await db.prepare('SELECT on_hand,reserved FROM inventory_finished_stock WHERE product_id=?').bind(productId).first();
      statements.push(db.prepare('INSERT INTO inventory_finished_stock(product_id,on_hand,reserved,updated_at) VALUES(?,?,0,?) ON CONFLICT(product_id) DO UPDATE SET on_hand=inventory_finished_stock.on_hand+excluded.on_hand,updated_at=excluded.updated_at').bind(productId, qty, at));
      statements.push(db.prepare("INSERT INTO inventory_movements(id,entity_type,entity_id,movement_type,quantity,reference_type,reference_id,note,created_by,created_at) VALUES(?,'finished_product',?,'production',?,'order',?,?,?,?)").bind(id(), productId, qty, order.id, 'Producción terminada · pedido ' + (order.number || order.id), actor, at));
      statements.push(db.prepare("UPDATE inventory_order_lines SET status='produced',updated_at=? WHERE order_id=? AND line_key=? AND status IN ('planned','consumed')").bind(at, order.id, lineKey));
      tracked.status = 'produced';
    }

    if (['Enviado','Entregado'].includes(order.status) && ['reserved','produced'].includes(tracked.status)) {
      if (tracked.status === 'reserved') {
        statements.push(db.prepare('UPDATE inventory_finished_stock SET on_hand=on_hand-?,reserved=reserved-?,updated_at=? WHERE product_id=? AND on_hand>=? AND reserved>=?').bind(tracked.quantity, tracked.quantity, at, productId, tracked.quantity, tracked.quantity));
      } else {
        statements.push(db.prepare('UPDATE inventory_finished_stock SET on_hand=on_hand-?,updated_at=? WHERE product_id=? AND on_hand>=?').bind(tracked.quantity, at, productId, tracked.quantity));
      }
      statements.push(db.prepare("INSERT INTO inventory_movements(id,entity_type,entity_id,movement_type,quantity,reference_type,reference_id,note,created_by,created_at) VALUES(?,'finished_product',?,'dispatch',?,'order',?,?,?,?)").bind(id(), productId, tracked.quantity, order.id, 'Salida por pedido ' + (order.number || order.id), actor, at));
      statements.push(db.prepare("UPDATE inventory_order_lines SET status='dispatched',updated_at=? WHERE order_id=? AND line_key=? AND status IN ('reserved','produced')").bind(at, order.id, lineKey));
    }
  }
  return statements;
}

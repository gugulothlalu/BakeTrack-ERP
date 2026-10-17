import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { pool } from './db.js';

dotenv.config();
const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

const MAX_LEN = { material_name: 120, lot_code: 80, supplier: 160, batch_code: 80, product_name: 120, recipe_code: 80, recipe_name: 120, check_name: 120 };
function validText(value, max) { return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max; }
function dbFailure(e, fallback, duplicateMessage) {
  if (e?.code === 'ER_DUP_ENTRY') return { status: 409, error: duplicateMessage || 'Duplicate value already exists.' };
  if (e?.code === 'ER_DATA_TOO_LONG') return { status: 400, error: 'One or more values exceed the allowed length.' };
  if (e?.code === 'ER_NO_REFERENCED_ROW_2') return { status: 400, error: 'Referenced record does not exist.' };
  console.error(e);
  return { status: 500, error: fallback };
}

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, service: 'BakeTrack API' }); }
  catch { res.status(500).json({ ok: false, error: 'Database connection failed. Check server/.env and schema.sql.' }); }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const [[batches]] = await pool.query(`SELECT COUNT(*) total,
      SUM(status='quality_hold') quality_hold,
      SUM(status='approved') approved,
      COALESCE(SUM(planned_qty_kg),0) planned,
      COALESCE(SUM(actual_qty_kg),0) actual
      FROM production_batches WHERE production_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`);
    const [[inventory]] = await pool.query(`SELECT COUNT(*) lot_count,
      COALESCE(SUM(quantity_kg),0) stock_kg,
      SUM(expiry_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)) expiring_soon
      FROM material_lots WHERE quantity_kg > 0`);
    const [[waste]] = await pool.query(`SELECT COALESCE(SUM(quantity_kg),0) waste_kg FROM waste_entries WHERE logged_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
    const [[quality]] = await pool.query(`SELECT COUNT(*) checks_total, SUM(result='fail') failures FROM quality_checks WHERE checked_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
    res.json({ batches, inventory, waste, quality });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load dashboard' }); }
});

app.get('/api/inventory', async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT *, DATEDIFF(expiry_date, CURDATE()) days_to_expiry
      FROM material_lots ORDER BY expiry_date ASC`);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load inventory' }); }
});

app.post('/api/inventory', async (req, res) => {
  const { material_name, lot_code, quantity_kg, received_date, expiry_date, supplier } = req.body;
  if (!validText(material_name, MAX_LEN.material_name) || !validText(lot_code, MAX_LEN.lot_code) ||
      !validText(received_date, 10) || !validText(expiry_date, 10) || !validText(supplier, MAX_LEN.supplier) ||
      !Number.isFinite(Number(quantity_kg)) || Number(quantity_kg) < 0 || Number(quantity_kg) > 99999999.99 || expiry_date < received_date) {
    return res.status(400).json({ error: `Enter valid material (<=${MAX_LEN.material_name} chars), lot (<=${MAX_LEN.lot_code}), quantity, dates, and supplier (<=${MAX_LEN.supplier}).` });
  }
  try {
    const [result] = await pool.query(`INSERT INTO material_lots (material_name,lot_code,quantity_kg,received_date,expiry_date,supplier) VALUES (?,?,?,?,?,?)`,
      [material_name.trim(), lot_code.trim(), Number(quantity_kg), received_date, expiry_date, supplier.trim()]);
    res.status(201).json({ id: result.insertId, message: 'Material lot added' });
  } catch (e) { const f = dbFailure(e, 'Could not add material lot.', 'Lot code already exists.'); res.status(f.status).json({ error: f.error }); }
});

app.get('/api/batches', async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT b.*,
      COALESCE(w.waste_kg, 0) waste_kg,
      COALESCE(q.failed_checks, 0) failed_checks,
      COALESCE(o.open_failed_checks, 0) open_failed_checks
      FROM production_batches b
      LEFT JOIN (SELECT batch_id, SUM(quantity_kg) waste_kg FROM waste_entries GROUP BY batch_id) w ON w.batch_id = b.id
      LEFT JOIN (SELECT batch_id, SUM(result='fail') failed_checks FROM quality_checks GROUP BY batch_id) q ON q.batch_id = b.id
      LEFT JOIN (
        SELECT batch_id, SUM(result='fail') open_failed_checks FROM (
          SELECT batch_id, check_name, result,
            ROW_NUMBER() OVER (PARTITION BY batch_id, check_name ORDER BY checked_at DESC, id DESC) rn
          FROM quality_checks
        ) latest WHERE latest.rn = 1 GROUP BY batch_id
      ) o ON o.batch_id = b.id
      ORDER BY b.production_date DESC, b.id DESC`);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load batches' }); }
});

app.post('/api/batches', async (req, res) => {
  const { batch_code, product_name, planned_qty_kg, production_date } = req.body;
  if (!validText(batch_code, MAX_LEN.batch_code) || !validText(product_name, MAX_LEN.product_name) || !validText(production_date, 10) ||
      !Number.isFinite(Number(planned_qty_kg)) || Number(planned_qty_kg) <= 0 || Number(planned_qty_kg) > 99999999.99) {
    return res.status(400).json({ error: `Enter valid batch code (<=${MAX_LEN.batch_code} chars), product (<=${MAX_LEN.product_name}), planned quantity, and date.` });
  }
  try {
    const [result] = await pool.query(`INSERT INTO production_batches (batch_code,product_name,planned_qty_kg,production_date,status) VALUES (?,?,?,?, 'planned')`,
      [batch_code.trim(), product_name.trim(), Number(planned_qty_kg), production_date]);
    res.status(201).json({ id: result.insertId, message: 'Production batch created' });
  } catch (e) { const f = dbFailure(e, 'Could not create batch.', 'Batch code already exists.'); res.status(f.status).json({ error: f.error }); }
});

app.post('/api/batches/:id/quality-checks', async (req, res) => {
  const { check_name, result, notes = '' } = req.body;
  if (!validText(check_name, MAX_LEN.check_name) || !['pass','fail'].includes(result)) return res.status(400).json({ error: `Check name (max ${MAX_LEN.check_name} chars) and pass/fail result are required.` });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [batchRows] = await conn.query('SELECT id, status FROM production_batches WHERE id=? FOR UPDATE', [req.params.id]);
    if (!batchRows.length) { await conn.rollback(); return res.status(404).json({ error: 'Batch not found.' }); }
    const currentStatus = batchRows[0].status;
    if (currentStatus === 'rejected' || currentStatus === 'dispatched') { await conn.rollback(); return res.status(409).json({ error: `Cannot record a quality check for a ${currentStatus} batch.` }); }
    await conn.query('INSERT INTO quality_checks (batch_id,check_name,result,notes) VALUES (?,?,?,?)',
      [req.params.id, check_name.trim(), result, String(notes).slice(0,500)]);
    let message = 'Passed check recorded. Batch status unchanged; use release to approve.';
    if (result === 'fail') {
      await conn.query('UPDATE production_batches SET status=? WHERE id=?', ['quality_hold', req.params.id]);
      message = 'Failed check recorded; batch placed on quality hold.';
    }
    await conn.commit();
    res.status(201).json({ message });
  } catch (e) { await conn.rollback(); console.error(e); res.status(500).json({ error: 'Could not save quality check.' }); }
  finally { conn.release(); }
});

const OPEN_FAILURES_SQL = `SELECT COUNT(*) open_failures FROM (
  SELECT result, ROW_NUMBER() OVER (PARTITION BY check_name ORDER BY checked_at DESC, id DESC) rn
  FROM quality_checks WHERE batch_id=?
) latest WHERE latest.rn = 1 AND latest.result = 'fail'`;

app.post('/api/batches/:id/complete', async (req, res) => {
  const batchId = Number(req.params.id);
  const qty = Number(req.body.actual_qty_kg);
  if (!Number.isInteger(batchId) || batchId < 1) return res.status(400).json({ error: 'Invalid batch id.' });
  if (!Number.isFinite(qty) || qty <= 0 || qty > 99999999.99) return res.status(400).json({ error: 'Enter a positive actual output up to 99,999,999.99 kg.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, status FROM production_batches WHERE id=? FOR UPDATE', [batchId]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Batch not found.' }); }
    const status = rows[0].status;
    if (!['planned','in_production','completed','quality_hold'].includes(status)) { await conn.rollback(); return res.status(409).json({ error: `Cannot complete a ${status} batch.` }); }
    const nextStatus = status === 'quality_hold' ? 'quality_hold' : 'completed';
    await conn.query('UPDATE production_batches SET actual_qty_kg=?, completed_at=NOW(), status=? WHERE id=?', [qty, nextStatus, batchId]);
    await conn.commit();
    res.json({ message: status === 'quality_hold' ? `Actual output updated to ${qty} kg; batch remains on quality hold.` : `Batch completed with ${qty} kg actual output.`, status: nextStatus });
  } catch (e) { await conn.rollback(); console.error(e); res.status(500).json({ error: 'Could not complete batch.' }); }
  finally { conn.release(); }
});

app.post('/api/batches/:id/release', async (req, res) => {
  const batchId = Number(req.params.id);
  const { release_note, acknowledge_failures = false } = req.body;
  if (!Number.isInteger(batchId) || batchId < 1) return res.status(400).json({ error: 'Invalid batch id.' });
  if (typeof release_note !== 'string' || release_note.trim().length < 3 || release_note.trim().length > 500) return res.status(400).json({ error: 'A release note of 3-500 characters is required.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, status, actual_qty_kg FROM production_batches WHERE id=? FOR UPDATE', [batchId]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Batch not found.' }); }
    const batch = rows[0];
    if (!['in_production','completed','quality_hold'].includes(batch.status)) { await conn.rollback(); return res.status(409).json({ error: `Cannot release a ${batch.status} batch.` }); }
    if (Number(batch.actual_qty_kg) <= 0) { await conn.rollback(); return res.status(409).json({ error: 'Record actual output (complete the batch) before release.' }); }
    const [[checkCount]] = await conn.query('SELECT COUNT(*) checks FROM quality_checks WHERE batch_id=?', [batchId]);
    if (Number(checkCount.checks) < 1) { await conn.rollback(); return res.status(409).json({ error: 'Record at least one quality check before release.' }); }
    const [[openRow]] = await conn.query(OPEN_FAILURES_SQL, [batchId]);
    const openFailures = Number(openRow.open_failures);
    if (openFailures > 0 && acknowledge_failures !== true) { await conn.rollback(); return res.status(409).json({ error: `Release blocked: ${openFailures} open failed check(s). Re-inspect or resend with acknowledge_failures=true.` }); }
    const note = openFailures > 0 ? `${release_note.trim()} [acknowledged ${openFailures} open failed check(s)]` : release_note.trim();
    await conn.query('UPDATE production_batches SET status=?, status_note=? WHERE id=?', ['approved', note.slice(0,500), batchId]);
    await conn.commit();
    res.json({ message: 'Batch released and approved.', status: 'approved' });
  } catch (e) { await conn.rollback(); console.error(e); res.status(500).json({ error: 'Could not release batch.' }); }
  finally { conn.release(); }
});

app.post('/api/batches/:id/reject', async (req, res) => {
  const batchId = Number(req.params.id);
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!Number.isInteger(batchId) || batchId < 1) return res.status(400).json({ error: 'Invalid batch id.' });
  if (reason.length < 3 || reason.length > 500) return res.status(400).json({ error: 'A rejection reason of 3-500 characters is required.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, status FROM production_batches WHERE id=? FOR UPDATE', [batchId]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Batch not found.' }); }
    const status = rows[0].status;
    if (!['in_production','completed','quality_hold'].includes(status)) { await conn.rollback(); return res.status(409).json({ error: `Cannot reject a ${status} batch.` }); }
    await conn.query('UPDATE production_batches SET status=?, status_note=? WHERE id=?', ['rejected', reason, batchId]);
    await conn.commit();
    res.json({ message: 'Batch rejected.', status: 'rejected' });
  } catch (e) { await conn.rollback(); console.error(e); res.status(500).json({ error: 'Could not reject batch.' }); }
  finally { conn.release(); }
});

app.post('/api/batches/:id/dispatch', async (req, res) => {
  const batchId = Number(req.params.id);
  if (!Number.isInteger(batchId) || batchId < 1) return res.status(400).json({ error: 'Invalid batch id.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT id, status FROM production_batches WHERE id=? FOR UPDATE', [batchId]);
    if (!rows.length) { await conn.rollback(); return res.status(404).json({ error: 'Batch not found.' }); }
    if (rows[0].status !== 'approved') { await conn.rollback(); return res.status(409).json({ error: `Cannot dispatch a ${rows[0].status} batch; release it first.` }); }
    await conn.query('UPDATE production_batches SET status=? WHERE id=?', ['dispatched', batchId]);
    await conn.commit();
    res.json({ message: 'Batch dispatched.', status: 'dispatched' });
  } catch (e) { await conn.rollback(); console.error(e); res.status(500).json({ error: 'Could not dispatch batch.' }); }
  finally { conn.release(); }
});

app.get('/api/waste', async (_req, res) => {
  try {
    const [rows] = await pool.query(`SELECT w.*, b.batch_code FROM waste_entries w LEFT JOIN production_batches b ON b.id=w.batch_id ORDER BY w.logged_at DESC`);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load waste records' }); }
});

app.post('/api/waste', async (req, res) => {
  const { batch_id = null, waste_type, quantity_kg, disposition, notes = '' } = req.body;
  const types = ['overproduction','process_loss','damaged_product','quality_reject','expired_material','other'];
  const routes = ['rework_review','compost','biogas','approved_feed_route','disposal','other'];
  if (!types.includes(waste_type) || !routes.includes(disposition) ||
      !Number.isFinite(Number(quantity_kg)) || Number(quantity_kg) <= 0) {
    return res.status(400).json({ error: 'Choose a valid waste type, positive quantity, and disposition.' });
  }
  try {
    const [result] = await pool.query(`INSERT INTO waste_entries (batch_id,waste_type,quantity_kg,disposition,notes) VALUES (?,?,?,?,?)`,
      [batch_id || null, waste_type, Number(quantity_kg), disposition, String(notes).slice(0,500)]);
    res.status(201).json({ id: result.insertId, message: 'Waste record added' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not add waste record.' }); }
});

// Recipe management: ingredient quantities are specified per recipe batch output.
app.get('/api/recipes', async (_req, res) => {
  try {
    const [recipes] = await pool.query('SELECT * FROM recipes ORDER BY created_at DESC, id DESC');
    for (const recipe of recipes) {
      const [ingredients] = await pool.query('SELECT id, material_name, quantity_kg FROM recipe_ingredients WHERE recipe_id=? ORDER BY material_name', [recipe.id]);
      recipe.ingredients = ingredients;
    }
    res.json(recipes);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load recipes.' }); }
});

app.post('/api/recipes', async (req, res) => {
  const { recipe_code, recipe_name, product_name, batch_output_kg, instructions = '', ingredients } = req.body;
  if (!validText(recipe_code, MAX_LEN.recipe_code) || !validText(recipe_name, MAX_LEN.recipe_name) || !validText(product_name, MAX_LEN.product_name) ||
      !Number.isFinite(Number(batch_output_kg)) || Number(batch_output_kg) <= 0 || Number(batch_output_kg) > 99999999.99 ||
      !Array.isArray(ingredients) || ingredients.length < 1 ||
      ingredients.some(i => !validText(i.material_name, MAX_LEN.material_name) || !Number.isFinite(Number(i.quantity_kg)) || Number(i.quantity_kg) <= 0 || Number(i.quantity_kg) > 99999999.99)) {
    return res.status(400).json({ error: 'Provide valid recipe details, positive batch output, and at least one valid ingredient (material names max 120 chars, quantities up to 99,999,999.99).' });
  }
  const names = ingredients.map(i => i.material_name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return res.status(400).json({ error: 'Each material can appear only once per recipe.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query('INSERT INTO recipes (recipe_code,recipe_name,product_name,batch_output_kg,instructions) VALUES (?,?,?,?,?)', [recipe_code.trim(),recipe_name.trim(),product_name.trim(),Number(batch_output_kg),String(instructions).slice(0,2000)]);
    for (const ingredient of ingredients) await conn.query('INSERT INTO recipe_ingredients (recipe_id,material_name,quantity_kg) VALUES (?,?,?)', [result.insertId,ingredient.material_name.trim(),Number(ingredient.quantity_kg)]);
    await conn.commit(); res.status(201).json({ id: result.insertId, message: 'Recipe created.' });
  } catch (e) { await conn.rollback(); const f = dbFailure(e, 'Could not create recipe.', 'Recipe code already exists.'); res.status(f.status).json({ error: f.error }); }
  finally { conn.release(); }
});

app.get('/api/batches/:id/consumptions', async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT c.*, l.lot_code, b.batch_code, r.recipe_code
      FROM batch_consumptions c JOIN material_lots l ON l.id=c.material_lot_id
      JOIN production_batches b ON b.id=c.batch_id JOIN recipes r ON r.id=c.recipe_id
      WHERE c.batch_id=? ORDER BY c.consumed_at DESC`, [req.params.id]);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load consumption records.' }); }
});

app.post('/api/batches/:id/consumptions', async (req, res) => {
  const batchId = Number(req.params.id);
  const { recipe_id, material_lot_id, quantity_kg } = req.body;
  const recipeId = Number(recipe_id), lotId = Number(material_lot_id), qtyValue = Number(quantity_kg);
  if (!Number.isInteger(batchId) || batchId < 1 || !Number.isInteger(recipeId) || recipeId < 1 || !Number.isInteger(lotId) || lotId < 1 ||
      !Number.isFinite(qtyValue) || qtyValue <= 0 || qtyValue > 99999999.99) {
    return res.status(400).json({ error: 'Choose a batch, recipe, material lot, and a positive quantity up to 99,999,999.99 kg.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [batchRows] = await conn.query('SELECT * FROM production_batches WHERE id=? FOR UPDATE', [batchId]);
    const [recipeRows] = await conn.query('SELECT * FROM recipes WHERE id=? AND active=TRUE', [recipe_id]);
    const [lotRows] = await conn.query('SELECT * FROM material_lots WHERE id=? FOR UPDATE', [material_lot_id]);
    if (!batchRows.length || !recipeRows.length || !lotRows.length) { await conn.rollback(); return res.status(404).json({ error: 'Batch, active recipe, or material lot not found.' }); }
    const batch = batchRows[0], recipe = recipeRows[0], lot = lotRows[0];
    if (!['planned','in_production'].includes(batch.status)) { await conn.rollback(); return res.status(409).json({ error: `Cannot consume materials for a ${batch.status} batch; consumption is only allowed for planned or in-production batches.` }); }
    if (batch.product_name.toLowerCase() !== recipe.product_name.toLowerCase()) { await conn.rollback(); return res.status(400).json({ error: 'Recipe product does not match this production batch.' }); }
    const [ingredients] = await conn.query('SELECT * FROM recipe_ingredients WHERE recipe_id=? AND LOWER(material_name)=LOWER(?)', [recipe.id, lot.material_name]);
    if (!ingredients.length) { await conn.rollback(); return res.status(400).json({ error: `${lot.material_name} is not an ingredient in recipe ${recipe.recipe_code}.` }); }
    const expiryDate = lot.expiry_date instanceof Date ? lot.expiry_date : new Date(`${String(lot.expiry_date).slice(0,10)}T00:00:00`);
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    if (expiryDate < todayStart) { await conn.rollback(); return res.status(400).json({ error: 'This lot is expired and cannot be consumed.' }); }
    const qty = Number(quantity_kg), available = Number(lot.quantity_kg);
    if (qty > available) { await conn.rollback(); return res.status(409).json({ error: `Insufficient stock. This lot has ${available} kg available.` }); }
    const [alreadyRows] = await conn.query('SELECT COALESCE(SUM(quantity_kg),0) used_kg FROM batch_consumptions WHERE batch_id=? AND recipe_id=? AND material_name=?', [batchId,recipe.id,ingredients[0].material_name]);
    const allowed = Number(ingredients[0].quantity_kg) * Number(batch.planned_qty_kg) / Number(recipe.batch_output_kg);
    const remaining = Math.max(0, allowed - Number(alreadyRows[0].used_kg));
    if (qty > remaining + 0.0005) { await conn.rollback(); return res.status(400).json({ error: `Recipe allowance is ${allowed.toFixed(3)} kg for this batch; ${Number(alreadyRows[0].used_kg).toFixed(3)} kg already recorded, so max additional is ${remaining.toFixed(3)} kg.` }); }
    await conn.query('UPDATE material_lots SET quantity_kg=quantity_kg-? WHERE id=?', [qty,lot.id]);
    await conn.query('INSERT INTO batch_consumptions (batch_id,recipe_id,material_lot_id,material_name,quantity_kg) VALUES (?,?,?,?,?)', [batchId,recipe.id,lot.id,lot.material_name,qty]);
    await conn.query("UPDATE production_batches SET status='in_production' WHERE id=? AND status='planned'", [batchId]);
    await conn.commit(); res.status(201).json({ message: `${qty} kg of ${lot.material_name} recorded; stock deducted from lot ${lot.lot_code}.`, quantity_kg: qty });
  } catch (e) { await conn.rollback(); console.error(e); res.status(500).json({ error: 'Could not record consumption.' }); }
  finally { conn.release(); }
});

app.get('/api/traceability/:batchCode', async (req, res) => {
  if (!validText(req.params.batchCode, MAX_LEN.batch_code)) return res.status(400).json({ error: 'Invalid batch code.' });
  try {
    const [batches] = await pool.query('SELECT * FROM production_batches WHERE batch_code=?', [req.params.batchCode]);
    if (!batches.length) return res.status(404).json({ error: 'Batch not found.' });
    const batch = batches[0];
    const [checks] = await pool.query('SELECT check_name,result,notes,checked_at FROM quality_checks WHERE batch_id=? ORDER BY checked_at DESC', [batch.id]);
    const [waste] = await pool.query('SELECT waste_type,quantity_kg,disposition,notes,logged_at FROM waste_entries WHERE batch_id=? ORDER BY logged_at DESC', [batch.id]);
    const [consumptions] = await pool.query(`SELECT c.material_name,c.quantity_kg,c.consumed_at,l.lot_code,r.recipe_code
      FROM batch_consumptions c JOIN material_lots l ON l.id=c.material_lot_id JOIN recipes r ON r.id=c.recipe_id
      WHERE c.batch_id=? ORDER BY c.consumed_at DESC`, [batch.id]);
    res.json({ batch, checks, waste, consumptions, note: 'Traceability links recorded raw-material lot consumption to the production batch, plus quality and waste records.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Traceability lookup failed.' }); }
});

const port = Number(process.env.PORT || 5000);
app.listen(port, () => console.log(`BakeTrack API running on http://localhost:${port}`));

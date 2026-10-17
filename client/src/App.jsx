import { useEffect, useMemo, useState } from 'react';

import { Activity, AlertTriangle, Archive, ArrowDownRight, ArrowUpRight, Boxes, CheckCircle2, ChevronDown, ClipboardCheck, Factory, LayoutDashboard, Leaf, Package, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Truck, X } from 'lucide-react';

import Factory3D from './Factory3D';

const API = 'http://localhost:5000/api';

const money = n => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });

const pretty = s => String(s || '').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());

async function request(path, options) {

   const res = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });

   const data = await res.json().catch(() => ({}));

   if (!res.ok) throw new Error(data.error || 'Request failed');

   return data;

}

const nav = [

   ['Overview', LayoutDashboard], ['Factory 3D', Boxes], ['Production batches', Factory], ['Recipes & consumption', ClipboardCheck], ['Inventory & FEFO', Package],

   ['Quality control', ShieldCheck], ['Waste analytics', Leaf], ['Traceability', Activity]

];

function Stat({label,value,sub,icon:Icon,tone='green'}) {

   return <div className="stat"><div className={`stat-icon ${tone}`}><Icon size={18}/></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-sub">{sub}</div></div>;

}

function Badge({children,kind=''}) { return <span className={`badge ${kind}`}>{children}</span>; }

function Modal({title,onClose,children}) { return <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div></div>; }

export default function App() {

   const [page,setPage] = useState('Overview');

   const [dash,setDash] = useState(null);

   const [batches,setBatches] = useState([]);

   const [inventory,setInventory] = useState([]);

   const [waste,setWaste] = useState([]);

   const [recipes,setRecipes] = useState([]);

   const [error,setError] = useState('');

   const [busy,setBusy] = useState(false);

   const [modal,setModal] = useState('');

   const [search,setSearch] = useState('');

   const [traceCode,setTraceCode] = useState('BT-DEMO-1001');

   const [trace,setTrace] = useState(null);

   const [toast,setToast] = useState('');

   const [batchForm,setBatchForm] = useState({batch_code:'',product_name:'Butter Cookies',planned_qty_kg:'',production_date:new Date().toISOString().slice(0,10)});

   const [stockForm,setStockForm] = useState({material_name:'',lot_code:'',quantity_kg:'',received_date:new Date().toISOString().slice(0,10),expiry_date:'',supplier:''});

   const [qualityForm,setQualityForm] = useState({batch_id:'',check_name:'Visual defect inspection',result:'pass',notes:''});

   const [wasteForm,setWasteForm] = useState({batch_id:'',waste_type:'process_loss',quantity_kg:'',disposition:'other',notes:''});

   const [recipeForm,setRecipeForm] = useState({recipe_code:'',recipe_name:'',product_name:'Butter Cookies',batch_output_kg:'100',instructions:'',ingredients_text:'Wheat flour: 60\nSugar: 20\nVegetable oil: 10'});

   const [consumptionForm,setConsumptionForm] = useState({batch_id:'',recipe_id:'',material_lot_id:'',quantity_kg:''});

   const [consumptions,setConsumptions] = useState([]);

   const [actionBatch,setActionBatch] = useState(null);

   const [actionForm,setActionForm] = useState({actual_qty_kg:'',release_note:'',reason:'',acknowledge_failures:false});

   async function load() {

      setBusy(true); setError('');

      try {

         const [d,b,i,w,r] = await Promise.all([request('/dashboard'),request('/batches'),request('/inventory'),request('/waste'),request('/recipes')]);

         setDash(d); setBatches(b); setInventory(i); setWaste(w); setRecipes(r);

         if (!qualityForm.batch_id && b.length) setQualityForm(f=>({...f,batch_id:String(b[0].id)}));

         if (!wasteForm.batch_id && b.length) setWasteForm(f=>({...f,batch_id:String(b[0].id)}));

      } catch(e) { setError(e.message + ' — Check that MySQL is running, schema.sql is imported, and the API is running on port 5000.'); }

      finally { setBusy(false); }

   }

   useEffect(()=>{load()},[]);

   const filteredBatches = useMemo(()=>batches.filter(b=>`${b.batch_code} ${b.product_name} ${b.status}`.toLowerCase().includes(search.toLowerCase())),[batches,search]);

   async function submit(path, body, success, close=true) {

      try { await request(path,{method:'POST',body:JSON.stringify(body)}); setToast(success); setError(''); if(close) setModal(''); await load(); }

      catch(e){setError(e.message);}

   }

   function openAction(batch,type) {

      setActionBatch(batch);

      setActionForm({actual_qty_kg:Number(batch.actual_qty_kg)>0?String(batch.actual_qty_kg):'',release_note:'',reason:'',acknowledge_failures:false});

      setModal(type);

   }

   async function dispatchBatch(batch) {

      if(!window.confirm(`Dispatch batch ${batch.batch_code}? Dispatched batches cannot be changed afterwards.`)) return;

      await submit(`/batches/${batch.id}/dispatch`,{},`Batch ${batch.batch_code} dispatched.`);

   }

   const runAction = (batch,type) => type==='dispatch' ? dispatchBatch(batch) : openAction(batch,type);

   async function runTrace(e) {

      e?.preventDefault();

      try { setTrace(await request(`/traceability/${encodeURIComponent(traceCode.trim())}`)); setError(''); }

      catch(e){setTrace(null);setError(e.message);}

   }

   const statusKind = s => ['approved','pass'].includes(s)?'good':['quality_hold','rejected','fail'].includes(s)?'bad':['in_production','completed'].includes(s)?'blue':'neutral';

   const batchOptions = batches.map(b=>({value:String(b.id),label:`${b.batch_code} · ${b.product_name}`}));

   const selectedRecipe = recipes.find(r=>String(r.id)===String(consumptionForm.recipe_id));

   const selectedBatch = batches.find(b=>String(b.id)===String(consumptionForm.batch_id));

   const matchingLots = inventory.filter(l=>selectedRecipe?.ingredients?.some(i=>i.material_name.toLowerCase()===l.material_name.toLowerCase()));

   async function loadConsumptions(batchId) { try { setConsumptions(await request(`/batches/${batchId}/consumptions`)); } catch(e) { setError(e.message); } }

   return <div className="app-shell">

      <aside className="sidebar">

         <div className="brand"><div className="brand-mark"><Factory size={22}/></div><div><strong>BakeTrack</strong><span>MANUFACTURING ERP</span></div></div>

         <div className="workspace"><span className="workspace-dot"></span><div><b>Demo Bakery Plant</b><small>Portfolio environment</small></div><ChevronDown size={15}/></div>

         <div className="nav-label">WORKSPACE</div>

         <nav>{nav.map(([label,Icon])=><button key={label} className={`nav-item ${page===label?'active':''}`} onClick={()=>setPage(label)}><Icon size={17}/><span>{label}</span>{label==='Quality control'&&dash?.batches?.quality_hold>0&&<i/>}</button>)}</nav>

         <div className="sidebar-bottom"><div className="demo-note"><Sparkles size={16}/><b>Prototype mode</b><p>Using synthetic sample data. Not connected to any real factory.</p></div><div className="profile"><div className="avatar">LL</div><div><b>Plant operator</b><small>Demo workspace</small></div><ChevronDown size={15}/></div></div>

      </aside>

      <main className={`main ${page === 'Factory 3D' ? 'factory3d-active' : ''}`}>

         <header className="topbar"><div className="crumb">Operations <span>/</span> <b>{page}</b></div><div className="top-actions"><span className="live-dot"></span><span className="system-status">API-backed data</span><button className="icon-btn" onClick={load} title="Refresh"><RefreshCw size={17}/></button><div className="avatar small">LL</div></div></header>

         <div className="content">

            {page !== 'Factory 3D' && <div className="page-heading">

               <div><div className="eyebrow">BAKERY OPERATIONS · OCTOBER 2026</div><h1>{page}</h1><p>Production visibility, quality assurance and material traceability in one workspace.</p></div><button className="primary" onClick={()=>setModal(page==='Inventory & FEFO'?'stock':page==='Waste analytics'?'waste':page==='Recipes & consumption'?'recipe':page==='Production batches'?'batch':'batch')}><Plus size={17}/>{page==='Inventory & FEFO'?'Add material lot':page==='Waste analytics'?'Log waste':page==='Recipes & consumption'?'Create recipe':'New production batch'}</button></div>}

            {page === 'Factory 3D' && (
              <Factory3D
                batches={batches}
                inventory={inventory}
                waste={waste}
                onNavigate={setPage}
              />
            )}

            {error&&<div className="error-banner"><AlertTriangle size={18}/><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>}

            {toast&&<div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast('')}><X size={15}/></button></div>}

            {busy&&!dash?<div className="loading">Connecting to BakeTrack API…</div>:null}

            {page==='Overview'&&dash&&<><div className="stat-grid">

               <Stat label="Batches · last 30 days" value={money(dash.batches?.total)} sub={`${money(dash.batches?.approved)} approved`} icon={Factory}/>

               <Stat label="Material stock" value={`${money(dash.inventory?.stock_kg)} kg`} sub={`${money(dash.inventory?.lot_count)} active lots`} icon={Boxes} tone="blue"/>

               <Stat label="Quality holds" value={money(dash.batches?.quality_hold)} sub={`${money(dash.quality?.failures)} failed checks`} icon={ShieldCheck} tone="amber"/>

               <Stat label="Waste recorded" value={`${money(dash.waste?.waste_kg)} kg`} sub="Last 30 days" icon={Leaf} tone="purple"/>

            </div><div className="dashboard-grid"><section className="panel"><div className="panel-head"><div><h2>Recent production batches</h2><p>Batch status and actual output</p></div><button className="text-btn" onClick={()=>setPage('Production batches')}>View all <ArrowUpRight size={15}/></button></div><BatchTable rows={batches.slice(0,5)} statusKind={statusKind}/></section><section className="panel"><div className="panel-head"><div><h2>Inventory expiry watch</h2><p>Earliest expiry first (FEFO)</p></div><button className="text-btn" onClick={()=>setPage('Inventory & FEFO')}>Inventory <ArrowUpRight size={15}/></button></div><div className="expiry-list">{inventory.slice(0,5).map(row=><div className="expiry-row" key={row.id}><div className="material-icon"><Package size={16}/></div><div className="expiry-info"><b>{row.material_name}</b><small>{row.lot_code} · {money(row.quantity_kg)} kg</small></div><div className="expiry-date"><b>{row.days_to_expiry<0?'Expired':row.days_to_expiry===0?'Today':`${row.days_to_expiry} days`}</b><small>{String(row.expiry_date).slice(0,10)}</small></div></div>)}</div></section></div><div className="bottom-grid"><section className="panel insight"><div className="insight-icon"><Activity size={20}/></div><div><h3>Yield snapshot</h3><p>Actual output vs planned output across recent batches.</p><strong>{dash.batches?.planned?`${(100*dash.batches.actual/dash.batches.planned).toFixed(1)}%`:'—'}</strong><small>Overall output / plan</small></div><div className="mini-bar"><span style={{width:`${Math.min(100,Math.max(0,dash.batches?.planned?100*dash.batches.actual/dash.batches.planned:0))}%`}}/></div></section><section className="panel insight"><div className="insight-icon orange"><AlertTriangle size={20}/></div><div><h3>Expiry & quality attention</h3><p>Prioritize materials nearing expiry and batches on hold.</p><strong>{money(dash.inventory?.expiring_soon)} lots</strong><small>Expiring in 14 days</small></div><button className="text-btn" onClick={()=>setPage('Quality control')}>Review <ArrowUpRight size={15}/></button></section></div></>}

            {page==='Production batches'&&<section className="panel table-panel"><div className="panel-head"><div><h2>Production register</h2><p>Work orders, output and status</p></div><div className="searchbox"><Search size={16}/><input placeholder="Search batch or product…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><BatchTable rows={filteredBatches} statusKind={statusKind} action={runAction}/></section>}

            {page==='Recipes & consumption'&&<>

               <div className="stat-grid"><Stat label="Active recipes" value={recipes.filter(r=>r.active).length} sub="Product formulas" icon={ClipboardCheck}/><Stat label="Ingredients defined" value={recipes.reduce((n,r)=>n+(r.ingredients?.length||0),0)} sub="Recipe components" icon={Boxes} tone="blue"/><Stat label="Consumption entries" value={consumptions.length} sub="Selected batch history" icon={Archive} tone="purple"/><Stat label="Inventory lots" value={inventory.length} sub="Available for production" icon={Package} tone="amber"/></div>

               <section className="panel table-panel"><div className="panel-head"><div><h2>Recipe book</h2><p>Ingredient quantities are stored per defined recipe output batch.</p></div><button className="primary" onClick={()=>setModal('recipe')}><Plus size={16}/>Create recipe</button></div>

               <div className="table-wrap"><table><thead><tr><th>Recipe</th><th>Product</th><th>Reference output</th><th>Ingredients / recipe batch</th><th>Instructions</th></tr></thead><tbody>{recipes.map(r=><tr key={r.id}><td><b>{r.recipe_name}</b><small className="subcell mono">{r.recipe_code}</small></td><td>{r.product_name}</td><td>{money(r.batch_output_kg)} kg</td><td>{(r.ingredients||[]).map(i=><div key={i.id}>{i.material_name}: <b>{money(i.quantity_kg)} kg</b></div>)}</td><td>{r.instructions||'—'}</td></tr>)}</tbody></table>{!recipes.length&&<div className="empty">No recipes yet. Create one to define ingredient requirements.</div>}</div></section>

               <section className="panel table-panel" style={{marginTop:18}}><div className="panel-head"><div><h2>Record raw-material consumption</h2><p>Choose a batch, its matching recipe and a material lot. Stock is deducted transactionally.</p></div></div>

               <form className="form-grid" onSubmit={async e=>{e.preventDefault();await submit(`/batches/${consumptionForm.batch_id}/consumptions`,{recipe_id:Number(consumptionForm.recipe_id),material_lot_id:Number(consumptionForm.material_lot_id),quantity_kg:Number(consumptionForm.quantity_kg)},'Raw-material consumption recorded and stock updated.',false);if(consumptionForm.batch_id)loadConsumptions(consumptionForm.batch_id);setConsumptionForm(f=>({...f,quantity_kg:''}));}}>

                  <label>Production batch<select required value={consumptionForm.batch_id} onChange={e=>{setConsumptionForm(f=>({...f,batch_id:e.target.value,recipe_id:'',material_lot_id:''}));setConsumptions([]);}}><option value="">Choose batch</option>{batches.filter(b=>!['completed','quality_hold','approved','rejected','dispatched'].includes(b.status)).map(b=><option key={b.id} value={b.id}>{b.batch_code} · {b.product_name} · {money(b.planned_qty_kg)} kg</option>)}</select></label>

                  <label>Matching recipe<select required value={consumptionForm.recipe_id} onChange={e=>setConsumptionForm(f=>({...f,recipe_id:e.target.value,material_lot_id:''}))}><option value="">Choose recipe</option>{recipes.filter(r=>r.active&&(!selectedBatch||r.product_name.toLowerCase()===selectedBatch.product_name.toLowerCase())).map(r=><option key={r.id} value={r.id}>{r.recipe_code} · {r.recipe_name}</option>)}</select></label>

                  <label>Material lot<select required value={consumptionForm.material_lot_id} onChange={e=>setConsumptionForm(f=>({...f,material_lot_id:e.target.value}))}><option value="">Choose ingredient lot</option>{matchingLots.map(l=><option key={l.id} value={l.id}>{l.material_name} · {l.lot_code} · {money(l.quantity_kg)} kg available</option>)}</select></label>

                  <label>Consumed quantity (kg)<input type="number" min="0.001" step="0.001" required value={consumptionForm.quantity_kg} onChange={e=>setConsumptionForm(f=>({...f,quantity_kg:e.target.value}))}/></label>

                  {selectedRecipe&&selectedBatch&&<div className="hint wide">Recipe allowance scales to the batch plan: {selectedRecipe.recipe_name} reference output {money(selectedRecipe.batch_output_kg)} kg × planned batch output {money(selectedBatch.planned_qty_kg)} kg. Each ingredient has a maximum allowance enforced by the API.</div>}

                  <div className="form-actions"><button type="button" className="secondary" disabled={!consumptionForm.batch_id} onClick={()=>loadConsumptions(consumptionForm.batch_id)}>Load batch history</button><button className="primary" type="submit" disabled={!recipes.length||!consumptionForm.batch_id}>Record consumption</button></div>

               </form>

               {consumptions.length>0&&<div className="table-wrap"><table><thead><tr><th>Recorded at</th><th>Recipe</th><th>Material</th><th>Lot</th><th>Consumed</th></tr></thead><tbody>{consumptions.map(c=><tr key={c.id}><td>{new Date(c.consumed_at).toLocaleString('en-IN')}</td><td>{c.recipe_code}</td><td>{c.material_name}</td><td className="mono">{c.lot_code}</td><td>{money(c.quantity_kg)} kg</td></tr>)}</tbody></table></div>}

               </section>

            </>}

            {page==='Inventory & FEFO'&&<section className="panel table-panel"><div className="panel-head"><div><h2>Raw-material lots</h2><p>Sorted by earliest expiry first</p></div><Badge kind="blue">FEFO view</Badge></div><div className="table-wrap"><table><thead><tr><th>Material / supplier</th><th>Lot code</th><th>Available</th><th>Received</th><th>Expiry</th><th>Remaining life</th></tr></thead><tbody>{inventory.map(r=><tr key={r.id}><td><b>{r.material_name}</b><small className="subcell">{r.supplier}</small></td><td className="mono">{r.lot_code}</td><td>{money(r.quantity_kg)} kg</td><td>{String(r.received_date).slice(0,10)}</td><td>{String(r.expiry_date).slice(0,10)}</td><td><Badge kind={r.days_to_expiry<0?'bad':r.days_to_expiry<=14?'warn':'good'}>{r.days_to_expiry<0?'Expired':`${r.days_to_expiry} days`}</Badge></td></tr>)}</tbody></table></div></section>}

            {page==='Quality control'&&<section className="panel table-panel"><div className="panel-head"><div><h2>Batch quality checks</h2><p>Failed checks should place a batch on hold for review</p></div><button className="primary" onClick={()=>setModal('quality')}><Plus size={16}/>Record inspection</button></div><div className="table-wrap"><table><thead><tr><th>Batch</th><th>Product</th><th>Production date</th><th>Batch status</th><th>Failed checks</th><th>Actual output</th></tr></thead><tbody>{batches.map(b=><tr key={b.id}><td className="mono">{b.batch_code}</td><td><b>{b.product_name}</b></td><td>{String(b.production_date).slice(0,10)}</td><td><Badge kind={statusKind(b.status)}>{pretty(b.status)}</Badge></td><td>{Number(b.failed_checks||0)}</td><td>{money(b.actual_qty_kg)} kg</td></tr>)}</tbody></table></div></section>}

            {page==='Waste analytics'&&<><div className="stat-grid"><Stat label="Waste recorded" value={`${money(waste.reduce((s,w)=>s+Number(w.quantity_kg),0))} kg`} sub="All logged records" icon={Leaf} tone="purple"/><Stat label="Waste events" value={waste.length} sub="Logged records" icon={Archive}/><Stat label="Linked to batch" value={waste.filter(w=>w.batch_id).length} sub="Traceable events" icon={Activity} tone="blue"/><Stat label="Disposition routes" value={new Set(waste.map(w=>w.disposition)).size} sub="Different recorded routes" icon={RefreshCw} tone="amber"/></div><section className="panel table-panel"><div className="panel-head"><div><h2>Waste register</h2><p>Record cause and intended route; route requires site approval.</p></div><button className="primary" onClick={()=>setModal('waste')}><Plus size={16}/>Log waste</button></div><div className="table-wrap"><table><thead><tr><th>Logged</th><th>Batch</th><th>Waste type</th><th>Quantity</th><th>Disposition</th><th>Notes</th></tr></thead><tbody>{waste.map(w=><tr key={w.id}><td>{new Date(w.logged_at).toLocaleDateString('en-IN')}</td><td className="mono">{w.batch_code||'—'}</td><td>{pretty(w.waste_type)}</td><td>{money(w.quantity_kg)} kg</td><td>{pretty(w.disposition)}</td><td>{w.notes||'—'}</td></tr>)}</tbody></table></div></section></>}

            {page==='Traceability'&&<div className="trace-layout"><section className="panel trace-search"><h2>Batch trace lookup</h2><p>Find a batch and inspect its quality and waste records.</p><form onSubmit={runTrace}><label>Batch code<input value={traceCode} onChange={e=>setTraceCode(e.target.value)} placeholder="BT-DEMO-1001" required/></label><button className="primary" type="submit"><Search size={16}/>Trace batch</button></form><div className="hint">Try BT-DEMO-1001 or BT-DEMO-1002.</div></section>{trace&&<section className="panel trace-result"><div className="panel-head"><div><Badge kind={statusKind(trace.batch.status)}>{pretty(trace.batch.status)}</Badge><h2>{trace.batch.batch_code}</h2><p>{trace.batch.product_name} · {String(trace.batch.production_date).slice(0,10)}</p></div></div><div className="trace-kpis"><div><small>Planned</small><b>{money(trace.batch.planned_qty_kg)} kg</b></div><div><small>Actual</small><b>{money(trace.batch.actual_qty_kg)} kg</b></div><div><small>Yield</small><b>{trace.batch.planned_qty_kg?(100*trace.batch.actual_qty_kg/trace.batch.planned_qty_kg).toFixed(1)+'%':'—'}</b></div></div><h3>Quality checks</h3>{trace.checks.length?trace.checks.map((c,i)=><div className="trace-line" key={i}><span>{c.check_name}<small>{c.notes}</small></span><Badge kind={statusKind(c.result)}>{pretty(c.result)}</Badge></div>):<p>No checks recorded.</p>}<h3>Raw-material consumption</h3>{trace.consumptions?.length?trace.consumptions.map((c,i)=><div className="trace-line" key={i}><span>{c.material_name}<small>{c.recipe_code} · lot {c.lot_code}</small></span><b>{money(c.quantity_kg)} kg</b></div>):<p>No raw-material consumption recorded.</p>}<h3>Waste events</h3>{trace.waste.length?trace.waste.map((w,i)=><div className="trace-line" key={i}><span>{pretty(w.waste_type)}<small>{w.notes}</small></span><b>{money(w.quantity_kg)} kg</b></div>):<p>No waste records.</p>}<div className="hint">{trace.note}</div></section>}</div>}

            <footer><span><span className="footer-dot"/> BakeTrack ERP · Portfolio MVP</span><span>Demo data only · Not an official BakeMate system</span></footer>

         </div>

      </main>

      {modal==='recipe'&&<Modal title="Create production recipe" onClose={()=>setModal('')}><form className="form-grid" onSubmit={e=>{e.preventDefault();const ingredients=recipeForm.ingredients_text.split(/\r?\n/).map(line=>{const idx=line.lastIndexOf(':');return idx<0?null:{material_name:line.slice(0,idx).trim(),quantity_kg:Number(line.slice(idx+1).trim())};}).filter(Boolean);if(!ingredients.length||ingredients.some(i=>!i.material_name||!Number.isFinite(i.quantity_kg)||i.quantity_kg<=0)){setError('Ingredients format must be one per line: Material name: quantity in kg');return;}submit('/recipes',{...recipeForm,batch_output_kg:Number(recipeForm.batch_output_kg),ingredients},'Recipe created');}}><label>Recipe code<input required placeholder="RC-BISC-001" value={recipeForm.recipe_code} onChange={e=>setRecipeForm({...recipeForm,recipe_code:e.target.value})}/></label><label>Recipe name<input required placeholder="Classic cookie formula" value={recipeForm.recipe_name} onChange={e=>setRecipeForm({...recipeForm,recipe_name:e.target.value})}/></label><label>Product<select value={recipeForm.product_name} onChange={e=>setRecipeForm({...recipeForm,product_name:e.target.value})}><option>Butter Cookies</option><option>Chocolate Biscuits</option><option>Wafers</option><option>Rusk</option><option>Cake</option></select></label><label>Reference output (kg)<input type="number" min="0.1" step="0.1" required value={recipeForm.batch_output_kg} onChange={e=>setRecipeForm({...recipeForm,batch_output_kg:e.target.value})}/></label><label className="wide">Ingredients (one per line: Material: kg)<textarea required rows="5" value={recipeForm.ingredients_text} onChange={e=>setRecipeForm({...recipeForm,ingredients_text:e.target.value})}/></label><label className="wide">Instructions / notes<input value={recipeForm.instructions} onChange={e=>setRecipeForm({...recipeForm,instructions:e.target.value})} placeholder="Mixing, baking or handling notes"/></label><div className="hint wide">Use material names that match the inventory exactly (e.g. Wheat flour, Sugar, Vegetable oil). Quantities are for the reference output amount.</div><div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal('')}>Cancel</button><button className="primary" type="submit">Save recipe</button></div></form></Modal>}

      {modal==='batch'&&<Modal title="Create production batch" onClose={()=>setModal('')}><form className="form-grid" onSubmit={e=>{e.preventDefault();submit('/batches',batchForm,'Production batch created');}}><label>Batch code<input required placeholder="BT-2026-001" value={batchForm.batch_code} onChange={e=>setBatchForm({...batchForm,batch_code:e.target.value})}/></label><label>Product<select value={batchForm.product_name} onChange={e=>setBatchForm({...batchForm,product_name:e.target.value})}><option>Butter Cookies</option><option>Chocolate Biscuits</option><option>Wafers</option><option>Rusk</option><option>Cake</option></select></label><label>Planned output (kg)<input type="number" min="0.1" step="0.1" required value={batchForm.planned_qty_kg} onChange={e=>setBatchForm({...batchForm,planned_qty_kg:e.target.value})}/></label><label>Production date<input type="date" required value={batchForm.production_date} onChange={e=>setBatchForm({...batchForm,production_date:e.target.value})}/></label><div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal('')}>Cancel</button><button className="primary" type="submit">Create batch</button></div></form></Modal>}

      {modal==='stock'&&<Modal title="Add raw-material lot" onClose={()=>setModal('')}><form className="form-grid" onSubmit={e=>{e.preventDefault();submit('/inventory',stockForm,'Material lot added');}}><label>Material<input required value={stockForm.material_name} onChange={e=>setStockForm({...stockForm,material_name:e.target.value})} placeholder="Wheat flour"/></label><label>Lot code<input required value={stockForm.lot_code} onChange={e=>setStockForm({...stockForm,lot_code:e.target.value})} placeholder="FLR-2026-001"/></label><label>Quantity (kg)<input type="number" min="0" step="0.1" required value={stockForm.quantity_kg} onChange={e=>setStockForm({...stockForm,quantity_kg:e.target.value})}/></label><label>Supplier<input required value={stockForm.supplier} onChange={e=>setStockForm({...stockForm,supplier:e.target.value})}/></label><label>Received date<input type="date" required value={stockForm.received_date} onChange={e=>setStockForm({...stockForm,received_date:e.target.value})}/></label><label>Expiry date<input type="date" min={stockForm.received_date} required value={stockForm.expiry_date} onChange={e=>setStockForm({...stockForm,expiry_date:e.target.value})}/></label><div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal('')}>Cancel</button><button className="primary" type="submit">Save material lot</button></div></form></Modal>}

      {modal==='quality'&&<Modal title="Record quality inspection" onClose={()=>setModal('')}><form className="form-grid" onSubmit={e=>{e.preventDefault();submit(`/batches/${qualityForm.batch_id}/quality-checks`,qualityForm,qualityForm.result==='fail'?'Failed check recorded; batch on hold.':'Quality check passed; batch status unchanged — use Release to approve.');}}><label className="wide">Production batch<select required value={qualityForm.batch_id} onChange={e=>setQualityForm({...qualityForm,batch_id:e.target.value})}>{batchOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label><label className="wide">Inspection name<input required value={qualityForm.check_name} onChange={e=>setQualityForm({...qualityForm,check_name:e.target.value})}/></label><label>Result<select value={qualityForm.result} onChange={e=>setQualityForm({...qualityForm,result:e.target.value})}><option value="pass">Pass</option><option value="fail">Fail — hold batch</option></select></label><label>Notes<input value={qualityForm.notes} onChange={e=>setQualityForm({...qualityForm,notes:e.target.value})} placeholder="Record observation"/></label><div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal('')}>Cancel</button><button className="primary" type="submit">Save inspection</button></div></form></Modal>}

      {modal==='waste'&&<Modal title="Log production waste" onClose={()=>setModal('')}><form className="form-grid" onSubmit={e=>{e.preventDefault();submit('/waste',{...wasteForm,batch_id:wasteForm.batch_id||null},'Waste record added');}}><label>Batch (optional)<select value={wasteForm.batch_id} onChange={e=>setWasteForm({...wasteForm,batch_id:e.target.value})}><option value="">Unlinked</option>{batchOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label><label>Waste quantity (kg)<input type="number" min="0.1" step="0.1" required value={wasteForm.quantity_kg} onChange={e=>setWasteForm({...wasteForm,quantity_kg:e.target.value})}/></label><label>Waste type<select value={wasteForm.waste_type} onChange={e=>setWasteForm({...wasteForm,waste_type:e.target.value})}>{['overproduction','process_loss','damaged_product','quality_reject','expired_material','other'].map(v=><option key={v} value={v}>{pretty(v)}</option>)}</select></label><label>Disposition<select value={wasteForm.disposition} onChange={e=>setWasteForm({...wasteForm,disposition:e.target.value})}>{['rework_review','compost','biogas','approved_feed_route','disposal','other'].map(v=><option key={v} value={v}>{pretty(v)}</option>)}</select></label><label className="wide">Notes<input value={wasteForm.notes} onChange={e=>setWasteForm({...wasteForm,notes:e.target.value})}/></label><div className="hint wide">Food reuse, feed, compost and biogas routes must follow site approval and applicable safety rules. This app only records a selected route.</div><div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal('')}>Cancel</button><button className="primary" type="submit">Save waste record</button></div></form></Modal>}

      {modal==='complete'&&actionBatch&&<Modal title={`${['completed','quality_hold'].includes(actionBatch.status)?'Amend actual output':'Complete batch'} · ${actionBatch.batch_code}`} onClose={()=>setModal('')}><form className="form-grid" onSubmit={e=>{e.preventDefault();submit(`/batches/${actionBatch.id}/complete`,{actual_qty_kg:Number(actionForm.actual_qty_kg)},`Output saved for ${actionBatch.batch_code}.`);}}><label className="wide">Actual output (kg)<input type="number" min="0.001" max="99999999.99" step="0.001" required value={actionForm.actual_qty_kg} onChange={e=>setActionForm({...actionForm,actual_qty_kg:e.target.value})}/></label><div className="hint wide">Planned output: {money(actionBatch.planned_qty_kg)} kg. {['completed','quality_hold'].includes(actionBatch.status)?'This batch already has a recorded output; saving updates it and keeps the current status.':'Completing records the final output and marks the batch as completed.'}</div><div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal('')}>Cancel</button><button className="primary" type="submit">Save output</button></div></form></Modal>}

      {modal==='release'&&actionBatch&&<Modal title={`Release batch · ${actionBatch.batch_code}`} onClose={()=>setModal('')}><form className="form-grid" onSubmit={e=>{e.preventDefault();submit(`/batches/${actionBatch.id}/release`,{release_note:actionForm.release_note,acknowledge_failures:actionForm.acknowledge_failures},`Batch ${actionBatch.batch_code} released and approved.`);}}><label className="wide">Release note (3-500 characters)<textarea required minLength="3" maxLength="500" rows="3" value={actionForm.release_note} onChange={e=>setActionForm({...actionForm,release_note:e.target.value})} placeholder="State the review basis for approving this batch"/></label>{Number(actionBatch.open_failed_checks||0)>0&&<label className="wide"><input type="checkbox" checked={actionForm.acknowledge_failures} onChange={e=>setActionForm({...actionForm,acknowledge_failures:e.target.checked})}/> Acknowledge {Number(actionBatch.open_failed_checks)} open failed check(s) for this release</label>}<div className="hint wide">Requires recorded actual output and at least one quality check. A re-passed check supersedes an earlier failure; otherwise open failures must be acknowledged.</div><div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal('')}>Cancel</button><button className="primary" type="submit">Release batch</button></div></form></Modal>}

      {modal==='reject'&&actionBatch&&<Modal title={`Reject batch · ${actionBatch.batch_code}`} onClose={()=>setModal('')}><form className="form-grid" onSubmit={e=>{e.preventDefault();submit(`/batches/${actionBatch.id}/reject`,{reason:actionForm.reason},`Batch ${actionBatch.batch_code} rejected.`);}}><label className="wide">Rejection reason (3-500 characters)<textarea required minLength="3" maxLength="500" rows="3" value={actionForm.reason} onChange={e=>setActionForm({...actionForm,reason:e.target.value})} placeholder="Explain why this batch is being rejected"/></label><div className="hint wide">Rejected batches keep their full history and cannot be released, consumed or dispatched afterwards.</div><div className="form-actions"><button type="button" className="secondary" onClick={()=>setModal('')}>Cancel</button><button className="primary" type="submit">Reject batch</button></div></form></Modal>}

   </div>;

}

function BatchTable({rows,statusKind,action}) {

   return <div className="table-wrap"><table><thead><tr><th>Batch / product</th><th>Planned</th><th>Actual output</th><th>Yield</th><th>Status</th>{action&&<th>Actions</th>}</tr></thead><tbody>{rows.map(b=><tr key={b.id}><td><b className="mono">{b.batch_code}</b><small className="subcell">{b.product_name}</small></td><td>{money(b.planned_qty_kg)} kg</td><td>{money(b.actual_qty_kg)} kg</td><td><span className="yield">{b.planned_qty_kg?(100*b.actual_qty_kg/b.planned_qty_kg).toFixed(1)+'%':'—'}</span></td><td><Badge kind={statusKind(b.status)}>{String(b.status).replaceAll('_',' ')}</Badge></td>{action&&<td>{['planned','in_production','completed','quality_hold'].includes(b.status)&&<button className="text-btn" onClick={()=>action(b,'complete')}>{['completed','quality_hold'].includes(b.status)?'Amend output':'Complete'}</button>}{['in_production','completed','quality_hold'].includes(b.status)&&<button className="text-btn" disabled={!(Number(b.actual_qty_kg)>0)} title={!(Number(b.actual_qty_kg)>0)?'Record actual output before release':''} onClick={()=>action(b,'release')}>Release</button>}{['in_production','completed','quality_hold'].includes(b.status)&&<button className="text-btn" onClick={()=>action(b,'reject')}>Reject</button>}{b.status==='approved'&&<button className="text-btn" onClick={()=>action(b,'dispatch')}>Dispatch</button>}</td>}</tr>)}</tbody></table>{!rows.length&&<div className="empty">No records match.</div>}</div>;

}

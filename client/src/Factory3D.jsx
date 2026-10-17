import { useMemo, useState } from 'react';
import {
  Activity, Archive, ArrowRight, Bell, Boxes, CheckCircle2, ClipboardList,
  Clock3, Factory, Layers3, Package, RotateCcw, Search, ShieldCheck,
  Snowflake, Thermometer, Truck, ZoomIn
} from 'lucide-react';
import './factory3d.css';

const stations = [
  { id: 'storage', name: 'Ingredient Storage', page: 'Inventory & FEFO', note: 'Inventory lots from BakeTrack records.' },
  { id: 'mixing', name: 'Mixing Station', page: 'Recipes & consumption', note: 'Open recipes and recorded ingredient consumption.' },
  { id: 'conveyor', name: 'Dough Conveyor', page: 'Production batches', note: 'Conveyor illustration only; no conveyor sensor is connected.' },
  { id: 'oven', name: 'Oven Line 02', page: 'Production batches', note: '185°C is an illustrative demo value, not a sensor reading.' },
  { id: 'cooling', name: 'Cooling Rack', page: 'Quality control', note: 'Review recorded checks in Quality Control.' },
  { id: 'packing', name: 'Packaging', page: 'Production batches', note: 'Packaging state is illustrative demo information.' },
];

const activity = [
  ['14:12', 'Batch entered cooling stage', Snowflake],
  ['13:50', 'Oven Line 02 temperature stable at 185°C (demo)', Thermometer],
  ['13:45', 'Mixing completed for current batch', CheckCircle2],
  ['12:30', 'Quality check passed (demo activity)', ShieldCheck],
  ['11:20', 'Batch started (demo activity)', Activity],
];
const linePerformance = [['Oven Line 01', 92], ['Oven Line 02', 87], ['Oven Line 03', 76], ['Packaging Line', 88]];

export default function Factory3D({ batches = [], inventory = [], waste = [], onNavigate }) {
  const [selected, setSelected] = useState('oven');
  const [zoom, setZoom] = useState(false);
  const [line, setLine] = useState('All');
  const station = stations.find(s => s.id === selected) || stations[3];
  const activeBatches = useMemo(
    () => batches.filter(b => !['completed', 'approved', 'rejected', 'dispatched'].includes(String(b.status || '').toLowerCase())),
    [batches]
  );
  const planned = batches.reduce((n, b) => n + Number(b.planned_qty_kg || 0), 0);
  const actual = batches.reduce((n, b) => n + Number(b.actual_qty_kg || 0), 0);
  const wasteTotal = waste.reduce((n, w) => n + Number(w.quantity_kg || 0), 0);
  const currentBatch = activeBatches[0] || batches[0];
  const code = currentBatch?.batch_code || 'BT-2026-014';
  const product = currentBatch?.product_name || 'Butter Cookies';
  const plannedQty = Number(currentBatch?.planned_qty_kg || 500);
  const actualQty = Number(currentBatch?.actual_qty_kg || 0);
  const progress = currentBatch?.planned_qty_kg ? Math.min(100, Math.round(actualQty / plannedQty * 100)) : 68;

  const kpis = [
    { title: 'Active Batches', value: String(activeBatches.length || 3), sub: `${Math.min(2, activeBatches.length || 2)} running`, icon: Layers3, kind: 'green' },
    { title: 'Planned Production', value: `${(planned || 1100).toLocaleString('en-IN')} kg`, sub: '95%', icon: Archive, kind: 'amber', bar: '95%' },
    { title: 'Actual Production', value: `${(actual || 1047).toLocaleString('en-IN')} kg`, sub: '95.2%', icon: Activity, kind: 'green', bar: '95.2%' },
    { title: 'Waste Generated', value: `${(wasteTotal || 18).toLocaleString('en-IN')} kg`, sub: '1.6%', icon: Package, kind: 'red', bar: '4%' },
  ];

  return (
    <div className="bt3d">
      <header className="bt3d-welcome">
        <div><h1>Good Afternoon, Lalu!</h1><p>Here's what's happening in your bakery today.</p></div>
        <div className="bt3d-top-tools">
          <label className="bt3d-search"><Search size={16}/><input placeholder="Search batches, recipes, ingredients..."/><kbd>Ctrl K</kbd></label>
          <button className="bt3d-icon-button" aria-label="Notifications"><Bell size={18}/><i/></button>
          <div className="bt3d-user"><span>L</span><div><b>Lalu</b><small>Admin</small></div></div>
        </div>
      </header>

      <section className="bt3d-kpis">
        {kpis.map(({title,value,sub,icon:Icon,kind,bar}) => <article className="bt3d-kpi" key={title}>
          <div className={`bt3d-kpi-icon ${kind}`}><Icon size={22}/></div>
          <div className="bt3d-kpi-content"><span>{title}</span><strong>{value}</strong>
            {bar ? <div className={`bt3d-progress ${kind==='red'?'red':''}`}><i style={{width:bar}}/></div> : <small>● {sub}</small>}
          </div>{bar && <b className="bt3d-percent">{sub}</b>}
        </article>)}
      </section>

      <div className="bt3d-main-grid">
        <section className="bt3d-floor-card">
          <div className="bt3d-floor-toolbar">
            <div className="bt3d-floor-title"><span>●</span><b>Bakery Production Floor</b><em>● Visual simulation</em></div>
            <div className="bt3d-controls">
              <label>Production Line: <select value={line} onChange={e=>setLine(e.target.value)}><option>All</option><option>Oven</option><option>Mixing</option><option>Packaging</option></select></label>
              <button onClick={()=>setSelected(stations[(stations.findIndex(s=>s.id===selected)+1)%stations.length].id)}><RotateCcw size={14}/> Rotate</button>
              <button onClick={()=>setZoom(v=>!v)}><ZoomIn size={14}/> Zoom</button>
              <button onClick={()=>{setSelected('oven');setZoom(false);setLine('All')}}><RotateCcw size={14}/> Reset</button>
            </div>
          </div>
          <div className={`bt3d-scene ${zoom?'zoomed':''}`}>
            <img className="bt3d-floor-image" src="/factory-floor.png" alt="Illustrative bakery production floor with ingredient storage, mixing, oven, cooling and packaging areas"/>
            <div className="bt3d-hotspots" aria-label="Interactive production stations">
              <button className="hotspot storage" aria-label="Ingredient Storage" onClick={()=>setSelected('storage')}/>
              <button className="hotspot mixing" aria-label="Mixing Station" onClick={()=>setSelected('mixing')}/>
              <button className="hotspot conveyor" aria-label="Dough Conveyor" onClick={()=>setSelected('conveyor')}/>
              <button className="hotspot oven" aria-label="Oven Line 02" onClick={()=>setSelected('oven')}/>
              <button className="hotspot cooling" aria-label="Cooling Rack" onClick={()=>setSelected('cooling')}/>
              <button className="hotspot packing" aria-label="Packaging" onClick={()=>setSelected('packing')}/>
            </div>
            <div className="bt3d-scene-note">Factory floor visual · click a station label to inspect it</div>
          </div>
        </section>

        <aside className="bt3d-machine-card">
          <div className="bt3d-machine-head"><span className="bt3d-status-dot"/><h2>{station.name}</h2><button title="Reset selected station" onClick={()=>setSelected('oven')}>•••</button></div>
          <img className="bt3d-oven-image" src="/oven-line.png" alt="Illustrative industrial bakery oven"/>
          <div className="bt3d-detail-row"><span><ClipboardList size={15}/> Status</span><b className="bt3d-running">{selected==='oven'?'Running · demo':selected==='mixing'?'Completed · demo':selected==='cooling'||selected==='packing'?'Pending · demo':'Ready · demo'}</b></div>
          <div className="bt3d-detail-row"><span><Thermometer size={15}/> Temperature</span><b>{selected==='oven'?'185°C':'—'} <small>{selected==='oven'?'demo':''}</small></b></div>
          <div className="bt3d-detail-row"><span><Package size={15}/> Current Batch</span><b>{code}<small>{product}</small></b></div>
          <div className="bt3d-progress-label"><span>Recorded output vs plan</span><b>{progress}%</b></div><div className="bt3d-progress large"><i style={{width:`${progress}%`}}/></div>
          <div className="bt3d-time-box"><div><Clock3 size={14}/><span>Started<small>Demo: 10 Oct, 11:20</small></span></div><div><Clock3 size={14}/><span>ETA<small>Demo: Today, 15:30</small></span></div></div>
          <p className="bt3d-detail-note">{station.note} No machine controller or live temperature telemetry is connected.</p>
          <button className="bt3d-primary" onClick={()=>onNavigate?.(station.page)}>View details <ArrowRight size={16}/></button>
        </aside>
      </div>

      <div className="bt3d-bottom-grid">
        <section className="bt3d-bottom-card bt3d-batch-progress"><h3><ClipboardList size={16}/> Batch Progress – {code}</h3><p>{product} · {plannedQty} kg</p>
          <div className="bt3d-steps">{[['Recipe','Completed'],['Mixing','Completed'],['Baking','In Progress'],['Cooling','Pending'],['Packaging','Pending']].map(([name,state],i)=><div key={name} className={`bt3d-step ${i<2?'done':''} ${i===2?'current':''}`}><span>{i<2?'✓':i===2?'▣':i===3?'❄':'⬡'}</span><b>{name}</b><small>{state}</small></div>)}</div>
          <div className="bt3d-demo-caption">Workflow stages are illustrative demo data.</div>
        </section>
        <section className="bt3d-bottom-card"><div className="bt3d-card-title"><h3>Recent Activity</h3><button onClick={()=>onNavigate?.('Traceability')}>View all</button></div><div className="bt3d-activity">{activity.map(([time,label,Icon])=><div key={time}><time>{time}</time><Icon size={14}/><span>{label}</span></div>)}</div></section>
        <section className="bt3d-bottom-card"><div className="bt3d-card-title"><h3>Line Performance (Today)</h3><button onClick={()=>onNavigate?.('Production batches')}>View all</button></div><div className="bt3d-lines">{linePerformance.map(([name,value])=><div key={name}><span>{name}</span><b>{value}%</b><div><i className={value<80?'warning':''} style={{width:`${value}%`}}/></div></div>)}</div><div className="bt3d-demo-caption">Illustrative performance, not live machine telemetry.</div></section>
      </div>
    </div>
  );
}

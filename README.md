# BakeTrack ERP — MVP starter

Independent portfolio prototype for bakery production, inventory, batch traceability, quality checks, and waste analytics. Not affiliated with BakeMate.

## Stack
- React + Vite
- Node.js + Express
- MySQL

## 1. Requirements
Install Node.js LTS and MySQL Server. Create a database using `server/schema.sql`.

## 2. Configure backend
```bash
cd server
npm install
copy .env.example .env
```
Edit `.env` with your MySQL credentials.

## 3. Start backend
```bash
npm run dev
```
Backend runs on `http://localhost:5000`.

## 4. Start frontend (new terminal)
```bash
cd client
npm install
npm run dev
```
Open the URL Vite prints (normally `http://localhost:5173`).

## Current MVP
- Dashboard KPIs
- Raw-material lot inventory and FEFO view
- Create production batches
- Quality inspection pass/fail with batch hold/release state
- Waste entries and summary
- Basic traceability view by batch ID

## Important
All demo rows are synthetic sample data. Do not describe the app as production-ready or as used by BakeMate. Before a real deployment, add authentication/authorization, input validation, audit logs, migrations, backups, tests, and security hardening.
BakeTrack Factory 3D UI update

Files:
- Factory3D.jsx: replacement component for client/src/Factory3D.jsx
- factory3d.css: CSS imported by Factory3D.jsx

Install:
1. Back up your existing client/src/Factory3D.jsx.
2. Copy this Factory3D.jsx into client/src/Factory3D.jsx (replace existing).
3. Copy factory3d.css into client/src/factory3d.css.
4. Ensure App.jsx imports Factory3D from './Factory3D' and nav uses ['Factory 3D', Boxes], not Factory3D as the icon.
5. Run npm run build from the client folder.

Important:
- The 3D factory floor is a procedural illustrative model, not a photorealistic image.
- Temperature, time, performance and activity entries are labeled as demo/illustrative because no machine telemetry is connected.
- Existing ERP API records are used for batch, inventory and waste totals when available; fallback numbers are illustrative demo values.

One small App.jsx adjustment:
Find <main className="main"> and replace it with:
<main className={`main ${page === 'Factory 3D' ? 'factory3d-active' : ''}`}>
This hides the original ERP topbar only on Factory 3D, avoiding a duplicated header. Keep the existing page-heading conditional that hides the old page heading for Factory 3D.

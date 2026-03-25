# SAP O2C Graph Explorer

A Graph-Based Data Modeling + LLM Query System for SAP Order-to-Cash (O2C) data. 
**Works locally and deploys to production on Vercel (frontend) + Railway (backend).**

---

## 🚀 Quick Deployment (Production)

### Deploy to Vercel (Frontend) + Railway (Backend)

#### Step 1: Deploy Backend to Railway

```bash
npm install -g @railway/cli
railway login
cd backend
railway init
railway up
# Copy the Railway URL (e.g., https://o2c-backend-xyz.railway.app)
```

#### Step 2: Set Frontend Environment Variable in Vercel

1. Go to [Vercel Dashboard](https://vercel.com) → Your Project
2. **Settings** → **Environment Variables**
3. Add: `VITE_API_URL` = `https://your-railway-url.railway.app`
4. **Redeploy**

#### Step 3: Deploy Frontend to Vercel

```bash
npm install -g vercel
cd frontend
vercel --prod
```

**Frontend URL will be:** `https://your-project.vercel.app`

---

## 🏠 Local Development

### 1. Set up PostgreSQL

```bash
psql -U postgres -c "CREATE DATABASE o2c_graph;"
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env

# Edit .env — set:
# - DATABASE_URL=postgresql://user:pass@localhost:5432/o2c_graph
# - GROQ_API_KEY=gsk_xxxx (free at console.groq.com)
# - PORT=3001

npm run db:push    # Push schema to PostgreSQL
npm run ingest     # Load SAP JSONL data
npm run dev        # Start with hot reload (or: npm start)
```

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in browser.

Local API calls are **automatically proxied** to `localhost:3001` via Vite dev server.

---

## 🎯 Features

### Graph Visualization
- **Force-directed layout** with physics tuning (react-force-graph-2d)
- **Lazy subgraph expansion** — click any node to expand its O2C flow
- **Interactive highlighting** — hover over nodes to see connections
- **Real-time focus** — zoom to specific order flows
- **Node types** — 7 entity types with distinct colors

### LLM Query Engine (Dodge AI)
- **Natural language queries** → PostgreSQL SQL (deterministic generation, temperature=0)
- **3-stage pipeline**: Classification → SQL Generation → Response Formatting
- **Query patterns** — Automatically chooses simple queries for simple requests
- **Smart retries** — Auto-fixes schema errors with context-aware hints
- **Rate limiting** — 20 req/min per IP
- **CSV Export** — Download query results in one click
- **SQL visibility** — See generated SQL before execution

### Data Model
- **16 SAP tables** — O2C flow from order through journal entry
- **Normalized relationships** — Foreign keys: salesOrder → delivery → billing → payment
- **Prisma ORM** — Type-safe database queries
- **PostgreSQL** — Production-ready relational database

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                  │
│  ┌───────────────────────┐    ┌──────────────────────────┐  │
│  │  Graph Visualization  │    │   Dodge AI Chat Panel    │  │
│  │  react-force-graph-2d │    │  Natural Language Query  │  │
│  │  Force-directed layout│    │  CSV Export + SQL View   │  │
│  └───────────────────────┘    └──────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                          │ HTTP (vite proxy :3001 local, VITE_API_URL prod)
┌──────────────────────────▼──────────────────────────────────┐
│                   Backend (Node.js + Express)                │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │  /graph  │   │   /query     │   │    LLM Pipeline      │ │
│  │  Routes  │   │   Routes     │   │  Classify → SQL →    │ │
│  │          │   │              │   │  Execute → Format    │ │
│  └────┬─────┘   └──────┬───────┘   └──────────┬───────────┘ │
│       │                │                      │             │
│  ┌────▼────────────────▼──────────────────────▼──────────┐  │
│  │              Graph Construction Layer                  │  │
│  │   nodes[] + edges[] from LEFT JOIN queries            │  │
│  │   ID normalization · deduplication · lazy expansion   │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐  │
│  │              Prisma ORM + PostgreSQL                   │  │
│  │  16 tables: sales_orders, deliveries, billing,        │  │
│  │  payments, business_partners, products, etc.          │  │
│  └────────────────────────────────────────────────────────┘  │
│                        Groq API (LLM)                        │
│                  (llama-3.3-70b-versatile)                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 🔧 Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 18.3.1 |
| Build | Vite | 5.4.11 |
| Styling | Tailwind CSS | 3.4.19 |
| Graph | react-force-graph-2d | 1.29.1 |
| Backend | Node.js + Express | 4.21 |
| ORM | Prisma | 5.22 |
| Database | PostgreSQL | (Neon/self-hosted) |
| LLM | Groq | llama-3.3-70b |
| Rate Limit | express-rate-limit | 8.3.1 |

---

## 📁 Project Structure

```
forward-deployment-task/
├── README.md                    # This file
├── .gitignore
├── .vercelignore               # Files excluded from Vercel deploy
├── vercel.json                 # Vercel build config
├── DEPLOYMENT.md               # Detailed deployment guide
│
├── backend/
│   ├── index.js                # Express app + CORS + trust proxy
│   ├── package.json
│   ├── .env                    # Secrets (gitignored)
│   ├── .env.example            # Template
│   │
│   ├── prisma/
│   │   └── schema.prisma       # 16-table PostgreSQL schema
│   │
│   ├── db/
│   │   └── prisma.js           # Prisma client singleton
│   │
│   ├── routes/
│   │   ├── graph.js            # GET /graph, GET /graph/:nodeId
│   │   ├── query.js            # POST /query (rate-limited LLM pipeline)
│   │   └── ingest.js           # GET /ingest/status
│   │
│   ├── services/
│   │   └── graph.js            # Node/edge builders, subgraph logic
│   │
│   ├── llm/
│   │   └── groq.js             # 3-stage LLM: classify → SQL → format
│   │                           # Query patterns, smart retry, caching
│   │
│   └── scripts/
│       └── ingest.js           # One-time JSONL → PostgreSQL
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js          # Dev proxy + build config
│   ├── tailwind.config.js
│   ├── .env                    # VITE_API_URL (gitignored)
│   ├── .env.example            # Template
│   │
│   └── src/
│       ├── main.jsx            # React entry
│       ├── App.jsx             # Root component
│       ├── api.js              # API base URL (local or production)
│       │
│       ├── pages/
│       │   └── Dashboard.jsx   # Layout, state, graph+chat sync
│       │
│       ├── components/
│       │   ├── GraphView.jsx   # react-force-graph-2d canvas
│       │   ├── ChatPanel.jsx   # Dodge AI chat + LLM queries
│       │   └── NodeDetailsCard.jsx  # Node metadata floating card
│       │
│       └── hooks/              # Custom React hooks (reserved)
│
└── sap-o2c-data/               # 19 JSONL folders
    └── (not in git)
```

---

## 🌐 Environment Variables

### backend/.env

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/o2c_graph
GROQ_API_KEY=gsk_xxxxxxxxxxxx  # Free at console.groq.com
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

**Production** (`NODE_ENV=production` on Railway):
```env
DATABASE_URL=postgresql://...@neon.tech
GROQ_API_KEY=gsk_xxxxxxxxxxxx
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://your-frontend.vercel.app
```

### frontend/.env

**Local development** (Vite proxy auto-routes to backend:3001):
```env
# Leave empty or comment out
# VITE_API_URL=
```

**Production** (Vercel):
```env
VITE_API_URL=https://your-backend.railway.app
```

---

## 📊 LLM Pipeline

### Architecture (3 Stages)

**Stage 1: Domain Classification**
- Input: User question
- Output: RELATED or UNRELATED
- Purpose: Reject off-topic queries early
- Model: llama-3.3-70b-versatile

**Stage 2: SQL Generation**
- Input: Full schema + key join paths + query patterns
- Output: Single PostgreSQL SELECT statement
- Rules:
  - SELECT only (no INSERT/UPDATE/DELETE)
  - Always double-quote camelCase columns
  - Use LEFT JOIN for flow traces
  - Join payments via `accountingDocument`, NOT `invoiceReference` ❌
  - LIMIT 50 default
  - Deterministic: temperature=0
- Model: llama-3.3-70b-versatile
- Safety: validateSQL() + 21 retryable error codes

**Stage 3: Response Formatting**
- Input: Query results (up to 25 rows)
- Output: Natural language, structured answer
  - Single records: Key: Value format
  - Multiple records: Bullet list format
  - Status codes decoded (C=Complete, A=None, B=Partial)
  - Currency always included
- Model: llama-3.3-70b-versatile (temperature=0.1)

### Query Pattern Recognition

| Pattern | Detection | SQL Strategy |
|---------|-----------|--------------|
| **Single record details** | "give details of", "show", "get" + entity ID | Simple SELECT + WHERE, minimal joins |
| **Full flow trace** | "trace", "full flow", "complete journey" | Complete LEFT JOIN chain (sales→delivery→billing→payment) |
| **Summary/Aggregation** | "total", "unpaid", "count", "revenue" | GROUP BY + SUM/COUNT on appropriate headers |

### Guardrails

| Guard | Implementation |
|-------|---------------|
| Domain filter | Separate classification LLM call |
| SQL injection | SELECT-only; banned keywords checked |
| Multi-statement | extractFirstStatement() strips after `;` |
| Schema grounding | Full SCHEMA_DESCRIPTION in system prompt |
| Result size | LIMIT 50 enforced + examples |
| Rate limiting | 20 req/min per IP via express-rate-limit |
| Response caching | In-memory Map (repeat questions skip LLM calls) |

---

## 🎨 Graph Visualization

**Physics Config**
- Charge strength: -900 (repulsion)
- Link distance: 70px
- Link strength: 0.9
- Node collision: 18px

**Node Types & Colors**

| Type | Color | Represents |
|------|-------|------------|
| Sales Order | `#3B82F6` | O2C root |
| Delivery | `#60A5FA` | Goods movement |
| Invoice | `#EF4444` | Billing |
| Payment | `#DC2626` | AR payment |
| Customer | `#2563EB` | Business partner |
| Product | `#93C5FD` | Material |
| Journal | `#F87171` | FI entry |

**Interactions**
- **Click**: Open metadata card
- **Expand**: Fetch + merge subgraph
- **Focus**: Replace graph with node's subgraph
- **Hover**: Highlight node + neighbors
- **Reset View**: Reload overview
- **Minimize**: Full-width chat mode

---

## 📚 Data Model

### O2C Entity Flow

```
BusinessPartner ──places──► SalesOrder ──contains──► SalesOrderItem ──→ Product
                                │
                    delivered via│
                                ▼
                    OutboundDeliveryHeader ─item─→ OutboundDeliveryItem
                                │
                         billed via│
                                ▼
                    BillingDocumentHeader ─item─→ BillingDocumentItem
                         │                              │
              linked via │                              │
         accountingDocument                          Product
                         │
                         ▼
                    JournalEntryItem          Payment
                         │                      │
                         └──────paid by ────────┘
```

### Critical Join Rules

| From | To | Column | Notes |
|------|----|---------|---------| 
| SalesOrder → Delivery | outbound_delivery_items | `referenceSdDocument = salesOrder` | |
| Delivery → Billing | billing_document_items | `referenceSdDocument = deliveryDocument` | |
| Billing → Payment | payments | `accountingDocument = billing.accountingDocument` | ✅ Correct |
| Billing → Journal | journal_entry_items | `accountingDocument = billing.accountingDocument` | ✅ Correct |
| Billing (item) → Accounting | ❌ | ❌ `billing_document_items.accountingDocument` | DOES NOT EXIST! Use billing_document_headers |
| Payment → Billing | payments | ❌ `invoiceReference` | ALWAYS NULL! Use `accountingDocument` |

---

## 🧪 Example Queries

Try these in the chat:

```
Give details of SO 740527
Get invoice 90504207
Show delivery D80737721

Give full details of order 740506
Trace full flow of billing document 90504248
Which invoices are unpaid?

Find orders delivered but not billed
Show O2C funnel — how many orders reached each stage
What is order-to-delivery cycle time?

Which customers have outstanding unpaid invoices?
Show revenue by customer
Which products have never been ordered?
Which sales orders have cancelled billing documents?
```

---

## 🔧 Troubleshooting

### "SCHEMA ERROR: billing_document_items does not have accountingDocument"

**Cause:** LLM tried to use a column that doesn't exist.
**Fix:** LLM retries automatically with better hints. If persists:
- Check backend logs for retry success/failure
- Verify Railway deployed latest code (commit `b92921a` or later)
- Wait 2-3 minutes for Railway redeploy after git push

### Vite Proxy Not Working (Local Dev)

**Symptom:** Frontend gets 404 calling `/query`
**Fix:**
```bash
# Restart frontend dev server
cd frontend
npm run dev
```

### Database Connection Error

**Symptom:** "connect ECONNREFUSED 127.0.0.1:5432"
**Check:**
```bash
psql -U postgres -c "\l"    # List databases
npm run db:push              # Push schema
npm run db:generate          # Regenerate Prisma client
```

### CORS Error on Production

**Symptom:** Frontend requests blocked from vercel.app
**Fix:**
1. Check `backend/.env` has `FRONTEND_URL=https://your-frontend.vercel.app`
2. Restart Railway: Dashboard → Deployments → Redeploy
3. Verify CPU/network in Railway logs

### LLM Takes Too Long

**Cause:** First request to question (not cached)
**Normal:** Groq API takes 2-5 seconds
**Cached:** Repeat questions are instant

---

## 📝 API Reference

### GET /graph
**Overview graph** — 20 most recent orders with full O2C chains.

### GET /graph/:nodeId
**Subgraph expansion** — fetch related nodes for any entity.

| Prefix | Expands To |
|--------|-----------|
| `so-740506` | Full O2C chain (deliveries, invoices, payments) |
| `bp-320000083` | Customer + all their orders |
| `del-80737721` | Delivery + source orders + billing |
| `bill-90504204` | Invoice + delivery + payments + journal |
| `pay-9400000205-1` | Payment + linked invoice |
| `prod-B8907367022152` | Product + orders containing it |

### POST /query
**Natural language → SQL → formatted result**

```json
// Request
POST /query
{ "question": "Which invoices are unpaid?" }

// Response (200 OK)
{
  "answer": "There are 43 unpaid invoices totaling $2.1M...",
  "sql": "SELECT DISTINCT bdh...",
  "data": [
    { "billingDocument": "90504204", "totalNetAmount": 5000.00, ... },
    ...
  ],
  "isUnrelated": false
}

// Response (400 Bad Request)
{
  "message": "Query failed after retry: SCHEMA ERROR..."
}
```

### GET /ingest/status
**Record counts** — health check for data load.

```json
{
  "sales_order_headers": 100,
  "billing_document_headers": 163,
  "payments": 120,
  ...
}
```

### GET /health
**Backend health** — always returns `{"status": "ok"}`.

---

## 🚨 Production Checklist

- [ ] Backend deployed to Railway
- [ ] Frontend deployed to Vercel
- [ ] Set `VITE_API_URL` in Vercel environment variables
- [ ] Set `FRONTEND_URL` inRailway environment variables
- [ ] Test `/health` endpoint
- [ ] Test a simple query: "How many sales orders exist?"
- [ ] Monitor Railway logs for errors
- [ ] Monitor Vercel build logs for deployment issues

---

## 📄 Files of Interest

| File | Purpose |
|------|---------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Step-by-step deployment guide (Railway + Vercel) |
| [vercel.json](vercel.json) | Vercel build config |
| [.vercelignore](.vercelignore) | Files excluded from Vercel |
| [backend/.env.example](backend/.env.example) | Backend secrets template |
| [frontend/.env.example](frontend/.env.example) | Frontend config template |

---

## 📖 Learn More

- **Prisma Docs**: https://www.prisma.io/docs
- **Groq API**: https://console.groq.com
- **React Force Graph**: https://github.com/vasturiano/react-force-graph
- **Vite**: https://vitejs.dev
- **Vercel**: https://vercel.com
- **Railway**: https://railway.app

---

**Built for semester project demonstration of O2C data flow visualization + LLM integration.** ✨


## Tech Stack


| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Graph Visualization | react-force-graph-2d (force-directed) |
| Backend | Node.js + Express |
| Database | PostgreSQL |
| ORM | Prisma |
| LLM | Groq API (llama-3.3-70b-versatile) |


---


## Project Structure


```
Forward_developed_Task/
│
├── README.md                          # This file
├── .gitignore
│
├── backend/
│   ├── index.js                       # Express app entry — CORS, routes, error handler
│   ├── package.json
│   ├── package-lock.json
│   │
│   ├── .env                           # ← actual secrets (gitignored)
│   │   ├── DATABASE_URL               #   postgresql://user:pass@host:5432/o2c_graph
│   │   ├── GROQ_API_KEY               #   gsk_xxxx (free at console.groq.com)
│   │   ├── PORT                       #   3001
│   │   └── FRONTEND_URL               #   http://localhost:5173 (prod CORS origin)
│   │
│   ├── .env.example                   # Safe template — copy to .env and fill in values
│   │
│   ├── prisma/
│   │   └── schema.prisma              # 16-table PostgreSQL schema (all O2C entities)
│   │
│   ├── db/
│   │   └── prisma.js                  # Prisma client singleton (shared across app)
│   │
│   ├── routes/
│   │   ├── graph.js                   # GET /graph, GET /graph/:nodeId
│   │   ├── query.js                   # POST /query — NL → SQL pipeline + rate limiter
│   │   └── ingest.js                  # GET /ingest/status — record counts per table
│   │
│   ├── services/
│   │   └── graph.js                   # Node/edge builder, all subgraph expansion functions
│   │
│   ├── llm/
│   │   └── groq.js                    # 3-stage LLM pipeline: classify → SQL → format
│   │                                  # Includes: in-memory cache, smart retry on DB errors
│   │
│   └── scripts/
│       └── ingest.js                  # One-time bulk JSONL → PostgreSQL ingestion script
│
├── frontend/
│   ├── index.html                     # Vite HTML entry
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js                 # Dev proxy: /graph, /query → localhost:3001
│   ├── tailwind.config.js             # Tailwind + scrollbar-hide utility
│   ├── postcss.config.js
│   │
│   ├── .env                           # ← actual frontend env (gitignored)
│   │   └── VITE_API_URL               #   https://your-backend.railway.app (prod only)
│   │
│   ├── .env.example                   # Safe template — leave VITE_API_URL empty for local dev
│   │
│   └── src/
│       ├── main.jsx                   # React entry point
│       ├── App.jsx                    # Root component — renders Dashboard
│       ├── index.css                  # Global styles + Tailwind directives
│       ├── api.js                     # API base URL helper (reads VITE_API_URL)
│       │
│       ├── pages/
│       │   └── Dashboard.jsx          # Layout, state, graph+chat coordination
│       │                              # Handles: load, expand, focus, highlight, toast
│       │
│       ├── components/
│       │   ├── GraphView.jsx          # react-force-graph-2d canvas + physics config
│       │   │                          # Node rendering, hover highlight, zoom-to-fit
│       │   ├── ChatPanel.jsx          # Dodge AI chat UI
│       │   │                          # Suggestion pills, CSV export, SQL toggle
│       │   │                          # Fires graph highlight on query results
│       │   └── NodeDetailsCard.jsx    # Floating metadata card on node click
│       │
│       └── hooks/                     # (reserved for custom hooks)
│
└── sap-o2c-data/                      # 19 JSONL dataset folders (not in git)
```


---


## Environment Variables


### backend/.env


| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string — `postgresql://user:pass@host:5432/o2c_graph` |
| `GROQ_API_KEY` | ✅ | Groq API key — free at [console.groq.com](https://console.groq.com) |
| `PORT` | optional | Backend port, defaults to `3001` |
| `FRONTEND_URL` | optional | CORS origin in production, e.g. `https://your-app.vercel.app` |


### frontend/.env


| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | production only | Backend URL, e.g. `https://your-backend.railway.app`. Leave empty for local dev — Vite proxy handles it |


---


## Quick Start


### 1. Set up PostgreSQL


```bash
psql -U postgres -c "CREATE DATABASE o2c_graph;"
```


### 2. Backend Setup


```bash
cd backend
npm install


cp .env.example .env
# Edit .env — set DATABASE_URL and GROQ_API_KEY


npm run db:push   # push schema to PostgreSQL
npm run ingest    # load all JSONL data into DB
npm run dev       # start with hot reload (or: npm start)
```


### 3. Frontend Setup


```bash
cd frontend
npm install
npm run dev
```


Open **http://localhost:5173** (or 5174 if port is in use)


---


## Data Ingestion


`backend/scripts/ingest.js` reads all 19 JSONL folders from `sap-o2c-data/` and upserts into PostgreSQL:


| Folder | Table | Records |
|--------|-------|---------|
| `products` + `product_descriptions` | `products` | 69 |
| `business_partners` | `business_partners` | 8 |
| `business_partner_addresses` | `business_partner_addresses` | 8 |
| `customer_company_assignments` | `customer_company_assignments` | 8 |
| `customer_sales_area_assignments` | `customer_sales_area_assignments` | 28 |
| `sales_order_headers` | `sales_order_headers` | 100 |
| `sales_order_items` | `sales_order_items` | 167 |
| `sales_order_schedule_lines` | `sales_order_schedule_lines` | 179 |
| `outbound_delivery_headers` | `outbound_delivery_headers` | 86 |
| `outbound_delivery_items` | `outbound_delivery_items` | 137 |
| `billing_document_headers` + cancellations | `billing_document_headers` | 163 |
| `billing_document_items` | `billing_document_items` | 245 |
| `journal_entry_items_accounts_receivable` | `journal_entry_items` | 123 |
| `payments_accounts_receivable` | `payments` | 120 |
| `plants` | `plants` | 44 |
| `product_plants` | `product_plants` | 3,036 |
| `product_storage_locations` | `product_storage_locations` | 16,723 |


---


## Data Model


### O2C Entity Flow


```
BusinessPartner ──places──► SalesOrderHeader ──contains──► SalesOrderItem
                                   │                              │
                       delivered via│                          Product
                                   ▼
                       OutboundDeliveryHeader
                                   │
                            billed via│
                                   ▼
                       BillingDocumentHeader ──posted to──► JournalEntryItem
                                   │
                             paid by│  (join: accountingDocument)
                                   ▼
                                Payment
```


### Key Join Paths


| From | To | Join Column |
|------|----|-------------|
| SalesOrder → Delivery | `outbound_delivery_items` | `referenceSdDocument = salesOrder` |
| Delivery → Billing | `billing_document_items` | `referenceSdDocument = deliveryDocument` |
| Billing → Journal | `journal_entry_items` | `accountingDocument = billing.accountingDocument` |
| Billing → Payment | `payments` | `accountingDocument = billing.accountingDocument` |
| Order → Customer | `sales_order_headers` | `soldToParty = businessPartner` |
| Item → Product | `sales_order_items` | `material = product` |


> **Important:** `payments.invoiceReference` is NULL in this dataset. Payment-to-billing links are resolved exclusively via `payments.accountingDocument = billing_document_headers.accountingDocument`.


---


## Graph Construction Strategy


We transform relational SAP data into a **logical graph abstraction** on top of PostgreSQL. Rather than a native graph database, we construct the graph layer dynamically using JOIN queries mapped into a standard `{ nodes, edges }` structure.


### Node + Edge Builder


Every entity becomes a node, every foreign-key relationship becomes a directed edge:


```js
// Node
{ id: "so-740506", label: "SO 740506", type: "salesOrder", data: { ... } }


// Edge
{ id: "so-740506→del-80737721", source: "so-740506", target: "del-80737721", label: "delivered via" }
```


### ID Normalization


| Entity | Prefix | Example |
|--------|--------|---------|
| Sales Order | `so-` | `so-740506` |
| Business Partner | `bp-` | `bp-320000083` |
| Delivery | `del-` | `del-80737721` |
| Billing Doc | `bill-` | `bill-90504204` |
| Payment | `pay-` | `pay-9400000205-1` |
| Journal Entry | `je-` | `je-9400000205-1` |
| Product | `prod-` | `prod-B8907367022152` |


### Lazy Subgraph Expansion


The overview graph loads the 20 most recent orders. Clicking any node triggers `GET /graph/:nodeId` which fetches and **merges** only new nodes/edges — existing nodes are never duplicated (Map-based deduplication by ID).


---


## LLM Pipeline


### Three-Stage Architecture


```
User Question
     │
     ▼
[Stage 1] Domain Classification
 Model: llama-3.3-70b-versatile
 Output: RELATED or UNRELATED
 Purpose: Reject off-topic questions before SQL generation
     │
     ▼ (RELATED only)
[Stage 2] SQL Generation
 Model: llama-3.3-70b-versatile
 Input: Full schema (16 tables) + key join paths + 15 grounded SQL examples
 Rules enforced:
   - SELECT only (no INSERT/UPDATE/DELETE/DROP)
   - Always LEFT JOIN for flow traces
   - Join payments via accountingDocument, NOT invoiceReference
   - All camelCase columns double-quoted
   - LIMIT 50 default
 Safety: extractFirstStatement() + validateSQL() before execution
 Retry: auto-retries on DB errors (21000, 42703, 42702, 42P01)
     │
     ▼
[Stage 3] Response Formatting
 Model: llama-3.3-70b-versatile
 Input: Raw query results (up to 25 rows preview)
 Output: Structured natural language answer
   - Key: Value format for single records
   - Bullet lists for multiple records
   - Status codes decoded (C=Complete, A=None, B=Partial)
   - Currency always included
```


### Guardrails


| Guard | Implementation |
|-------|---------------|
| Domain filter | Separate classification LLM call with few-shot examples |
| SQL injection | Only SELECT allowed; banned keywords list checked |
| Multi-statement | `extractFirstStatement()` strips everything after first `;` |
| Schema grounding | LLM only sees real table/column names in prompt |
| Result size | LIMIT 50 enforced in prompt + examples |
| Rate limiting | 20 requests/min per IP via `express-rate-limit` |
| Type safety | BigInt → string, Decimal → string serialization |
| Response caching | In-memory Map — repeat questions skip all 3 Groq calls |


---


## Graph Visualization


Force-directed layout (react-force-graph-2d) with physics tuned for hub-spoke cluster formation:


- **Charge strength**: -900 (strong repulsion = explosive spread)
- **Link distance**: 70px, strength 0.9 (tight hub-spoke)
- **Collision**: 18px radius (prevents overlap)


### Node Types & Colors


| Type | Color | Represents |
|------|-------|------------|
| Customer | `#2563EB` | Business partner |
| Sales Order | `#3B82F6` | O2C root document |
| Delivery | `#60A5FA` | Outbound goods movement |
| Invoice | `#EF4444` | Billing document |
| Payment | `#DC2626` | AR payment |
| Product | `#93C5FD` | Material master |
| Journal | `#F87171` | FI accounting entry |


### Interactions


| Action | Behaviour |
|--------|-----------|
| Click node | Opens metadata card |
| Expand | Fetches + merges subgraph |
| Focus | Replaces graph with node's subgraph |
| Hover | Highlights node + neighbours, dims rest |
| Reset View | Reloads overview (20 most recent orders) |
| Minimize | Collapses graph; chat takes full width |


---


## API Reference


### GET /graph
Overview graph — 20 most recent sales orders with full O2C chain.


### GET /graph/:nodeId
Subgraph for a specific node.


| Prefix | Expands |
|--------|---------|
| `so-` | Full O2C chain for that order |
| `bp-` | Customer + all their orders |
| `del-` | Delivery + source orders + billing |
| `bill-` | Invoice + delivery + payments + journal |
| `pay-` | Payment + linked invoice |
| `prod-` | Product + orders containing it |


### POST /query
Natural language → SQL → formatted answer.


```json
// Request
{ "question": "Which invoices are unpaid?" }


// Response
{
 "answer": "There are 43 unpaid invoices...",
 "sql": "SELECT ...",
 "data": [...],
 "isUnrelated": false
}
```


### GET /ingest/status
Record counts per table — health check.


---


## Example Queries


| Question | What it tests |
|----------|--------------|
| `Give full details of order 740506` | Full LEFT JOIN trace across all 6 tables |
| `Which invoices are unpaid?` | Payment join via accountingDocument |
| `Find orders delivered but not billed` | Broken flow — LEFT JOIN + NULL check |
| `Find orders billed but never paid` | Two-hop broken flow |
| `Trace full flow of billing document 90504248` | Reverse traversal from billing |
| `Which products have highest billing count?` | Aggregation across items + products |
| `Show O2C funnel — how many orders reached each stage` | Pipeline health summary |
| `What is the order-to-delivery cycle time?` | Date arithmetic across tables |
| `Which customers have outstanding unpaid invoices?` | AR aging |
| `Show revenue by customer` | Customer profitability rollup |
| `Which products have never been ordered?` | Dead stock detection |
| `Which sales orders have cancelled billing documents?` | Reversal/dispute detection |


---


## Architectural Decisions


### PostgreSQL over a Graph DB
The dataset has clear relational foreign keys and the LLM generates SQL far more reliably than Cypher or Gremlin. PostgreSQL with LEFT JOINs enables full graph traversal while keeping the LLM prompt simple and accurate.


### Force-Directed Layout over Columnar
Broken flows are visually obvious — disconnected nodes float away from their cluster. A fixed layout would hide structural gaps. Physics-based placement is more informative for exploratory O2C analysis.


### accountingDocument as Payment Join Key
`payments.invoiceReference` is NULL for all records. Payments link to billing via `payments.accountingDocument = billing_document_headers.accountingDocument`. This is documented explicitly in the LLM schema prompt to prevent incorrect SQL generation.


### Schema-in-Prompt over RAG
With 16 tables, the full schema fits in a single LLM context (< 2K tokens). RAG would add latency and retrieval complexity with no benefit at this scale.


### Three-Stage LLM Pipeline
Separating classification, SQL generation, and formatting gives independent control — the classifier tuned for recall, the SQL generator for precision, the formatter for output style — without each stage interfering with the others.


### In-Memory Cache
Identical questions skip all 3 Groq API calls. Simple `Map` keyed by normalised question string — sufficient for a single-server deployment.




/ /   r e d e p l o y 
 
 
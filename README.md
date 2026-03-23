# SAP O2C Graph Explorer


A Graph-Based Data Modeling + LLM Query System for SAP Order-to-Cash (O2C) data.


## Architecture


```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                  │
│  ┌───────────────────────┐    ┌──────────────────────────┐  │
│  │  Graph Visualization  │    │   Dodge AI Chat Panel    │  │
│  │  react-force-graph-2d │    │  Natural Language Query  │  │
│  │  Force-directed layout│    │  CSV Export + SQL View   │  │
│  └───────────────────────┘    └──────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                          │ HTTP (proxy via Vite → :3001)
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
│  │   nodes[] + edges[] built from relational JOIN queries │  │
│  │   ID normalization · deduplication · lazy expansion   │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│  ┌────────────────────────▼───────────────────────────────┐  │
│  │              Prisma ORM + PostgreSQL                   │  │
│  │  sales_orders · deliveries · billing · payments        │  │
│  │  business_partners · products · journal_entries        │  │
│  │  customer_company · customer_sales_area · storage_locs │  │
│  └────────────────────────────────────────────────────────┘  │
│                        Groq API (LLM)                        │
└──────────────────────────────────────────────────────────────┘
```


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




/ /   r e d e p l o y  
 
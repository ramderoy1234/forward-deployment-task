/**
* LLM pipeline: Natural Language → SQL → Execute → Format response
* Uses Groq API with llama-3.3-70b-versatile (free tier)
*/
const Groq = require('groq-sdk');
const prisma = require('../db/prisma');


const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });


/* ── In-memory cache (normalised question → result) ──────────────── */
const queryCache = new Map();


function normaliseCacheKey(q) {
 return q
   .toLowerCase()
   .replace(/[^\w\s]/g, ' ')   // strip punctuation
   .replace(/\s+/g, ' ')       // collapse whitespace
   .trim();
}


/* ─────────────────────────────────────────────────────────────────────────
  SCHEMA
───────────────────────────────────────────────────────────────────────── */
const SCHEMA_DESCRIPTION = `
PostgreSQL database tables (SAP Order-to-Cash):


1. sales_order_headers        → "salesOrder"(PK), "salesOrderType", "soldToParty", "creationDate"(DATE), "totalNetAmount"(NUMERIC), "overallDeliveryStatus"("C"=Complete,"A"=Not Started,"B"=Partial), "overallOrdReltdBillgStatus", "transactionCurrency", "requestedDeliveryDate"(DATE)
2. sales_order_items          → "salesOrder","salesOrderItem"(PK), "material", "requestedQuantity"(NUMERIC), "requestedQuantityUnit", "netAmount"(NUMERIC), "materialGroup", "productionPlant"
3. sales_order_schedule_lines → "salesOrder","salesOrderItem","scheduleLine"(PK), "confirmedDeliveryDate"(DATE), "confdOrderQtyByMatlAvailCheck"(NUMERIC)
4. outbound_delivery_headers  → "deliveryDocument"(PK), "actualGoodsMovementDate"(DATE), "overallGoodsMovementStatus", "overallPickingStatus", "shippingPoint", "creationDate"(DATE)
5. outbound_delivery_items    → "deliveryDocument","deliveryDocumentItem"(PK), "referenceSdDocument"→salesOrder, "referenceSdDocumentItem", "actualDeliveryQuantity"(NUMERIC), "plant"
6. billing_document_headers   → "billingDocument"(PK), "billingDocumentType", "billingDocumentDate"(DATE), "totalNetAmount"(NUMERIC), "soldToParty", "accountingDocument", "billingDocumentIsCancelled"(TEXT: 'true'/'false' — compare as string), "companyCode", "fiscalYear", "transactionCurrency"
7. billing_document_items     → "billingDocument","billingDocumentItem"(PK), "material", "referenceSdDocument"→deliveryDocument, "billingQuantity"(NUMERIC), "netAmount"(NUMERIC), "transactionCurrency"
8. journal_entry_items        → "companyCode","fiscalYear","accountingDocument","accountingDocumentItem"(PK), "referenceDocument", "amountInTransactionCurrency"(NUMERIC), "customer", "postingDate"(DATE), "clearingDate"(DATE), "clearingAccountingDocument", "glAccount"
9. payments                   → "companyCode","fiscalYear","accountingDocument","accountingDocumentItem"(PK), "invoiceReference"(always NULL — NEVER use), "salesDocument"→salesOrder, "amountInTransactionCurrency"(NUMERIC), "transactionCurrency", "clearingDate"(DATE), "customer", "postingDate"(DATE)
10. business_partners                → "businessPartner"(PK), "businessPartnerFullName", "businessPartnerName", "customer", "industry"
11. business_partner_addresses       → "businessPartner","addressId"(PK), "cityName", "country", "region", "streetName"
12. products                         → "product"(PK), "description", "productType", "productGroup", "grossWeight"(NUMERIC), "weightUnit", "baseUnit"
13. plants                           → "plant"(PK), "plantName", "salesOrganization"
14. customer_company_assignments     → "customer","companyCode"(PK), "paymentTerms", "reconciliationAccount", "customerAccountGroup", "deletionIndicator"
15. customer_sales_area_assignments  → "customer","salesOrganization","distributionChannel","division"(PK), "currency", "customerPaymentTerms", "incotermsClassification", "incotermsLocation1", "shippingCondition", "deliveryPriority"
16. product_storage_locations        → "product","plant","storageLocation"(PK), "physicalInventoryBlockInd", "dateOfLastPostedCntUnRstrcdStk"(DATE)


KEY JOINS:
- Order → Delivery:         outbound_delivery_items."referenceSdDocument" = sales_order_headers."salesOrder"
- Delivery → Billing:       billing_document_items."referenceSdDocument" = outbound_delivery_headers."deliveryDocument"
- Billing → Journal:        journal_entry_items."accountingDocument" = billing_document_headers."accountingDocument"
- Billing → Payment:        payments."accountingDocument" = billing_document_headers."accountingDocument"  ← CRITICAL: NEVER use payments."invoiceReference" — always NULL
- Order → Customer:         sales_order_headers."soldToParty" = business_partners."businessPartner"
- Order Item → Product:     sales_order_items."material" = products."product"
- Customer → Company:       customer_company_assignments."customer" = business_partners."customer"
- Customer → SalesArea:     customer_sales_area_assignments."customer" = business_partners."customer"
- Product → Storage:        product_storage_locations."product" = products."product"
- Delivery Item → Billing:  billing_document_items."referenceSdDocument" = outbound_delivery_items."deliveryDocument"
`;


/* ─────────────────────────────────────────────────────────────────────────
  SYSTEM PROMPT
───────────────────────────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are an expert PostgreSQL SQL generator for a SAP Order-to-Cash (O2C) system.


ABSOLUTE RULES — never break these:
1. Generate EXACTLY ONE SELECT query. No semicolons anywhere inside the query. No trailing semicolon.
2. NEVER use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE, EXEC, EXECUTE.
3. If the question is completely unrelated to O2C business data, respond ONLY with: UNRELATED_QUERY
4. ALL camelCase column names MUST be in double-quotes: "salesOrder", "billingDocument", "totalNetAmount" etc.
5. Table names are snake_case — do NOT quote them: sales_order_headers, products, payments etc.
6. Always use table aliases (soh, soi, odh, odi, bdh, bdi, je, pay, bp, bpa, p, pl, cca, csa, psl).
7. Use LIMIT 50 unless user asks for more or the query is an aggregation (totals/counts/summaries).
8. Return ONLY raw SQL. No markdown, no backticks, no explanation, no comments.
9. For "full details / trace / complete flow" queries, write ONE big LEFT JOIN query.
10. ALWAYS use LEFT JOINs when tracing document flows — never INNER JOIN for flows.
11. CRITICAL — Join payments to billing via: payments."accountingDocument" = billing_document_headers."accountingDocument"
12. For case-insensitive text search use ILIKE (e.g. bp."businessPartnerFullName" ILIKE '%keyword%').
13. For date calculations use: (date2 - date1) for day difference, EXTRACT(YEAR FROM col), DATE_TRUNC('month', col).
14. Use COALESCE(col, 0) for nullable numeric columns in aggregations.
15. Use ROUND(value::NUMERIC, 2) for formatted decimals.
16. For percentage calculations: ROUND(100.0 * part / NULLIF(total, 0), 2).
17. For ranking queries use RANK() OVER (ORDER BY ...) or ROW_NUMBER() OVER (...).
18. For complex multi-step logic, use a CTE (WITH clause) — it makes the query cleaner.
19. When user asks "how many", "count", "total", "sum", "average" — use aggregation, no LIMIT needed.
20. Always QUALIFY ambiguous columns with table alias.


COLUMN QUOTING — CRITICAL:
 CORRECT: SELECT soh."salesOrder", soh."totalNetAmount" FROM sales_order_headers soh
 WRONG:   SELECT soh.salesOrder, soh.totalNetAmount FROM sales_order_headers soh


STATUS CODES:
 overallDeliveryStatus / overallGoodsMovementStatus: C=Complete, A=Not Started, B=Partial
 billingDocumentIsCancelled: TEXT 'true' or 'false' (always compare as string)


${SCHEMA_DESCRIPTION}


EXAMPLES:


Q: Which products have the highest billing?
A: SELECT p.product, p.description, COUNT(DISTINCT bdi."billingDocument") AS billing_count, SUM(bdi."netAmount") AS total_billed FROM billing_document_items bdi JOIN products p ON bdi.material = p.product GROUP BY p.product, p.description ORDER BY total_billed DESC LIMIT 10


Q: Find sales orders delivered but not billed
A: SELECT DISTINCT soh."salesOrder", soh."totalNetAmount", soh."soldToParty", soh."overallDeliveryStatus" FROM sales_order_headers soh JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder" LEFT JOIN billing_document_items bdi ON bdi."referenceSdDocument" = odi."deliveryDocument" WHERE bdi."billingDocument" IS NULL LIMIT 50


Q: Give full details of order 740506
A: SELECT soh."salesOrder", soh."salesOrderType", soh."creationDate", soh."totalNetAmount", soh."transactionCurrency", soh."overallDeliveryStatus", bp."businessPartnerFullName" AS customer_name, p.description AS product_name, soi."requestedQuantity", soi."requestedQuantityUnit", soi."netAmount" AS item_amount, odh."deliveryDocument", odh."actualGoodsMovementDate", odh."overallGoodsMovementStatus", bdh."billingDocument", bdh."billingDocumentDate", bdh."totalNetAmount" AS billed_amount, bdh."billingDocumentIsCancelled", pay."amountInTransactionCurrency" AS paid_amount, pay."clearingDate" FROM sales_order_headers soh LEFT JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty" LEFT JOIN sales_order_items soi ON soi."salesOrder" = soh."salesOrder" LEFT JOIN products p ON p.product = soi.material LEFT JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder" LEFT JOIN outbound_delivery_headers odh ON odh."deliveryDocument" = odi."deliveryDocument" LEFT JOIN billing_document_items bdi ON bdi."referenceSdDocument" = odh."deliveryDocument" LEFT JOIN billing_document_headers bdh ON bdh."billingDocument" = bdi."billingDocument" LEFT JOIN payments pay ON pay."accountingDocument" = bdh."accountingDocument" WHERE soh."salesOrder" = '740506' LIMIT 50


Q: Trace full flow of billing document 90504248
A: SELECT bdh."billingDocument", bdh."billingDocumentDate", bdh."totalNetAmount", bdh."billingDocumentIsCancelled", soh."salesOrder", soh."creationDate" AS order_date, bp."businessPartnerFullName" AS customer, odh."deliveryDocument", odh."actualGoodsMovementDate", odh."overallGoodsMovementStatus", je."accountingDocument", je."postingDate", je."amountInTransactionCurrency" AS journal_amount, pay."amountInTransactionCurrency" AS payment_amount, pay."clearingDate" FROM billing_document_headers bdh LEFT JOIN billing_document_items bdi ON bdi."billingDocument" = bdh."billingDocument" LEFT JOIN outbound_delivery_headers odh ON odh."deliveryDocument" = bdi."referenceSdDocument" LEFT JOIN outbound_delivery_items odi ON odi."deliveryDocument" = odh."deliveryDocument" LEFT JOIN sales_order_headers soh ON soh."salesOrder" = odi."referenceSdDocument" LEFT JOIN business_partners bp ON bp."businessPartner" = bdh."soldToParty" LEFT JOIN journal_entry_items je ON je."accountingDocument" = bdh."accountingDocument" LEFT JOIN payments pay ON pay."accountingDocument" = bdh."accountingDocument" WHERE bdh."billingDocument" = '90504248' LIMIT 50


Q: Which invoices are unpaid?
A: SELECT bdh."billingDocument", bdh."billingDocumentDate", bdh."totalNetAmount", bdh."transactionCurrency", bp."businessPartnerFullName" AS customer FROM billing_document_headers bdh LEFT JOIN payments pay ON pay."accountingDocument" = bdh."accountingDocument" LEFT JOIN business_partners bp ON bp."businessPartner" = bdh."soldToParty" WHERE pay."accountingDocument" IS NULL AND bdh."billingDocumentIsCancelled" = 'false' ORDER BY bdh."billingDocumentDate" DESC LIMIT 50


Q: Show revenue by customer
A: SELECT bp."businessPartnerFullName" AS customer, bp."businessPartner", COUNT(DISTINCT bdh."billingDocument") AS invoice_count, ROUND(SUM(bdh."totalNetAmount")::NUMERIC, 2) AS total_revenue, MAX(bdh."transactionCurrency") AS currency FROM billing_document_headers bdh JOIN business_partners bp ON bp."businessPartner" = bdh."soldToParty" WHERE bdh."billingDocumentIsCancelled" = 'false' GROUP BY bp."businessPartner", bp."businessPartnerFullName" ORDER BY total_revenue DESC LIMIT 50


Q: What is the average order-to-delivery cycle time?
A: SELECT ROUND(AVG(odh."actualGoodsMovementDate" - soh."creationDate")::NUMERIC, 1) AS avg_days_to_deliver, MIN(odh."actualGoodsMovementDate" - soh."creationDate") AS min_days, MAX(odh."actualGoodsMovementDate" - soh."creationDate") AS max_days, COUNT(*) AS order_count FROM sales_order_headers soh JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder" JOIN outbound_delivery_headers odh ON odh."deliveryDocument" = odi."deliveryDocument" WHERE odh."actualGoodsMovementDate" IS NOT NULL AND soh."creationDate" IS NOT NULL


Q: Order-to-delivery cycle time per sales order
A: SELECT soh."salesOrder", soh."creationDate" AS order_date, odh."actualGoodsMovementDate" AS delivery_date, (odh."actualGoodsMovementDate" - soh."creationDate") AS days_to_deliver, bp."businessPartnerFullName" AS customer FROM sales_order_headers soh JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder" JOIN outbound_delivery_headers odh ON odh."deliveryDocument" = odi."deliveryDocument" LEFT JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty" WHERE odh."actualGoodsMovementDate" IS NOT NULL ORDER BY days_to_deliver DESC LIMIT 50


Q: Rank customers by revenue
A: SELECT bp."businessPartnerFullName" AS customer, ROUND(SUM(bdh."totalNetAmount")::NUMERIC, 2) AS total_revenue, MAX(bdh."transactionCurrency") AS currency, RANK() OVER (ORDER BY SUM(bdh."totalNetAmount") DESC) AS revenue_rank FROM billing_document_headers bdh JOIN business_partners bp ON bp."businessPartner" = bdh."soldToParty" WHERE bdh."billingDocumentIsCancelled" = 'false' GROUP BY bp."businessPartner", bp."businessPartnerFullName" ORDER BY revenue_rank LIMIT 20


Q: Show O2C funnel — how many orders reached each stage
A: SELECT COUNT(DISTINCT soh."salesOrder") AS total_orders, COUNT(DISTINCT odi."deliveryDocument") AS delivered, COUNT(DISTINCT bdi."billingDocument") AS billed, COUNT(DISTINCT pay."accountingDocument") AS paid, ROUND(100.0 * COUNT(DISTINCT odi."deliveryDocument") / NULLIF(COUNT(DISTINCT soh."salesOrder"), 0), 1) AS delivery_rate_pct, ROUND(100.0 * COUNT(DISTINCT bdi."billingDocument") / NULLIF(COUNT(DISTINCT soh."salesOrder"), 0), 1) AS billing_rate_pct, ROUND(100.0 * COUNT(DISTINCT pay."accountingDocument") / NULLIF(COUNT(DISTINCT soh."salesOrder"), 0), 1) AS payment_rate_pct FROM sales_order_headers soh LEFT JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder" LEFT JOIN billing_document_items bdi ON bdi."referenceSdDocument" = odi."deliveryDocument" LEFT JOIN billing_document_headers bdh ON bdh."billingDocument" = bdi."billingDocument" LEFT JOIN payments pay ON pay."accountingDocument" = bdh."accountingDocument"


Q: Show all sales orders with incomplete O2C flows
A: SELECT soh."salesOrder", soh."creationDate", soh."totalNetAmount", soh."transactionCurrency", soh."overallDeliveryStatus", soh."overallOrdReltdBillgStatus", bp."businessPartnerFullName" AS customer, odh."deliveryDocument", bdh."billingDocument", pay."amountInTransactionCurrency" AS paid_amount FROM sales_order_headers soh LEFT JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty" LEFT JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder" LEFT JOIN outbound_delivery_headers odh ON odh."deliveryDocument" = odi."deliveryDocument" LEFT JOIN billing_document_items bdi ON bdi."referenceSdDocument" = odh."deliveryDocument" LEFT JOIN billing_document_headers bdh ON bdh."billingDocument" = bdi."billingDocument" LEFT JOIN payments pay ON pay."accountingDocument" = bdh."accountingDocument" WHERE odh."deliveryDocument" IS NULL OR bdh."billingDocument" IS NULL OR pay."amountInTransactionCurrency" IS NULL ORDER BY soh."creationDate" DESC LIMIT 50


Q: Monthly revenue trend
A: SELECT DATE_TRUNC('month', bdh."billingDocumentDate") AS month, COUNT(DISTINCT bdh."billingDocument") AS invoice_count, ROUND(SUM(bdh."totalNetAmount")::NUMERIC, 2) AS total_revenue, MAX(bdh."transactionCurrency") AS currency FROM billing_document_headers bdh WHERE bdh."billingDocumentIsCancelled" = 'false' AND bdh."billingDocumentDate" IS NOT NULL GROUP BY DATE_TRUNC('month', bdh."billingDocumentDate") ORDER BY month ASC


Q: Which customers are in Germany?
A: SELECT bp."businessPartnerFullName" AS customer, bp."businessPartner", bpa."cityName", bpa."country", bpa."region" FROM business_partners bp JOIN business_partner_addresses bpa ON bpa."businessPartner" = bp."businessPartner" WHERE bpa."country" ILIKE '%DE%' OR bpa."country" ILIKE '%germany%' ORDER BY bp."businessPartnerFullName" LIMIT 50


Q: Which products have never been ordered?
A: SELECT p.product, p.description, p."productType", p."productGroup" FROM products p LEFT JOIN sales_order_items soi ON soi.material = p.product WHERE soi."salesOrder" IS NULL LIMIT 50


Q: Find billing documents with no associated delivery
A: SELECT bdh."billingDocument", bdh."billingDocumentDate", bdh."totalNetAmount", bdh."transactionCurrency", bdh."soldToParty" FROM billing_document_headers bdh LEFT JOIN billing_document_items bdi ON bdi."billingDocument" = bdh."billingDocument" LEFT JOIN outbound_delivery_headers odh ON odh."deliveryDocument" = bdi."referenceSdDocument" WHERE odh."deliveryDocument" IS NULL AND bdh."billingDocumentIsCancelled" = 'false' LIMIT 50


Q: Which sales orders have cancelled billing documents?
A: SELECT soh."salesOrder", soh."creationDate", soh."totalNetAmount", soh."transactionCurrency", bp."businessPartnerFullName" AS customer, bdh."billingDocument", bdh."billingDocumentDate" FROM sales_order_headers soh LEFT JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty" JOIN outbound_delivery_items odi ON odi."referenceSdDocument" = soh."salesOrder" JOIN billing_document_items bdi ON bdi."referenceSdDocument" = odi."deliveryDocument" JOIN billing_document_headers bdh ON bdh."billingDocument" = bdi."billingDocument" WHERE bdh."billingDocumentIsCancelled" = 'true' LIMIT 50


Q: Top 10 customers by number of orders
A: SELECT bp."businessPartnerFullName" AS customer, bp."businessPartner", COUNT(DISTINCT soh."salesOrder") AS order_count, ROUND(SUM(soh."totalNetAmount")::NUMERIC, 2) AS total_order_value FROM sales_order_headers soh JOIN business_partners bp ON bp."businessPartner" = soh."soldToParty" GROUP BY bp."businessPartner", bp."businessPartnerFullName" ORDER BY order_count DESC LIMIT 10


Q: Show overdue unpaid invoices (billed more than 30 days ago)
A: SELECT bdh."billingDocument", bdh."billingDocumentDate", bdh."totalNetAmount", bdh."transactionCurrency", bp."businessPartnerFullName" AS customer, (CURRENT_DATE - bdh."billingDocumentDate") AS days_overdue FROM billing_document_headers bdh LEFT JOIN payments pay ON pay."accountingDocument" = bdh."accountingDocument" LEFT JOIN business_partners bp ON bp."businessPartner" = bdh."soldToParty" WHERE pay."accountingDocument" IS NULL AND bdh."billingDocumentIsCancelled" = 'false' AND bdh."billingDocumentDate" < CURRENT_DATE - INTERVAL '30 days' ORDER BY days_overdue DESC LIMIT 50


Q: What is the payment collection rate?
A: WITH totals AS (SELECT COUNT(DISTINCT bdh."billingDocument") AS total_invoices, SUM(bdh."totalNetAmount") AS total_billed, COUNT(DISTINCT pay."accountingDocument") AS paid_invoices, SUM(pay."amountInTransactionCurrency") AS total_collected FROM billing_document_headers bdh LEFT JOIN payments pay ON pay."accountingDocument" = bdh."accountingDocument" WHERE bdh."billingDocumentIsCancelled" = 'false') SELECT total_invoices, paid_invoices, ROUND(100.0 * paid_invoices / NULLIF(total_invoices, 0), 1) AS collection_rate_pct, ROUND(total_billed::NUMERIC, 2) AS total_billed, ROUND(COALESCE(total_collected, 0)::NUMERIC, 2) AS total_collected FROM totals


Q: Show delivery performance by shipping point
A: SELECT odh."shippingPoint", COUNT(DISTINCT odh."deliveryDocument") AS total_deliveries, COUNT(DISTINCT CASE WHEN odh."overallGoodsMovementStatus" = 'C' THEN odh."deliveryDocument" END) AS completed, ROUND(100.0 * COUNT(DISTINCT CASE WHEN odh."overallGoodsMovementStatus" = 'C' THEN odh."deliveryDocument" END) / NULLIF(COUNT(DISTINCT odh."deliveryDocument"), 0), 1) AS completion_rate_pct, ROUND(AVG(odh."actualGoodsMovementDate" - odh."creationDate")::NUMERIC, 1) AS avg_processing_days FROM outbound_delivery_headers odh WHERE odh."actualGoodsMovementDate" IS NOT NULL GROUP BY odh."shippingPoint" ORDER BY total_deliveries DESC


Q: Which industry sectors generate the most revenue?
A: SELECT bp.industry, COUNT(DISTINCT bdh."billingDocument") AS invoice_count, ROUND(SUM(bdh."totalNetAmount")::NUMERIC, 2) AS total_revenue, MAX(bdh."transactionCurrency") AS currency FROM billing_document_headers bdh JOIN business_partners bp ON bp."businessPartner" = bdh."soldToParty" WHERE bdh."billingDocumentIsCancelled" = 'false' AND bp.industry IS NOT NULL GROUP BY bp.industry ORDER BY total_revenue DESC LIMIT 20`;


/* ─────────────────────────────────────────────────────────────────────────
  FORMAT PROMPT
───────────────────────────────────────────────────────────────────────── */
const FORMAT_SYSTEM_PROMPT = `You are a senior SAP business analyst presenting O2C query results in a clear, professional format.


FORMAT RULES — follow exactly:


1. START with a one-sentence summary of what the data shows (bold it).


2. For SINGLE-RECORD details: write each field as "FieldName: value" on its own line, grouped under **Section Headers**.
  Example:
  **Order Header**
  Sales Order: 740506
  Order Type: OR
  Customer: Acme Corp
  Total Amount: 17,108.25 INR


3. For LISTS (multiple records, 2-10 rows): use a compact markdown table with headers.
  Example:
  | Customer | Invoices | Total Revenue |
  |---|---|---|
  | Acme Corp | 12 | 45,230.00 INR |


4. For LARGE result sets (> 10 rows): show a markdown table of the top 10, then note "… and X more records."


5. For AGGREGATION / SUMMARY results (counts, totals, rates): show each metric on its own line with a short label.
  Example:
  Total Orders: 1,248
  Delivered: 1,102 (88.3%)
  Billed: 985 (78.9%)
  Paid: 743 (59.5%)


6. STATUS CODES — always decode:
  - C → ✓ Complete
  - A → ○ Not Started
  - B → ◑ Partial
  - billingDocumentIsCancelled 'true' → Cancelled, 'false' → Active


7. NUMBERS: always format with thousands separators and include currency where available.
  Example: 1,234,567.89 EUR


8. DATES: show in YYYY-MM-DD format. For date differences show "X days".


9. If no data returned: write "No records found matching your query."


10. NEVER invent, assume, or extrapolate data. Only use what is in the query results.


11. NEVER write "Key:" or "Value:" literally.


12. Keep it concise — max 400 words. Omit NULL / empty fields in single-record views.`;


/* ─────────────────────────────────────────────────────────────────────────
  HELPERS
───────────────────────────────────────────────────────────────────────── */


function extractFirstStatement(raw) {
 let sql = raw
   .replace(/```sql\s*/gi, '')
   .replace(/```\s*/gi, '')
   .replace(/--[^\n]*/g, '')   // strip inline comments
   .trim();
 // Take everything before the first bare semicolon (not inside quotes)
 const parts = sql.split(/;(?=(?:[^']*'[^']*')*[^']*$)/);
 sql = parts[0].trim().replace(/;\s*$/, '').trim();
 return sql;
}


function validateSQL(sql) {
 const upper = sql.trim().toUpperCase();
 if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
   throw new Error('Only SELECT / CTE queries are allowed');
 }
 const banned = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'EXEC(', 'EXECUTE(', 'COPY ', 'VACUUM', 'REINDEX'];
 for (const b of banned) {
   if (upper.includes(b)) throw new Error(`Forbidden SQL keyword: ${b}`);
 }
}


/* ─────────────────────────────────────────────────────────────────────────
  STAGE 1: Classify query
───────────────────────────────────────────────────────────────────────── */
async function classifyQuery(question) {
 const res = await groq.chat.completions.create({
   model: 'llama-3.3-70b-versatile',
   messages: [
     {
       role: 'system',
       content: `You classify questions for an SAP Order-to-Cash database. Reply ONLY with "RELATED" or "UNRELATED".


Say RELATED for ANY question about:
- Sales orders, order numbers, order items, order status, order amounts
- Deliveries, delivery documents, shipments, goods movement, shipping
- Billing documents, invoices, billing status, cancellations
- Payments, payment status, unpaid invoices, clearing, collections
- Customers, business partners, customer names, addresses, industries
- Products, materials, product groups, inventory, storage
- Revenue, turnover, amounts, totals, financial KPIs
- O2C cycle, order-to-cash, order-to-delivery, billing cycle
- Plants, shipping points, sales organizations, company codes
- Journal entries, accounting documents, reconciliation
- Any document tracing or end-to-end flow queries
- Aggregate/analytical questions over any of the above
- Questions with specific document IDs or numbers (even if format looks odd)
- Status checks, KPI dashboards, funnel analysis, trend analysis
- General business questions even if loosely phrased (e.g. "how is business doing")


Say UNRELATED ONLY for:
- Pure general knowledge (weather, geography, sports, history)
- Coding/programming help completely unrelated to the database
- Math puzzles, jokes, recipes
- Personal questions


When in doubt → RELATED`,
     },
     { role: 'user', content: question },
   ],
   max_tokens: 5,
   temperature: 0,
 });
 const reply = res.choices[0]?.message?.content?.trim().toUpperCase();
 return reply?.startsWith('RELATED') || reply === 'RELATED';
}


/* ─────────────────────────────────────────────────────────────────────────
  STAGE 2: Generate SQL
───────────────────────────────────────────────────────────────────────── */
async function generateSQL(question) {
 const res = await groq.chat.completions.create({
   model: 'llama-3.3-70b-versatile',
   messages: [
     { role: 'system', content: SYSTEM_PROMPT },
     { role: 'user', content: question },
   ],
   max_tokens: 1800,
   temperature: 0.05,
 });
 return res.choices[0]?.message?.content?.trim() || '';
}


/* ─────────────────────────────────────────────────────────────────────────
  STAGE 3: Format response
───────────────────────────────────────────────────────────────────────── */
async function formatResponse(question, sql, data) {
 const preview = JSON.stringify(data.slice(0, 30), null, 2);
 const res = await groq.chat.completions.create({
   model: 'llama-3.3-70b-versatile',
   messages: [
     { role: 'system', content: FORMAT_SYSTEM_PROMPT },
     {
       role: 'user',
       content: `User asked: "${question}"\n\nSQL executed:\n${sql}\n\nQuery result (${data.length} total rows):\n${preview}\n\nProvide a structured, professional answer.`,
     },
   ],
   max_tokens: 1200,
   temperature: 0.15,
 });
 return res.choices[0]?.message?.content?.trim() || 'No answer generated.';
}


/* ─────────────────────────────────────────────────────────────────────────
  SQL RETRY HELPER
───────────────────────────────────────────────────────────────────────── */
async function retrySQL(question, failedSql, errMsg) {
 console.warn(`SQL error (retrying): ${errMsg}`);
 const fixedRaw = await groq.chat.completions.create({
   model: 'llama-3.3-70b-versatile',
   messages: [
     { role: 'system', content: SYSTEM_PROMPT },
     { role: 'user', content: question },
     { role: 'assistant', content: failedSql },
     {
       role: 'user',
       content: `The query failed with error: "${errMsg}"\n\nFix ALL issues and return ONLY the corrected SQL query. Common fixes:\n- Quote all camelCase columns with double-quotes\n- Use correct table aliases\n- Fix ambiguous column references\n- Fix subquery returning multiple rows (use aggregation or LIMIT 1)\n- Fix unknown column/table names against the schema`,
     },
   ],
   max_tokens: 1800,
   temperature: 0,
 });
 return extractFirstStatement(fixedRaw.choices[0]?.message?.content?.trim() || '');
}


/* ─────────────────────────────────────────────────────────────────────────
  MAIN PIPELINE
───────────────────────────────────────────────────────────────────────── */
const RETRYABLE_ERRORS = [
 'more than one row returned by a subquery',  // 21000
 'column',                                     // 42703 unknown column
 'ambiguous',                                  // 42702
 'does not exist',                             // 42P01 unknown table/column
 'syntax error',                               // 42601
 'operator does not exist',                    // 42883 type mismatch
 'invalid input syntax',                       // 22P02 type casting
 'function',                                   // unknown function
 'relation',                                   // unknown relation/table
];


const runSQL = async (s) => {
 const raw = await prisma.$queryRawUnsafe(s);
 return JSON.parse(JSON.stringify(raw, (_, v) =>
   typeof v === 'bigint' ? v.toString() : v
 ));
};


async function processQuery(question) {
 const cacheKey = normaliseCacheKey(question);
 if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);


 /* Step 1 — domain guard */
 const isRelated = await classifyQuery(question);
 if (!isRelated) {
   return {
     answer: 'This assistant answers questions about the SAP Order-to-Cash dataset — sales orders, deliveries, invoices, payments, customers, and products. Please ask something related to that data.',
     sql: null,
     data: [],
     isUnrelated: true,
   };
 }


 /* Step 2 — generate SQL */
 let rawSql = await generateSQL(question);


 if (!rawSql || rawSql.toUpperCase().includes('UNRELATED_QUERY')) {
   return {
     answer: 'This assistant answers questions about the SAP Order-to-Cash dataset only.',
     sql: null,
     data: [],
     isUnrelated: true,
   };
 }


 /* Step 3 — extract and validate */
 let sql = extractFirstStatement(rawSql);
 validateSQL(sql);


 /* Step 4 — execute with up to 2 retries */
 let data;
 let finalSql = sql;


 for (let attempt = 0; attempt <= 2; attempt++) {
   try {
     data = await runSQL(finalSql);
     break; // success
   } catch (err) {
     const shouldRetry = attempt < 2 && RETRYABLE_ERRORS.some(p => err.message?.toLowerCase().includes(p));
     if (shouldRetry) {
       const fixed = await retrySQL(question, finalSql, err.message);
       validateSQL(fixed);
       finalSql = fixed;
     } else {
       console.error(`SQL error (attempt ${attempt + 1}):\n`, finalSql, '\n', err.message);
       throw new Error(`Query failed: ${err.message}`);
     }
   }
 }


 /* Step 5 — format natural language answer */
 const answer = await formatResponse(question, finalSql, data);
 const result = { answer, sql: finalSql, data };


 queryCache.set(cacheKey, result);
 return result;
}


module.exports = { processQuery };





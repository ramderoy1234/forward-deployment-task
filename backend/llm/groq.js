/**
* LLM pipeline: Natural Language → SQL → Execute → Format response
* Uses Groq API with llama-3.3-70b-versatile (free tier)
*/
const Groq = require('groq-sdk');
const prisma = require('../db/prisma');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/* ── In-memory cache (question → result) ─────────────────────── */
const queryCache = new Map();

/* DETAILED SCHEMA DESCRIPTION - Critical for LLM accuracy */
const SCHEMA_DESCRIPTION = `
CRITICAL TABLE STRUCTURE:

1. sales_order_headers (PK: "salesOrder")
   - "salesOrder", "salesOrderType", "soldToParty", "creationDate", "totalNetAmount", 
   - "overallDeliveryStatus", "overallOrdReltdBillgStatus", "transactionCurrency"

2. sales_order_items (PK: "salesOrder", "salesOrderItem")
   - Links to products via material = product

3. outbound_delivery_headers (PK: "deliveryDocument")
   - "deliveryDocument", "actualGoodsMovementDate", "overallGoodsMovementStatus"

4. outbound_delivery_items (PK: "deliveryDocument", "deliveryDocumentItem")
   - "referenceSdDocument" (points to salesOrder), "deliveryDocument"

5. billing_document_headers (PK: "billingDocument")
   - "billingDocument", "billingDocumentDate", "totalNetAmount", "soldToParty"
   - "accountingDocument" (points to journal/payment), "billingDocumentIsCancelled"

6. billing_document_items (PK: "billingDocument", "billingDocumentItem")
   - "referenceSdDocument" (points to deliveryDocument), "material"
   - NOTE: billing_document_items does NOT have accountingDocument column!

7. payments (PK: "accountingDocument", "accountingDocumentItem")
   - "accountingDocument", "amountInTransactionCurrency", "clearingDate", "postingDate"
   - "invoiceReference" is ALWAYS NULL - do NOT use!

8. journal_entry_items (PK: "accountingDocument", "accountingDocumentItem")
   - "accountingDocument", "amountInTransactionCurrency", "postingDate"

9. business_partners (PK: "businessPartner")
   - "businessPartner", "businessPartnerFullName", "businessPartnerName"

10. products (PK: "product")
    - "product", "description", "productGroup"

CRITICAL JOIN RULES:
✓ sales_order → delivery: outbound_delivery_items."referenceSdDocument" = sales_order_headers."salesOrder"
✓ delivery → billing: billing_document_items."referenceSdDocument" = outbound_delivery_headers."deliveryDocument"
✓ billing → payment: payments."accountingDocument" = billing_document_headers."accountingDocument"
✓ billing → journal: journal_entry_items."accountingDocument" = billing_document_headers."accountingDocument"
✗ WRONG: Do NOT use billing_document_items."accountingDocument" - that column does NOT exist!
✗ WRONG: Do NOT use payments."invoiceReference" - it is ALWAYS NULL!
`.trim();

/* SYSTEM PROMPT - Explicit about column locations */
const SYSTEM_PROMPT = `You are a PostgreSQL SQL generator for a SAP Order-to-Cash system.

RULES (NEVER break these):
1. Generate EXACTLY ONE SELECT query. No semicolons. Return only the SQL.
2. NEVER use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, TRUNCATE.
3. ALL camelCase column names MUST be wrapped in "double-quotes".
4. Table names are snake_case - do NOT quote them.
5. Always use LEFT JOINs when tracing document flows (sales→delivery→billing→payment).
6. When joining to payments or journal_entry_items, ALWAYS go through billing_document_headers.accountingDocument.

CRITICAL SCHEMA RULES:
- billing_document_items has: billingDocument, billingDocumentItem, referenceSdDocument, material, netAmount
- billing_document_headers has: billingDocument, accountingDocument, totalNetAmount, billingDocumentDate
- Use billing_document_headers."accountingDocument" to link to payments/journal, NOT billing_document_items!
- payments."invoiceReference" is ALWAYS NULL - NEVER use it. Use payments."accountingDocument" instead.

${SCHEMA_DESCRIPTION}

Example correct joins:
- Order to Delivery: LEFT JOIN outbound_delivery_items ON outbound_delivery_items."referenceSdDocument" = soh."salesOrder"
- Delivery to Billing: LEFT JOIN billing_document_items ON billing_document_items."referenceSdDocument" = odh."deliveryDocument"
- Billing to Payment: LEFT JOIN payments ON payments."accountingDocument" = bdh."accountingDocument"

Use LIMIT 50 unless asked for more. Return ONLY raw SQL without any explanation.`;

/* FORMAT PROMPT */
const FORMAT_SYSTEM_PROMPT = 'You are a business analyst presenting SAP O2C query results. Rules: 1. For single records, write "FieldName: value" on separate lines. 2. Use **Section Header** before groups of fields. 3. For multiple records, use bullet format "- description: value". 4. Decode status codes: C=Complete, A=Not Started, B=Partial. 5. Always include currency for amounts. 6. If no data: "No records found". 7. Never write "Key:" or "Value:" as literal words. 8. Only use provided data, never invent. 9. Keep under 300 words.';

/* HELPERS */
function extractFirstStatement(raw) {
 let sql = raw.replace(/```sql\s*/gi, '').replace(/```\s*/gi, '').trim();
 const parts = sql.split(/;(?=(?:[^']*'[^']*')*[^']*$)/);
 sql = parts[0].trim();
 sql = sql.replace(/;\s*$/, '').trim();
 return sql;
}

function validateSQL(sql) {
 const upper = sql.trim().toUpperCase();
 if (!upper.startsWith('SELECT')) {
   throw new Error('Only SELECT queries are allowed');
 }
 const banned = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'EXEC(', 'EXECUTE('];
 for (const b of banned) {
   if (upper.includes(b)) throw new Error(`Forbidden SQL keyword: ${b}`);
 }
 
 // Validate common billing-related column mistakes
 const lowerSql = sql.toLowerCase();
 if (lowerSql.includes('billing_document_items') && lowerSql.includes('accountingdocument')) {
   throw new Error('SCHEMA ERROR: billing_document_items does not have accountingDocument column. Use billing_document_headers."accountingDocument" instead. billing_document_items only has: billingDocument, billingDocumentItem, referenceSdDocument, material, netAmount, etc.');
 }
 if (lowerSql.includes('invoicereference') && lowerSql.includes('payments')) {
   throw new Error('SCHEMA ERROR: payments."invoiceReference" is always NULL. Use payments."accountingDocument" linked to billing_document_headers."accountingDocument" instead.');
 }
}

/* STAGE 1: Classify query */
async function classifyQuery(question) {
 const res = await groq.chat.completions.create({
   model: 'llama-3.3-70b-versatile',
   messages: [
     {
       role: 'system',
       content: 'Respond ONLY with "RELATED" or "UNRELATED". RELATED: SAP O2C business data questions. UNRELATED: weather, jokes, coding, math, recipes, etc.',
     },
     { role: 'user', content: question },
   ],
   max_tokens: 5,
   temperature: 0,
 });
 const reply = res.choices[0]?.message?.content?.trim().toUpperCase();
 return reply === 'RELATED' || reply?.startsWith('RELATED');
}

/* STAGE 2: Generate SQL */
async function generateSQL(question) {
 const res = await groq.chat.completions.create({
   model: 'llama-3.3-70b-versatile',
   messages: [
     { role: 'system', content: SYSTEM_PROMPT },
     { role: 'user', content: question },
   ],
   max_tokens: 1200,
   temperature: 0.05,
 });
 return res.choices[0]?.message?.content?.trim() || '';
}

/* STAGE 3: Format response */
async function formatResponse(question, sql, data) {
 const preview = JSON.stringify(data.slice(0, 25), null, 2);
 const res = await groq.chat.completions.create({
   model: 'llama-3.3-70b-versatile',
   messages: [
     { role: 'system', content: FORMAT_SYSTEM_PROMPT },
     {
       role: 'user',
       content: `User asked: "${question}"\n\nQuery result (${data.length} rows):\n${preview}\n\nProvide a structured, readable answer.`,
     },
   ],
   max_tokens: 900,
   temperature: 0.2,
 });
 return res.choices[0]?.message?.content?.trim() || 'No answer generated.';
}

/* MAIN PIPELINE */
async function processQuery(question) {
 const cacheKey = question.trim().toLowerCase();
 if (queryCache.has(cacheKey)) return queryCache.get(cacheKey);

 const isRelated = await classifyQuery(question);
 if (!isRelated) {
   return {
     answer: 'This system is designed for SAP Order-to-Cash data only. Please ask about sales orders, deliveries, invoices, payments, customers, or products.',
     sql: null,
     data: [],
     isUnrelated: true,
   };
 }

 let rawSql = await generateSQL(question);

 if (!rawSql || rawSql.toUpperCase().includes('UNRELATED_QUERY')) {
   return {
     answer: 'This system is designed for SAP Order-to-Cash data only.',
     sql: null,
     data: [],
     isUnrelated: true,
   };
 }

 const sql = extractFirstStatement(rawSql);

 const RETRYABLE = [
   'more than one row returned by a subquery',
   'column',
   'ambiguous',
   'does not exist',
   'schema error',
 ];

 const runSQL = async (s) => {
   const raw = await prisma.$queryRawUnsafe(s);
   return JSON.parse(JSON.stringify(raw, (_, v) =>
     typeof v === 'bigint' ? v.toString() : v
   ));
 };

 const retrySQL = async (failedSql, errMsg) => {
   console.warn(`SQL error (retrying): ${errMsg}`);
   
   // Enhanced error context for specific column errors
   let errorHint = '';
   let tableColumnInfo = '';
   
   if (errMsg.toLowerCase().includes('accountingdocument')) {
     errorHint = '\n\n⚠️ CRITICAL FIX:\nYou used billing_document_items."accountingDocument" but this column does NOT exist on that table!\n- billing_document_items has: billingDocument, billingDocumentItem, referenceSdDocument, material, netAmount, etc.\n- billing_document_headers HAS accountingDocument column\n- ALWAYS use: billing_document_headers."accountingDocument" to link to payments or journal entries\n- IF you need billing_document_items, join it to headers first: billing_document_items JOIN billing_document_headers ON ... then use headers.accountingDocument';
     tableColumnInfo = '\nRECORRECT TABLE STRUCTURE:\n- billing_document_headers: billingDocument, accountingDocument, totalNetAmount, soldToParty, billingDocumentDate\n- billing_document_items: billingDocument (FK to headers), billingDocumentItem, material, referenceSdDocument (FK to delivery), netAmount';
   } else if (errMsg.toLowerCase().includes('invoicereference')) {
     errorHint = '\n\n⚠️ CRITICAL FIX:\npayments."invoiceReference" is ALWAYS NULL - DO NOT USE IT!\n- Use payments."accountingDocument" instead\n- Link: payments."accountingDocument" = billing_document_headers."accountingDocument"';
   } else if (errMsg.toLowerCase().includes('column') && errMsg.toLowerCase().includes('does not exist')) {
     const columnMatch = errMsg.match(/column\s+([^\s]+)/i);
     if (columnMatch) {
       errorHint = `\n\n⚠️ CRITICAL FIX:\nColumn "${columnMatch[1]}" does NOT exist in that table.\nCarefully check SCHEMA DESCRIPTION for correct column name and table.`;
     }
   }
   
   const fixedRaw = await groq.chat.completions.create({
     model: 'llama-3.3-70b-versatile',
     messages: [
       { role: 'system', content: SYSTEM_PROMPT },
       { role: 'user', content: question },
       { role: 'assistant', content: failedSql },
       { role: 'user', content: `QUERY FAILED:\nError: "${errMsg}"\n\nFailed SQL:\n${failedSql}${errorHint}${tableColumnInfo}\n\n🔧 YOUR TASK:\n1. Identify which table has the column you need\n2. Rewrite the JOIN logic to go through correct tables\n3. Return ONLY corrected SQL - no explanations\n4. Use column names exactly as shown in SCHEMA DESCRIPTION` },
     ],
     max_tokens: 1200,
     temperature: 0,
   });
   return extractFirstStatement(fixedRaw.choices[0]?.message?.content?.trim() || '');
 };

 let data;
 let finalSql = sql;
 try {
   // Validate INSIDE try-catch so validation errors can trigger retries
   validateSQL(sql);
   data = await runSQL(sql);
 } catch (err) {
   const shouldRetry = RETRYABLE.some(p => err.message?.toLowerCase().includes(p));
   if (shouldRetry) {
     try {
       const retrySql = await retrySQL(sql, err.message);
       validateSQL(retrySql);
       finalSql = retrySql;
       data = await runSQL(retrySql);
       console.log('✓ Retry successful after error:', err.message.substring(0, 100));
     } catch (retryErr) {
       console.error('✗ Retry failed. Original error:\n', err.message);
       console.error('✗ Retry error:\n', retryErr.message);
       throw new Error(`Query failed after retry: ${retryErr.message}`);
     }
   } else {
     console.error('✗ SQL error (non-retryable):\n', sql, '\n', err.message);
     throw new Error(`Query failed: ${err.message}`);
   }
 }

 const answer = await formatResponse(question, finalSql, data);
 const result = { answer, sql: finalSql, data };

 queryCache.set(cacheKey, result);

 return result;
}

module.exports = { processQuery };

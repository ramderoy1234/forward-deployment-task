import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import API_BASE from '../api.js';


const SUGGESTIONS = [
 // Required: a
 { label: '📦 Top billed products',         query: 'Which products are associated with the highest number of billing documents?' },
 // Required: b
 { label: '🔍 Trace billing doc 90504248',  query: 'Trace the full flow of billing document 90504248 — Sales Order → Delivery → Billing → Journal Entry' },
 // Required: c
 { label: '⚠️ Delivered not billed',        query: 'Find sales orders that were delivered but not billed' },
 { label: '⚠️ Billed without delivery',     query: 'Find billing documents that have no associated delivery' },
 // Beyond examples
 { label: '📊 O2C funnel',                  query: 'Show O2C funnel — how many orders reached each stage' },
 { label: '📉 Incomplete O2C flows',        query: 'Show all sales orders with incomplete Order-to-Cash flows' },
 { label: '💸 Unpaid invoices',             query: 'Which invoices are unpaid?' },
 { label: '🔗 Billed but never paid',       query: 'Find orders billed but never paid' },
 { label: '⏱️ Order-to-delivery cycle time',query: 'What is the order-to-delivery cycle time for each sales order?' },
 { label: '🚨 Customers with overdue',      query: 'Which customers have outstanding unpaid invoices?' },
 { label: '💰 Revenue by customer',         query: 'Show revenue by customer — total billed amount per customer' },
 { label: '❌ Cancelled billing docs',      query: 'Which sales orders have cancelled billing documents?' },
 { label: '🚫 Products never ordered',      query: 'Which products have never been ordered?' },
 { label: '👤 Customer order totals',       query: 'Show all customers and their total order amounts' },
 { label: '🏆 Top ordering customer',       query: 'Which customer placed the most orders?' },
 { label: '📋 Full details order 740506',   query: 'Give full details of order 740506' },
];


function extractNodeIds(rows) {
 const ids = [];
 for (const row of rows) {
   // normalise: lowercase all keys so aliases like "salesOrder" and "salesorder" both match
   const r = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().replace(/_/g, ''), v]));
   if (r.salesorder)       ids.push(`so-${r.salesorder}`);
   if (r.billingdocument)  ids.push(`bill-${r.billingdocument}`);
   if (r.deliverydocument) ids.push(`del-${r.deliverydocument}`);
   if (r.product)          ids.push(`prod-${r.product}`);
   if (r.businesspartner)  ids.push(`bp-${r.businesspartner}`);
 }
 return [...new Set(ids)];
}


/* ── Structured answer renderer ─────────────────────────────── */
function Answer({ text }) {
 return (
   <div className="space-y-1 text-[12px] leading-relaxed text-slate-700">
     {text.split('\n').map((line, i) => {
       if (!line.trim()) return <div key={i} className="h-0.5" />;


       const boldHeader = line.match(/^\*\*(.+)\*\*:?\s*$/);
       if (boldHeader) return (
         <div key={i} className="pt-1.5 first:pt-0">
           <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
             {boldHeader[1]}
           </span>
         </div>
       );


       if (/^[-•]\s/.test(line)) return (
         <div key={i} className="flex gap-1.5">
           <span className="text-blue-400 flex-shrink-0 mt-0.5">•</span>
           <span>{line.replace(/^[-•]\s/, '')}</span>
         </div>
       );


       const kv = line.match(/^([^:]{2,40}):\s*(.+)$/);
       if (kv) return (
         <div key={i} className="flex gap-2">
           <span className="text-slate-400 text-[11px] w-32 flex-shrink-0 leading-5">{kv[1]}</span>
           <span className="font-semibold text-slate-800 leading-5">{kv[2]}</span>
         </div>
       );


       const num = line.match(/^(\d+)\.\s(.+)/);
       if (num) return (
         <div key={i} className="flex gap-1.5">
           <span className="text-blue-400 font-bold text-[11px] flex-shrink-0 mt-0.5">{num[1]}.</span>
           <span>{num[2]}</span>
         </div>
       );


       return <p key={i}>{line}</p>;
     })}
   </div>
 );
}


/* ── Message bubbles ─────────────────────────────────────────── */
function UserMsg({ text }) {
 return (
   <div className="flex justify-end mb-1.5">
     <div className="max-w-[80%] bg-white border border-slate-200 text-slate-800 text-[12px] rounded-xl rounded-tr-sm px-2.5 py-1.5 leading-relaxed shadow-sm">
       {text}
     </div>
   </div>
 );
}


function downloadCSV(data, question) {
 if (!data?.length) return;
 const headers = Object.keys(data[0]);
 const rows    = data.map(r => headers.map(h => {
   const v = r[h] == null ? '' : String(r[h]);
   return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
 }).join(','));
 const csv  = [headers.join(','), ...rows].join('\n');
 const blob = new Blob([csv], { type: 'text/csv' });
 const url  = URL.createObjectURL(blob);
 const a    = document.createElement('a');
 a.href     = url;
 a.download = `o2c-query-${Date.now()}.csv`;
 a.click();
 URL.revokeObjectURL(url);
}


function BotMsg({ text, sql, rowCount, highlighted, rawData, question }) {
 const [showSql, setShowSql] = useState(false);
 return (
   <div className="flex gap-1.5 mb-1.5 items-start">
     {/* Dodge AI avatar */}
     <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-[8px] font-black flex-shrink-0 mt-0.5">
       D
     </div>
     <div className="max-w-[88%]">
       <div className="bg-[#F8F9FA] rounded-xl rounded-tl-sm px-2.5 py-1.5">
         <Answer text={text} />
       </div>
       {(sql || rowCount !== undefined || highlighted) && (
         <div className="flex flex-wrap items-center gap-2 mt-0.5 px-0.5">
           {sql && (
             <button onClick={() => setShowSql(v => !v)}
               className="text-[10px] text-blue-400 hover:text-blue-600 font-medium">
               {showSql ? '▲ Hide SQL' : '▼ SQL'}
             </button>
           )}
           {rowCount !== undefined && (
             <span className="text-[10px] text-slate-400">{rowCount} row{rowCount !== 1 ? 's' : ''}</span>
           )}
           {rawData?.length > 0 && (
             <button
               onClick={() => downloadCSV(rawData, question)}
               className="text-[10px] text-slate-400 hover:text-blue-500 font-medium flex items-center gap-1 transition-colors"
             >
               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                   d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
               </svg>
               CSV
             </button>
           )}
           {highlighted && (
             <span className="text-[10px] text-emerald-500 font-medium flex items-center gap-1">
               <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
               Graph highlighted
             </span>
           )}
         </div>
       )}
       {showSql && sql && (
         <div className="mt-1 bg-slate-900 rounded-xl p-2 overflow-x-auto">
           <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap">{sql}</pre>
         </div>
       )}
     </div>
   </div>
 );
}


function Typing() {
 return (
   <div className="flex gap-1.5 mb-1.5 items-start">
     <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-[8px] font-black flex-shrink-0">
       D
     </div>
     <div className="bg-[#F8F9FA] rounded-xl rounded-tl-sm px-2.5 py-2">
       <div className="flex gap-1 items-center h-3">
         {[0,1,2].map(i => (
           <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-300 typing-dot"
             style={{ animationDelay: `${i * 0.15}s` }} />
         ))}
       </div>
     </div>
   </div>
 );
}


/* ── Main component ──────────────────────────────────────────── */
export default function ChatPanel({ onHighlightNodes }) {
 const [messages, setMessages] = useState([{
   role: 'bot',
   text: 'Hi! I can help you analyze the Order to Cash process.\n\nAsk me about orders, deliveries, invoices, payments, or customers.',
 }]);
 const [input,   setInput]   = useState('');
 const [loading, setLoading] = useState(false);
 const bottomRef = useRef();
 const inputRef  = useRef();


 useEffect(() => {
   bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
 }, [messages, loading]);


 useEffect(() => {
   const h = (e) => sendMessage(e.detail);
   window.addEventListener('quick-query', h);
   return () => window.removeEventListener('quick-query', h);
 }, []);


 const sendMessage = useCallback(async (override) => {
   const q = (override || input).trim();
   if (!q || loading) return;


   setInput('');
   if (inputRef.current) inputRef.current.style.height = '40px';
   setMessages(prev => [...prev, { role: 'user', text: q }]);
   setLoading(true);


   try {
     const { data } = await axios.post(`${API_BASE}/query`, { question: q });
     const nodeIds = data.data?.length ? extractNodeIds(data.data) : [];
     if (nodeIds.length && onHighlightNodes) onHighlightNodes(nodeIds);


     setMessages(prev => [...prev, {
       role: 'bot',
       text: data.answer || 'No response.',
       sql: data.sql,
       rowCount: data.data?.length,
       highlighted: nodeIds.length > 0,
       rawData: data.data,
       question: q,
     }]);
   } catch (err) {
     setMessages(prev => [...prev, {
       role: 'bot',
       text: `⚠️ Error: ${err.response?.data?.message || err.message}`,
     }]);
   } finally {
     setLoading(false);
     setTimeout(() => inputRef.current?.focus(), 80);
   }
 }, [input, loading, onHighlightNodes]);


 function handleKey(e) {
   if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
 }


 function handleInput(e) {
   setInput(e.target.value);
   e.target.style.height = 'auto';
   e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
 }




 return (
   <div className="flex flex-col h-full bg-white">


     {/* ── Header ─────────────────────────────────────────────── */}
     <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
       <h2 className="text-sm font-bold text-slate-900">Chat with Graph</h2>
       <p className="text-[11px] text-slate-400 mt-0.5">Order to Cash</p>
     </div>


     {/* ── Dodge AI profile strip ──────────────────────────────── */}
     <div className="px-4 py-2.5 border-b border-slate-50 flex items-center gap-3 flex-shrink-0 bg-slate-50/50">
       <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">
         D
       </div>
       <div>
         <p className="text-[13px] font-semibold text-slate-800 leading-none mb-1">Dodge AI</p>
         <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-semibold">
           Graph Agent
         </span>
       </div>
     </div>


     {/* ── Messages ───────────────────────────────────────────── */}
     <div className="flex-1 overflow-y-auto px-3 py-3">
       {messages.map((m, i) =>
         m.role === 'user'
           ? <UserMsg key={i} text={m.text} />
           : <BotMsg key={i} text={m.text} sql={m.sql} rowCount={m.rowCount} highlighted={m.highlighted} rawData={m.rawData} question={m.question} />
       )}
       {loading && <Typing />}
       <div ref={bottomRef} />
     </div>


     {/* ── Input area ─────────────────────────────────────────── */}
     <div className="px-3 pt-2 pb-2.5 border-t border-slate-100 flex-shrink-0">


       {/* Suggestions — scrollable quick-query pills, always visible */}
       <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2 scrollbar-hide">
         {SUGGESTIONS.map(s => (
           <button key={s.query} onClick={() => sendMessage(s.query)}
             className="text-[10px] bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-500 hover:text-blue-600 rounded-full px-2.5 py-1 transition-all whitespace-nowrap flex-shrink-0">
             {s.label}
           </button>
         ))}
       </div>


       {/* Status indicator */}
       <div className="flex items-center gap-1.5 mb-1.5">
         <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
         <span className="text-[10px] text-slate-400">
           {loading ? 'Dodge AI is thinking…' : 'Dodge AI is awaiting instructions'}
         </span>
       </div>


       {/* Input row */}
       <div className="flex items-end gap-1.5 bg-slate-50 border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 rounded-xl px-2.5 py-1.5 transition-all">
         <textarea
           ref={inputRef}
           value={input}
           onChange={handleInput}
           onKeyDown={handleKey}
           placeholder="Analyze anything"
           disabled={loading}
           rows={1}
           className="flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
           style={{ minHeight: 28, maxHeight: 100 }}
         />
         <button
           onClick={() => sendMessage()}
           disabled={loading || !input.trim()}
           className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
           style={{ background: loading || !input.trim() ? '#E2E8F0' : 'linear-gradient(135deg,#3B82F6,#6366F1)' }}
         >
           {loading
             ? <svg className="animate-spin w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24">
                 <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                 <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
               </svg>
             : <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7"/>
               </svg>
           }
         </button>
       </div>
     </div>
   </div>
 );
}





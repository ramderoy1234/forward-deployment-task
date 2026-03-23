import React, { useEffect, useRef } from 'react';


/* ── per-type visual config ───────────────────────────────────────────── */
const TYPE_CFG = {
 customer:   { label: 'Customer',    color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE', emoji: '👤' },
 salesOrder: { label: 'Sales Order', color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', emoji: '📋' },
 delivery:   { label: 'Delivery',    color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', emoji: '🚚' },
 billing:    { label: 'Invoice',     color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', emoji: '🧾' },
 payment:    { label: 'Payment',     color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', emoji: '💳' },
 product:    { label: 'Product',     color: '#06B6D4', bg: '#ECFEFF', border: '#A5F3FC', emoji: '📦' },
 journal:    { label: 'Journal',     color: '#F97316', bg: '#FFF7ED', border: '#FED7AA', emoji: '📒' },
};
const DEF_CFG = { label: 'Entity', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', emoji: '●' };


/* ── field skip list ─────────────────────────────────────────────────── */
const SKIP = new Set([
 'id','index','x','y','vx','vy','fx','fy',
 '__indexColor','color','ring','label','type','meta',
]);


/* ── formatters ──────────────────────────────────────────────────────── */
function fmtKey(k) {
 return k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}
function fmtVal(key, val) {
 if (val === null || val === undefined || val === '') return '—';
 const s = String(val);
 if (s.match(/^\d{4}-\d{2}-\d{2}T/))
   return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
 if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('price')) {
   const n = parseFloat(s);
   if (!isNaN(n)) return `₹ ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
 }
 return s.length > 42 ? s.slice(0, 41) + '…' : s;
}


/* ── status badge for known status fields ─────────────────────────────── */
function StatusBadge({ value }) {
 const map = {
   'C': { label: 'Complete',   cls: 'bg-emerald-100 text-emerald-700' },
   'A': { label: 'Not Started', cls: 'bg-slate-100 text-slate-500'    },
   'B': { label: 'Partial',    cls: 'bg-amber-100 text-amber-700'     },
   'X': { label: 'Cancelled',  cls: 'bg-red-100 text-red-600'         },
 };
 const s = map[String(value).toUpperCase()];
 if (!s) return <span className="text-[11px] font-semibold text-slate-700">{String(value)}</span>;
 return (
   <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${s.cls}`}>
     {s.label}
   </span>
 );
}


/* ── main component ───────────────────────────────────────────────────── */
export default function NodeDetailsCard({ node, pos, onClose, onExpand, onFocus }) {
 const cardRef = useRef(null);


 /* Close on Escape key */
 useEffect(() => {
   const handler = (e) => { if (e.key === 'Escape') onClose(); };
   window.addEventListener('keydown', handler);
   return () => window.removeEventListener('keydown', handler);
 }, [onClose]);


 /* Smart positioning — keep card inside viewport */
 const CARD_W = 320;
 const CARD_H = 460;
 let left = (pos?.x ?? 200) + 16;
 let top  = (pos?.y ?? 200) - 30;
 if (left + CARD_W > window.innerWidth  - 20) left = (pos?.x ?? 200) - CARD_W - 16;
 if (top  + CARD_H > window.innerHeight - 20) top  = window.innerHeight - CARD_H - 20;
 if (left < 8) left = 8;
 if (top  < 8) top  = 8;


 if (!node) return null;


 const cfg  = TYPE_CFG[node.type] || DEF_CFG;
 const meta = node.meta || {};


 /* Collect metadata rows — separate "status" fields for badge rendering */
 const STATUS_KEYS = new Set(['overallDeliveryStatus','overallGoodsMovementStatus','overallPickingStatus','billingDocumentIsCancelled','crossPlantStatus']);
 const entries = Object.entries(meta).filter(([k, v]) =>
   !SKIP.has(k) && v !== null && v !== undefined && v !== ''
 );


 /* Quick queries seeded from node type */
 const quickMap = {
   salesOrder: [`Give full details of order ${meta.salesOrder}`, `Trace flow of order ${meta.salesOrder}`],
   customer:   [`All orders for customer ${meta.businessPartner}`, `Total billing for ${meta.businessPartner}`],
   billing:    [`Is invoice ${meta.billingDocument} paid?`, `Trace flow of billing ${meta.billingDocument}`],
   delivery:   [`Is delivery ${meta.deliveryDocument} invoiced?`],
   product:    [`Total revenue from product ${meta.product}`, `How many times was ${meta.product} sold?`],
   payment:    [`Show payment details for ${meta.accountingDocument}`],
   journal:    [`Show journal entries for document ${meta.accountingDocument}`],
 };
 const queries = quickMap[node.type] || [];


 return (
   <>
     {/* Click-away backdrop (invisible) */}
     <div className="fixed inset-0 z-40" onClick={onClose} />


     {/* Floating card */}
     <div
       ref={cardRef}
       className="fixed z-50 animate-fade-in"
       style={{ left, top, width: CARD_W }}
     >
       <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
         style={{ boxShadow: `0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px ${cfg.border}` }}>


         {/* ── Coloured header strip ─────────────────────────────────── */}
         <div className="px-4 pt-4 pb-3" style={{ background: `linear-gradient(135deg, ${cfg.bg}, #ffffff)` }}>
           <div className="flex items-start justify-between">
             <div className="flex items-center gap-3">
               {/* Type icon */}
               <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shadow-sm flex-shrink-0"
                 style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}` }}>
                 {cfg.emoji}
               </div>
               <div>
                 {/* Type badge */}
                 <span className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mb-1"
                   style={{ background: cfg.border, color: cfg.color }}>
                   {cfg.label}
                 </span>
                 {/* Node label */}
                 <p className="text-sm font-bold text-slate-900 leading-snug max-w-[200px] break-words">
                   {node.label || node.id}
                 </p>
               </div>
             </div>
             {/* Close button */}
             <button
               onClick={onClose}
               className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/80 hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all border border-slate-100 flex-shrink-0"
             >
               <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
               </svg>
             </button>
           </div>
         </div>


         {/* ── Metadata rows ─────────────────────────────────────────── */}
         <div className="max-h-52 overflow-y-auto px-4 py-2 divide-y divide-slate-50">
           {entries.length === 0 ? (
             <p className="text-xs text-slate-400 text-center py-4">No metadata available</p>
           ) : entries.map(([key, value]) => (
             <div key={key} className="flex justify-between items-center gap-3 py-1.5">
               <span className="text-[11px] text-slate-400 flex-shrink-0 leading-none">
                 {fmtKey(key)}
               </span>
               <div className="text-right">
                 {STATUS_KEYS.has(key)
                   ? <StatusBadge value={value} />
                   : <span className="text-[11px] font-semibold text-slate-800">{fmtVal(key, value)}</span>
                 }
               </div>
             </div>
           ))}
         </div>


         {/* ── Action buttons ────────────────────────────────────────── */}
         <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
           <button
             onClick={() => { onExpand(node.id); onClose(); }}
             className="flex-1 py-2 rounded-xl text-xs font-bold border transition-all"
             style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}
           >
             + Expand
           </button>
           <button
             onClick={() => { onFocus(node.id); onClose(); }}
             className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-all"
             style={{ background: cfg.color }}
           >
             ⤢ Focus
           </button>
         </div>


         {/* ── Ask AI shortcuts ──────────────────────────────────────── */}
         {queries.length > 0 && (
           <div className="px-4 pb-4">
             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Ask AI</p>
             <div className="flex flex-col gap-1">
               {queries.map(q => (
                 <button
                   key={q}
                   onClick={() => {
                     window.dispatchEvent(new CustomEvent('quick-query', { detail: q }));
                     onClose();
                   }}
                   className="text-left text-[11px] text-slate-600 hover:text-blue-700 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 rounded-lg px-3 py-2 transition-all leading-snug"
                 >
                   <span className="text-blue-400 mr-1.5">→</span>{q}
                 </button>
               ))}
             </div>
           </div>
         )}
       </div>


       {/* Pointer arrow */}
       <div
         className="absolute w-3 h-3 bg-white border-l border-t border-slate-100 rotate-45"
         style={{
           top: 28,
           left: left + CARD_W > (pos?.x ?? 0) + 100 ? -6 : 'auto',
           right: left + CARD_W > (pos?.x ?? 0) + 100 ? 'auto' : -6,
           borderColor: cfg.border,
         }}
       />
     </div>
   </>
 );
}





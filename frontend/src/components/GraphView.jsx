import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { forceCollide } from 'd3-force';


/* ── Node config ─────────────────────────────────────────────── */
const NODE_CFG = {
 customer:   { color: '#2563EB', ring: '#BFDBFE', label: 'Customer',    size: 7 },
 salesOrder: { color: '#3B82F6', ring: '#BFDBFE', label: 'Sales Order', size: 5 },
 delivery:   { color: '#60A5FA', ring: '#DBEAFE', label: 'Delivery',    size: 4 },
 billing:    { color: '#EF4444', ring: '#FECACA', label: 'Invoice',     size: 4 },
 payment:    { color: '#DC2626', ring: '#FECACA', label: 'Payment',     size: 4 },
 product:    { color: '#93C5FD', ring: '#DBEAFE', label: 'Product',     size: 3 },
 journal:    { color: '#F87171', ring: '#FECACA', label: 'Journal',     size: 3 },
};
const DEF = { color: '#93C5FD', ring: '#DBEAFE', label: 'Entity', size: 3 };
const c   = (type) => NODE_CFG[type] || DEF;


export default function GraphView({ graphData, onNodeClick, highlightNodeIds = [], loading, onMinimize }) {
 const fgRef        = useRef();
 const containerRef = useRef();
 const [dims, setDims]                 = useState({ w: 800, h: 600 });
 const [hoveredNode, setHoveredNode]   = useState(null);
 const [hideGranular, setHideGranular] = useState(false);


 /* ── Responsive sizing ──────────────────────────────────────── */
 useEffect(() => {
   const el = containerRef.current;
   if (!el) return;
   const ro = new ResizeObserver(() =>
     setDims({ w: el.offsetWidth, h: el.offsetHeight })
   );
   ro.observe(el);
   setDims({ w: el.offsetWidth, h: el.offsetHeight });
   return () => ro.disconnect();
 }, []);


 /* ── Force config: explosive starburst ─────────────────────── */
 const handleEngineInit = useCallback(() => {
   const fg = fgRef.current;
   if (!fg) return;
   fg.d3Force('charge').strength(-900);        // strong repulsion = explosive spread
   fg.d3Force('center', null);                 // no center gravity
   fg.d3Force('collision', forceCollide(18));  // tight personal space
   fg.d3Force('link').distance(70).strength(0.9); // short, strong links = clear hub-spoke
 }, []);


 /* ── Auto-fit after settle ──────────────────────────────────── */
 const handleEngineStop = useCallback(() => {
   fgRef.current?.zoomToFit(400, 50);
 }, []);


 useEffect(() => {
   if (graphData?.nodes?.length) {
     setTimeout(() => fgRef.current?.zoomToFit(400, 50), 400);
   }
 }, [graphData]);


 /* ── Dot-grid background ────────────────────────────────────── */
 const drawBackground = useCallback((ctx) => {
   ctx.save();
   ctx.setTransform(1, 0, 0, 1, 0, 0);
   ctx.fillStyle = '#ffffff';
   ctx.fillRect(0, 0, dims.w, dims.h);
   ctx.fillStyle = '#D1D5DB';
   const step = 24;
   for (let x = 0; x <= dims.w; x += step) {
     for (let y = 0; y <= dims.h; y += step) {
       ctx.beginPath();
       ctx.arc(x, y, 0.6, 0, Math.PI * 2);
       ctx.fill();
     }
   }
   ctx.restore();
 }, [dims]);


 /* ── Neighbor map ────────────────────────────────────────────── */
 const neighborMap = useMemo(() => {
   const map = new Map();
   for (const e of (graphData?.edges || [])) {
     const s = typeof e.source === 'object' ? e.source.id : e.source;
     const t = typeof e.target === 'object' ? e.target.id : e.target;
     if (!map.has(s)) map.set(s, new Set());
     if (!map.has(t)) map.set(t, new Set());
     map.get(s).add(t);
     map.get(t).add(s);
   }
   return map;
 }, [graphData]);


 /* ── Per-type node counts for legend ───────────────────────── */
 const typeCounts = useMemo(() => {
   const counts = {};
   for (const n of (graphData?.nodes || [])) {
     counts[n.type] = (counts[n.type] || 0) + 1;
   }
   return counts;
 }, [graphData]);


 const hlSet = useMemo(() => new Set(highlightNodeIds), [highlightNodeIds]);


 /* ── Node painter ────────────────────────────────────────────── */
 const paintNode = useCallback((node, ctx, scale) => {
   const cfg        = c(node.type);
   const isHL       = hlSet.has(node.id);
   const isHov      = hoveredNode?.id === node.id;
   const isNeighbor = hoveredNode
     ? (neighborMap.get(hoveredNode.id)?.has(node.id) ?? false)
     : false;
   const isDimmed   = hoveredNode && !isHov && !isNeighbor;


   const base = cfg.size;
   const r    = isHov ? base + 4 : (isNeighbor || isHL) ? base + 2 : base;


   ctx.save();
   ctx.globalAlpha = isDimmed ? 0.08 : 1; // dim non-neighbours hard on hover


   /* soft glow ring */
   if (isHov || isNeighbor || isHL) {
     ctx.beginPath();
     ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI);
     ctx.fillStyle = cfg.ring + (isHov ? 'BB' : '55');
     ctx.fill();
   }


   /* filled circle */
   ctx.beginPath();
   ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
   ctx.fillStyle = cfg.color;
   ctx.fill();


   /* thin white border */
   ctx.beginPath();
   ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
   ctx.strokeStyle = '#ffffff';
   ctx.lineWidth   = 1;
   ctx.stroke();


   /* label only on hover / highlight / neighbour */
   if (isHov || isHL || isNeighbor) {
     const fs    = Math.min(10 / scale, 10);
     const label = (node.label || node.id || '').toString();
     const short = label.length > 20 ? label.slice(0, 19) + '…' : label;


     ctx.font         = `600 ${fs}px Inter, sans-serif`;
     ctx.textAlign    = 'center';
     ctx.textBaseline = 'top';
     const tw  = ctx.measureText(short).width;
     const pad = 3;
     const bx  = node.x - tw / 2 - pad;
     const by  = node.y + r + 3;


     ctx.shadowColor = 'rgba(0,0,0,0.08)';
     ctx.shadowBlur  = 4;
     ctx.fillStyle   = '#ffffff';
     ctx.beginPath();
     ctx.roundRect(bx, by, tw + pad * 2, fs + pad * 2, 3);
     ctx.fill();
     ctx.shadowBlur = 0;
     ctx.fillStyle  = '#1e293b';
     ctx.fillText(short, node.x, by + pad);
   }


   ctx.restore();
 }, [hoveredNode, hlSet, neighborMap]);


 /* ── Handlers ────────────────────────────────────────────────── */
 const handleClick = useCallback((node, _graphEvent, domEvent) => {
   if (!node) return;
   const rect    = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
   const screenX = domEvent?.clientX ?? rect.left + dims.w / 2;
   const screenY = domEvent?.clientY ?? rect.top  + dims.h / 2;
   onNodeClick?.(node, { x: screenX, y: screenY });
 }, [onNodeClick, dims]);


 const handleHover = useCallback((node) => {
   setHoveredNode(node || null);
   document.body.style.cursor = node ? 'pointer' : 'default';
 }, []);


 /* ── Data normalisation ─────────────────────────────────────── */
 const fgData = useMemo(() => ({
   nodes: (graphData?.nodes || []).map(n => ({ ...n })),
   links: (graphData?.edges  || []).map(e => ({
     source: e.source, target: e.target, label: e.label,
   })),
 }), [graphData]);


 /* ── Edge color / opacity based on hover state ──────────────── */
 const linkColor = useCallback((link) => {
   const s        = typeof link.source === 'object' ? link.source.id : link.source;
   const t        = typeof link.target === 'object' ? link.target.id : link.target;
   const isActive = hoveredNode && (hoveredNode.id === s || hoveredNode.id === t);
   if (isActive)    return 'rgba(59,130,246,0.85)';   // bright blue on hover
   if (hoveredNode) return 'rgba(173,216,230,0.08)';  // nearly invisible when other node hovered
   return 'rgba(173,216,230,0.4)';                    // default web look
 }, [hoveredNode]);


 const linkWidth = useCallback((link) => {
   const s        = typeof link.source === 'object' ? link.source.id : link.source;
   const t        = typeof link.target === 'object' ? link.target.id : link.target;
   const isActive = hoveredNode && (hoveredNode.id === s || hoveredNode.id === t);
   return isActive ? 1.5 : 0.5;
 }, [hoveredNode]);


 return (
   <div ref={containerRef} className="relative w-full h-full overflow-hidden select-none">


     {/* Loading overlay */}
     {loading && (
       <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-sm">
         <div className="bg-white shadow-lg rounded-2xl px-5 py-3 flex items-center gap-3 border border-slate-100">
           <div className="flex gap-1">
             {[0,1,2].map(i => (
               <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-400 typing-dot"
                 style={{ animationDelay: `${i * 0.15}s` }} />
             ))}
           </div>
           <span className="text-sm text-slate-500">Loading graph…</span>
         </div>
       </div>
     )}


     {/* ── Top-left controls ────────────────────────────────────── */}
     <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
       <button
         onClick={onMinimize}
         className="flex items-center gap-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 shadow-sm transition-colors"
       >
         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4"/>
         </svg>
         Minimize
       </button>


       <button
         onClick={() => setHideGranular(v => !v)}
         className={`flex items-center gap-1.5 backdrop-blur-sm border rounded-lg px-2.5 py-1.5 text-[11px] font-medium shadow-sm transition-colors ${
           hideGranular
             ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-600'
             : 'bg-white/95 border-slate-200 text-slate-600 hover:bg-slate-50'
         }`}
       >
         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
             d={hideGranular
               ? 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21'
               : 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'}
           />
         </svg>
         {hideGranular ? 'Show Overlay' : 'Hide Granular'}
       </button>
     </div>


     {/* ── Bottom-left: Node Types legend with counts ───────────── */}
     {!hideGranular && (
       <div className="absolute bottom-10 left-3 z-10 bg-white/95 backdrop-blur-sm rounded-xl shadow-md border border-slate-100 p-2.5">
         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Node Types</p>
         <div className="flex flex-col gap-1">
           {Object.entries(NODE_CFG).map(([type, cfg]) => (
             <div key={type} className="flex items-center gap-1.5">
               <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
               <span className="text-[11px] text-slate-600 flex-1">{cfg.label}</span>
               {typeCounts[type] > 0 && (
                 <span className="text-[10px] font-semibold text-slate-400 ml-2 tabular-nums">
                   {typeCounts[type]}
                 </span>
               )}
             </div>
           ))}
         </div>
       </div>
     )}


     {/* ── Bottom-right: nodes / edges count ───────────────────── */}
     {!hideGranular && (
       <div className="absolute bottom-10 right-3 z-10 bg-white/95 backdrop-blur-sm rounded-xl shadow-md border border-slate-100 px-3 py-2 flex gap-3">
         <div className="text-center">
           <div className="text-sm font-bold text-slate-800 tabular-nums">{fgData.nodes.length}</div>
           <div className="text-[9px] text-slate-400 uppercase tracking-wide">Nodes</div>
         </div>
         <div className="w-px bg-slate-100" />
         <div className="text-center">
           <div className="text-sm font-bold text-slate-800 tabular-nums">{fgData.links.length}</div>
           <div className="text-[9px] text-slate-400 uppercase tracking-wide">Edges</div>
         </div>
       </div>
     )}


     {/* Hint */}
     <div className="hidden sm:block absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-white/80 border border-slate-200 rounded-full px-4 py-1 text-[10px] text-slate-400 shadow-sm whitespace-nowrap pointer-events-none">
       Click to expand · Hover to trace path · Scroll to zoom
     </div>


     <ForceGraph2D
       ref={fgRef}
       width={dims.w}
       height={dims.h}
       graphData={fgData}
       /* dot-grid background */
       onRenderFramePre={drawBackground}
       /* node */
       nodeCanvasObject={paintNode}
       nodeCanvasObjectMode={() => 'replace'}
       /* edges — thin web-like lines, no custom canvas painter */
       linkColor={linkColor}
       linkWidth={linkWidth}
       linkDirectionalArrowLength={4}
       linkDirectionalArrowRelPos={1}
       linkDirectionalArrowColor={linkColor}
       backgroundColor="#ffffff"
       /* events */
       onNodeClick={handleClick}
       onNodeHover={handleHover}
       onEngineStop={handleEngineStop}
       onEngineStart={handleEngineInit}
       /* physics */
       warmupTicks={100}
       cooldownTicks={100}
       d3AlphaDecay={0.01}
       d3VelocityDecay={0.3}
       /* interaction */
       enableZoomInteraction
       enablePanInteraction
       enableNodeDrag
     />
   </div>
 );
}





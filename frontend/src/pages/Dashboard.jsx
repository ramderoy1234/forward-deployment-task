import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import API_BASE from '../api.js';
import GraphView from '../components/GraphView.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import NodeDetailsCard from '../components/NodeDetailsCard.jsx';


function transformGraph(data) {
 if (!data) return { nodes: [], edges: [] };
 return {
   nodes: (data.nodes || []).map(n => ({
     id: n.id, label: n.label, type: n.type, color: n.color, meta: n.data || {},
   })),
   edges: (data.edges || []).map(e => ({
     source: e.source, target: e.target, label: e.label, id: e.id,
   })),
 };
}


const TOAST_STYLES = {
 success: 'bg-emerald-500',
 error:   'bg-red-500',
 info:    'bg-blue-500',
};


export default function Dashboard() {
 const [graphData,      setGraphData]      = useState({ nodes: [], edges: [] });
 const [loading,        setLoading]        = useState(false);
 const [selectedNode,   setSelectedNode]   = useState(null);
 const [highlightIds,   setHighlightIds]   = useState([]);
 const [toast,          setToast]          = useState(null);
 const [graphMinimized, setGraphMinimized] = useState(false);
 const [menuOpen,       setMenuOpen]       = useState(false);
 const toastTimer = useRef(null);
 const menuRef    = useRef(null);


 /* ── Close menu on outside click ─────────────────────────────── */
 useEffect(() => {
   const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
   document.addEventListener('mousedown', h);
   return () => document.removeEventListener('mousedown', h);
 }, []);


 /* ── Toast ───────────────────────────────────────────────────── */
 const showToast = useCallback((msg, type = 'info') => {
   setToast({ msg, type });
   clearTimeout(toastTimer.current);
   toastTimer.current = setTimeout(() => setToast(null), 3000);
 }, []);


 /* ── Load overview graph ─────────────────────────────────────── */
 const loadOverview = useCallback(async () => {
   setLoading(true);
   try {
     const { data } = await axios.get(`${API_BASE}/graph`);
     setGraphData(transformGraph(data));
     setSelectedNode(null);
   } catch {
     showToast('Failed to load graph', 'error');
   } finally {
     setLoading(false);
   }
 }, [showToast]);


 useEffect(() => { loadOverview(); }, [loadOverview]);


 /* ── Node click ──────────────────────────────────────────────── */
 const handleNodeClick = useCallback((node, pos) => {
   if (selectedNode?.node?.id === node.id) {
     setSelectedNode(null);
   } else {
     setSelectedNode({ node, pos });
   }
 }, [selectedNode]);


 /* ── Expand ──────────────────────────────────────────────────── */
 const handleExpand = useCallback(async (nodeId) => {
   setLoading(true);
   try {
     const { data } = await axios.get(`${API_BASE}/graph/${nodeId}`);
     const incoming = transformGraph(data);
     setGraphData(prev => {
       const existNodeIds = new Set(prev.nodes.map(n => n.id));
       const existEdgeIds = new Set(prev.edges.map(e => e.id));
       const newNodes = incoming.nodes.filter(n => !existNodeIds.has(n.id));
       const newEdges = incoming.edges.filter(e => !existEdgeIds.has(e.id));
       showToast(
         newNodes.length
           ? `Added ${newNodes.length} node${newNodes.length > 1 ? 's' : ''} and ${newEdges.length} edge${newEdges.length !== 1 ? 's' : ''}`
           : 'No new connections found',
         newNodes.length ? 'success' : 'info',
       );
       return { nodes: [...prev.nodes, ...newNodes], edges: [...prev.edges, ...newEdges] };
     });
   } catch {
     showToast('Failed to expand node', 'error');
   } finally {
     setLoading(false);
   }
 }, [showToast]);


 /* ── Focus ───────────────────────────────────────────────────── */
 const handleFocus = useCallback(async (nodeId) => {
   setLoading(true);
   setSelectedNode(null);
   try {
     const { data } = await axios.get(`${API_BASE}/graph/${nodeId}`);
     setGraphData(transformGraph(data));
     showToast('Focused on subgraph', 'success');
   } catch {
     showToast('Failed to focus node', 'error');
   } finally {
     setLoading(false);
   }
 }, [showToast]);


 /* ── Chat → highlight ────────────────────────────────────────── */
 const handleHighlight = useCallback((ids) => {
   setHighlightIds(ids);
   showToast(`Highlighted ${ids.length} node${ids.length !== 1 ? 's' : ''} in graph`, 'success');
   setTimeout(() => setHighlightIds([]), 6000);
 }, [showToast]);


 return (
   <div className="flex flex-col h-screen bg-white overflow-hidden">


     {/* ── Header: breadcrumb + triple-dot ───────────────────────── */}
     <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0 z-20">


       {/* Breadcrumb */}
       <nav className="flex items-center gap-1.5 text-sm select-none">
         <span className="text-slate-400 font-medium hover:text-slate-600 cursor-pointer transition-colors">
           Mapping
         </span>
         <svg className="w-3.5 h-3.5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
         </svg>
         <span className="text-slate-800 font-semibold">Order to Cash</span>
       </nav>


       {/* Triple-dot menu */}
       <div ref={menuRef} className="relative">
         <button
           onClick={() => setMenuOpen(v => !v)}
           className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
         >
           <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
             <circle cx="12" cy="5"  r="1.5"/>
             <circle cx="12" cy="12" r="1.5"/>
             <circle cx="12" cy="19" r="1.5"/>
           </svg>
         </button>


         {menuOpen && (
           <div className="absolute right-0 top-10 w-44 bg-white border border-slate-100 rounded-xl shadow-xl z-50 py-1 animate-fade-in">
             <button
               onClick={() => { loadOverview(); setMenuOpen(false); }}
               className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
             >
               <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                   d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
               </svg>
               Reset View
             </button>
             <button
               onClick={() => { setGraphMinimized(v => !v); setMenuOpen(false); }}
               className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
             >
               <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                   d={graphMinimized ? 'M4 8h16M4 16h16' : 'M20 12H4'}/>
               </svg>
               {graphMinimized ? 'Expand Graph' : 'Minimize Graph'}
             </button>
           </div>
         )}
       </div>
     </header>


     {/* ── Main content ──────────────────────────────────────────── */}
     <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">


       {/* Graph panel */}
       {graphMinimized ? (
         /* Collapsed strip — desktop only */
         <div
           className="hidden md:flex flex-col items-center justify-center w-10 bg-slate-50 border-r border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors flex-shrink-0"
           onClick={() => setGraphMinimized(false)}
           title="Expand graph"
         >
           <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
           </svg>
         </div>
       ) : (
         <div className="flex-1 overflow-hidden relative min-h-0" style={{ minHeight: '40vh' }}>
           <GraphView
             graphData={graphData}
             onNodeClick={handleNodeClick}
             highlightNodeIds={[
               ...(selectedNode ? [selectedNode.node.id] : []),
               ...highlightIds,
             ]}
             loading={loading}
             onMinimize={() => setGraphMinimized(true)}
           />
         </div>
       )}


       {/* Chat sidebar */}
       <div
         className="flex-shrink-0 overflow-hidden border-t md:border-t-0 md:border-l border-slate-100 h-[45vh] md:h-auto"
         style={{ width: graphMinimized ? '100%' : undefined }}
         /* on desktop: fixed width unless minimized */
         {...(!graphMinimized && { style: { width: 'clamp(280px, 30vw, 360px)' } })}
       >
         <ChatPanel onHighlightNodes={handleHighlight} />
       </div>
     </div>


     {/* ── Floating node details card ─────────────────────────────── */}
     {selectedNode && (
       <NodeDetailsCard
         node={selectedNode.node}
         pos={selectedNode.pos}
         onClose={() => setSelectedNode(null)}
         onExpand={handleExpand}
         onFocus={handleFocus}
       />
     )}


     {/* ── Toast ─────────────────────────────────────────────────── */}
     {toast && (
       <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] ${TOAST_STYLES[toast.type]} text-white text-xs font-semibold px-5 py-2.5 rounded-full shadow-xl animate-fade-in whitespace-nowrap`}>
         {toast.msg}
       </div>
     )}
   </div>
 );
}





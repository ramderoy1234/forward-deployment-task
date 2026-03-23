const express = require('express');
const router = express.Router();
const { getOverviewGraph, getNodeNeighbors, getSalesOrderGraph } = require('../services/graph');


// GET /graph - overview graph (latest 30 sales orders + customers)
router.get('/', async (req, res) => {
 try {
   const graph = await getOverviewGraph();
   res.json(graph);
 } catch (err) {
   console.error('Graph overview error:', err);
   res.status(500).json({ error: err.message });
 }
});


// GET /graph/:nodeId - expand a specific node
router.get('/:nodeId', async (req, res) => {
 try {
   const { nodeId } = req.params;
   const graph = await getNodeNeighbors(nodeId);
   res.json(graph);
 } catch (err) {
   console.error('Graph node error:', err);
   res.status(500).json({ error: err.message });
 }
});


module.exports = router;





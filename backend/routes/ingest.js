const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const path = require('path');


// POST /ingest - trigger data ingestion (for convenience)
router.post('/', (req, res) => {
 try {
   res.json({ status: 'started', message: 'Run: npm run ingest from backend directory' });
 } catch (err) {
   res.status(500).json({ error: err.message });
 }
});


// GET /ingest/status - check record counts
const prisma = require('../db/prisma');
router.get('/status', async (req, res) => {
 try {
   const [
     salesOrders, deliveries, billings, payments, customers, products, journals
   ] = await Promise.all([
     prisma.salesOrderHeader.count(),
     prisma.outboundDeliveryHeader.count(),
     prisma.billingDocumentHeader.count(),
     prisma.payment.count(),
     prisma.businessPartner.count(),
     prisma.product.count(),
     prisma.journalEntryItem.count(),
   ]);
   res.json({
     salesOrders, deliveries, billings, payments, customers, products, journals,
     total: salesOrders + deliveries + billings + payments + customers + products + journals,
   });
 } catch (err) {
   res.status(500).json({ error: err.message });
 }
});


module.exports = router;





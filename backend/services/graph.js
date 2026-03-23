/**
* Graph service: builds node/edge representations for React Flow visualization
* Supports expanding any entity node and showing its connections.
*/
const prisma = require('../db/prisma');


// Node type colors for UI
const NODE_COLORS = {
 salesOrder: '#4f86c6',
 delivery: '#5fb878',
 billing: '#e8a838',
 payment: '#e85d5d',
 customer: '#9b59b6',
 product: '#1abc9c',
 journal: '#e67e22',
 plant: '#95a5a6',
};


function makeNode(id, label, type, data = {}) {
 return {
   id,
   label,
   type,
   color: NODE_COLORS[type] || '#888',
   data,
 };
}


function makeEdge(source, target, label = '') {
 return { id: `${source}→${target}`, source, target, label };
}


// Get graph for a specific sales order
async function getSalesOrderGraph(salesOrderId) {
 const nodes = [];
 const edges = [];


 // Sales Order
 const so = await prisma.salesOrderHeader.findUnique({
   where: { salesOrder: salesOrderId },
   include: {
     items: { include: { product: true } },
     customer: true,
   },
 });


 if (!so) return { nodes, edges };


 nodes.push(makeNode(`so-${so.salesOrder}`, `SO ${so.salesOrder}`, 'salesOrder', {
   salesOrder: so.salesOrder,
   amount: so.totalNetAmount,
   currency: so.transactionCurrency,
   deliveryStatus: so.overallDeliveryStatus,
   billingStatus: so.overallOrdReltdBillgStatus,
   creationDate: so.creationDate,
 }));


 // Customer
 if (so.customer) {
   const custId = `bp-${so.soldToParty}`;
   nodes.push(makeNode(custId, so.customer.businessPartnerFullName || so.customer.businessPartnerName || so.soldToParty, 'customer', {
     businessPartner: so.soldToParty,
     name: so.customer.businessPartnerFullName,
     industry: so.customer.industry,
   }));
   edges.push(makeEdge(custId, `so-${so.salesOrder}`, 'placed'));
 }


 // Order Items → Products
 for (const item of so.items) {
   if (item.product) {
     const prodId = `prod-${item.material}`;
     if (!nodes.find(n => n.id === prodId)) {
       nodes.push(makeNode(prodId, item.product.description || item.material, 'product', {
         product: item.material,
         description: item.product.description,
         productGroup: item.product.productGroup,
       }));
     }
     edges.push(makeEdge(`so-${so.salesOrder}`, prodId, `item ${item.salesOrderItem}`));
   }
 }


 // Deliveries for this sales order
 const deliveryItems = await prisma.outboundDeliveryItem.findMany({
   where: { referenceSdDocument: salesOrderId },
   include: { delivery: true },
 });


 const deliveryDocs = [...new Set(deliveryItems.map(d => d.deliveryDocument))];
 for (const delivDoc of deliveryDocs) {
   const deliv = deliveryItems.find(d => d.deliveryDocument === delivDoc)?.delivery;
   if (!deliv) continue;
   const delivId = `del-${delivDoc}`;
   nodes.push(makeNode(delivId, `Delivery ${delivDoc}`, 'delivery', {
     deliveryDocument: delivDoc,
     goodsMovementDate: deliv.actualGoodsMovementDate,
     goodsMovementStatus: deliv.overallGoodsMovementStatus,
     shippingPoint: deliv.shippingPoint,
   }));
   edges.push(makeEdge(`so-${so.salesOrder}`, delivId, 'delivered via'));


   // Billing documents for this delivery
   const billingItems = await prisma.billingDocumentItem.findMany({
     where: { referenceSdDocument: delivDoc },
     include: { header: true },
   });


   const billingDocs = [...new Set(billingItems.map(b => b.billingDocument))];
   for (const billDoc of billingDocs) {
     const bill = billingItems.find(b => b.billingDocument === billDoc)?.header;
     if (!bill) continue;
     const billId = `bill-${billDoc}`;
     if (!nodes.find(n => n.id === billId)) {
       nodes.push(makeNode(billId, `Invoice ${billDoc}`, 'billing', {
         billingDocument: billDoc,
         amount: bill.totalNetAmount,
         currency: bill.transactionCurrency,
         billingDate: bill.billingDocumentDate,
         isCancelled: bill.billingDocumentIsCancelled,
         accountingDocument: bill.accountingDocument,
       }));
       edges.push(makeEdge(delivId, billId, 'billed'));
     }


     // Payments for this billing document (linked via accountingDocument, NOT invoiceReference)
     if (bill.accountingDocument) {
       const payments = await prisma.payment.findMany({
         where: { accountingDocument: bill.accountingDocument },
       });
       for (const pay of payments) {
         const payId = `pay-${pay.accountingDocument}-${pay.accountingDocumentItem}`;
         if (!nodes.find(n => n.id === payId)) {
           nodes.push(makeNode(payId, `Payment ${pay.accountingDocument}`, 'payment', {
             amount: pay.amountInTransactionCurrency,
             currency: pay.transactionCurrency,
             clearingDate: pay.clearingDate,
             postingDate: pay.postingDate,
           }));
           edges.push(makeEdge(billId, payId, 'paid by'));
         }
       }
     }


     // Journal entries
     if (bill.accountingDocument) {
       const journals = await prisma.journalEntryItem.findMany({
         where: { accountingDocument: bill.accountingDocument },
       });
       for (const j of journals) {
         const jId = `je-${j.accountingDocument}-${j.accountingDocumentItem}`;
         if (!nodes.find(n => n.id === jId)) {
           nodes.push(makeNode(jId, `Journal ${j.accountingDocument}`, 'journal', {
             amount: j.amountInTransactionCurrency,
             currency: j.transactionCurrency,
             postingDate: j.postingDate,
             glAccount: j.glAccount,
           }));
           edges.push(makeEdge(billId, jId, 'posted to'));
         }
       }
     }
   }
 }


 return { nodes, edges };
}


// Get overview graph: full O2C chain — Customer → Order → Delivery → Invoice → Payment
async function getOverviewGraph() {
 const nodeMap = new Map(); // id → node (dedup)
 const edgeMap = new Map(); // id → edge (dedup)


 const addNode = (n) => { if (!nodeMap.has(n.id)) nodeMap.set(n.id, n); };
 const addEdge = (e) => { if (!edgeMap.has(e.id)) edgeMap.set(e.id, e); };


 // ── 1. Fetch recent sales orders + customers ───────────────────────────
 const salesOrders = await prisma.salesOrderHeader.findMany({
   take: 20,
   orderBy: { creationDate: 'desc' },
   include: { customer: true },
 });


 const soIds = salesOrders.map(so => so.salesOrder);


 for (const so of salesOrders) {
   // Customer node
   if (so.soldToParty) {
     const bp = so.customer;
     addNode(makeNode(`bp-${so.soldToParty}`,
       bp?.businessPartnerFullName || bp?.businessPartnerName || so.soldToParty,
       'customer', { businessPartner: so.soldToParty, name: bp?.businessPartnerFullName }
     ));
     addEdge(makeEdge(`bp-${so.soldToParty}`, `so-${so.salesOrder}`, 'placed'));
   }
   // Sales order node
   addNode(makeNode(`so-${so.salesOrder}`, `SO ${so.salesOrder}`, 'salesOrder', {
     salesOrder: so.salesOrder,
     amount: so.totalNetAmount,
     currency: so.transactionCurrency,
     deliveryStatus: so.overallDeliveryStatus,
     billingStatus: so.overallOrdReltdBillgStatus,
     creationDate: so.creationDate,
   }));
 }


 // ── 2. Deliveries linked to these sales orders ─────────────────────────
 const deliveryItems = await prisma.outboundDeliveryItem.findMany({
   where: { referenceSdDocument: { in: soIds } },
   include: { delivery: true },
 });


 const delivDocIds = [...new Set(deliveryItems.map(d => d.deliveryDocument))];


 for (const di of deliveryItems) {
   const deliv = di.delivery;
   if (!deliv) continue;
   const delivId = `del-${di.deliveryDocument}`;
   addNode(makeNode(delivId, `Delivery ${di.deliveryDocument}`, 'delivery', {
     deliveryDocument: di.deliveryDocument,
     goodsMovementDate: deliv.actualGoodsMovementDate,
     goodsMovementStatus: deliv.overallGoodsMovementStatus,
     shippingPoint: deliv.shippingPoint,
   }));
   // Edge: sales order → delivery (use the referenceSdDocument as the SO id)
   const soNodeId = `so-${di.referenceSdDocument}`;
   if (nodeMap.has(soNodeId)) {
     addEdge(makeEdge(soNodeId, delivId, 'delivered via'));
   }
 }


 // ── 3. Billing documents linked to those deliveries ────────────────────
 const billingItems = await prisma.billingDocumentItem.findMany({
   where: { referenceSdDocument: { in: delivDocIds } },
   include: { header: true },
 });


 const billDocIds = [...new Set(billingItems.map(b => b.billingDocument))];


 for (const bi of billingItems) {
   const bill = bi.header;
   if (!bill) continue;
   const billId = `bill-${bi.billingDocument}`;
   addNode(makeNode(billId, `Invoice ${bi.billingDocument}`, 'billing', {
     billingDocument: bi.billingDocument,
     amount: bill.totalNetAmount,
     currency: bill.transactionCurrency,
     billingDate: bill.billingDocumentDate,
     isCancelled: bill.billingDocumentIsCancelled,
     accountingDocument: bill.accountingDocument,
   }));
   // Edge: delivery → billing
   const delivId = `del-${bi.referenceSdDocument}`;
   if (nodeMap.has(delivId)) {
     addEdge(makeEdge(delivId, billId, 'billed'));
   }
 }


 // ── 4. Payments linked via accountingDocument (invoiceReference is null in this dataset) ──
 // Build a map: accountingDocument → billId for fast reverse lookup
 const acctDocToBillId = new Map();
 for (const bi of billingItems) {
   if (bi.header?.accountingDocument) {
     acctDocToBillId.set(bi.header.accountingDocument, `bill-${bi.billingDocument}`);
   }
 }
 const acctDocIds = [...acctDocToBillId.keys()];


 const payments = await prisma.payment.findMany({
   where: { accountingDocument: { in: acctDocIds } },
 });


 for (const pay of payments) {
   const payId = `pay-${pay.accountingDocument}-${pay.accountingDocumentItem}`;
   const billId = acctDocToBillId.get(pay.accountingDocument);
   if (!billId) continue;
   addNode(makeNode(payId, `Payment ${pay.accountingDocument}`, 'payment', {
     amount: pay.amountInTransactionCurrency,
     currency: pay.transactionCurrency,
     clearingDate: pay.clearingDate,
     postingDate: pay.postingDate,
   }));
   if (nodeMap.has(billId)) {
     addEdge(makeEdge(billId, payId, 'paid by'));
   }
 }


 return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
}




async function getCustomerGraph(businessPartnerId) {
 const nodes = [];
 const edges = [];


 const bp = await prisma.businessPartner.findUnique({
   where: { businessPartner: businessPartnerId },
   include: {
     orders: { take: 10, orderBy: { creationDate: 'desc' } },
     addresses: { take: 1 },
   },
 });


 if (!bp) return { nodes, edges };


 nodes.push(makeNode(`bp-${businessPartnerId}`, bp.businessPartnerFullName || bp.businessPartnerName || businessPartnerId, 'customer', {
   businessPartner: businessPartnerId,
   name: bp.businessPartnerFullName,
   industry: bp.industry,
   city: bp.addresses[0]?.cityName,
   country: bp.addresses[0]?.country,
 }));


 for (const so of bp.orders) {
   nodes.push(makeNode(`so-${so.salesOrder}`, `SO ${so.salesOrder}`, 'salesOrder', {
     salesOrder: so.salesOrder,
     amount: so.totalNetAmount,
     currency: so.transactionCurrency,
     deliveryStatus: so.overallDeliveryStatus,
   }));
   edges.push(makeEdge(`bp-${businessPartnerId}`, `so-${so.salesOrder}`, 'placed'));
 }


 return { nodes, edges };
}


async function getProductGraph(productId) {
 const nodes = [];
 const edges = [];


 const product = await prisma.product.findUnique({
   where: { product: productId },
   include: {
     salesOrderItems: { take: 10, include: { order: true } },
     billingItems: { take: 10, include: { header: true } },
   },
 });


 if (!product) return { nodes, edges };


 nodes.push(makeNode(`prod-${productId}`, product.description || productId, 'product', {
   product: productId,
   description: product.description,
   productGroup: product.productGroup,
 }));


 for (const item of product.salesOrderItems) {
   const soId = `so-${item.salesOrder}`;
   if (!nodes.find(n => n.id === soId)) {
     nodes.push(makeNode(soId, `SO ${item.salesOrder}`, 'salesOrder', {
       salesOrder: item.salesOrder,
       amount: item.order?.totalNetAmount,
       currency: item.order?.transactionCurrency,
     }));
   }
   edges.push(makeEdge(soId, `prod-${productId}`, `qty: ${item.requestedQuantity}`));
 }


 return { nodes, edges };
}


/* ── Billing document expansion ─────────────────────────────────── */
async function getBillingGraph(billingDocumentId) {
 const nodes = [];
 const edges = [];


 const bill = await prisma.billingDocumentHeader.findUnique({
   where: { billingDocument: billingDocumentId },
   include: { items: true },
 });
 if (!bill) return { nodes, edges };


 const billId = `bill-${billingDocumentId}`;
 nodes.push(makeNode(billId, `Invoice ${billingDocumentId}`, 'billing', {
   billingDocument: billingDocumentId,
   amount: bill.totalNetAmount,
   currency: bill.transactionCurrency,
   billingDate: bill.billingDocumentDate,
   isCancelled: bill.billingDocumentIsCancelled,
   accountingDocument: bill.accountingDocument,
 }));


 // Customer
 if (bill.soldToParty) {
   const bp = await prisma.businessPartner.findUnique({ where: { businessPartner: bill.soldToParty } });
   const custId = `bp-${bill.soldToParty}`;
   nodes.push(makeNode(custId, bp?.businessPartnerFullName || bill.soldToParty, 'customer', {
     businessPartner: bill.soldToParty,
     name: bp?.businessPartnerFullName,
   }));
   edges.push(makeEdge(custId, billId, 'billed to'));
 }


 // Deliveries (referenceSdDocument on billing items points to delivery doc)
 const delivDocs = [...new Set(bill.items.map(i => i.referenceSdDocument).filter(Boolean))];
 for (const delivDoc of delivDocs) {
   const deliv = await prisma.outboundDeliveryHeader.findUnique({ where: { deliveryDocument: delivDoc } });
   if (!deliv) continue;
   const delivId = `del-${delivDoc}`;
   nodes.push(makeNode(delivId, `Delivery ${delivDoc}`, 'delivery', {
     deliveryDocument: delivDoc,
     goodsMovementDate: deliv.actualGoodsMovementDate,
     goodsMovementStatus: deliv.overallGoodsMovementStatus,
   }));
   edges.push(makeEdge(delivId, billId, 'billed'));


   // Sales order from delivery items
   const soIds = [...new Set((await prisma.outboundDeliveryItem.findMany({
     where: { deliveryDocument: delivDoc }, select: { referenceSdDocument: true },
   })).map(i => i.referenceSdDocument).filter(Boolean))];
   for (const soId of soIds.slice(0, 3)) {
     const soNodeId = `so-${soId}`;
     if (!nodes.find(n => n.id === soNodeId)) {
       const so = await prisma.salesOrderHeader.findUnique({ where: { salesOrder: soId } });
       nodes.push(makeNode(soNodeId, `SO ${soId}`, 'salesOrder', {
         salesOrder: soId, amount: so?.totalNetAmount, currency: so?.transactionCurrency,
       }));
     }
     edges.push(makeEdge(soNodeId, delivId, 'delivered via'));
   }
 }


 // Payments — linked via accountingDocument (invoiceReference is null in this dataset)
 if (bill.accountingDocument) {
   const payments = await prisma.payment.findMany({
     where: { accountingDocument: bill.accountingDocument },
   });
   for (const pay of payments) {
     const payId = `pay-${pay.accountingDocument}-${pay.accountingDocumentItem}`;
     nodes.push(makeNode(payId, `Payment ${pay.accountingDocument}`, 'payment', {
       amount: pay.amountInTransactionCurrency,
       currency: pay.transactionCurrency,
       clearingDate: pay.clearingDate,
       postingDate: pay.postingDate,
     }));
     edges.push(makeEdge(billId, payId, 'paid by'));
   }
 }


 // Journal entries
 if (bill.accountingDocument) {
   const journals = await prisma.journalEntryItem.findMany({
     where: { accountingDocument: bill.accountingDocument }, take: 5,
   });
   for (const j of journals) {
     const jId = `je-${j.accountingDocument}-${j.accountingDocumentItem}`;
     nodes.push(makeNode(jId, `Journal ${j.accountingDocument}`, 'journal', {
       amount: j.amountInTransactionCurrency,
       postingDate: j.postingDate,
       glAccount: j.glAccount,
       accountingDocument: j.accountingDocument,
     }));
     edges.push(makeEdge(billId, jId, 'posted to'));
   }
 }


 return { nodes, edges };
}


/* ── Delivery document expansion ────────────────────────────────── */
async function getDeliveryGraph(deliveryDocumentId) {
 const nodes = [];
 const edges = [];


 const deliv = await prisma.outboundDeliveryHeader.findUnique({
   where: { deliveryDocument: deliveryDocumentId },
   include: { items: true },
 });
 if (!deliv) return { nodes, edges };


 const delivId = `del-${deliveryDocumentId}`;
 nodes.push(makeNode(delivId, `Delivery ${deliveryDocumentId}`, 'delivery', {
   deliveryDocument: deliveryDocumentId,
   goodsMovementDate: deliv.actualGoodsMovementDate,
   goodsMovementStatus: deliv.overallGoodsMovementStatus,
   pickingStatus: deliv.overallPickingStatus,
   shippingPoint: deliv.shippingPoint,
 }));


 // Linked sales orders
 const soIds = [...new Set(deliv.items.map(i => i.referenceSdDocument).filter(Boolean))];
 for (const soId of soIds) {
   const so = await prisma.salesOrderHeader.findUnique({ where: { salesOrder: soId } });
   const soNodeId = `so-${soId}`;
   nodes.push(makeNode(soNodeId, `SO ${soId}`, 'salesOrder', {
     salesOrder: soId, amount: so?.totalNetAmount, currency: so?.transactionCurrency,
     deliveryStatus: so?.overallDeliveryStatus,
   }));
   edges.push(makeEdge(soNodeId, delivId, 'delivered via'));
 }


 // Billing documents
 const billItems = await prisma.billingDocumentItem.findMany({
   where: { referenceSdDocument: deliveryDocumentId },
   include: { header: true },
 });
 const billDocs = [...new Set(billItems.map(b => b.billingDocument))];
 for (const billDoc of billDocs) {
   const bill = billItems.find(b => b.billingDocument === billDoc)?.header;
   if (!bill) continue;
   const billId = `bill-${billDoc}`;
   nodes.push(makeNode(billId, `Invoice ${billDoc}`, 'billing', {
     billingDocument: billDoc, amount: bill.totalNetAmount,
     currency: bill.transactionCurrency, billingDate: bill.billingDocumentDate,
   }));
   edges.push(makeEdge(delivId, billId, 'billed'));
 }


 return { nodes, edges };
}


/* ── Payment node expansion ─────────────────────────────────────── */
async function getPaymentGraph(payKey) {
 // payKey is "accountingDocument-accountingDocumentItem"
 const [acctDoc] = payKey.split('-');
 const nodes = [];
 const edges = [];


 const payments = await prisma.payment.findMany({ where: { accountingDocument: acctDoc } });
 if (!payments.length) return { nodes, edges };


 for (const pay of payments) {
   const payId = `pay-${pay.accountingDocument}-${pay.accountingDocumentItem}`;
   if (!nodes.find(n => n.id === payId)) {
     nodes.push(makeNode(payId, `Payment ${pay.accountingDocument}`, 'payment', {
       amount: pay.amountInTransactionCurrency, currency: pay.transactionCurrency,
       clearingDate: pay.clearingDate, postingDate: pay.postingDate,
       accountingDocument: pay.accountingDocument,
     }));
   }
   // Link back to billing document via accountingDocument
   const bill = await prisma.billingDocumentHeader.findFirst({
     where: { accountingDocument: pay.accountingDocument },
   });
   if (bill) {
     const billId = `bill-${bill.billingDocument}`;
     if (!nodes.find(n => n.id === billId)) {
       nodes.push(makeNode(billId, `Invoice ${bill.billingDocument}`, 'billing', {
         billingDocument: bill.billingDocument, amount: bill.totalNetAmount,
         currency: bill.transactionCurrency, billingDate: bill.billingDocumentDate,
       }));
     }
     edges.push(makeEdge(billId, payId, 'paid by'));
   }
 }


 return { nodes, edges };
}


/* ── Journal entry expansion ────────────────────────────────────── */
async function getJournalGraph(jeKey) {
 const [acctDoc] = jeKey.split('-');
 const nodes = [];
 const edges = [];


 const journals = await prisma.journalEntryItem.findMany({
   where: { accountingDocument: acctDoc }, take: 10,
 });
 if (!journals.length) return { nodes, edges };


 for (const j of journals) {
   const jId = `je-${j.accountingDocument}-${j.accountingDocumentItem}`;
   if (!nodes.find(n => n.id === jId)) {
     nodes.push(makeNode(jId, `Journal ${j.accountingDocument}`, 'journal', {
       amount: j.amountInTransactionCurrency, postingDate: j.postingDate,
       glAccount: j.glAccount, accountingDocument: j.accountingDocument,
     }));
   }
 }


 // Link to billing document that generated this journal
 const bill = await prisma.billingDocumentHeader.findFirst({
   where: { accountingDocument: acctDoc },
 });
 if (bill) {
   const billId = `bill-${bill.billingDocument}`;
   nodes.push(makeNode(billId, `Invoice ${bill.billingDocument}`, 'billing', {
     billingDocument: bill.billingDocument, amount: bill.totalNetAmount,
     currency: bill.transactionCurrency, billingDate: bill.billingDocumentDate,
   }));
   for (const j of journals) {
     edges.push(makeEdge(billId, `je-${j.accountingDocument}-${j.accountingDocumentItem}`, 'posted to'));
   }
 }


 return { nodes, edges };
}


/* ── Router ──────────────────────────────────────────────────────── */
async function getNodeNeighbors(nodeId) {
 const dashIdx  = nodeId.indexOf('-');
 const type     = nodeId.slice(0, dashIdx);
 const actualId = nodeId.slice(dashIdx + 1);


 switch (type) {
   case 'so':   return getSalesOrderGraph(actualId);
   case 'bp':   return getCustomerGraph(actualId);
   case 'prod': return getProductGraph(actualId);
   case 'bill': return getBillingGraph(actualId);
   case 'del':  return getDeliveryGraph(actualId);
   case 'pay':  return getPaymentGraph(actualId);
   case 'je':   return getJournalGraph(actualId);
   default:     return getOverviewGraph();
 }
}


module.exports = { getOverviewGraph, getNodeNeighbors, getSalesOrderGraph };





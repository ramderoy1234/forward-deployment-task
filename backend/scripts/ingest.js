/**
* Data ingestion script: reads all JSONL files from sap-o2c-data
* and populates the PostgreSQL database via Prisma.
*/
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '../.env') });


const prisma = new PrismaClient();


const DATA_DIR = path.join(__dirname, '../../sap-o2c-data');


async function readJsonl(dir) {
 const records = [];
 const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
 for (const file of files) {
   const rl = readline.createInterface({
     input: fs.createReadStream(path.join(dir, file)),
     crlfDelay: Infinity,
   });
   for await (const line of rl) {
     if (line.trim()) {
       try {
         records.push(JSON.parse(line));
       } catch (_) {}
     }
   }
 }
 return records;
}


function toDecimal(val) {
 if (val === null || val === undefined || val === '') return null;
 const n = parseFloat(val);
 return isNaN(n) ? null : n;
}


function toDate(val) {
 if (!val) return null;
 try {
   const d = new Date(val);
   return isNaN(d.getTime()) ? null : d;
 } catch {
   return null;
 }
}


function str(val) {
 if (val === null || val === undefined) return null;
 const s = String(val).trim();
 return s === '' ? null : s;
}


async function ingestProducts() {
 const desc = await readJsonl(path.join(DATA_DIR, 'product_descriptions'));
 const descMap = {};
 for (const d of desc) {
   if (d.language === 'EN' || !descMap[d.product]) {
     descMap[d.product] = d.productDescription;
   }
 }


 const records = await readJsonl(path.join(DATA_DIR, 'products'));
 console.log(`Ingesting ${records.length} products...`);
 for (const r of records) {
   await prisma.product.upsert({
     where: { product: r.product },
     update: {},
     create: {
       product: r.product,
       productType: str(r.productType),
       crossPlantStatus: str(r.crossPlantStatus),
       crossPlantStatusValidityDate: toDate(r.crossPlantStatusValidityDate),
       creationDate: toDate(r.creationDate),
       createdByUser: str(r.createdByUser),
       lastChangeDate: toDate(r.lastChangeDate),
       lastChangeDateTime: toDate(r.lastChangeDateTime),
       isMarkedForDeletion: str(r.isMarkedForDeletion),
       productOldId: str(r.productOldId),
       grossWeight: toDecimal(r.grossWeight),
       weightUnit: str(r.weightUnit),
       netWeight: toDecimal(r.netWeight),
       productGroup: str(r.productGroup),
       baseUnit: str(r.baseUnit),
       division: str(r.division),
       industrySector: str(r.industrySector),
       description: str(descMap[r.product]),
     },
   });
 }
 console.log('Products done.');
}


async function ingestBusinessPartners() {
 const records = await readJsonl(path.join(DATA_DIR, 'business_partners'));
 console.log(`Ingesting ${records.length} business partners...`);
 for (const r of records) {
   await prisma.businessPartner.upsert({
     where: { businessPartner: r.businessPartner },
     update: {},
     create: {
       businessPartner: r.businessPartner,
       customer: str(r.customer),
       businessPartnerCategory: str(r.businessPartnerCategory),
       businessPartnerFullName: str(r.businessPartnerFullName),
       businessPartnerGrouping: str(r.businessPartnerGrouping),
       businessPartnerName: str(r.businessPartnerName),
       correspondenceLanguage: str(r.correspondenceLanguage),
       createdByUser: str(r.createdByUser),
       creationDate: toDate(r.creationDate),
       creationTime: str(r.creationTime),
       firstName: str(r.firstName),
       formOfAddress: str(r.formOfAddress),
       industry: str(r.industry),
       lastChangeDate: toDate(r.lastChangeDate),
       lastName: str(r.lastName),
       organizationBpName1: str(r.organizationBpName1),
       organizationBpName2: str(r.organizationBpName2),
       businessPartnerIsBlocked: str(r.businessPartnerIsBlocked),
       isMarkedForArchiving: str(r.isMarkedForArchiving),
     },
   });
 }
 console.log('Business partners done.');
}


async function ingestAddresses() {
 const records = await readJsonl(path.join(DATA_DIR, 'business_partner_addresses'));
 console.log(`Ingesting ${records.length} addresses...`);
 for (const r of records) {
   try {
     await prisma.businessPartnerAddress.upsert({
       where: { businessPartner_addressId: { businessPartner: r.businessPartner, addressId: r.addressId } },
       update: {},
       create: {
         businessPartner: r.businessPartner,
         addressId: r.addressId,
         validityStartDate: toDate(r.validityStartDate),
         validityEndDate: toDate(r.validityEndDate),
         addressUuid: str(r.addressUuid),
         addressTimeZone: str(r.addressTimeZone),
         cityName: str(r.cityName),
         country: str(r.country),
         postalCode: str(r.postalCode),
         region: str(r.region),
         streetName: str(r.streetName),
         taxJurisdiction: str(r.taxJurisdiction),
         transportZone: str(r.transportZone),
       },
     });
   } catch (e) {
     // skip if BP not found
   }
 }
 console.log('Addresses done.');
}


async function ingestSalesOrders() {
 const headers = await readJsonl(path.join(DATA_DIR, 'sales_order_headers'));
 console.log(`Ingesting ${headers.length} sales order headers...`);
 for (const r of headers) {
   await prisma.salesOrderHeader.upsert({
     where: { salesOrder: r.salesOrder },
     update: {},
     create: {
       salesOrder: r.salesOrder,
       salesOrderType: str(r.salesOrderType),
       salesOrganization: str(r.salesOrganization),
       distributionChannel: str(r.distributionChannel),
       organizationDivision: str(r.organizationDivision),
       salesGroup: str(r.salesGroup),
       salesOffice: str(r.salesOffice),
       soldToParty: str(r.soldToParty),
       creationDate: toDate(r.creationDate),
       createdByUser: str(r.createdByUser),
       lastChangeDateTime: toDate(r.lastChangeDateTime),
       totalNetAmount: toDecimal(r.totalNetAmount),
       overallDeliveryStatus: str(r.overallDeliveryStatus),
       overallOrdReltdBillgStatus: str(r.overallOrdReltdBillgStatus),
       overallSdDocReferenceStatus: str(r.overallSdDocReferenceStatus),
       transactionCurrency: str(r.transactionCurrency),
       pricingDate: toDate(r.pricingDate),
       requestedDeliveryDate: toDate(r.requestedDeliveryDate),
       headerBillingBlockReason: str(r.headerBillingBlockReason),
       deliveryBlockReason: str(r.deliveryBlockReason),
       incotermsClassification: str(r.incotermsClassification),
       incotermsLocation1: str(r.incotermsLocation1),
       customerPaymentTerms: str(r.customerPaymentTerms),
       totalCreditCheckStatus: str(r.totalCreditCheckStatus),
     },
   });
 }


 const items = await readJsonl(path.join(DATA_DIR, 'sales_order_items'));
 console.log(`Ingesting ${items.length} sales order items...`);
 for (const r of items) {
   try {
     await prisma.salesOrderItem.upsert({
       where: { salesOrder_salesOrderItem: { salesOrder: r.salesOrder, salesOrderItem: r.salesOrderItem } },
       update: {},
       create: {
         salesOrder: r.salesOrder,
         salesOrderItem: r.salesOrderItem,
         salesOrderItemCategory: str(r.salesOrderItemCategory),
         material: str(r.material),
         requestedQuantity: toDecimal(r.requestedQuantity),
         requestedQuantityUnit: str(r.requestedQuantityUnit),
         transactionCurrency: str(r.transactionCurrency),
         netAmount: toDecimal(r.netAmount),
         materialGroup: str(r.materialGroup),
         productionPlant: str(r.productionPlant),
         storageLocation: str(r.storageLocation),
         salesDocumentRjcnReason: str(r.salesDocumentRjcnReason),
         itemBillingBlockReason: str(r.itemBillingBlockReason),
       },
     });
   } catch (e) {
     // skip if product not in table
   }
 }


 const lines = await readJsonl(path.join(DATA_DIR, 'sales_order_schedule_lines'));
 console.log(`Ingesting ${lines.length} schedule lines...`);
 for (const r of lines) {
   try {
     await prisma.salesOrderScheduleLine.upsert({
       where: { salesOrder_salesOrderItem_scheduleLine: { salesOrder: r.salesOrder, salesOrderItem: r.salesOrderItem, scheduleLine: r.scheduleLine } },
       update: {},
       create: {
         salesOrder: r.salesOrder,
         salesOrderItem: r.salesOrderItem,
         scheduleLine: r.scheduleLine,
         confirmedDeliveryDate: toDate(r.confirmedDeliveryDate),
         orderQuantityUnit: str(r.orderQuantityUnit),
         confdOrderQtyByMatlAvailCheck: toDecimal(r.confdOrderQtyByMatlAvailCheck),
       },
     });
   } catch (e) {}
 }
 console.log('Sales orders done.');
}


async function ingestDeliveries() {
 const headers = await readJsonl(path.join(DATA_DIR, 'outbound_delivery_headers'));
 console.log(`Ingesting ${headers.length} delivery headers...`);
 for (const r of headers) {
   await prisma.outboundDeliveryHeader.upsert({
     where: { deliveryDocument: r.deliveryDocument },
     update: {},
     create: {
       deliveryDocument: r.deliveryDocument,
       actualGoodsMovementDate: toDate(r.actualGoodsMovementDate),
       actualGoodsMovementTime: str(r.actualGoodsMovementTime),
       creationDate: toDate(r.creationDate),
       creationTime: str(r.creationTime),
       deliveryBlockReason: str(r.deliveryBlockReason),
       hdrGeneralIncompletionStatus: str(r.hdrGeneralIncompletionStatus),
       headerBillingBlockReason: str(r.headerBillingBlockReason),
       lastChangeDate: toDate(r.lastChangeDate),
       overallGoodsMovementStatus: str(r.overallGoodsMovementStatus),
       overallPickingStatus: str(r.overallPickingStatus),
       overallProofOfDeliveryStatus: str(r.overallProofOfDeliveryStatus),
       shippingPoint: str(r.shippingPoint),
     },
   });
 }


 const items = await readJsonl(path.join(DATA_DIR, 'outbound_delivery_items'));
 console.log(`Ingesting ${items.length} delivery items...`);
 for (const r of items) {
   try {
     await prisma.outboundDeliveryItem.upsert({
       where: { deliveryDocument_deliveryDocumentItem: { deliveryDocument: r.deliveryDocument, deliveryDocumentItem: r.deliveryDocumentItem } },
       update: {},
       create: {
         deliveryDocument: r.deliveryDocument,
         deliveryDocumentItem: r.deliveryDocumentItem,
         actualDeliveryQuantity: toDecimal(r.actualDeliveryQuantity),
         batch: str(r.batch),
         deliveryQuantityUnit: str(r.deliveryQuantityUnit),
         itemBillingBlockReason: str(r.itemBillingBlockReason),
         lastChangeDate: toDate(r.lastChangeDate),
         plant: str(r.plant),
         referenceSdDocument: str(r.referenceSdDocument),
         referenceSdDocumentItem: str(r.referenceSdDocumentItem),
         storageLocation: str(r.storageLocation),
       },
     });
   } catch (e) {}
 }
 console.log('Deliveries done.');
}


async function ingestBillingDocuments() {
 const headers = await readJsonl(path.join(DATA_DIR, 'billing_document_headers'));
 console.log(`Ingesting ${headers.length} billing document headers...`);
 for (const r of headers) {
   await prisma.billingDocumentHeader.upsert({
     where: { billingDocument: r.billingDocument },
     update: {},
     create: {
       billingDocument: r.billingDocument,
       billingDocumentType: str(r.billingDocumentType),
       creationDate: toDate(r.creationDate),
       creationTime: str(r.creationTime),
       lastChangeDateTime: toDate(r.lastChangeDateTime),
       billingDocumentDate: toDate(r.billingDocumentDate),
       billingDocumentIsCancelled: str(r.billingDocumentIsCancelled),
       cancelledBillingDocument: str(r.cancelledBillingDocument),
       totalNetAmount: toDecimal(r.totalNetAmount),
       transactionCurrency: str(r.transactionCurrency),
       companyCode: str(r.companyCode),
       fiscalYear: str(r.fiscalYear),
       accountingDocument: str(r.accountingDocument),
       soldToParty: str(r.soldToParty),
     },
   });
 }


 const items = await readJsonl(path.join(DATA_DIR, 'billing_document_items'));
 console.log(`Ingesting ${items.length} billing document items...`);
 for (const r of items) {
   try {
     await prisma.billingDocumentItem.upsert({
       where: { billingDocument_billingDocumentItem: { billingDocument: r.billingDocument, billingDocumentItem: r.billingDocumentItem } },
       update: {},
       create: {
         billingDocument: r.billingDocument,
         billingDocumentItem: r.billingDocumentItem,
         material: str(r.material),
         billingQuantity: toDecimal(r.billingQuantity),
         billingQuantityUnit: str(r.billingQuantityUnit),
         netAmount: toDecimal(r.netAmount),
         transactionCurrency: str(r.transactionCurrency),
         referenceSdDocument: str(r.referenceSdDocument),
         referenceSdDocumentItem: str(r.referenceSdDocumentItem),
       },
     });
   } catch (e) {}
 }
 console.log('Billing documents done.');
}


async function ingestJournalEntries() {
 const records = await readJsonl(path.join(DATA_DIR, 'journal_entry_items_accounts_receivable'));
 console.log(`Ingesting ${records.length} journal entries...`);
 for (const r of records) {
   try {
     await prisma.journalEntryItem.upsert({
       where: {
         companyCode_fiscalYear_accountingDocument_accountingDocumentItem: {
           companyCode: r.companyCode,
           fiscalYear: r.fiscalYear,
           accountingDocument: r.accountingDocument,
           accountingDocumentItem: r.accountingDocumentItem,
         },
       },
       update: {},
       create: {
         companyCode: r.companyCode,
         fiscalYear: r.fiscalYear,
         accountingDocument: r.accountingDocument,
         accountingDocumentItem: r.accountingDocumentItem,
         glAccount: str(r.glAccount),
         referenceDocument: str(r.referenceDocument),
         costCenter: str(r.costCenter),
         profitCenter: str(r.profitCenter),
         transactionCurrency: str(r.transactionCurrency),
         amountInTransactionCurrency: toDecimal(r.amountInTransactionCurrency),
         companyCodeCurrency: str(r.companyCodeCurrency),
         amountInCompanyCodeCurrency: toDecimal(r.amountInCompanyCodeCurrency),
         postingDate: toDate(r.postingDate),
         documentDate: toDate(r.documentDate),
         accountingDocumentType: str(r.accountingDocumentType),
         assignmentReference: str(r.assignmentReference),
         lastChangeDateTime: toDate(r.lastChangeDateTime),
         customer: str(r.customer),
         financialAccountType: str(r.financialAccountType),
         clearingDate: toDate(r.clearingDate),
         clearingAccountingDocument: str(r.clearingAccountingDocument),
         clearingDocFiscalYear: str(r.clearingDocFiscalYear),
       },
     });
   } catch (e) {}
 }
 console.log('Journal entries done.');
}


async function ingestPayments() {
 const records = await readJsonl(path.join(DATA_DIR, 'payments_accounts_receivable'));
 console.log(`Ingesting ${records.length} payments...`);
 for (const r of records) {
   try {
     await prisma.payment.upsert({
       where: {
         companyCode_fiscalYear_accountingDocument_accountingDocumentItem: {
           companyCode: r.companyCode,
           fiscalYear: r.fiscalYear,
           accountingDocument: r.accountingDocument,
           accountingDocumentItem: r.accountingDocumentItem,
         },
       },
       update: {},
       create: {
         companyCode: r.companyCode,
         fiscalYear: r.fiscalYear,
         accountingDocument: r.accountingDocument,
         accountingDocumentItem: r.accountingDocumentItem,
         clearingDate: toDate(r.clearingDate),
         clearingAccountingDocument: str(r.clearingAccountingDocument),
         clearingDocFiscalYear: str(r.clearingDocFiscalYear),
         amountInTransactionCurrency: toDecimal(r.amountInTransactionCurrency),
         transactionCurrency: str(r.transactionCurrency),
         amountInCompanyCodeCurrency: toDecimal(r.amountInCompanyCodeCurrency),
         companyCodeCurrency: str(r.companyCodeCurrency),
         customer: str(r.customer),
         invoiceReference: str(r.invoiceReference),
         invoiceReferenceFiscalYear: str(r.invoiceReferenceFiscalYear),
         salesDocument: str(r.salesDocument),
         salesDocumentItem: str(r.salesDocumentItem),
         postingDate: toDate(r.postingDate),
         documentDate: toDate(r.documentDate),
         assignmentReference: str(r.assignmentReference),
         glAccount: str(r.glAccount),
         financialAccountType: str(r.financialAccountType),
         profitCenter: str(r.profitCenter),
         costCenter: str(r.costCenter),
       },
     });
   } catch (e) {}
 }
 console.log('Payments done.');
}


async function ingestPlants() {
 const records = await readJsonl(path.join(DATA_DIR, 'plants'));
 console.log(`Ingesting ${records.length} plants...`);
 for (const r of records) {
   await prisma.plant.upsert({
     where: { plant: r.plant },
     update: {},
     create: {
       plant: r.plant,
       plantName: str(r.plantName),
       valuationArea: str(r.valuationArea),
       plantCustomer: str(r.plantCustomer),
       plantSupplier: str(r.plantSupplier),
       factoryCalendar: str(r.factoryCalendar),
       defaultPurchasingOrganization: str(r.defaultPurchasingOrganization),
       salesOrganization: str(r.salesOrganization),
       addressId: str(r.addressId),
       plantCategory: str(r.plantCategory),
       distributionChannel: str(r.distributionChannel),
       division: str(r.division),
       language: str(r.language),
       isMarkedForArchiving: str(r.isMarkedForArchiving),
     },
   });
 }
 console.log('Plants done.');
}


async function ingestBillingCancellations() {
 const records = await readJsonl(path.join(DATA_DIR, 'billing_document_cancellations'));
 console.log(`Ingesting ${records.length} billing document cancellations...`);
 for (const r of records) {
   await prisma.billingDocumentHeader.upsert({
     where: { billingDocument: r.billingDocument },
     update: {
       billingDocumentIsCancelled: String(r.billingDocumentIsCancelled),
       cancelledBillingDocument: str(r.cancelledBillingDocument),
       lastChangeDateTime: toDate(r.lastChangeDateTime),
       accountingDocument: str(r.accountingDocument),
     },
     create: {
       billingDocument: r.billingDocument,
       billingDocumentType: str(r.billingDocumentType),
       creationDate: toDate(r.creationDate),
       billingDocumentDate: toDate(r.billingDocumentDate),
       billingDocumentIsCancelled: String(r.billingDocumentIsCancelled),
       cancelledBillingDocument: str(r.cancelledBillingDocument),
       totalNetAmount: toDecimal(r.totalNetAmount),
       transactionCurrency: str(r.transactionCurrency),
       companyCode: str(r.companyCode),
       fiscalYear: str(r.fiscalYear),
       accountingDocument: str(r.accountingDocument),
       soldToParty: str(r.soldToParty),
       lastChangeDateTime: toDate(r.lastChangeDateTime),
     },
   });
 }
 console.log('Billing cancellations done.');
}


async function ingestCustomerCompanyAssignments() {
 const records = await readJsonl(path.join(DATA_DIR, 'customer_company_assignments'));
 console.log(`Ingesting ${records.length} customer company assignments...`);
 for (const r of records) {
   try {
     await prisma.customerCompanyAssignment.upsert({
       where: { customer_companyCode: { customer: r.customer, companyCode: r.companyCode } },
       update: {},
       create: {
         customer: r.customer,
         companyCode: r.companyCode,
         accountingClerk: str(r.accountingClerk),
         accountingClerkFaxNumber: str(r.accountingClerkFaxNumber),
         accountingClerkPhoneNumber: str(r.accountingClerkPhoneNumber),
         alternativePayerAccount: str(r.alternativePayerAccount),
         paymentBlockingReason: str(r.paymentBlockingReason),
         paymentMethodsList: str(r.paymentMethodsList),
         paymentTerms: str(r.paymentTerms),
         reconciliationAccount: str(r.reconciliationAccount),
         deletionIndicator: r.deletionIndicator === true || r.deletionIndicator === 'true' ? true : false,
         customerAccountGroup: str(r.customerAccountGroup),
       },
     });
   } catch (e) {}
 }
 console.log('Customer company assignments done.');
}


async function ingestCustomerSalesAreaAssignments() {
 const records = await readJsonl(path.join(DATA_DIR, 'customer_sales_area_assignments'));
 console.log(`Ingesting ${records.length} customer sales area assignments...`);
 for (const r of records) {
   try {
     await prisma.customerSalesAreaAssignment.upsert({
       where: {
         customer_salesOrganization_distributionChannel_division: {
           customer: r.customer,
           salesOrganization: r.salesOrganization,
           distributionChannel: r.distributionChannel,
           division: r.division,
         },
       },
       update: {},
       create: {
         customer: r.customer,
         salesOrganization: r.salesOrganization,
         distributionChannel: r.distributionChannel,
         division: r.division,
         billingIsBlockedForCustomer: str(r.billingIsBlockedForCustomer),
         completeDeliveryIsDefined: r.completeDeliveryIsDefined === true || r.completeDeliveryIsDefined === 'true' ? true : false,
         creditControlArea: str(r.creditControlArea),
         currency: str(r.currency),
         customerPaymentTerms: str(r.customerPaymentTerms),
         deliveryPriority: str(r.deliveryPriority),
         incotermsClassification: str(r.incotermsClassification),
         incotermsLocation1: str(r.incotermsLocation1),
         salesGroup: str(r.salesGroup),
         salesOffice: str(r.salesOffice),
         shippingCondition: str(r.shippingCondition),
         salesDistrict: str(r.salesDistrict),
         exchangeRateType: str(r.exchangeRateType),
       },
     });
   } catch (e) {}
 }
 console.log('Customer sales area assignments done.');
}


async function ingestProductStorageLocations() {
 const records = await readJsonl(path.join(DATA_DIR, 'product_storage_locations'));
 console.log(`Ingesting ${records.length} product storage locations...`);
 for (const r of records) {
   try {
     await prisma.productStorageLocation.upsert({
       where: {
         product_plant_storageLocation: {
           product: r.product,
           plant: r.plant,
           storageLocation: r.storageLocation,
         },
       },
       update: {},
       create: {
         product: r.product,
         plant: r.plant,
         storageLocation: r.storageLocation,
         physicalInventoryBlockInd: str(r.physicalInventoryBlockInd),
         dateOfLastPostedCntUnRstrcdStk: toDate(r.dateOfLastPostedCntUnRstrcdStk),
       },
     });
   } catch (e) {}
 }
 console.log('Product storage locations done.');
}


async function ingestProductPlants() {
 const records = await readJsonl(path.join(DATA_DIR, 'product_plants'));
 // Only ingest plants that exist in products table
 const products = await prisma.product.findMany({ select: { product: true } });
 const productSet = new Set(products.map(p => p.product));
 const filtered = records.filter(r => productSet.has(r.product));
 console.log(`Ingesting ${filtered.length}/${records.length} product-plant records...`);
 for (const r of filtered) {
   try {
     await prisma.productPlant.upsert({
       where: { product_plant: { product: r.product, plant: r.plant } },
       update: {},
       create: {
         product: r.product,
         plant: r.plant,
         countryOfOrigin: str(r.countryOfOrigin),
         regionOfOrigin: str(r.regionOfOrigin),
         productionInvtryManagedLoc: str(r.productionInvtryManagedLoc),
         availabilityCheckType: str(r.availabilityCheckType),
         fiscalYearVariant: str(r.fiscalYearVariant),
         profitCenter: str(r.profitCenter),
         mrpType: str(r.mrpType),
       },
     });
   } catch (e) {}
 }
 console.log('Product plants done.');
}


async function main() {
 console.log('Starting data ingestion...\n');
 try {
   await ingestProducts();
   await ingestBusinessPartners();
   await ingestAddresses();
   await ingestCustomerCompanyAssignments();
   await ingestCustomerSalesAreaAssignments();
   await ingestSalesOrders();
   await ingestDeliveries();
   await ingestBillingDocuments();
   await ingestBillingCancellations();
   await ingestJournalEntries();
   await ingestPayments();
   await ingestPlants();
   await ingestProductPlants();
   await ingestProductStorageLocations();
   console.log('\nAll data ingested successfully!');
 } catch (err) {
   console.error('Ingestion error:', err);
   process.exit(1);
 } finally {
   await prisma.$disconnect();
 }
}


main();





const { PrismaClient } = require('@prisma/client');
// Singleton Prisma client
const prisma = new PrismaClient({
 log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
module.exports = prisma;

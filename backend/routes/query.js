const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { processQuery } = require('../llm/groq');


const limiter = rateLimit({
 windowMs: 60 * 1000, // 1 minute
 max: 20,
 message: { error: 'Too many requests. Please wait a moment before trying again.' },
 standardHeaders: true,
 legacyHeaders: false,
});


// POST /query - natural language to SQL pipeline
router.post('/', limiter, async (req, res) => {
 const { question } = req.body;
 if (!question || typeof question !== 'string' || question.trim().length === 0) {
   return res.status(400).json({ error: 'Question is required' });
 }
 if (question.trim().length > 1000) {
   return res.status(400).json({ error: 'Question too long (max 1000 characters)' });
 }


 try {
   const result = await processQuery(question.trim());
   res.json(result);
 } catch (err) {
   console.error('Query error:', err.message);
   res.status(500).json({
     error: 'Failed to process query',
     message: err.message,
     answer: `Sorry, I encountered an error processing your query: ${err.message}`,
     data: [],
   });
 }
});


module.exports = router;




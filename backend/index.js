const express = require('express');
const cors = require('cors');
require('dotenv').config();


const queryRouter = require('./routes/query');
const graphRouter = require('./routes/graph');
const ingestRouter = require('./routes/ingest');


const app = express();
const PORT = process.env.PORT || 3001;


app.use(cors({
 origin: process.env.NODE_ENV === 'production'
   ? process.env.FRONTEND_URL
   : ['http://localhost:5173', 'http://localhost:5174'],
 credentials: true,
}));
app.use(express.json());


// Health check
app.get('/health', (req, res) => {
 res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


// Routes
app.use('/query', queryRouter);
app.use('/graph', graphRouter);
app.use('/ingest', ingestRouter);


// Error handler
app.use((err, req, res, next) => {
 console.error(err.stack);
 res.status(500).json({ error: 'Internal server error' });
});


app.listen(PORT, () => {
 console.log(`O2C Graph Backend running on http://localhost:${PORT}`);
});





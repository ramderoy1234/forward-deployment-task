import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';


export default defineConfig({
 plugins: [react()],
 optimizeDeps: {
   include: ['react-force-graph-2d'],
 },
 server: {
   port: 5173,
   proxy: {
     '/query': 'http://localhost:3002',
     '/graph': 'http://localhost:3002',
     '/ingest': 'http://localhost:3002',
     '/health': 'http://localhost:3002',
   },
 },
});





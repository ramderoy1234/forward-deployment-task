# Deployment Guide - Vercel + Railway

## **Quick Deploy (15 minutes)**

### **1. Deploy Backend to Railway**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create Railway project
railway init

# Deploy backend
railway up
```

Copy the Railway URL (e.g., `https://o2c-backend-xyz.railway.app`)

---

### **2. Deploy Frontend to Vercel**

**Option A: Git Push (Easiest)**
```bash
git add .
git commit -m "Production ready"
git push origin main
```
Then go to [vercel.com](https://vercel.com), connect GitHub, Vercel auto-deploys on push.

**Option B: Vercel CLI**
```bash
npm install -g vercel
cd frontend
vercel --prod
```

---

### **3. Connect Backend URL**

1. Go to **Vercel Dashboard** → Your Project
2. **Settings** → **Environment Variables**
3. Add: `VITE_API_URL` = `https://your-railway-url.railway.app`
4. Redeploy

---

## **Environment Variables**

### Frontend (`frontend/.env`)
```
VITE_API_URL=https://o2c-backend-xyz.railway.app
```

### Backend (`backend/.env`)
```
DATABASE_URL=postgresql://user:pass@neon-host/db
GROQ_API_KEY=gsk_xxxxx
PORT=3000
FRONTEND_URL=https://o2c-graph.vercel.app
NODE_ENV=production
```

---

## **Post-Deployment Checklist**

- [ ] Backend deployed to Railway
- [ ] Frontend .env has correct backend URL
- [ ] Vercel environment variable set
- [ ] Database connection working
- [ ] CORS allows vercel.app domain
- [ ] Test API calls from frontend

---

## **Troubleshooting**

**"Cannot connect to backend"**
- Check `VITE_API_URL` in Vercel env vars
- Verify backend is running: `curl https://your-backend.railway.app/health`

**"Prisma not found"**
- Ensure `prisma generate` runs in Railway deployment

**"CORS blocked"**
- Update backend `.env`: `FRONTEND_URL=https://yourapp.vercel.app`

---

## **Cost**

- **Vercel**: Free tier (5 deployments/month)
- **Railway**: Free tier ($5 credit/month)
- **Neon DB**: Free tier (up to 3 branches)


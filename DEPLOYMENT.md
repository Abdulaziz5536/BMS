# BMS Deployment

This app can deploy as one Node service:

- backend: Express API from `backend/index.js`
- frontend: static files from `frontend/dist`
- database: the `MONGO_URI` you already use

## Build And Start

```bash
npm install
npm run install:frontend
npm run build
npm start
```

## Required Backend Environment

Set these on the server or in `backend/.env`:

```bash
NODE_ENV=production
PORT=3000
APP_NAME=Your Building System Name
MONGO_URI=mongodb://your-existing-mongodb/bms
JWT_SECRET=use-a-long-random-secret
SERVE_FRONTEND=true
ALLOW_SIGNUP=true
```

After creating the owner/admin account, change:

```bash
ALLOW_SIGNUP=false
```

Production frontend builds already use `frontend/.env.production`, which hides the signup
button with:

```bash
VITE_ALLOW_SIGNUP=false
```

## Frontend API URL

If the backend serves `frontend/dist`, leave `VITE_API_BASE` unset before building.

If the frontend is hosted separately, set:

```bash
VITE_API_BASE=https://your-backend-domain.com
```

Then also set backend CORS:

```bash
CORS_ORIGINS=https://your-frontend-domain.com
SERVE_FRONTEND=false
```

## Reminders And Messaging

To enable automatic due/overdue reminders:

```bash
DUE_REMINDER_ENABLED=true
DUE_REMINDER_DAYS_AHEAD=3
DUE_REMINDER_INTERVAL_MINUTES=1440
DUE_REMINDER_SEND_EMAIL=true
DUE_REMINDER_SEND_SMS=false
```

Then configure SMTP/SMS values from `backend/.env.example`.

## Health Check

Use this endpoint after deployment:

```text
/system/health
```

It returns `200` when required deployment checks pass and `503` when something important is missing.

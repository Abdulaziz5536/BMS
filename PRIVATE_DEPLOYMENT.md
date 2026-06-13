# Private Internet Deployment

This setup gives you a normal browser link for phone/tablet/PC, while keeping the BMS private.

## What Is Already Done

- Backend signup is disabled with `ALLOW_SIGNUP=false`.
- Production frontend hides the signup button with `VITE_ALLOW_SIGNUP=false`.
- Private API routes require login JWT tokens.
- `/system/health` is public for health checks only.

## Best Private Link Option

Use one server plus a private access layer:

1. Deploy the BMS on a VPS or office server.
2. Point a domain/subdomain to it, for example:
   `https://bms.yourdomain.com`
3. Put Cloudflare Access, Tailscale, or a firewall allowlist in front of it.
4. Only approved devices/users can open the login page.

## Server Commands

Run these on the server after uploading or cloning the project:

```bash
npm install
npm run install:frontend
npm run build
npm start
```

## Production Backend Env

Use your current MongoDB value for `MONGO_URI`.

```bash
NODE_ENV=production
PORT=3000
APP_NAME=Building Management System
MONGO_URI=your-current-mongodb-uri
JWT_SECRET=use-a-long-random-secret
SERVE_FRONTEND=true
ALLOW_SIGNUP=false
DUE_REMINDER_ENABLED=true
```

If the domain and backend are the same, no `VITE_API_BASE` is needed.

## Keep It Private

Recommended private layers:

- Cloudflare Access: users must pass email/code login before the BMS login page.
- Tailscale: only devices in your private network can open the link.
- Firewall allowlist: only specific public IP addresses can access port 443.

## Editing After Deployment

Edit locally, test, then redeploy:

```bash
npm.cmd run test
npm.cmd run build
git add .
git commit -m "update BMS"
git push
```

On the server:

```bash
git pull
npm install
npm run install:frontend
npm run build
npm start
```

## This PC Boot-Level Auto-Start Setup

Bookmark the MagicDNS link instead of the raw `100.x.x.x` address:

```text
http://desktop-n8vqhgp.tail50fa36.ts.net:3000/
```

MagicDNS follows this PC's current Tailscale IP, so the link survives if Tailscale
renumbers the machine.

This PC has an Administrator-level scheduled task:

```text
BMS-Backend-Boot
```

It starts when Windows boots, before user login, and runs:

```text
scripts/start-bms-backend-watchdog.ps1
```

The watchdog checks both:

```text
http://127.0.0.1:3000/system/health
http://<current-tailscale-ip>:3000/system/health
```

If Tailscale loses its `100.x.x.x` IP or the backend stops responding through
Tailscale, the watchdog runs `tailscale up` and restarts the Tailscale service
before checking again. If the backend is down locally, it starts `backend/index.js`
again. While the watchdog is running, it also prevents Windows idle sleep so the
PC can keep acting as the BMS server.

After changing the watchdog script, reinstall or refresh the boot task from an
Administrator PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install-bms-boot-task.ps1 -NoPause
```

Installer/uninstaller scripts:

```text
scripts/install-bms-boot-task.ps1
scripts/uninstall-bms-boot-task.ps1
```

Logs are written to:

```text
logs/backend-watchdog.log
logs/backend.log
logs/backend.err
```

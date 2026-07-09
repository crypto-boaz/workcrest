# Workcrest Deployment: Vercel + Render + Supabase

This setup keeps the browser-facing app on Vercel, runs Django on Render, and
stores durable data in Supabase Postgres. Supabase Storage is used for uploaded
business logos and future media because Render free web services have an
ephemeral filesystem.

## 1. Supabase

Create one Supabase project for the hosted environment.

Copy the pooled Postgres connection string and use it as Render's
`DATABASE_URL`. Prefer the transaction/session pooler URL supplied by Supabase
and keep `sslmode=require` in the connection string, or set
`DATABASE_SSL_REQUIRE=true` on Render.

Create a private or public bucket for media, for example:

```text
workcrest-media
```

Enable S3 access in Supabase Storage and copy:

- S3 endpoint URL
- Access key ID
- Secret access key
- Bucket name

For v1, public logo URLs are simplest. If you later need private media, switch
`AWS_QUERYSTRING_AUTH=true` and return signed URLs from the API.

## 2. Render backend

Create a Render Web Service from the GitHub repository.

Recommended settings:

```text
Root Directory: backend
Runtime: Python
Instance Type: Free
Build Command: pip install -r requirements/base.txt && python manage.py collectstatic --noinput
Start Command: bash render_start.sh
Health Check Path: /health/
```

Required environment variables:

```env
DEBUG=false
SECRET_KEY=<strong-random-secret>
DATABASE_URL=<supabase-postgres-url>
DATABASE_SSL_REQUIRE=true
ALLOWED_HOSTS=<your-render-service>.onrender.com,.onrender.com
PLATFORM_DOMAIN=<your-frontend-domain>
PLATFORM_NAME=Workcrest
FRONTEND_URL=https://<your-vercel-domain>
CSRF_TRUSTED_ORIGINS=https://<your-vercel-domain>,https://*.vercel.app
CORS_ALLOWED_ORIGINS=https://<your-vercel-domain>
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_DOMAIN=
SECURE_SSL_REDIRECT=false
MEDIA_STORAGE_BACKEND=s3
AWS_STORAGE_BUCKET_NAME=workcrest-media
AWS_ACCESS_KEY_ID=<supabase-s3-access-key>
AWS_SECRET_ACCESS_KEY=<supabase-s3-secret-key>
AWS_S3_ENDPOINT_URL=https://<supabase-project-ref>.supabase.co/storage/v1/s3
AWS_S3_REGION_NAME=auto
AWS_S3_ADDRESSING_STYLE=path
AWS_QUERYSTRING_AUTH=false
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
DEFAULT_FROM_EMAIL=no-reply@workcrest.local
DJANGO_SUPERUSER_EMAIL=pelumialiu8@gmail.com
DJANGO_SUPERUSER_PASSWORD=<set-this-in-render-only>
DJANGO_SUPERUSER_FULL_NAME=Workcrest Owner
```

Notes:

- Render free services sleep after inactivity, so the first API request can be
  slow.
- The start script runs migrations before Gunicorn starts.
- The start script also runs `ensure_superuser`, which creates or updates the
  deployment superuser from `DJANGO_SUPERUSER_EMAIL` and
  `DJANGO_SUPERUSER_PASSWORD`.
- Do not use SQLite or Render's free filesystem for production data.

## 3. Vercel frontend

Create a Vercel project from the same GitHub repository.

Recommended settings:

```text
Framework Preset: Next.js
Root Directory: ./
Install Command: npm install
Build Command: npm run build
Output Directory: .next
```

Required environment variables:

```env
NEXT_PUBLIC_DATA_MODE=api
BACKEND_URL=https://<your-render-service>.onrender.com
```

The frontend calls `/api/...` on its own Vercel origin. `next.config.ts`
rewrites those requests to Render, which lets auth and CSRF cookies behave like
first-party cookies in the browser.

## 4. Post-deploy checks

After both services deploy:

```text
https://<render-service>.onrender.com/health/
https://<render-service>.onrender.com/ready/
https://<vercel-app>/api/v1/session/context/
https://<vercel-app>/auth/login
```

Expected result:

- `/health/` returns `{"status":"ok"}`.
- `/ready/` returns database readiness JSON.
- `/api/v1/session/context/` works through the Vercel proxy.
- Signup/login works from the Vercel URL.

## 5. Free-tier warnings

- Render free web services spin down and wake up slowly.
- Supabase free projects can pause after inactivity and have limited backups.
- Move to paid infrastructure before onboarding real paying businesses.

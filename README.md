# Workcrest

Workcrest is a white-label, multi-tenant SaaS platform for running day-to-day
business operations. It provides one centrally maintained application while
giving every subscribed organization isolated data, branding, locations,
staff access, modules, and settings.

Timphat Cosmetics is the first Commerce tenant and remains included as the
development demo company. It is not the identity of the platform.

> **Project status:** active pre-release development. Platform Core and the
> Commerce module are being built first. Review the production checklist before
> deploying with real business data.

## What is implemented

- Runtime tenant resolution and white-label branding
- Email-based accounts, verification, secure sessions, CSRF protection, and
  recent-password reauthentication
- Organizations, locations, memberships, invitations, roles, and granular
  capabilities
- Tenant module activation and subscription entitlements
- Company settings with live frontend updates
- Commerce workflows for products, inventory, POS sales, customers, suppliers,
  purchases, returns, transfers, and expenses
- Notifications, audit events, exports, reports, and dashboard summaries
- Immutable stock movements and transactionally maintained balances
- Idempotent transactional endpoints and concurrent stock protection
- PostgreSQL row-level security for tenant-owned tables
- Responsive dark/light Next.js application shell
- OpenAPI schema and generated TypeScript API types

## Architecture

Workcrest uses a modular monolith rather than tenant-specific deployments or
code forks.

```text
Next.js frontend
      |
      | first-party /api proxy, session cookie, CSRF
      v
Django REST API
      |
      +-- Platform Core
      |   accounts, organizations, locations, roles, branding,
      |   subscriptions, modules, notifications, audit
      |
      +-- Commerce module
      |   products, inventory, POS, sales, customers, suppliers,
      |   purchasing, returns, transfers, expenses
      |
      +-- PostgreSQL + RLS
      +-- Redis + Celery
```

Every tenant-owned record contains an `organization_id`. Location-owned data
also contains a `location_id`. Tenant identity is resolved from the verified
request host; request bodies are never trusted to select an organization.

## Technology

### Frontend

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Radix UI primitives
- TanStack Query
- Recharts
- Lucide icons
- next-themes
- Vitest, Testing Library, and Playwright

### Backend

- Python 3.13
- Django 5.2 LTS
- Django REST Framework
- django-allauth Headless with MFA support
- PostgreSQL
- Redis and Celery
- drf-spectacular
- Argon2 password hashing
- WhiteNoise and Gunicorn
- pytest

## Repository layout

```text
.
|-- src/                         Next.js application
|   |-- app/                     Routes and layouts
|   |-- components/              Shell, dashboard, and workspace UI
|   `-- lib/                     API clients, types, formatting, and adapters
|-- tests/e2e/                   Playwright smoke tests
|-- backend/
|   |-- accounts/                Global user accounts and auth permissions
|   |-- organizations/           Tenants, locations, roles, and branding
|   |-- commerce/                Commerce domain and transactional services
|   |-- subscriptions/           Plans, trials, quotas, and lifecycle
|   |-- notifications/           In-app notification state
|   |-- audit/                   Audit events, outbox, and exports
|   |-- platform_admin/          SaaS operator control plane
|   |-- config/                  Django, DRF, Celery, and security settings
|   `-- openapi.yaml             Versioned API contract
|-- ops/postgres/                PostgreSQL role initialization
`-- docker-compose.yml           PostgreSQL, Redis, API, worker, and beat
```

## Prerequisites

- Node.js 20 or later
- npm
- Python 3.13 recommended
- Docker Desktop if using PostgreSQL and Redis locally

## Environment configuration

Create local environment files from the committed examples:

```powershell
Copy-Item .env.example .env
Copy-Item backend\.env.example backend\.env
```

Never commit the resulting `.env` files. The root file configures the Next.js
API proxy. The backend file configures Django and infrastructure.

Important backend settings include:

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | Django cryptographic signing key |
| `DEBUG` | Enables development behavior only |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Celery broker and result backend |
| `PLATFORM_DOMAIN` | Base domain used for tenant subdomains |
| `PLATFORM_NAME` | Public SaaS identity |
| `CSRF_TRUSTED_ORIGINS` | Trusted browser origins |
| `SESSION_COOKIE_DOMAIN` | Shared production cookie domain when required |
| `SESSION_COOKIE_SECURE` | Must be `true` behind production HTTPS |
| `DEFAULT_FROM_EMAIL` | Authentication email sender |
| `SENTRY_DSN` | Optional error reporting destination |

## Local development with SQLite

SQLite is convenient for frontend and API development. PostgreSQL is required
to exercise and prove row-level security.

After copying `backend/.env.example`, remove or comment out its `DATABASE_URL`
line to use the built-in SQLite fallback.

Create the virtual environment and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements\dev.txt
```

Prepare and start Django:

```powershell
.\.venv\Scripts\python.exe backend\manage.py migrate
.\.venv\Scripts\python.exe backend\manage.py seed_demo
.\.venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000
```

In a second terminal, install and start the frontend:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

The development seed creates:

```text
Email:    owner@timphat.local
Password: ChangeMe-2026!
```

The seed account is verified automatically. The password is strictly for local
development and must not be used in a deployed environment.

## Local development with Docker

Docker runs PostgreSQL, Redis, migrations, Django, the Celery worker, and
Celery beat:

```powershell
docker compose up --build
```

Run the Next.js frontend separately:

```powershell
npm install
npm run dev
```

The migration service owns schema objects. Runtime services connect through
the non-owner `workcrest_runtime` PostgreSQL role with `NOBYPASSRLS`.

If a local Docker volume was created before the Workcrest rename, recreate that
development volume or migrate its old database roles manually before starting
the renamed stack.

## Frontend data modes

The default mode uses Django:

```env
NEXT_PUBLIC_DATA_MODE=api
BACKEND_URL=http://127.0.0.1:8000
```

Next.js proxies `/api` and `/media` to Django so authentication and CSRF cookies
remain first-party.

An explicit UI-only demo is also available:

```env
NEXT_PUBLIC_DATA_MODE=mock
```

Mock mode is non-persistent and must not be used for real business data.
Business records in API mode are stored in Django; browser storage is limited
to harmless interface preferences such as theme and active location.

## Hosted deployment

The recommended hosted demo stack is:

```text
Vercel      Next.js frontend
Render      Django API on a free web service
Supabase    PostgreSQL database and S3-compatible media storage
```

Use Supabase for durable data instead of Render free Postgres. Render's free
database tier expires after 30 days, and Render free web services do not
preserve uploaded files on local disk.

See [docs/deployment.md](docs/deployment.md) for the exact Render, Vercel, and
Supabase setup instructions and required environment variables.

## Tenant and API contract

Key endpoints:

- `GET /api/v1/tenant-manifest/` — public host-specific branding
- `GET /api/v1/bootstrap/` — user, tenant, locations, roles, modules, and plan
- `/api/v1/auth/*` — authentication and session operations
- `/api/v1/locations/{location_id}/...` — location-scoped Commerce APIs
- `/api/v1/notifications/` — notification state
- `/api/v1/exports/` — asynchronous data exports
- `/api/v1/platform/...` — operator-only control plane
- `/api/v1/schema/` — OpenAPI schema
- `/api/v1/docs/` — Swagger UI
- `/api/v1/redoc/` — ReDoc

The `X-Tenant-Slug` header is accepted only while `DEBUG=true`. Production
requests must resolve the tenant through a verified hostname.

## Security model

- Authentication uses `HttpOnly` server-side session cookies, never browser
  token storage.
- Unsafe session-authenticated requests require CSRF validation.
- Passwords use Argon2.
- Sensitive owner and operator changes require recent reauthentication.
- Tenant-owned PostgreSQL tables use forced row-level security.
- The runtime database role must not own tables or have `BYPASSRLS`.
- Transactional writes use domain services and database transactions.
- Checkout locks inventory balances to prevent concurrent overselling.
- Idempotency keys prevent duplicate transactional results.
- Support access is time-limited, visible, reason-required, and audited.
- Card details are never stored; payment methods are operational tender records.

## Quality checks

Frontend:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Backend:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe -m pytest -p no:cacheprovider
..\.venv\Scripts\python.exe manage.py check
..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

Regenerate the TypeScript API contract after changing the backend schema:

```powershell
.\.venv\Scripts\python.exe backend\manage.py spectacular --file backend\openapi.yaml
npm run api:generate
```

The SQL-level tenant-isolation test requires PostgreSQL and is skipped when the
test database uses SQLite.

## Current v1 boundaries

- One shared codebase and shared infrastructure
- Tenant subdomains; customer-owned domains come later
- Platform Core and Commerce ship first
- Agriculture, Academic, and Services are future module packs
- Manual subscription billing initially
- No tenant-specific source forks
- No automated billing, tax engine, SMS, SSO, full offline checkout, or full
  accounting in v1

## Before production

- Replace all development secrets and credentials.
- Set `DEBUG=false`.
- Enforce HTTPS and secure cookies.
- Configure production host and CSRF allowlists.
- Use managed PostgreSQL, Redis, encrypted object storage, and encrypted backups.
- Run migrations with a schema-owner role and the application with the
  restricted runtime role.
- Configure email delivery, Sentry, logging, metrics, and alerting.
- Run the complete test suite, PostgreSQL isolation tests, and restoration
  drills.

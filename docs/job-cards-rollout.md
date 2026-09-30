# Job cards rollout

Job cards are disabled by default for every existing and new company. A company owner can enable them in Company Settings after deployment. The change adds one organization boolean and three new tables; it does not rewrite sales, customers, products, or other existing rows.

The new tables store repair jobs, payment records, and status events. They are scoped to the company and branch and use the same PostgreSQL row security policy as existing tenant tables. Repair job numbers contain the branch code and year. Creation and payment requests require an idempotency key; edits require the latest job version.

The PWA saves viewed job cards per company, branch, and signed-in user for offline viewing after the offline PIN is unlocked. Creating jobs, changing details or status, and recording payments require a connection. Repair payments are currently separate from Sales reports. Parts charges do not change product inventory.

Before merging to `main`, obtain a current Supabase backup and have the Render migration run during a monitored deployment. The local machine lacks several backend dependencies, including Celery, so Django's migration generator and system checks could not run here. The edited Python files compile, and the frontend typecheck, lint, and production build completed locally.

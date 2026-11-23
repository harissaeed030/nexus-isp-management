-- Additive: SaaS plan, customer limit and branding settings per ISP workspace.
ALTER TABLE tenants ADD COLUMN plan TEXT NOT NULL DEFAULT 'starter' CHECK(plan IN ('starter','growth','pro'));
ALTER TABLE tenants ADD COLUMN customer_limit INTEGER NOT NULL DEFAULT 100 CHECK(customer_limit>=0);
ALTER TABLE tenants ADD COLUMN brand_color TEXT NOT NULL DEFAULT '#16a34a';
ALTER TABLE tenants ADD COLUMN support_phone TEXT;
ALTER TABLE tenants ADD COLUMN address TEXT;
-- Existing workspaces keep working: give them the unlimited-style pro plan so no one is locked out.
UPDATE tenants SET plan='pro',customer_limit=100000;

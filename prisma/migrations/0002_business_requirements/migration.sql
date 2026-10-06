CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('merchant','admin','user'))
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      owner_id TEXT PRIMARY KEY REFERENCES users(id), package_id TEXT NOT NULL,
      expires TEXT, payments INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      csrf TEXT NOT NULL, expires BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL, mime TEXT NOT NULL, bytes BYTEA NOT NULL
    );
    CREATE TABLE IF NOT EXISTS villas (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
      province TEXT NOT NULL, merchant TEXT NOT NULL, email TEXT NOT NULL, package_id TEXT NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id),
      status TEXT NOT NULL CHECK(status IN ('pending','approved','changes','rejected')) DEFAULT 'pending',
      reason TEXT NOT NULL DEFAULT '', qr TEXT UNIQUE, expires TEXT, payments INTEGER NOT NULL DEFAULT 0,
      created TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY, villa_id TEXT NOT NULL REFERENCES villas(id), amount INTEGER NOT NULL,
      months INTEGER NOT NULL CHECK(months IN (1,3)),
      status TEXT NOT NULL CHECK(status IN ('pending','submitted','paid')) DEFAULT 'pending',
      proof_id TEXT REFERENCES documents(id), reference TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
      created TEXT NOT NULL, paid_at TEXT, confirmed_by TEXT REFERENCES users(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_open_invoice ON invoices(villa_id) WHERE status != 'paid';
    CREATE TABLE IF NOT EXISTS mails (
      id TEXT PRIMARY KEY, villa_id TEXT NOT NULL REFERENCES villas(id), invoice_id TEXT NOT NULL UNIQUE REFERENCES invoices(id),
      recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt BIGINT NOT NULL DEFAULT 0, last_error TEXT NOT NULL DEFAULT '', sent_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
      target_id TEXT NOT NULL, created TEXT NOT NULL
    );

ALTER TABLE users ADD COLUMN IF NOT EXISTS created TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subscription_owner TEXT REFERENCES users(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS package_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS one_open_subscription_invoice ON invoices(subscription_owner) WHERE status != 'paid' AND subscription_owner IS NOT NULL;
ALTER TABLE villas ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE villas ADD COLUMN IF NOT EXISTS bank_name TEXT NOT NULL DEFAULT '';
ALTER TABLE villas ADD COLUMN IF NOT EXISTS account_name TEXT NOT NULL DEFAULT '';
ALTER TABLE villas ADD COLUMN IF NOT EXISTS account_number TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS oauth_identities (
  provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY(provider, subject), UNIQUE(provider, user_id)
);
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, verifier TEXT NOT NULL,
  return_to TEXT NOT NULL, expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires BIGINT NOT NULL
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'WAITING_FOR_SLIP';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS verification_mode TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'THB';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS external_transaction_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS external_provider TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS unique_payment_transaction ON invoices(external_transaction_id) WHERE external_transaction_id IS NOT NULL;
UPDATE invoices SET payment_status=CASE WHEN status='paid' THEN 'VERIFIED' WHEN status='submitted' THEN 'PENDING_REVIEW' ELSE payment_status END;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'PENDING_RENEWAL';
ALTER TABLE villas ADD COLUMN IF NOT EXISTS verification_level TEXT NOT NULL DEFAULT 'VERIFIED';
ALTER TABLE villas ADD COLUMN IF NOT EXISTS reviewed_at TEXT;
ALTER TABLE villas ADD COLUMN IF NOT EXISTS reviewed_by TEXT;

ALTER TABLE villas ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';

ALTER TABLE users ADD COLUMN IF NOT EXISTS business_name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS package_catalog (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>=0), currency TEXT NOT NULL DEFAULT 'THB', billing_cycle TEXT NOT NULL DEFAULT 'MONTHLY',
 trial_months INTEGER NOT NULL DEFAULT 0 CHECK(trial_months>=0), capacity INTEGER NOT NULL CHECK(capacity>=1),
 features TEXT NOT NULL DEFAULT '[]', max_level TEXT NOT NULL DEFAULT 'VERIFIED', banner INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS leads (
 id TEXT PRIMARY KEY,user_id TEXT UNIQUE REFERENCES users(id),type TEXT NOT NULL CHECK(type IN ('USER','MERCHANT')),
 name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',source TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'NEW',
 notes TEXT NOT NULL DEFAULT '',created TEXT NOT NULL,updated TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_qrs (
 id TEXT PRIMARY KEY,payment_id TEXT NOT NULL REFERENCES invoices(id),payload TEXT NOT NULL,
 generated_at TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('ACTIVE','PAID','EXPIRED','CANCELLED')),
 created TEXT NOT NULL,updated TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_payment_qr ON payment_qrs(payment_id) WHERE status='ACTIVE';

INSERT INTO leads(id,user_id,type,name,email,source,created,updated) SELECT id,id,UPPER(role),name,email,'REGISTRATION',created,created FROM users WHERE role IN ('user','merchant') ON CONFLICT(user_id) DO NOTHING;

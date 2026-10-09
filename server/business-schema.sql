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
CREATE TABLE IF NOT EXISTS support_reports (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, user_id TEXT REFERENCES users(id), villa_id TEXT REFERENCES villas(id),
 villa_name TEXT NOT NULL, type TEXT NOT NULL, detail TEXT NOT NULL, reporter TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','UNDER_REVIEW','RESOLVED','REJECTED')),
 admin_note TEXT NOT NULL DEFAULT '', public_note TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_user_created ON support_reports(user_id,created);
CREATE INDEX IF NOT EXISTS reports_villa_created ON support_reports(villa_id,created);
CREATE TABLE IF NOT EXISTS user_checks (
 id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL REFERENCES users(id), villa_id TEXT REFERENCES villas(id),
 villa_name TEXT NOT NULL, qr TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, result TEXT NOT NULL,
 submitted_account TEXT NOT NULL DEFAULT '', submitted_contact TEXT NOT NULL DEFAULT '', request_key TEXT NOT NULL,
 created TEXT NOT NULL, UNIQUE(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS checks_user_created ON user_checks(user_id,created);
CREATE TABLE IF NOT EXISTS villa_events (
 id TEXT PRIMARY KEY, villa_id TEXT NOT NULL REFERENCES villas(id), kind TEXT NOT NULL CHECK(kind IN ('PROFILE_VIEW','QR_SCAN','CONTACT_VIEW')),
 created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_villa_created ON villa_events(villa_id,created);
CREATE TABLE IF NOT EXISTS login_otps (
 id TEXT PRIMARY KEY,
 channel TEXT NOT NULL CHECK(channel IN ('email','sms')),
 destination TEXT NOT NULL,
 code_hash TEXT NOT NULL,
 expires BIGINT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 consumed INTEGER NOT NULL DEFAULT 0,
 created BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_otps_destination_created ON login_otps(destination,created);

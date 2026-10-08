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

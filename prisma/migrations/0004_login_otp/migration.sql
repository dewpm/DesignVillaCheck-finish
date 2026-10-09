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

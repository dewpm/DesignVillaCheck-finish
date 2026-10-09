import { useEffect, useState } from "react";
import { api, authenticate, currentAccount } from "./api";
import { PortalShell, type Page } from "./prototype";
import type { Account } from "./merchantStore";

export function SocialLogin({ reference = "", variant = "default" }: { reference?: string; variant?: "default" | "stacked" }) {
  const [providers, setProviders] = useState({ google: false, facebook: false, line: false });
  useEffect(() => { void api<{ oauth: typeof providers }>("/config").then(v => setProviders(v.oauth || providers)).catch(() => {}); }, []);
  const returnTo = reference ? `#${new URLSearchParams({ page: "verify", item: reference })}` : "#page=user-dashboard";
  return <div className={`social-login ${variant === "stacked" ? "login-social-stack" : ""}`}>{variant !== "stacked" && <span>เข้าสู่ระบบ / สมัคร User ด้วย</span>}<div>{(["facebook", "google", "line"] as const).map(provider => <button key={provider} disabled={!providers[provider]} title={providers[provider] ? undefined : "ยังไม่ได้ตั้งค่าบัญชีผู้ให้บริการ OAuth"} className={`oauth-button ${provider}`} onClick={() => { window.location.href = `/api/auth/oauth/${provider}/start?${new URLSearchParams({ returnTo })}`; }}>{variant === "stacked" ? <><span aria-hidden="true" className={`login-provider-icon ${provider}`}>{provider === "google" ? "G" : provider === "facebook" ? "f" : "LINE"}</span><span>ดำเนินการต่อด้วย {provider === "google" ? "Google" : provider === "facebook" ? "Facebook" : "LINE"}</span></> : provider === "google" ? "G  Google" : provider === "facebook" ? "f  Facebook" : "LINE"}</button>)}</div><p className="line-login-notice">VillaCheck ขอชื่อและอีเมลจาก LINE เพื่อสร้างบัญชีสมาชิก User และใช้ระบุบัญชีเมื่อเข้าสู่ระบบ</p>{(!providers.google || !providers.facebook || !providers.line) && <small>ช่องทางที่ยังไม่ได้เชื่อมต่อจะแสดงเป็นปุ่มปิดใช้งาน</small>}</div>;
}

export function UserRegistration({ go, reference }: { go: (page: Page, item?: string) => void; reference: string }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try { await authenticate(form.email, form.password, form.name, "user"); go(reference ? "verify" : "user-dashboard", reference); }
    catch (error) { setError(error instanceof Error ? error.message : "สมัครไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><div className="auth-card"><button className="text-button" onClick={() => go("login", reference)}>← เข้าสู่ระบบ</button><span className="kicker">VILLACHECK / USER ACCOUNT</span><h1>สมัครสมาชิก User</h1><p>ดูเบอร์โทรและบัญชีรับเงินของที่พักหลังเข้าสู่ระบบ</p><SocialLogin reference={reference} /><form className="form-stack" onSubmit={submit}><label><span>ชื่อ–นามสกุล</span><input required autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label><span>อีเมล</span><input required type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label><span>รหัสผ่าน (อย่างน้อย 10 ตัวอักษร)</span><input required type="password" minLength={10} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>{error && <p role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={busy}>{busy ? "กำลังสมัคร…" : "สมัครสมาชิก"}</button></form></div></main>;
}

type Member = { id: string; name: string; email: string; created: string; lastLogin: string | null; providers: string[] };
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ยังไม่เข้าใช้";
export function AdminUsers({ go }: { go: (page: Page) => void }) {
  const [users, setUsers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void currentAccount().then(user => { if (user.role !== "admin") throw Error("เฉพาะ Admin สามารถดูข้อมูล User ได้"); return api<{ users: Member[] }>("/admin/users"); }).then(v => { if (!cancelled) setUsers(v.users); }).catch(error => { if (!cancelled) setError(error.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const visible = users.filter(user => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
  return <PortalShell role="Admin" page="admin-users" go={go}><div className="portal-head"><div><span className="kicker">MEMBER MANAGEMENT</span><h1>ข้อมูล User</h1><p>สมาชิก {users.length} บัญชี · ข้อมูลจาก Backend</p></div></div><div className="merchant-toolbar"><input aria-label="ค้นหา User" placeholder="ค้นหาชื่อหรืออีเมล…" value={search} onChange={e => setSearch(e.target.value)} /></div>{error && <p role="alert">{error}</p>}{loading ? <p>กำลังโหลดข้อมูล…</p> : <div className="user-table-wrap"><table className="user-table"><thead><tr><th>สมาชิก</th><th>ช่องทางสมัคร</th><th>วันที่สมัคร</th><th>เข้าใช้ล่าสุด</th></tr></thead><tbody>{visible.map(user => <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td>{user.providers.length ? user.providers.map(p => p === "google" ? "Google" : p === "line" ? "LINE" : "Facebook").join(", ") : "อีเมล / รหัสผ่าน"}</td><td>{timestamp(user.created)}</td><td>{timestamp(user.lastLogin)}</td></tr>)}</tbody></table>{!visible.length && <p className="merchant-empty">ไม่พบสมาชิก</p>}</div>}</PortalShell>;
}

export function MemberDashboard({ go }: { go: (page: Page) => void }) {
  const [user, setUser] = useState<Account | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; void currentAccount().then(value => { if (!cancelled) { if (value.role !== "user") go("login"); else setUser(value); } }).catch(error => { if (!cancelled) setError(error.message); }); return () => { cancelled = true; }; }, []);
  return <PortalShell role="User" page="user-dashboard" go={go}><div className="portal-head"><div><span className="kicker">VILLACHECK / MEMBER</span><h1>{user ? `สวัสดี ${user.name}` : "บัญชี User"}</h1><p>{user?.email}</p></div></div>{error ? <div className="merchant-panel"><p role="alert">{error}</p><button className="primary-button" onClick={() => go("login")}>เข้าสู่ระบบ</button></div> : <div className="merchant-panel"><h2>ตรวจสอบที่พักก่อนโอน</h2><p>สแกน QR ของที่พักเพื่อดูข้อมูลที่ผ่านการตรวจสอบ พร้อมเบอร์โทรและเลขบัญชีรับเงิน</p><button className="primary-button" onClick={() => go("scan")}>สแกน QR ที่พัก →</button></div>}</PortalShell>;
}

import { randomBytes, createHash, createHmac } from "node:crypto"
import { createUser, transaction } from "./database.mjs"
const digest = (value) => createHash("sha256").update(value).digest("hex")
export function safeReturn(value) {
  if (typeof value !== "string" || !value.startsWith("#") || value.length > 500)
    return "#page=user-dashboard"
  const params = new URLSearchParams(value.slice(1))
  if (
    params.get("page") !== "verify" ||
    !/^VC-[a-zA-Z0-9-]+$/.test(params.get("item") || "")
  )
    return "#page=user-dashboard"
  return `#${new URLSearchParams({ page: "verify", item: params.get("item") })}`
}
export function oauthProviders(config) {
  return {
    google: Boolean(config.googleClientId && config.googleClientSecret),
    facebook: Boolean(
      config.facebookClientId &&
        config.facebookClientSecret &&
        /^v\d+\.0$/.test(config.facebookVersion || ""),
    ),
  }
}
export function createOAuth(db, config, issueSession, fetchProvider = fetch) {
  const stateCookie = (state, age = 600) =>
    `vc_oauth=${state}; HttpOnly; Path=/api/auth/oauth; SameSite=Lax; Max-Age=${age}${
      config.secureCookies ? "; Secure" : ""
    }`
  async function getJson(url, options) {
    const response = await fetchProvider(url, {
      ...options,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    })
    if (!response.ok) throw Error("provider_failed")
    return response.json()
  }
  return async (req, res, url) => {
    const match = url.pathname.match(
      /^\/api\/auth\/oauth\/(google|facebook)\/(start|callback)$/,
    )
    if (!match || req.method !== "GET") return false
    const [, provider, action] = match
    const enabled = oauthProviders(config)[provider]
    const redirect = (location) => {
      res.writeHead(302, { Location: location })
      res.end()
    }
    const failure = (error) =>
      redirect(
        `${config.appUrl}/#page=login&oauth_error=${encodeURIComponent(error)}`,
      )
    if (!enabled) {
      failure("not_configured")
      return true
    }
    const google = provider === "google"
    const clientId = google ? config.googleClientId : config.facebookClientId
    const secret = google
      ? config.googleClientSecret
      : config.facebookClientSecret
    const callback = `${config.appUrl}/api/auth/oauth/${provider}/callback`
    if (action === "start") {
      if (req.headers["sec-fetch-site"] === "cross-site") {
        failure("invalid_state")
        return true
      }
      const state = randomBytes(32).toString("hex"),
        verifier = randomBytes(32).toString("base64url")
      await db
        .prepare("DELETE FROM oauth_states WHERE expires<=?")
        .run(Date.now())
      const old = req.headers.cookie?.match(
        /(?:^|;\s*)vc_oauth=([a-f0-9]{64})(?:;|$)/,
      )?.[1]
      if (old)
        await db
          .prepare("DELETE FROM oauth_states WHERE state_hash=?")
          .run(digest(old))
      await db
        .prepare("INSERT INTO oauth_states VALUES (?,?,?,?,?)")
        .run(
          digest(state),
          provider,
          verifier,
          safeReturn(url.searchParams.get("returnTo")),
          Date.now() + 600000,
        )
      const authUrl = new URL(
        google
          ? "https://accounts.google.com/o/oauth2/v2/auth"
          : `https://www.facebook.com/${config.facebookVersion}/dialog/oauth`,
      )
      authUrl.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callback,
        response_type: "code",
        scope: google ? "openid email profile" : "email,public_profile",
        state,
      }).toString()
      if (google) {
        authUrl.searchParams.set(
          "code_challenge",
          createHash("sha256").update(verifier).digest("base64url"),
        )
        authUrl.searchParams.set("code_challenge_method", "S256")
      }
      res.setHeader("Set-Cookie", stateCookie(state))
      redirect(authUrl.toString())
      return true
    }
    const state = url.searchParams.get("state")
    const cookieState = req.headers.cookie?.match(
      /(?:^|;\s*)vc_oauth=([a-f0-9]{64})(?:;|$)/,
    )?.[1]
    if (!state || !/^[a-f0-9]{64}$/.test(state) || state !== cookieState) {
      failure("invalid_state")
      return true
    }
    const flow = await db
      .prepare(
        "SELECT * FROM oauth_states WHERE state_hash=? AND provider=? AND expires>?",
      )
      .get(digest(state), provider, Date.now())
    if (!flow) {
      failure("invalid_state")
      return true
    }
    await db
      .prepare("DELETE FROM oauth_states WHERE state_hash=?")
      .run(digest(state))
    res.setHeader("Set-Cookie", stateCookie("", 0))
    if (url.searchParams.has("error")) {
      failure("cancelled")
      return true
    }
    const code = url.searchParams.get("code")
    if (!code || code.length > 4096) {
      failure("invalid_state")
      return true
    }
    try {
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: secret,
        redirect_uri: callback,
        code,
      })
      if (google) {
        params.set("grant_type", "authorization_code")
        params.set("code_verifier", flow.verifier)
      }
      const tokens = await getJson(
        google
          ? "https://oauth2.googleapis.com/token"
          : `https://graph.facebook.com/${config.facebookVersion}/oauth/access_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        },
      )
      if (typeof tokens.access_token !== "string" || !tokens.access_token)
        throw Error("provider_failed")
      const profileUrl = new URL(
        google
          ? "https://openidconnect.googleapis.com/v1/userinfo"
          : `https://graph.facebook.com/${config.facebookVersion}/me`,
      )
      if (!google) {
        profileUrl.searchParams.set("fields", "id,name,email")
        profileUrl.searchParams.set(
          "appsecret_proof",
          createHmac("sha256", secret)
            .update(tokens.access_token)
            .digest("hex"),
        )
      }
      const profile = await getJson(profileUrl, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      })
      const subject = google ? profile.sub : profile.id
      if (typeof subject !== "string" || !subject || subject.length > 255)
        throw Error("provider_failed")
      if (google && profile.email_verified !== true)
        throw Error("email_required")
      const linked = await db
        .prepare(
          "SELECT u.* FROM oauth_identities o JOIN users u ON u.id=o.user_id WHERE o.provider=? AND o.subject=?",
        )
        .get(provider, subject)
      let user = linked
      if (!user) {
        if (
          typeof profile.email !== "string" ||
          profile.email.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)
        )
          throw Error("email_required")
        const address = profile.email.toLowerCase()
        // Never silently link an OAuth identity to an existing email/password or privileged account.
        if (await db.prepare("SELECT id FROM users WHERE email=?").get(address))
          throw Error("email_exists")
        user = await transaction(db, async () => {
          const name =
            typeof profile.name === "string"
              ? profile.name.slice(0, 200).replace(/[\x00-\x1f]/g, "")
              : "User"
          const created = await createUser(
            db,
            address,
            randomBytes(48).toString("hex"),
            name || "User",
            "user",
          )
          await db
            .prepare("INSERT INTO oauth_identities VALUES (?,?,?)")
            .run(provider, subject, created.id)
          return created
        })
      }
      const sessionCookie = (await issueSession(req, user)).cookie
      res.setHeader("Set-Cookie", [stateCookie("", 0), sessionCookie])
      redirect(`${config.appUrl}/${safeReturn(flow.return_to)}`)
    } catch (error) {
      failure(
        ["email_required", "email_exists"].includes(error.message)
          ? error.message
          : "provider_failed",
      )
    }
    return true
  }
}

import type { Account } from "./merchantStore"
let csrf = ""
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export async function api<T>(path: string, data?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: data === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        data === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: data === undefined ? undefined : JSON.stringify(data),
    })
  } catch {
    throw new ApiError(503, "เชื่อมต่อ Backend ไม่สำเร็จ กรุณาตรวจสอบว่าเซิร์ฟเวอร์เปิดอยู่")
  }
  const value = await response
    .json()
    .catch(() => ({ error: "เชื่อมต่อ Backend ไม่สำเร็จ" }))
  if (!response.ok)
    throw new ApiError(response.status, value.error || "ดำเนินการไม่สำเร็จ")
  return value as T
}
export async function currentAccount() {
  const session = await api<{ user: Account; csrf: string }>("/auth/me")
  csrf = session.csrf
  return session.user
}
export async function authenticate(
  email: string,
  password: string,
  name?: string,
  role: "merchant" | "user" = "merchant",
) {
  const session = await api<{ user: Account; csrf: string }>(
    name === undefined ? "/auth/login" : role === "user" ? "/auth/register-user" : "/auth/register",
    { email, password, name },
  )
  csrf = session.csrf
  return session.user
}
export async function logout() {
  await currentAccount()
  await api("/auth/logout", {})
  csrf = ""
}

type Channel = "email" | "phone" | "facebook" | "instagram";
export function openSupport(channel: Channel) {
  const values: Record<Channel, string | undefined> = {
    email: import.meta.env.VITE_SUPPORT_EMAIL,
    phone: import.meta.env.VITE_SUPPORT_PHONE,
    facebook: import.meta.env.VITE_FACEBOOK_URL,
    instagram: import.meta.env.VITE_INSTAGRAM_URL,
  };
  const value = values[channel]?.trim();
  if (!value) { window.alert("ช่องทางติดต่อนี้ยังไม่เปิดใช้งานในเว็บสาธิต"); return; }
  if (channel === "email") { window.location.href = `mailto:${value}`; return; }
  if (channel === "phone") { window.location.href = `tel:${value}`; return; }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid URL");
    window.open(url.href, "_blank", "noopener,noreferrer");
  } catch { window.alert("ช่องทางติดต่อนี้ยังไม่พร้อมใช้งาน"); }
}

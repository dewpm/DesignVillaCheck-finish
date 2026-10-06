import type { Metadata } from "next";
import "../src/index.css";
export const metadata: Metadata = { title: "VillaCheck", description: "ตรวจสอบ Villa ก่อนโอนเงิน" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
 return <html lang="th"><body>{children}</body></html>;
}

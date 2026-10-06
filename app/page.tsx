"use client";
import dynamic from "next/dynamic";
const VillaCheck = dynamic(() => import("../src/App"), {ssr:false,loading:()=> <p>กำลังโหลด VillaCheck…</p>});
export default function HomePage() { return <VillaCheck />; }

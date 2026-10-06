import { useEffect, useState } from "react";
import { api } from "./api";
export type PackagePlan = {
 id: string; name: string; slug: string; amount: number; capacity: number; description: string;
 currency: string; billingCycle: string; trialMonths: number; features: string[];
 maximumVerificationLevel: string; showPremiumBanner: boolean; isActive: boolean; sort_order: number;
};
export const selectedPlanKey = "villacheck-selected-package";
export const packageIntentKey = "villacheck-package-intent";
export function planId(name: string) { return sessionStorage.getItem(selectedPlanKey) || name; }
export function usePackages() {
 const [plans,setPlans]=useState<PackagePlan[]>([]);
 const [error,setError]=useState("");
 useEffect(()=>{ let active=true; const refresh=()=>void api<{packages:PackagePlan[]}>("/packages").then(v=>{if(active){setPlans(v.packages);setError("");}}).catch(e=>{if(active)setError(e.message);}); refresh(); const timer=window.setInterval(refresh,10000);return()=>{active=false;clearInterval(timer);};},[]);
 return {plans,error};
}

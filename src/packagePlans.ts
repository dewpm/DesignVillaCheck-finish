export const merchantPlans = [
  { id: "basic", name: "Basic Trust QR", amount: 0, capacity: 1 },
  { id: "starter", name: "Trust Starter", amount: 990, capacity: 1 },
  { id: "pro", name: "Trust Pro", amount: 2900, capacity: 1 },
  { id: "plus", name: "Trust Plus", amount: 4900, capacity: 2 },
  { id: "premium", name: "Trust Premium", amount: 9900, capacity: 10 },
];
export const selectedPlanKey = "villacheck-selected-package";
export const packageIntentKey = "villacheck-package-intent";
export function planId(name: string) { return merchantPlans.find(plan => plan.name === name)?.id || "starter"; }

export const creditPackages = [
  {
    key: "bronze",
    credits: 100,
    price: 1000,  // 10EUR (price in cents)
    productId: "pdt_0NUzkBLPj7RIOEcqZ64WA", 
  },
  {
    key: "silver", 
    credits: 500,
    price: 5000, // 50EUR (price in cents)
    productId: "pdt_0NUzkvLtA4UmSIekBVTcX", 
    bonus: 50,   // 550 total credits
    popular: true,
  },
  {
    key: "gold",
    credits: 1000,
    price: 10000, // 100EUR (price in cents)
    productId: "pdt_0NUzkyBe5er7ZA6OlnSXQ",
    bonus: 200,  // 1200 total credits
  },
] as const;

export const billingConfig = {
  // Feature costs in credits
  features: {
    aiGeneration: 1,      // 1 credit per AI generation
    apiCall: 0.1,         // 0.1 credits per API call
    exportPdf: 5,         // 5 credits per PDF export
    prioritySupport: 10,  // 10 credits per support ticket
    
    // Chat message costs
    chatText: 0.1,        // 0.1 credit per text message
    chatAudio: 1,         // 1 credit per audio message (future)
    chatVideo: 2,         // 2 credits per video message (future)
  },
  
  // Minimum credit balance warnings
  lowCreditThreshold: 10,
  
  // Whether to allow negative credits (with limits)
  allowNegativeCredits: false,
  
  // Maximum credits a user can hold
  maxCredits: 10000,
} as const;

export const subscriptionPlans = [
  {
    key: "starter",
    price: 1900,
    currency: "EUR",
    interval: "month",
    productId: "pdt_subscription_starter",
    features: ["Core app access"],
  },
  {
    key: "pro",
    price: 4900,
    currency: "EUR",
    interval: "month",
    productId: "pdt_subscription_pro",
    popular: true,
    features: ["Core app access", "Priority support"],
  },
] as const;

export type SubscriptionPlan = typeof subscriptionPlans[number];

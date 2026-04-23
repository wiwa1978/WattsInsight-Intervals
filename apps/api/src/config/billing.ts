export const creditPackages = [
  {
    key: "bronze",
    credits: 100,
    price: 1000,
    productId: "pdt_0NUzkBLPj7RIOEcqZ64WA",
  },
  {
    key: "silver",
    credits: 500,
    price: 5000,
    productId: "pdt_0NUzkvLtA4UmSIekBVTcX",
    bonus: 50,
    popular: true,
  },
  {
    key: "gold",
    credits: 1000,
    price: 10000,
    productId: "pdt_0NUzkyBe5er7ZA6OlnSXQ",
    bonus: 200,
  },
] as const;

export const billingConfig = {
  lowCreditThreshold: 10,
  allowNegativeCredits: false,
  maxCredits: 10000,
} as const;

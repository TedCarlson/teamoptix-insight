import { loadStripe } from "@stripe/stripe-js";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

export const stripeBrowserPromise = publishableKey
  ? loadStripe(publishableKey)
  : Promise.resolve(null);

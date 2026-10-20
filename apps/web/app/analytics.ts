type GtagFunction = (
  command: "config" | "event",
  targetIdOrEventName: string,
  parameters?: Record<string, unknown>
) => void;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: GtagFunction;
  }
}

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function trackEvent(
  eventName: string,
  parameters?: Record<string, unknown>
) {
  if (typeof window === "undefined") {
    return;
  }

  if (!window.gtag) {
    console.warn("Google Analytics is not loaded yet.");
    return;
  }

  window.gtag("event", eventName, parameters);
}
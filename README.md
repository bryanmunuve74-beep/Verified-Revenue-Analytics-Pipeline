# Verified Revenue & Analytics Pipeline

A learning project exploring a checkout flow, M-PESA integration, payment-state verification, and frontend analytics.

## M7: Frontend analytics and automated verification

The web app can load Google Analytics 4 using the local `NEXT_PUBLIC_GA_ID` environment variable. It sends `page_view` via the Google tag and a `begin_checkout` event when the checkout form is submitted.

The Cypress end-to-end test stubs the checkout and status API calls to avoid real M-PESA prompts, then checks that a GA4 `begin_checkout` request is sent.

See [apps/web/README.md](apps/web/README.md) for setup and test commands.

**Scope note:** this milestone verifies frontend event sending and synthetic test activity. It does not claim that verified successful payments are recorded as GA4 `purchase` events.

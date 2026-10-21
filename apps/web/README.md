# Verified Revenue & Analytics Pipeline — Web App

## GA4 setup

1. In the GA4 property, create or select a web data stream and copy its Measurement ID (it starts with `G-`).
2. Create `.env.local` in this directory (`apps/web/.env.local`) with:

   ```dotenv
   NEXT_PUBLIC_GA_ID=G-YOUR_MEASUREMENT_ID
   ```

3. Keep `.env.local` local; do not commit it.
4. Start the web app on port 3001:

   ```powershell
   npm run dev -- --port 3001
   ```

The layout loads the Google tag when `NEXT_PUBLIC_GA_ID` is set. Local development sets GA4 debug mode so events can be inspected in GA4 DebugView. The checkout form sends a `begin_checkout` event. Page views are sent by the tag.

## Cypress test setup

From `apps/web`, install Cypress and update the lockfile:

```powershell
npm install --save-dev cypress
```

With the web app running on port 3001, open Cypress:

```powershell
npm run cypress:open
```

Or run the end-to-end test in the terminal:

```powershell
npm run cypress:run
```

The test stubs the checkout API and order-status API, so it does not send a real M-PESA prompt. It checks that the page loads the Google tag and that submitting checkout sends a GA4 `begin_checkout` request. The test requires a valid local `NEXT_PUBLIC_GA_ID` and a browser/network environment where the Google tag can load.

## Interpreting the result

A passing Cypress test verifies that the browser sends the expected event request. Check GA4 DebugView separately to confirm that GA4 receives the event. DebugView/Realtime are for validation; standard reports can take longer to populate.

This milestone covers frontend event tracking and repeatable synthetic test activity. It does not implement server-side verified `purchase` tracking.

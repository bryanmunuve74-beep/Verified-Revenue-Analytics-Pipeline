describe("Checkout analytics", () => {
  beforeEach(() => {
    // Keep the test deterministic: do not send a real M-PESA prompt.
    cy.intercept("POST", "http://localhost:3000/api/checkout", {
      statusCode: 200,
      body: {
        message: "Simulated checkout accepted",
        order: { id: 9001, status: "PENDING" },
      },
    }).as("checkout");

    cy.intercept("GET", "http://localhost:3000/api/orders/9001/status", {
      statusCode: 200,
      body: { status: "SUCCESS" },
    }).as("orderStatus");

    // Give the GA4 event request a dynamic alias so the test can wait for
    // begin_checkout specifically rather than an earlier page_view request.
    cy.intercept({ url: "**/g/collect**" }, (request) => {
      const url = new URL(request.url);
      const bodyText =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body ?? "");

      const eventName =
        url.searchParams.get("en") ??
        new URLSearchParams(bodyText).get("en");

      if (
        eventName === "begin_checkout" ||
        bodyText.includes("begin_checkout")
      ) {
        request.alias = "beginCheckoutAnalytics";
      }
    });
  });

  it("sends begin_checkout to GA4 when the checkout form is submitted", () => {
    cy.visit(
      "/?utm_source=cypress&utm_medium=test&utm_campaign=m7_ga4_validation"
    );

    // This proves the frontend has been configured with a GA measurement ID.
    cy.get('script[src*="googletagmanager.com/gtag/js"]').should("exist");
    cy.window().its("gtag").should("be.a", "function");

    cy.get("#checkout-amount").clear().type("10");
    cy.get('button[type="submit"]').click();

    cy.wait("@checkout")
      .its("response.statusCode")
      .should("eq", 200);

    cy.wait("@beginCheckoutAnalytics").then((interception) => {
      const url = new URL(interception.request.url);
      const bodyText =
        typeof interception.request.body === "string"
          ? interception.request.body
          : JSON.stringify(interception.request.body ?? "");

      const eventName =
        url.searchParams.get("en") ??
        new URLSearchParams(bodyText).get("en");

      expect(
        eventName === "begin_checkout" ||
          bodyText.includes("begin_checkout")
      ).to.equal(true);
    });

    cy.get('[role="status"]').should(
      "contain.text",
      "Payment successful! Order ID: 9001"
    );
  });
});

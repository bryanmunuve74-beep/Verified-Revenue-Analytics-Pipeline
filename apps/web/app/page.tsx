
"use client";

import { useState } from "react";
import { trackEvent } from "./analytics";

export default function Home() {
  const [phone, setPhone] = useState("254700000000");
  const [amount, setAmount] = useState("10");
  const [message, setMessage] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);

  // Poll the backend until the order becomes SUCCESS or FAILED.
  const pollOrderStatus = async (orderId: number) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(
          `http://localhost:3000/api/orders/${orderId}/status`
        );

        const data = await response.json();

        console.log("Order status:", data.status);

        if (data.status === "SUCCESS") {
          setMessage(`Payment successful! Order ID: ${orderId}`);
          setIsWaiting(false);
          return;
        }

        if (data.status === "FAILED") {
          setMessage("Payment failed or was cancelled.");
          setIsWaiting(false);
          return;
        }

        // Still pending, so check again after 5 seconds.
        setMessage("Check your phone and enter your M-PESA PIN...");
        setTimeout(checkStatus, 5000);
      } catch (error) {
        console.error("Polling error:", error);
        setMessage("Unable to check payment status.");
        setIsWaiting(false);
      }
    };

    // Check immediately instead of waiting 5 seconds for the first check.
    checkStatus();
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();

    // This records the user's attempt to begin checkout, not a successful payment.
    trackEvent("begin_checkout", {
      currency: "KES",
      value: Number(amount),
    });

    setMessage("Processing...");
    setIsWaiting(true);

    try {
      const response = await fetch("http://localhost:3000/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone_number: phone,
          amount: parseFloat(amount),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const orderId = data.order.id;

        setMessage(
          `STK Push sent. Order ID: ${orderId}. Check your phone.`
        );

        // Start polling using the order ID created by the backend.
        pollOrderStatus(orderId);
      } else {
        setMessage(`Error: ${data.error || "Checkout failed"}`);
        setIsWaiting(false);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setMessage("Failed to connect to the server.");
      setIsWaiting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-24 text-black">
      <div className="w-96 rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-center text-2xl font-bold">
          Test Checkout
        </h1>

        <form onSubmit={handleCheckout} className="flex flex-col gap-4">
          <div>
            <label htmlFor="phone-number" className="mb-1 block text-sm font-medium">
              Phone Number
            </label>

            <input
              id="phone-number"
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border p-2"
            />
          </div>

          <div>
            <label htmlFor="checkout-amount" className="mb-1 block text-sm font-medium">
              Amount (KES)
            </label>

            <input
              id="checkout-amount"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded border p-2"
            />
          </div>

          <button
            type="submit"
            disabled={isWaiting}
            className="mt-2 rounded bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isWaiting ? "Waiting for Payment..." : "Pay Now"}
          </button>
        </form>

        {message && (
          <div role="status" className="mt-6 rounded bg-gray-100 p-4 text-center font-medium">
            {message}
          </div>
        )}
      </div>
    </main>
  );
}

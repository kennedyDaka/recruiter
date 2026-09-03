/**
 * PayChangu Checkout Session provider.
 *
 * Creates a hosted checkout page for card payments (Visa/Mastercard).
 * The customer is redirected to PayChangu's hosted page to complete payment.
 *
 * API docs: https://developer.paychangu.com/reference/create-checkout-session
 */

export interface CheckoutConfig {
  baseUrl: string;
  secretKey: string;
}

export interface CheckoutSessionRequest {
  amount: number;
  currency: string;
  txRef: string;
  email: string;
  firstName: string;
  lastName: string;
  callbackUrl: string;
}

export interface CheckoutSessionResponse {
  success: boolean;
  checkoutUrl?: string;
  chargeId?: string;
  error?: string;
}

function getConfig(): CheckoutConfig {
  return {
    baseUrl: process.env["PAYCHANGU_API_URL"] ?? "https://api.paychangu.com",
    secretKey: process.env["PAYCHANGU_SECRET_KEY"] ?? "",
  };
}

/**
 * Create a PayChangu Checkout Session for card payments.
 *
 * Returns a checkout_url that the customer opens in their browser
 * to complete payment with Visa or Mastercard.
 */
export async function createCheckoutSession(
  request: CheckoutSessionRequest,
): Promise<CheckoutSessionResponse> {
  const config = getConfig();

  if (!config.secretKey) {
    return { success: false, error: "PayChangu secret key not configured" };
  }

  try {
    const response = await fetch(`${config.baseUrl}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        amount: String(request.amount),
        currency: request.currency,
        tx_ref: request.txRef,
        email: request.email,
        first_name: request.firstName,
        last_name: request.lastName,
        callback_url: request.callbackUrl,
        return_url: request.callbackUrl,
        customization: {
          title: "RecruiterMW Campaign Payment",
          description: `Pay ${request.currency} ${request.amount} to activate your recruitment campaign`,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      return {
        success: false,
        error: data.message ?? "Failed to create checkout session",
      };
    }

    return {
      success: true,
      checkoutUrl: data.data?.checkout_url,
      chargeId: data.data?.charge_id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

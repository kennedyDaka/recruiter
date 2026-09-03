/**
 * PayChangu Mobile Money Direct Charge provider.
 *
 * Initiates payments without redirecting the customer.
 * The customer receives a mobile money prompt on their phone
 * and authorizes the payment directly.
 *
 * API docs: https://developer.paychangu.com/reference/charge-mobile-money
 */

export interface MobileMoneyConfig {
  baseUrl: string;
  secretKey: string;
  webhookSecret: string;
  testMode: boolean;
  airtelOperatorRefId: string;
  tnmOperatorRefId: string;
}

export interface ChargeRequest {
  phone: string;
  amount: number;
  chargeId: string;
  provider: "airtel_money" | "tnm_mpamba";
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface ChargeResponse {
  success: boolean;
  chargeId?: string;
  refId?: string;
  transId?: string;
  status?: string;
  error?: string;
}

export interface VerifyResponse {
  success: boolean;
  status: "success" | "failed" | "pending" | "processing";
  amount?: number;
  chargeId?: string;
  refId?: string;
  completedAt?: string;
  error?: string;
}

function getConfig(): MobileMoneyConfig {
  return {
    baseUrl: process.env["PAYCHANGU_API_URL"] ?? "https://api.paychangu.com",
    secretKey: process.env["PAYCHANGU_SECRET_KEY"] ?? "",
    webhookSecret: process.env["PAYCHANGU_WEBHOOK_SECRET"] ?? "",
    testMode: process.env["PAYCHANGU_TEST_MODE"] === "true",
    airtelOperatorRefId:
      process.env["PAYCHANGU_AIRTEL_OPERATOR_REF_ID"] ?? "20be6c20-adeb-4b5b-a7ba-0769820df4fb",
    tnmOperatorRefId: process.env["PAYCHANGU_TNM_OPERATOR_REF_ID"] ?? "",
  };
}

/**
 * Get the operator ref_id for a given payment provider.
 */
function getOperatorRefId(provider: "airtel_money" | "tnm_mpamba"): string {
  const config = getConfig();
  if (provider === "airtel_money") return config.airtelOperatorRefId;
  if (provider === "tnm_mpamba") return config.tnmOperatorRefId;
  throw new Error(`Unsupported mobile money provider: ${provider}`);
}

/**
 * Initiate a Mobile Money charge via PayChangu Direct API.
 *
 * This sends a payment prompt to the customer's phone.
 * The customer must authorize the payment on their device.
 */
export async function initiateMobileMoneyCharge(
  request: ChargeRequest,
): Promise<ChargeResponse> {
  const config = getConfig();

  if (!config.secretKey) {
    return { success: false, error: "PayChangu secret key not configured" };
  }

  const operatorRefId = getOperatorRefId(request.provider);
  if (!operatorRefId) {
    return {
      success: false,
      error: `Operator ref ID not configured for ${request.provider}`,
    };
  }

  // Normalize phone: ensure +265 prefix
  let phone = request.phone.replace(/\s+/g, "");
  if (phone.startsWith("0")) {
    phone = "+265" + phone.slice(1);
  } else if (!phone.startsWith("+265")) {
    phone = "+265" + phone;
  }

  try {
    const response = await fetch(`${config.baseUrl}/mobile-money/payments/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        mobile: phone,
        mobile_money_operator_ref_id: operatorRefId,
        amount: String(request.amount),
        charge_id: request.chargeId,
        first_name: request.firstName,
        last_name: request.lastName,
        email: request.email,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.status !== "success") {
      return {
        success: false,
        error: data.message ?? "Failed to initiate mobile money charge",
      };
    }

    return {
      success: true,
      chargeId: data.data.charge_id,
      refId: data.data.ref_id,
      transId: data.data.trans_id,
      status: data.data.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Verify a Mobile Money charge via PayChangu Direct API.
 *
 * Use this to check the status of a charge after initiation,
 * or to verify a payment before activating a campaign.
 */
export async function verifyMobileMoneyCharge(
  chargeId: string,
): Promise<VerifyResponse> {
  const config = getConfig();

  if (!config.secretKey) {
    return { success: false, status: "failed", error: "PayChangu secret key not configured" };
  }

  try {
    const response = await fetch(
      `${config.baseUrl}/mobile-money/payments/${chargeId}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          Accept: "application/json",
        },
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        status: "failed",
        error: data.message ?? "Verification failed",
      };
    }

    const status = data.data?.status as string;
    let normalizedStatus: "success" | "failed" | "pending" | "processing";
    if (status === "success") {
      normalizedStatus = "success";
    } else if (status === "failed") {
      normalizedStatus = "failed";
    } else if (status === "processing") {
      normalizedStatus = "processing";
    } else {
      normalizedStatus = "pending";
    }

    return {
      success: normalizedStatus === "success",
      status: normalizedStatus,
      amount: data.data?.amount,
      chargeId: data.data?.charge_id,
      refId: data.data?.ref_id,
      completedAt: data.data?.completed_at,
    };
  } catch (error) {
    return {
      success: false,
      status: "failed",
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  CheckCircle2,
  Calendar,
  AlertCircle,
  ArrowLeft,
  CreditCard,
  Ticket,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DAILY_RATE,
  MIN_DAYS,
  PRESET_DAYS,
  calculateCampaignPrice,
  formatMWK,
} from "@/lib/payment/pricing";

type PaymentState = "ready" | "processing" | "success" | "failed";

export const Route = createFileRoute("/_authenticated/campaigns/$campaignId/pay")({
  component: CampaignPayment,
});

function CampaignPayment() {
  const { campaignId } = Route.useParams();
  const [numDays, setNumDays] = useState(30);
  const [paymentState, setPaymentState] = useState<PaymentState>("ready");
  const [chargeId, setChargeId] = useState<string | null>(null);
  const [campaignActivated, setCampaignActivated] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promoResult, setPromoResult] = useState<{
    valid: boolean;
    discount_type: string;
    discount_value: number;
    message: string;
  } | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status, tenant_id, public_token, tenants(name, email)")
        .eq("id", campaignId)
        .maybeSingle();
      if (error || !data) throw new Error("Campaign not found");
      return data as {
        id: string;
        name: string;
        status: string;
        tenant_id: string;
        public_token: string | null;
        tenants: { name: string; email: string } | null;
      };
    },
  });

  const companyName = campaign?.tenants?.name ?? profile?.full_name ?? "Customer";
  const companyEmail = campaign?.tenants?.email ?? profile?.email ?? "";
  const baseAmount = calculateCampaignPrice(numDays);

  // Calculate discounted amount
  const totalAmount = (() => {
    if (promoResult?.valid) {
      if (promoResult.discount_type === "free") return 0;
      if (promoResult.discount_type === "percentage") {
        return Math.round(baseAmount * ((100 - promoResult.discount_value) / 100));
      }
    }
    return baseAmount;
  })();

  const pollStatus = useCallback(async () => {
    if (!chargeId || paymentState !== "processing") return;
    try {
      const res = await fetch(`/api/payment/charge-status/${chargeId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "success") {
        setPaymentState("success");
        setCampaignActivated(true);
        setPublicToken(data.publicToken);
      } else if (data.status === "failed") {
        setPaymentState("failed");
      }
    } catch {}
  }, [chargeId, paymentState]);

  useEffect(() => {
    if (paymentState !== "processing" || !chargeId) return;
    const interval = setInterval(pollStatus, 4000);
    return () => clearInterval(interval);
  }, [paymentState, chargeId, pollStatus]);

  const initiatePayment = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          numDays,
          provider: "card",
          customer: { name: companyName, email: companyEmail },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Payment initiation failed" }));
        throw new Error(err.error || "Payment initiation failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data.success && data.chargeId) {
        setChargeId(data.chargeId);
        setPaymentState("processing");
      } else {
        toast.error(data.error || "Failed to initiate payment");
      }
    },
    onError: (error) => {
      toast.error(error.message);
      setPaymentState("failed");
    },
  });

  const handleRetry = () => {
    setPaymentState("ready");
    setChargeId(null);
  };

  const validatePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoValidating(true);
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      setPromoResult(data);
      if (!data.valid) {
        toast.error(data.message);
      } else {
        toast.success(data.message);
      }
    } catch {
      toast.error("Failed to validate promo code");
    } finally {
      setPromoValidating(false);
    }
  };

  const clearPromo = () => {
    setPromoCode("");
    setPromoResult(null);
  };

  const promoBypassMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/promo/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: promoCode.trim(),
          campaignId,
          numDays,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Promo bypass failed" }));
        throw new Error(err.error || "Promo bypass failed");
      }
      return response.json();
    },
    onSuccess: (data) => {
      if (data.bypass) {
        setPaymentState("success");
        setCampaignActivated(true);
        // Fetch the public token
        supabase
          .from("campaigns")
          .select("public_token")
          .eq("id", campaignId)
          .maybeSingle()
          .then(({ data: c }) => {
            if (c?.public_token) setPublicToken(c.public_token);
          });
      } else {
        // Partial discount — still need to pay remainder
        toast.success(data.message);
        initiatePayment.mutate();
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (campaignLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container mx-auto max-w-2xl py-8 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <h1 className="text-2xl font-bold">Campaign not found</h1>
        <p className="mt-2 text-muted-foreground">This campaign may have been deleted.</p>
      </div>
    );
  }

  if (paymentState === "success") {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-success" />
            <h1 className="text-2xl font-bold">Payment successful</h1>
            <p className="mt-2 text-muted-foreground">Your recruitment campaign is now active.</p>
            <div className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Campaign</span>
                <span className="font-medium">{campaign.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">{numDays} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{formatMWK(totalAmount)}</span>
              </div>
              {publicToken && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Application link</span>
                  <span className="font-medium text-accent">/apply/{publicToken}</span>
                </div>
              )}
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/campaigns/$campaignId" params={{ campaignId }}>View Campaign</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/campaigns">All Campaigns</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentState === "failed") {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto mb-4 h-16 w-16 text-destructive" />
            <h1 className="text-2xl font-bold">Payment unsuccessful</h1>
            <p className="mt-2 text-muted-foreground">
              We could not complete the payment. Your campaign has not been activated.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button onClick={handleRetry}>Try Again</Button>
              <Button asChild variant="outline">
                <Link to="/campaigns/$campaignId" params={{ campaignId }}>Back to Campaign</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentState === "processing") {
    return (
      <div className="container mx-auto max-w-2xl py-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <Loader2 className="mx-auto mb-4 h-16 w-16 animate-spin text-accent" />
            <h1 className="text-2xl font-bold">Processing payment</h1>
            <p className="mt-2 text-muted-foreground">Waiting for payment confirmation...</p>
            <div className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Campaign</span>
                <span className="font-medium">{campaign.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{formatMWK(totalAmount)}</span>
              </div>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">This page updates automatically.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/campaigns/$campaignId" params={{ campaignId }}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to campaign
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Activate Recruitment Campaign</h1>
        <p className="mt-2 text-muted-foreground">
          Choose your campaign duration and pay securely.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <div>
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold">
              <Calendar className="h-5 w-5" />
              Campaign Duration
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Select how many days you want this campaign to be live.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              {PRESET_DAYS.map((days) => (
                <Button
                  key={days}
                  type="button"
                  variant={numDays === days ? "default" : "outline"}
                  onClick={() => setNumDays(days)}
                >
                  {days} days
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-days">
                Custom duration (minimum {MIN_DAYS} days)
              </Label>
              <Input
                id="custom-days"
                type="number"
                min={MIN_DAYS}
                max={365}
                value={numDays}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= MIN_DAYS) setNumDays(v);
                }}
              />
            </div>
          </div>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Daily rate</span>
                  <span>{formatMWK(DAILY_RATE)} / day</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration</span>
                  <span>{numDays} days</span>
                </div>
                <div className="border-t border-primary/20 pt-2 flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatMWK(totalAmount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="mb-4 text-xl font-semibold">Payment</h2>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Secure Checkout
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Campaign</span>
                  <span className="font-medium">{campaign.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{numDays} days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company</span>
                  <span className="font-medium">{companyName}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatMWK(totalAmount)}</span>
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-start gap-2">
                  <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <div className="space-y-1 text-xs text-blue-800">
                    <p className="font-medium">PayChangu Secure Checkout</p>
                    <p>You will be redirected to PayChangu's secure payment page where you can pay with Mobile Money, Visa, or Mastercard.</p>
                  </div>
                </div>
              </div>

              {/* Promo Code */}
              <div className="space-y-2">
                <Label className="text-sm">Promo Code (optional)</Label>
                {promoResult?.valid ? (
                  <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                    <Ticket className="size-4 text-green-600" />
                    <span className="flex-1 text-sm font-medium text-green-800">
                      {promoResult.message}
                    </span>
                    <Button variant="ghost" size="sm" onClick={clearPromo}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter promo code"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          validatePromo();
                        }
                      }}
                      disabled={promoValidating}
                      className="font-mono tracking-wider"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={validatePromo}
                      disabled={!promoCode.trim() || promoValidating}
                    >
                      {promoValidating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        "Apply"
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* Show discount breakdown */}
              {promoResult?.valid && promoResult.discount_type === "percentage" && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Original price</span>
                    <span className="line-through">{formatMWK(baseAmount)}</span>
                  </div>
                  <div className="flex justify-between text-green-600">
                    <span>Discount ({promoResult.discount_value}%)</span>
                    <span>-{formatMWK(baseAmount - totalAmount)}</span>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={!companyEmail || initiatePayment.isPending || promoBypassMutation.isPending}
                onClick={() => {
                  if (promoResult?.valid && promoResult.discount_type === "free") {
                    promoBypassMutation.mutate();
                  } else if (promoResult?.valid && totalAmount < baseAmount) {
                    // Partial discount — use promo bypass endpoint
                    promoBypassMutation.mutate();
                  } else {
                    initiatePayment.mutate();
                  }
                }}
              >
                {initiatePayment.isPending || promoBypassMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {promoBypassMutation.isPending ? "Activating..." : "Redirecting to checkout..."}
                  </>
                ) : promoResult?.valid && promoResult.discount_type === "free" ? (
                  <>
                    <Ticket className="mr-2 h-4 w-4" />
                    Activate Free with Promo
                  </>
                ) : promoResult?.valid ? (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay {formatMWK(totalAmount)}
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay {formatMWK(totalAmount)}
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Secure payment powered by PayChangu
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

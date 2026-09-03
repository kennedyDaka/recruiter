import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Calendar, AlertCircle, Clock, ArrowLeft, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DAILY_RATE, MIN_DAYS, PRESET_DAYS, calculateCampaignPrice, formatMWK } from "@/lib/payment/pricing";

export const Route = createFileRoute("/_authenticated/campaigns/$campaignId/extend")({
  head: () => ({ meta: [{ title: "Extend Campaign — RecruiterMW" }] }),
  component: ExtendCampaign,
});

function ExtendCampaign() {
  const { campaignId } = Route.useParams();
  const navigate = useNavigate();
  const [extraDays, setExtraDays] = useState(14);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
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
        .select("id, name, status, closing_date, public_token, tenant_id, tenants(name, email)")
        .eq("id", campaignId)
        .maybeSingle();
      if (error || !data) throw new Error("Campaign not found");
      return data as {
        id: string;
        name: string;
        status: string;
        closing_date: string | null;
        public_token: string | null;
        tenant_id: string;
        tenants: { name: string; email: string } | null;
      };
    },
  });

  const companyName = campaign?.tenants?.name ?? profile?.full_name ?? "Customer";
  const companyEmail = campaign?.tenants?.email ?? profile?.email ?? "";

  const currentClosing = campaign?.closing_date ? new Date(campaign.closing_date) : null;
  const daysRemaining = currentClosing
    ? Math.max(0, Math.ceil((currentClosing.getTime() - Date.now()) / 86_400_000))
    : 0;
  const newClosing = currentClosing
    ? new Date(currentClosing.getTime() + extraDays * 86_400_000)
    : null;

  const totalAmount = extraDays * DAILY_RATE;

  const [state, setState] = useState<"idle" | "polling" | "success" | "failed">("idle");

  const extendMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          numDays: extraDays,
          provider: "card",
          customer: { name: companyName, email: companyEmail },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Payment initiation failed" }));
        throw new Error(err.error || "Payment initiation failed");
      }
      return response.json() as Promise<{ paymentId: string; chargeId: string; status: string; checkoutUrl?: string }>;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast.error("Failed to start payment. Please try again.");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (campaignLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!campaign || campaign.status !== "active") {
    return (
      <div className="container mx-auto py-8 max-w-2xl text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h1 className="text-2xl font-bold">Cannot extend this campaign</h1>
        <p className="text-muted-foreground mt-2">Only active campaigns can be extended.</p>
        <Button className="mt-4" onClick={() => navigate({ to: "/campaigns" })}>
          Back to campaigns
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/campaigns/$campaignId" params={{ campaignId }}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back to campaign
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Extend Campaign</h1>
        <p className="text-muted-foreground mt-2">
          Add more days to keep your campaign live and accepting applications
        </p>
        <p className="text-sm font-medium mt-1">{campaign.name}</p>
      </div>

      {state === "success" && (
        <Card className="mb-8 border-green-200 bg-green-50">
          <CardContent className="py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-green-900">Payment successful!</h3>
            <p className="text-sm text-green-700 mt-1">
              Your campaign has been extended by {extraDays} days.
            </p>
            <p className="text-sm text-green-700">Redirecting to campaigns...</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Current campaign</p>
                  <p className="text-amber-700">
                    {daysRemaining} days remaining
                    {currentClosing && <> — closes {currentClosing.toLocaleDateString("en-GB")}</>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Extension Duration
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              How many additional days do you want to add?
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {PRESET_DAYS.map((days) => (
                <Button
                  key={days}
                  type="button"
                  variant={extraDays === days ? "default" : "outline"}
                  onClick={() => setExtraDays(days)}
                >
                  +{days} days
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-days">Custom extension (minimum {MIN_DAYS} days)</Label>
              <Input
                id="custom-days"
                type="number"
                min={MIN_DAYS}
                max={365}
                value={extraDays}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (v >= MIN_DAYS) setExtraDays(v);
                }}
              />
            </div>
          </div>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Daily rate</span>
                  <span>{formatMWK(DAILY_RATE)} / day</span>
                </div>
                <div className="flex justify-between">
                  <span>Extension</span>
                  <span>+{extraDays} days</span>
                </div>
                {newClosing && (
                  <div className="flex justify-between">
                    <span>New closing date</span>
                    <span className="font-medium">{newClosing.toLocaleDateString("en-GB")}</span>
                  </div>
                )}
                <div className="border-t border-primary/20 pt-2 flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatMWK(totalAmount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Payment</h2>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Secure Checkout
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Campaign</span>
                  <span className="font-medium">{campaign.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current closing</span>
                  <span className="font-medium">
                    {currentClosing?.toLocaleDateString("en-GB") ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Extension</span>
                  <Badge variant="secondary">+{extraDays} days</Badge>
                </div>
                {newClosing && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">New closing</span>
                    <span className="font-medium text-emerald-600">
                      {newClosing.toLocaleDateString("en-GB")}
                    </span>
                  </div>
                )}
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

              <Button
                className="w-full"
                size="lg"
                disabled={extendMutation.isPending}
                onClick={() => extendMutation.mutate()}
              >
                {extendMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting to checkout...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Pay {formatMWK(totalAmount)}
                  </>
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Secure payment — powered by PayChangu
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

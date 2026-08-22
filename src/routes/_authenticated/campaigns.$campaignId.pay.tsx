import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, Calendar, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const DAILY_RATE = 15_000;
const MIN_DAYS = 3;
const PRESET_DAYS = [3, 7, 14, 30, 60, 90];

export const Route = createFileRoute("/_authenticated/campaigns/$campaignId/pay")({
  component: CampaignPayment,
});

function CampaignPayment() {
  const { campaignId } = Route.useParams();
  const [numDays, setNumDays] = useState(30);

  // Fetch the logged-in user's profile for email
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

  // Fetch campaign to show name, status, and tenant info
  const { data: campaign, isLoading: campaignLoading } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status, tenant_id, tenants(name, email)")
        .eq("id", campaignId)
        .maybeSingle();
      if (error || !data) throw new Error("Campaign not found");
      return data as {
        id: string;
        name: string;
        status: string;
        tenant_id: string;
        tenants: { name: string; email: string } | null;
      };
    },
  });

  // The payer is the company (tenant) — use company name from onboarding
  const companyName = campaign?.tenants?.name ?? profile?.full_name ?? "Customer";
  const companyEmail = campaign?.tenants?.email ?? profile?.email ?? "";

  const totalAmount = numDays * DAILY_RATE;

  const initiatePayment = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/payment/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          numDays,
          customer: { name: companyName, email: companyEmail, phone: profile?.phone ?? "" },
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
        // Navigate in the SAME window so PayChangu can redirect back to success/failed page
        window.location.href = data.checkoutUrl;
      } else {
        toast.error("Failed to get checkout URL");
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-MW", { style: "currency", currency: "MWK" }).format(amount);

  if (campaignLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="container mx-auto py-8 max-w-2xl text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h1 className="text-2xl font-bold">Campaign not found</h1>
        <p className="text-muted-foreground mt-2">This campaign may have been deleted.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Activate Campaign</h1>
        <p className="text-muted-foreground mt-2">
          Choose how many days your campaign runs, then pay securely
        </p>
        <p className="text-sm font-medium mt-1">{campaign.name}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Day Selection + Pricing */}
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Campaign Duration
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select how many days you want this campaign to be live.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
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
              <Label htmlFor="custom-days">Custom duration (minimum {MIN_DAYS} days)</Label>
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

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Daily rate</span>
                  <span>{fmt(DAILY_RATE)} / day</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration</span>
                  <span>{numDays} days</span>
                </div>
                <div className="border-t border-primary/20 pt-2 flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-primary">{fmt(totalAmount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Confirmation + Pay */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Confirm & Pay</h2>
          <Card>
            <CardHeader>
              <CardTitle>Payment Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3 text-sm">
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{companyEmail}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-primary">{fmt(totalAmount)}</span>
                </div>
              </div>

              {/* PayChangu Test Numbers Info — only in test mode */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-amber-800 space-y-1">
                    <p className="font-medium">Test Mode — Use these test credentials:</p>
                    <p><strong>Airtel Money:</strong> 0999309070</p>
                    <p><strong>TNM Mpamba:</strong> 0899250456</p>
                    <p><strong>Visa:</strong> 4242 4242 4242 4242 (any future date, any CVC)</p>
                    <p><strong>Mastercard:</strong> 5555 5555 5555 4444 (any future date, any CVC)</p>
                    <p className="mt-1 italic">Select your payment method on the secure PayChangu checkout page.</p>
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                disabled={!companyEmail || initiatePayment.isPending}
                onClick={() => initiatePayment.mutate()}
              >
                {initiatePayment.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting to payment…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Pay {fmt(totalAmount)}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          <p className="mt-4 text-sm text-muted-foreground text-center">
            Secure payment — powered by PayChangu
          </p>
        </div>
      </div>
    </div>
  );
}

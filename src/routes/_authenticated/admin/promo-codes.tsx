/**
 * Admin — Promo Codes page.
 * Generate, list, and manage promo codes for campaign payment bypass.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentSessionFn } from "@/lib/auth/session.functions";
import {
  generatePromoCodeFn,
  listPromoCodesFn,
  togglePromoCodeFn,
} from "@/lib/promo-code.functions";
import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  ArrowLeft,
  Plus,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  Ticket,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/promo-codes")({
  head: () => ({ meta: [{ title: "Promo Codes — Admin" }] }),
  component: AdminPromoCodes,
});

function AdminPromoCodes() {
  const queryClient = useQueryClient();
  const getSession = useServerFn(getCurrentSessionFn);
  const { data: session } = useQuery({
    queryKey: ["admin-session"],
    queryFn: () => getSession(),
  });
  const isAdmin = (session as any)?.role === "super_admin";

  const [showForm, setShowForm] = useState(false);
  const [discountType, setDiscountType] = useState<"free" | "percentage">("free");
  const [discountValue, setDiscountValue] = useState(100);
  const [maxUses, setMaxUses] = useState(1);
  const [validUntil, setValidUntil] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchCodes = useServerFn(listPromoCodesFn);
  const { data: codesData, isLoading } = useQuery({
    queryKey: ["admin-promo-codes"],
    queryFn: () => fetchCodes({ data: { limit: 50, offset: 0 } }),
    enabled: isAdmin,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const result = await generatePromoCodeFn({
        data: {
          discount_type: discountType,
          discount_value: discountType === "free" ? 100 : discountValue,
          max_uses: maxUses,
          valid_until: validUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      return result;
    },
    onSuccess: (result) => {
      setGeneratedCode(result.code);
      queryClient.invalidateQueries({ queryKey: ["admin-promo-codes"] });
      toast.success("Promo code generated!");
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to generate code");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await togglePromoCodeFn({ data: { id, active } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-promo-codes"] });
      toast.success("Updated!");
    },
  });

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isAdmin) {
    return (
      <AppShell title="Access Denied" description="Super admin access required.">
        <div className="flex flex-col items-center justify-center py-20">
          <Shield className="size-16 text-muted-foreground/30" />
          <p className="mt-4 text-lg font-medium">Super Admin access required</p>
          <Button asChild className="mt-6">
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Promo Codes"
      description="Generate and manage payment bypass codes."
    >
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin">
            <ArrowLeft className="mr-2 size-4" />Back to Admin
          </Link>
        </Button>
      </div>

      {/* Generate Form */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-semibold">Generate New Code</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus className="mr-1 size-4" />{showForm ? "Cancel" : "New Code"}
            </Button>
          </div>

          {showForm && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="text-xs">Discount Type</Label>
                <Select
                  value={discountType}
                  onValueChange={(v: "free" | "percentage") => {
                    setDiscountType(v);
                    if (v === "free") setDiscountValue(100);
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free (100% bypass)</SelectItem>
                    <SelectItem value="percentage">Percentage Discount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {discountType === "percentage" && (
                <div>
                  <Label className="text-xs">Discount % (0-99)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              )}
              <div>
                <Label className="text-xs">Max Uses</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Valid Until</Label>
                <Input
                  type="datetime-local"
                  value={validUntil}
                  onChange={(e) => setValidUntil(new Date(e.target.value).toISOString())}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <Button
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? "Generating..." : "Generate Code"}
                </Button>
              </div>
            </div>
          )}

          {/* Show generated code */}
          {generatedCode && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Code generated! Copy it now — it won't be shown again.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="rounded bg-green-100 px-3 py-1.5 font-mono text-lg font-bold tracking-wider text-green-900 dark:bg-green-900 dark:text-green-100">
                  {generatedCode}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyCode(generatedCode, "new")}
                >
                  {copiedId === "new" ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Codes List */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-left font-medium">Code</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Discount</th>
                <th className="px-4 py-3 text-left font-medium">Usage</th>
                <th className="px-4 py-3 text-left font-medium">Valid Until</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : codesData?.items?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <Ticket className="mx-auto mb-3 size-10 text-muted-foreground/30" />
                    No promo codes yet. Generate your first one above.
                  </td>
                </tr>
              ) : (
                codesData?.items?.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs font-medium">
                      {c.code_prefix}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.discount_type === "free" ? "default" : "secondary"}>
                        {c.discount_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {c.discount_type === "free" ? "100%" : `${c.discount_value}%`}
                    </td>
                    <td className="px-4 py-3">
                      {c.used_count}/{c.max_uses}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(c.valid_until).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={c.active ? "default" : "destructive"}>
                        {c.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          toggleMutation.mutate({ id: c.id, active: !c.active })
                        }
                      >
                        {c.active ? (
                          <ToggleRight className="size-5 text-green-600" />
                        ) : (
                          <ToggleLeft className="size-5 text-muted-foreground" />
                        )}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </AppShell>
  );
}

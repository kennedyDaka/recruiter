import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  MapPin,
  Briefcase,
  GraduationCap,
  Calendar,
  Building2,
  ExternalLink,
  Clock,
  Share2,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/share/$publicToken")({
  head: ({ params }) => ({
    meta: [
      { title: "Job Vacancy — Operon Recruit" },
      {
        property: "og:title",
        content: "New Job Vacancy — Operon Recruit",
      },
      {
        property: "og:description",
        content: "Apply now for this open position. Structured hiring, objectively scored.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Operon Recruit" },
      {
        name: "description",
        content: "Apply now for this open position. Structured hiring, objectively scored.",
      },
    ],
  }),
  component: ShareVacancyPage,
});

function ShareVacancyPage() {
  const { publicToken } = Route.useParams();
  const [copied, setCopied] = useState(false);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["share-campaign", publicToken],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select(
          "id, name, job_title, location, employment_type, job_description, responsibilities, required_skills, min_qualification, min_experience_years, salary_min, salary_max, salary_currency, closing_date, published_at, tenants(name, logo_url)",
        )
        .eq("public_token", publicToken)
        .in("status", ["active", "paused"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const shareUrl =
    typeof window !== "undefined" ? window.location.href : "";
  const shareText = campaign
    ? `${campaign.job_title || campaign.name} — ${campaign.location || ""}\n\nApply now: ${shareUrl}`
    : "";

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const fmt = (amount: number) =>
    new Intl.NumberFormat("en-MW", {
      style: "currency",
      currency: campaign?.salary_currency || "MWK",
    }).format(amount);

  const parseList = (val: string | null): string[] => {
    if (!val) return [];
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return val
        .split(/\n|,/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading vacancy...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="pt-8 pb-8 text-center">
            <h1 className="text-2xl font-bold mb-2">Vacancy Not Found</h1>
            <p className="text-muted-foreground mb-6">
              This campaign may have expired or the link is invalid.
            </p>
            <Button asChild>
              <Link to="/">Browse Open Roles</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const skills = parseList(campaign.required_skills);
  const responsibilities = parseList(campaign.responsibilities);
  const applyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/apply/${publicToken}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={copyLink}>
              {copied ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 mr-1" />
              ) : (
                <Share2 className="h-4 w-4 mr-1" />
              )}
              {copied ? "Copied!" : "Share"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Company & Job Title */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            {campaign.tenants?.logo_url && (
              <img
                src={campaign.tenants.logo_url}
                alt={campaign.tenants?.name || ""}
                className="h-12 w-12 rounded-lg object-contain border"
              />
            )}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground">
                {campaign.tenants?.name || "Operon Recruit"}
              </h2>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {campaign.job_title || campaign.name}
              </h1>
            </div>
          </div>
        </div>

        {/* Quick Info Badges */}
        <div className="flex flex-wrap gap-2 mb-6">
          {campaign.location && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-sm font-medium">
              <MapPin className="h-3.5 w-3.5" />
              {campaign.location}
            </span>
          )}
          {campaign.employment_type && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-sm font-medium">
              <Briefcase className="h-3.5 w-3.5" />
              {campaign.employment_type}
            </span>
          )}
          {campaign.min_qualification && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-sm font-medium">
              <GraduationCap className="h-3.5 w-3.5" />
              {campaign.min_qualification}
            </span>
          )}
          {campaign.min_experience_years != null && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm font-medium">
              <Clock className="h-3.5 w-3.5" />
              {campaign.min_experience_years}+ years exp
            </span>
          )}
          {campaign.closing_date && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm font-medium">
              <Calendar className="h-3.5 w-3.5" />
              Closes {new Date(campaign.closing_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
        </div>

        {/* Salary */}
        {(campaign.salary_min || campaign.salary_max) && (
          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-700 dark:text-green-300 font-medium">
              💰 Salary Range
            </p>
            <p className="text-lg font-bold text-green-800 dark:text-green-200">
              {campaign.salary_min ? fmt(campaign.salary_min) : "Negotiable"}
              {campaign.salary_max ? ` — ${fmt(campaign.salary_max)}` : ""}
            </p>
          </div>
        )}

        {/* Description */}
        {campaign.job_description && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                About the Role
              </h3>
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-muted-foreground">
                {campaign.job_description}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Responsibilities */}
        {responsibilities.length > 0 && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-lg mb-3">Key Responsibilities</h3>
              <ul className="space-y-2">
                {responsibilities.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Skills */}
        {skills.length > 0 && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-lg mb-3">Required Skills</h3>
              <div className="flex flex-wrap gap-2">
                {skills.map((s, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Apply CTA */}
        <div className="sticky bottom-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-t -mx-4 px-4 py-4 mt-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">{campaign.tenants?.name || "Operon Recruit"}</p>
              <p className="text-sm text-muted-foreground">
                {campaign.job_title || campaign.name}
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <a href={applyUrl}>
                Apply Now
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

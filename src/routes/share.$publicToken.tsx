import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicCampaignFn } from "@/lib/apply-public.functions";
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

/* ── Inline brand icons ── */
function WhatsAppIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
  );
}
function FacebookIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
  );
}
function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
  );
}
function LinkedInIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
  );
}

/** Capitalise the first letter of each word */
function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseList(val: string | null): string[] {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return val.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
  }
}

function buildFullShareText(c: Record<string, any>, url: string): string {
  const lines: string[] = [];
  lines.push(`📋 ${c.job_title || c.name}`);
  lines.push(`🏢 ${c.tenants?.name || "RecruiterMW"}`);
  if (c.location) lines.push(`📍 ${c.location}`);
  if (c.employment_type) lines.push(`💼 ${c.employment_type}`);
  if (c.min_qualification) lines.push(`🎓 ${c.min_qualification}`);
  if (c.min_experience_years != null) lines.push(`⏱ ${c.min_experience_years}+ years experience`);
  if (c.closing_date) {
    lines.push(`📅 Closes ${new Date(c.closing_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`);
  }
  lines.push("");
  lines.push("Apply here 👇");
  lines.push(url);
  return lines.join("\n");
}

function buildShortShareText(c: Record<string, any>): string {
  const company = c.tenants?.name || "RecruiterMW";
  const title = c.job_title || c.name;
  const location = c.location ? ` — ${c.location}` : "";
  return `${title} at ${company}${location}`;
}

export const Route = createFileRoute("/share/$publicToken")({
  head: () => ({
    meta: [
      { title: "Job Vacancy — RecruiterMW" },
      { property: "og:title", content: "New Job Vacancy — RecruiterMW" },
      { property: "og:description", content: "Apply now for this open position." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "RecruiterMW" },
      { name: "description", content: "Apply now for this open position." },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShareVacancyPage,
});

function ShareVacancyPage() {
  const { publicToken } = Route.useParams();
  const [copied, setCopied] = useState(false);

  const fetchCampaign = useServerFn(getPublicCampaignFn);
  const { data: campaign, isLoading } = useQuery({
    queryKey: ["share-campaign", publicToken],
    queryFn: () => fetchCampaign({ data: { token: publicToken } }),
  });

  // Update document meta tags dynamically when campaign loads
  if (campaign && typeof document !== "undefined") {
    const title = `${campaign.job_title || campaign.name} at ${campaign.tenants?.name || "RecruiterMW"}`;
    const desc = [
      campaign.location,
      campaign.employment_type,
      campaign.min_qualification,
    ].filter(Boolean).join(" • ") || "Apply now for this open position.";

    document.title = `${title} — RecruiterMW`;

    const setMeta = (attr: string, key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", desc);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:site_name", (campaign as any)?.company_name || (campaign as any)?.tenants?.name || "");
    setMeta("name", "description", desc);
    setMeta("name", "twitter:card", "summary");
    setMeta("name", "twitter:title", title);
    setMeta("name", "twitter:description", desc);
  }

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const applyUrl = typeof window !== "undefined"
    ? `${window.location.origin}/apply/${publicToken}`
    : "";

  const fullText = campaign ? buildFullShareText(campaign as any, shareUrl) : "";
  const shortText = campaign ? buildShortShareText(campaign as any) : "";

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {((campaign as any)?.logo_data || (campaign as any)?.tenants?.logo_url) ? (
              <img src={(campaign as any)?.logo_data || (campaign as any)?.tenants?.logo_url} alt="Logo" className="h-8 w-8 rounded object-contain" />
            ) : null}
            <span className="font-display font-semibold" style={{ color: (campaign as any)?.brand_color || '#1e293b' }}>
              {(campaign as any)?.company_name || (campaign as any)?.tenants?.name || ''}
            </span>
          </div>
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
          <div className="flex items-start gap-3 mb-2">
            {((campaign as any)?.logo_data || (campaign as any)?.tenants?.logo_url) ? (
              <img
                src={(campaign as any)?.logo_data || (campaign as any)?.tenants?.logo_url}
                alt="Company logo"
                className="h-12 w-12 rounded-lg object-contain border"
              />
            ) : null}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground">
                {(campaign as any)?.company_name || (campaign as any)?.tenants?.name || ''}
              </h2>
              <h1 className="text-2xl md:text-3xl font-bold" style={{ color: '#000000' }}>
                {campaign.job_title ? toTitleCase(campaign.job_title) : campaign.name}
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

        {/* Social Sharing — full vacancy text */}
        <Card className="mb-6">
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold text-lg text-center">Share this vacancy</h3>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                onClick={() => {
                  const text = encodeURIComponent(fullText);
                  window.open(`https://wa.me/?text=${text}`, "_blank");
                }}
              >
                <WhatsAppIcon className="h-4 w-4 mr-1.5" />
                WhatsApp
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                onClick={() => {
                  const url = encodeURIComponent(shareUrl);
                  window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${encodeURIComponent(fullText)}`, "_blank");
                }}
              >
                <FacebookIcon className="h-4 w-4 mr-1.5" />
                Facebook
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200"
                onClick={() => {
                  const url = encodeURIComponent(shareUrl);
                  const text = encodeURIComponent(shortText);
                  window.open(`https://twitter.com/intent/tweet?url=${url}&text=${text}`, "_blank");
                }}
              >
                <XIcon className="h-4 w-4 mr-1.5" />
                Twitter / X
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200"
                onClick={() => {
                  const url = encodeURIComponent(shareUrl);
                  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
                }}
              >
                <LinkedInIcon className="h-4 w-4 mr-1.5" />
                LinkedIn
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Apply CTA */}
        <div className="sticky bottom-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-t -mx-4 px-4 py-4 mt-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">{campaign.tenants?.name || "RecruiterMW"}</p>
              <p className="text-sm text-muted-foreground">
                {toTitleCase(campaign.job_title || campaign.name || '')}
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

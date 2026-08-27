import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, ChevronsUpDown, Globe, LogOut, Phone, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registerCompany } from "@/lib/registration.functions";
import { supabase } from "@/integrations/supabase/client";
import { FALLBACK_INDUSTRIES } from "@/lib/recruitment-catalog";
import { COUNTRIES } from "@/lib/job-builder";
import { extractBrandColor, generateBrandTheme } from "@/lib/color-extraction"

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up company workspace — Operon Recruit" },
      {
        name: "description",
        content: "Set up your company workspace before creating a recruitment campaign.",
      },
    ],
  }),
  component: CompanyOnboarding,
});

// Currency mapping by country
const CURRENCY_MAP: Record<string, { code: string; symbol: string; name: string }> = {
  Malawi: { code: "MWK", symbol: "MK", name: "Malawian Kwacha" },
  Zambia: { code: "ZMW", symbol: "ZK", name: "Zambian Kwacha" },
  Zimbabwe: { code: "ZWL", symbol: "$", name: "Zimbabwean Dollar" },
  "South Africa": { code: "ZAR", symbol: "R", name: "South African Rand" },
  Tanzania: { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling" },
  Kenya: { code: "KES", symbol: "KSh", name: "Kenyan Shilling" },
  Uganda: { code: "UGX", symbol: "USh", name: "Ugandan Shilling" },
  Rwanda: { code: "RWF", symbol: "FRw", name: "Rwandan Franc" },
  Botswana: { code: "BWP", symbol: "P", name: "Botswana Pula" },
  Mozambique: { code: "MZN", symbol: "MT", name: "Mozambican Metical" },
  Namibia: { code: "NAD", symbol: "$", name: "Namibian Dollar" },
  Lesotho: { code: "LSL", symbol: "L", name: "Lesotho Loti" },
  Eswatini: { code: "SZL", symbol: "E", name: "Swazi Lilangeni" },
  Nigeria: { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  Ghana: { code: "GHS", symbol: "GH₵", name: "Ghanaian Cedi" },
  Cameroon: { code: "XAF", symbol: "FCFA", name: "CFA Franc" },
  "Democratic Republic of the Congo": { code: "CDF", symbol: "FC", name: "Congolese Franc" },
  Egypt: { code: "EGP", symbol: "E£", name: "Egyptian Pound" },
  India: { code: "INR", symbol: "₹", name: "Indian Rupee" },
  China: { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  Japan: { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  "United Kingdom": { code: "GBP", symbol: "£", name: "British Pound" },
  "United States": { code: "USD", symbol: "$", name: "US Dollar" },
  Canada: { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  Australia: { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  Germany: { code: "EUR", symbol: "€", name: "Euro" },
  France: { code: "EUR", symbol: "€", name: "Euro" },
  Italy: { code: "EUR", symbol: "€", name: "Euro" },
  Spain: { code: "EUR", symbol: "€", name: "Euro" },
  Portugal: { code: "EUR", symbol: "€", name: "Euro" },
  Netherlands: { code: "EUR", symbol: "€", name: "Euro" },
  Belgium: { code: "EUR", symbol: "€", name: "Euro" },
  Ireland: { code: "EUR", symbol: "€", name: "Euro" },
  "New Zealand": { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  Singapore: { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  "United Arab Emirates": { code: "AED", symbol: "د.إ", name: "UAE Dirham" },
  "Saudi Arabia": { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
  Pakistan: { code: "PKR", symbol: "₨", name: "Pakistani Rupee" },
  Bangladesh: { code: "BDT", symbol: "৳", name: "Bangladeshi Taka" },
  Brazil: { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  Argentina: { code: "ARS", symbol: "AR$", name: "Argentine Peso" },
  Ethiopia: { code: "ETB", symbol: "Br", name: "Ethiopian Birr" },
  Somalia: { code: "SOS", symbol: "Sh", name: "Somali Shilling" },
  "South Sudan": { code: "SSP", symbol: "SS£", name: "South Sudanese Pound" },
  Senegal: { code: "XOF", symbol: "CFA", name: "CFA Franc" },
  "Sierra Leone": { code: "SLL", symbol: "Le", name: "Sierra Leonean Leone" },
  Angola: { code: "AOA", symbol: "Kz", name: "Angolan Kwanza" },
  Algeria: { code: "DZD", symbol: "د.ج", name: "Algerian Dinar" },
  Mauritius: { code: "MUR", symbol: "₨", name: "Mauritian Rupee" },
};

// Phone country codes for auto-detection
const PHONE_CODES: Record<string, { code: string; flag: string; name: string }> = {
  Malawi: { code: "+265", flag: "🇲🇼", name: "Malawi" },
  Zambia: { code: "+260", flag: "🇿🇲", name: "Zambia" },
  Zimbabwe: { code: "+263", flag: "🇿🇼", name: "Zimbabwe" },
  "South Africa": { code: "+27", flag: "🇿🇦", name: "South Africa" },
  Tanzania: { code: "+255", flag: "🇹🇿", name: "Tanzania" },
  Kenya: { code: "+254", flag: "🇰🇪", name: "Kenya" },
  Uganda: { code: "+256", flag: "🇺🇬", name: "Uganda" },
  Rwanda: { code: "+250", flag: "🇷🇼", name: "Rwanda" },
  Botswana: { code: "+267", flag: "🇧🇼", name: "Botswana" },
  Mozambique: { code: "+258", flag: "🇲🇿", name: "Mozambique" },
  Nigeria: { code: "+234", flag: "🇳🇬", name: "Nigeria" },
  Ghana: { code: "+233", flag: "🇬🇭", name: "Ghana" },
  Cameroon: { code: "+237", flag: "🇨🇲", name: "Cameroon" },
  "Democratic Republic of the Congo": { code: "+243", flag: "🇨🇩", name: "DR Congo" },
  Egypt: { code: "+20", flag: "🇪🇬", name: "Egypt" },
  India: { code: "+91", flag: "🇮🇳", name: "India" },
  China: { code: "+86", flag: "🇨🇳", name: "China" },
  Japan: { code: "+81", flag: "🇯🇵", name: "Japan" },
  "United Kingdom": { code: "+44", flag: "🇬🇧", name: "UK" },
  "United States": { code: "+1", flag: "🇺🇸", name: "US" },
  Canada: { code: "+1", flag: "🇨🇦", name: "Canada" },
  Australia: { code: "+61", flag: "🇦🇺", name: "Australia" },
  Germany: { code: "+49", flag: "🇩🇪", name: "Germany" },
  France: { code: "+33", flag: "🇫🇷", name: "France" },
  Italy: { code: "+39", flag: "🇮🇹", name: "Italy" },
  Spain: { code: "+34", flag: "🇪🇸", name: "Spain" },
  "New Zealand": { code: "+64", flag: "🇳🇿", name: "New Zealand" },
  Singapore: { code: "+65", flag: "🇸🇬", name: "Singapore" },
  "United Arab Emirates": { code: "+971", flag: "🇦🇪", name: "UAE" },
  "Saudi Arabia": { code: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
  Namibia: { code: "+264", flag: "🇳🇦", name: "Namibia" },
  Lesotho: { code: "+266", flag: "🇱🇸", name: "Lesotho" },
  Eswatini: { code: "+268", flag: "🇸🇿", name: "Eswatini" },
  Ethiopia: { code: "+251", flag: "🇪🇹", name: "Ethiopia" },
  Pakistan: { code: "+92", flag: "🇵🇰", name: "Pakistan" },
  Bangladesh: { code: "+880", flag: "🇧🇩", name: "Bangladesh" },
  Brazil: { code: "+55", flag: "🇧🇷", name: "Brazil" },
  Senegal: { code: "+221", flag: "🇸🇳", name: "Senegal" },
  "Sierra Leone": { code: "+232", flag: "🇸🇱", name: "Sierra Leone" },
  Angola: { code: "+244", flag: "🇦🇴", name: "Angola" },
  Algeria: { code: "+213", flag: "🇩🇿", name: "Algeria" },
  Mauritius: { code: "+230", flag: "🇲🇺", name: "Mauritius" },
  Somalia: { code: "+252", flag: "🇸🇴", name: "Somalia" },
  "South Sudan": { code: "+211", flag: "🇸🇸", name: "South Sudan" },
};

function CompanyOnboarding() {
  const navigate = useNavigate();
  const register = useServerFn(registerCompany);
  const [industryOpen, setIndustryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [extractedColor, setExtractedColor] = useState("#2563eb");
  const [brandFont, setBrandFont] = useState("Inter");
  const [logoPreview, setLogoPreview] = useState("");
  const [form, setForm] = useState({
    companyName: "",
    industry: "",
    country: "",
    region: "",
    city: "",
    phone: "",
    email: "",
    website: "",
    fullName: "",
    adminPhone: "",
    autoPipelineEnabled: false,
    currency: "",
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      if (!user) return;
      const metadata = user.user_metadata as { full_name?: string } | undefined;
      setForm((current) => ({
        ...current,
        email: user.email ?? current.email,
        fullName: metadata?.full_name ?? current.fullName,
      }));
    });
  }, []);

  // Auto-set currency and phone code when country changes
  const handleCountryChange = (country: string) => {
    const currency = CURRENCY_MAP[country];
    const phoneInfo = PHONE_CODES[country];
    setForm((current) => ({
      ...current,
      country,
      currency: currency?.code ?? "",
      region: "",
      city: "",
      // Auto-prepend phone code if phone field is empty or only has a code
      phone: current.phone.replace(/^\+\d+\s*/, ""),
    }));
  };

  // Regions and cities for selected country
  const regions = useMemo(() => {
    if (!form.country) return {};
    return COUNTRIES[form.country] ?? {};
  }, [form.country]);

  const cities = useMemo(() => {
    if (!form.country || !form.region) return [];
    return regions[form.region] ?? [];
  }, [form.country, form.region, regions]);

  // Phone code for display
  const phoneCode = form.country ? PHONE_CODES[form.country] : null;
  const fullPhone = phoneCode && form.phone ? `${phoneCode.code} ${form.phone}` : form.phone;

  // Selected currency
  const selectedCurrency = form.country ? CURRENCY_MAP[form.country] : null;

  // Handle logo upload — reads as base64 data URL, extracts brand color
  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be 5 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      setLogoDataUrl(dataUrl);
      setLogoPreview(dataUrl);
      const color = await extractBrandColor(dataUrl);
      setExtractedColor(color);
      toast.success(`Logo uploaded! Detected brand color: ${color}`);
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoDataUrl("");
    setLogoPreview("");
    setExtractedColor("#2563eb");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveWorkspace = useMutation<
    { tenantId: string; created: boolean; token?: string },
    Error,
    void
  >({
    mutationFn: async () => {
      const result = (await register({ data: { ...form, phone: fullPhone, logoData: logoDataUrl, brandColor: extractedColor, brandFont } })) as {
        tenantId: string;
        created: boolean;
        token?: string;
      };
      return result;
    },
    onSuccess: (result) => {
      toast.success("Company workspace created");
      if (result?.token) {
        window.location.assign(
          `/session/callback?token=${encodeURIComponent(result.token)}&redirect=/dashboard`,
        );
      } else {
        navigate({ to: "/dashboard", replace: true });
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function signOut() {
    window.location.assign("/session/signout?redirect=" + encodeURIComponent("/auth?mode=signup"));
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="border-b border-border/60 bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link to="/">
            <Logo />
          </Link>
          <Button type="button" variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <section className="rounded-xl border border-border bg-card p-6 shadow-md sm:p-8">
          <div className="flex items-start gap-4">
            <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Company setup
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
                Create your company workspace
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                These details identify your organisation on recruitment campaigns and candidate
                applications.
              </p>
            </div>
          </div>

          <form
            className="mt-8 grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              saveWorkspace.mutate();
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              {/* Company name */}
              <Field label="Company name" htmlFor="companyName">
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={(event) => set("companyName")(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </Field>

              {/* Company logo — auto color extraction */}
              <Field label="Company logo" htmlFor="logo-upload">
                <input
                  ref={fileInputRef}
                  id="logo-upload"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                {logoPreview ? (
                  <div className="relative">
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                      <img
                        src={logoPreview}
                        alt="Company logo"
                        className="h-14 w-14 rounded-md object-contain border border-border"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">Logo uploaded</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Brand color:</span>
                          <span
                            className="inline-block h-4 w-4 rounded-full border border-border"
                            style={{ backgroundColor: extractedColor }}
                          />
                          <span className="font-mono text-xs">{extractedColor}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Font:</span>
                          <select
                            value={brandFont}
                            onChange={(e) => setBrandFont(e.target.value)}
                            className="rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                          >
                            {['Inter','Poppins','DM Sans','Space Grotesk','Lato','Open Sans','Nunito','Source Sans 3','Playfair Display'].map(f => (
                              <option key={f} value={f}>{f}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" onClick={removeLogo} className="shrink-0">
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/20 p-6 text-center hover:border-primary/50 hover:bg-secondary/40 transition-colors"
                  >
                    <Upload className="size-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Upload company logo</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        PNG, JPG, SVG or WebP. Max 5 MB. Brand color is auto-detected.
                      </p>
                    </div>
                  </button>
                )}
              </Field>

              {/* Brand preview */}
              {logoPreview && (
                <Field label="Brand preview" htmlFor="brand-preview">
                  <div
                    id="brand-preview"
                    className="rounded-lg border border-border p-4"
                    style={generateBrandTheme(extractedColor)}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <img src={logoPreview} alt="Logo" className="h-8 w-8 rounded object-contain" />
                      <span
                        className="text-base font-semibold"
                        style={{ color: extractedColor, fontFamily: brandFont }}
                      >
                        {form.companyName || "Company Name"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="rounded-md px-4 py-2 text-sm font-medium text-white"
                      style={{ backgroundColor: extractedColor, fontFamily: brandFont }}
                    >
                      Apply Now
                    </button>
                  </div>
                </Field>
              )}

              {/* Industry — searchable */}
              <Field label="Industry" htmlFor="industry">
                <Popover open={industryOpen} onOpenChange={setIndustryOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={industryOpen}
                      className="w-full justify-between font-normal"
                    >
                      {form.industry
                        ? FALLBACK_INDUSTRIES.find((i) => i.slug === form.industry)?.name
                        : "Search industries…"}
                      <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                    <Command>
                      <CommandInput placeholder="Search industries…" />
                      <CommandEmpty>No industry found.</CommandEmpty>
                      <CommandGroup className="max-h-64 overflow-auto">
                        {FALLBACK_INDUSTRIES.map((industry) => (
                          <CommandItem
                            key={industry.id}
                            value={industry.name}
                            onSelect={() => {
                              set("industry")(industry.slug);
                              setIndustryOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 size-4 ${
                                form.industry === industry.slug ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            {industry.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>

              {/* Country — dropdown */}
              <Field label="Country" htmlFor="country">
                <Select value={form.country} onValueChange={handleCountryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(COUNTRIES)
                      .sort()
                      .map((country) => (
                        <SelectItem key={country} value={country}>
                          <span className="flex items-center gap-2">
                            <Globe className="size-3.5 text-muted-foreground" />
                            {country}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* Currency — auto-selected */}
              {selectedCurrency && (
                <Field label="Currency" htmlFor="currency">
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted/50 px-3 text-sm">
                    <span className="font-medium">{selectedCurrency.symbol}</span>
                    <span className="ml-2 text-muted-foreground">{selectedCurrency.code}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      — {selectedCurrency.name}
                    </span>
                  </div>
                </Field>
              )}

              {/* Region — dropdown (dependent on country) */}
              {form.country && Object.keys(regions).length > 0 && (
                <Field label="Region / Province" htmlFor="region">
                  <Select value={form.region} onValueChange={(v) => setForm((c) => ({ ...c, region: v, city: "" }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.keys(regions).map((region) => (
                        <SelectItem key={region} value={region}>
                          {region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              {/* City — dropdown (dependent on region) */}
              {form.region && cities.length > 0 && (
                <Field label="City" htmlFor="city">
                  <Select value={form.city} onValueChange={set("city")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}

              {/* City — free text when no predefined cities */}
              {form.region && cities.length === 0 && (
                <Field label="City" htmlFor="city">
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(event) => set("city")(event.target.value)}
                    maxLength={80}
                    placeholder="Enter city name"
                  />
                </Field>
              )}

              {/* Company email */}
              <Field label="Company email" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) => set("email")(event.target.value)}
                  maxLength={255}
                  required
                />
              </Field>

              {/* Company phone — with auto-detected country code */}
              <Field label="Company phone" htmlFor="phone">
                <div className="flex">
                  {phoneCode && (
                    <div className="flex items-center rounded-l-md border border-r-0 border-input bg-muted/50 px-3 text-sm whitespace-nowrap">
                      <span className="mr-1.5">{phoneCode.flag}</span>
                      <span className="text-muted-foreground">{phoneCode.code}</span>
                    </div>
                  )}
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(event) => set("phone")(event.target.value)}
                    placeholder={phoneCode ? "7XX XXX XXX" : "+XX XXX XXX XXX"}
                    maxLength={40}
                    className={phoneCode ? "rounded-l-none" : ""}
                  />
                </div>
              </Field>

              {/* Website */}
              <Field label="Website" htmlFor="website">
                <Input
                  id="website"
                  type="url"
                  placeholder="https://example.com"
                  value={form.website}
                  onChange={(event) => set("website")(event.target.value)}
                  maxLength={255}
                />
              </Field>

              {/* Administrator name */}
              <Field label="Administrator name" htmlFor="fullName">
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(event) => set("fullName")(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </Field>
            </div>

            {/* Admin phone — with auto-detected country code */}
            <Field label="Administrator phone" htmlFor="adminPhone">
              <div className="flex">
                {phoneCode && (
                  <div className="flex items-center rounded-l-md border border-r-0 border-input bg-muted/50 px-3 text-sm whitespace-nowrap">
                    <span className="mr-1.5">{phoneCode.flag}</span>
                    <span className="text-muted-foreground">{phoneCode.code}</span>
                  </div>
                )}
                <Input
                  id="adminPhone"
                  type="tel"
                  value={form.adminPhone}
                  onChange={(event) => set("adminPhone")(event.target.value)}
                  placeholder={phoneCode ? "7XX XXX XXX" : "+XX XXX XXX XXX"}
                  maxLength={40}
                  className={phoneCode ? "rounded-l-none" : ""}
                />
              </div>
            </Field>

            <label className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-4">
              <Checkbox
                checked={form.autoPipelineEnabled}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    autoPipelineEnabled: Boolean(checked),
                  }))
                }
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium">
                  Automatically triage applications as they arrive
                </span>
                <span className="text-xs leading-5 text-muted-foreground">
                  Eligible applicants scoring 80+ are moved to Shortlisted, 60–79 to Manual
                  Review, and ineligible ones to Rejected. You can turn this off or adjust the
                  thresholds anytime in Settings.
                </span>
              </span>
            </label>
            <Button type="submit" size="lg" disabled={saveWorkspace.isPending}>
              {saveWorkspace.isPending ? "Creating workspace…" : "Create company workspace"}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

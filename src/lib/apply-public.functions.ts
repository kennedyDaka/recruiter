import { createServerFn } from "@tanstack/react-start";

/**
 * Fetches a public campaign by public_token or campaign ID.
 * Runs on the server to bypass RLS.
 */
export const getPublicCampaignFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const { z } = require("zod");
    return z.object({ token: z.string() }).parse(input);
  })
  .handler(async ({ data }) => {
    const { dbQueryFirst } = await import("@/lib/db");

    // Try public_token first, then fall back to id
    let campaign = await dbQueryFirst(
      `SELECT c.id, c.name, c.job_title, c.location, c.employment_type,
              c.job_description, c.responsibilities, c.required_skills,
              c.required_certifications, c.required_documents, c.min_qualification,
              c.min_experience_years, c.salary_min, c.salary_max, c.salary_currency,
              c.start_date, c.closing_date, c.referee_count, c.status, c.published_at,
              c.logo_data, c.brand_color, c.brand_font, c.company_name,
              t.name as tenant_name, t.logo_url as tenant_logo_url, t.settings as tenant_settings
       FROM campaigns c
       LEFT JOIN tenants t ON c.tenant_id = t.id
       WHERE c.public_token = $1 AND c.status IN ('active', 'closing_soon')`,
      [data.token],
    );

    if (!campaign) {
      campaign = await dbQueryFirst(
        `SELECT c.id, c.name, c.job_title, c.location, c.employment_type,
                c.job_description, c.responsibilities, c.required_skills,
                c.required_certifications, c.required_documents, c.min_qualification,
                c.min_experience_years, c.salary_min, c.salary_max, c.salary_currency,
                c.start_date, c.closing_date, c.referee_count, c.status, c.published_at,
                c.logo_data, c.brand_color, c.brand_font, c.company_name,
                t.name as tenant_name, t.logo_url as tenant_logo_url, t.settings as tenant_settings
         FROM campaigns c
         LEFT JOIN tenants t ON c.tenant_id = t.id
         WHERE c.id = $1 AND c.status IN ('active', 'closing_soon')`,
        [data.token],
      );
    }

    if (!campaign) return null;

    return {
      id: campaign.id,
      name: campaign.name,
      job_title: campaign.job_title,
      location: campaign.location,
      employment_type: campaign.employment_type,
      job_description: campaign.job_description,
      responsibilities: campaign.responsibilities,
      required_skills: campaign.required_skills,
      required_certifications: campaign.required_certifications,
      required_documents: campaign.required_documents,
      min_qualification: campaign.min_qualification,
      min_experience_years: campaign.min_experience_years,
      salary_min: campaign.salary_min,
      salary_max: campaign.salary_max,
      salary_currency: campaign.salary_currency,
      start_date: campaign.start_date,
      closing_date: campaign.closing_date,
      referee_count: campaign.referee_count,
      status: campaign.status,
      published_at: campaign.published_at,
      logo_data: campaign.logo_data,
      brand_color: campaign.brand_color,
      brand_font: campaign.brand_font,
      company_name: campaign.company_name,
      tenants: {
        name: campaign.tenant_name,
        logo_url: campaign.tenant_logo_url,
        settings: campaign.tenant_settings,
      },
    };
  });

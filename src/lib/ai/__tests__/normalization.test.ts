/**
 * Tests for the AI normalization layer.
 *
 * Covers:
 *   - GeminiCandidateOutput → CandidateScoringInput conversion
 *   - Vacancy normalization
 *   - Edge cases (empty data, missing fields, null values)
 */

import { describe, it, expect } from "vitest";
import {
  normalizeGeminiToScoringInput,
  normalizeGeminiVacancy,
  type GeminiCandidateOutput,
} from "../normalization";

describe("normalizeGeminiToScoringInput", () => {
  it("should map qualification names to standard forms", () => {
    const output: GeminiCandidateOutput = {
      education: [
        { qualification: "bachelor degree" },
        { qualification: "MSc Computer Science" },
        { qualification: "phd" },
      ],
    };

    const result = normalizeGeminiToScoringInput(output);

    expect(result.education).toHaveLength(3);
    const quals = (result.education ?? []).map((e) => e.qualification);
    expect(quals).toContain("Bachelor's Degree");
    expect(quals).toContain("Master's Degree");
    expect(quals).toContain("Doctorate");
  });

  it("should normalize dates to YYYY-MM format", () => {
    const output: GeminiCandidateOutput = {
      experience: [
        {
          position: "Engineer",
          start_date: "January 2020",
          end_date: "Dec 2023",
          is_current: false,
        },
      ],
    };

    const result = normalizeGeminiToScoringInput(output);

    expect(result.experienceEntries?.[0]?.startDate).toBe("2020-01");
    expect(result.experienceEntries?.[0]?.endDate).toBe("2023-12");
  });

  it("should calculate total experience years from dates", () => {
    const output: GeminiCandidateOutput = {
      experience: [
        {
          position: "Developer",
          start_date: "2020-01",
          end_date: "2023-01",
          is_current: false,
        },
      ],
    };

    const result = normalizeGeminiToScoringInput(output);

    expect(result.yearsExperience).toBeGreaterThanOrEqual(2);
    expect(result.yearsExperience).toBeLessThanOrEqual(4);
  });

  it("should handle empty input gracefully", () => {
    const output: GeminiCandidateOutput = {};

    const result = normalizeGeminiToScoringInput(output);

    expect(result.education).toEqual([]);
    expect(result.experienceEntries).toEqual([]);
    expect(result.skills).toEqual([]);
    expect(result.certifications).toEqual([]);
    expect(result.answers).toEqual({});
  });

  it("should filter out empty skills", () => {
    const output: GeminiCandidateOutput = {
      skills: ["JavaScript", "", "  ", "Python"],
    };

    const result = normalizeGeminiToScoringInput(output);

    expect(result.skills).toEqual(["javascript", "python"]);
  });

  it("should determine highest qualification correctly", () => {
    const output: GeminiCandidateOutput = {
      education: [
        { qualification: "Certificate" },
        { qualification: "Bachelor's Degree" },
        { qualification: "Diploma" },
      ],
    };

    const result = normalizeGeminiToScoringInput(output);

    expect(result.highestQualification).toBe("Bachelor's Degree");
  });

  it("should handle null/undefined values in experience", () => {
    const output: GeminiCandidateOutput = {
      experience: [
        {
          position: "Manager",
          is_current: true,
        },
      ],
    };

    const result = normalizeGeminiToScoringInput(output);

    expect(result.experienceEntries?.[0]?.title).toBe("Manager");
    expect(result.experienceEntries?.[0]?.isCurrent).toBe(true);
    // Should not have undefined in optional fields
    expect(result.experienceEntries?.[0]?.employer).toBeUndefined();
  });

  it("should extract fields of study from education", () => {
    const output: GeminiCandidateOutput = {
      education: [
        { qualification: "Bachelor's Degree", field_of_study: "Computer Science" },
        { qualification: "Master's Degree", field_of_study: "Mathematics" },
      ],
    };

    const result = normalizeGeminiToScoringInput(output);

    expect(result.fieldsOfStudy).toContain("Computer Science");
    expect(result.fieldsOfStudy).toContain("Mathematics");
  });

  it("should handle certifications", () => {
    const output: GeminiCandidateOutput = {
      certifications: ["  AWS Solutions Architect  ", "PMP"],
    };

    const result = normalizeGeminiToScoringInput(output);

    expect(result.certifications).toEqual(["AWS Solutions Architect", "PMP"]);
  });
});

describe("normalizeGeminiVacancy", () => {
  it("should map vacancy fields to ORS format", () => {
    const output = {
      job_title: "Software Engineer",
      department: "Engineering",
      location: "Lilongwe",
      employment_type: "full-time",
      job_description: "Build software",
      responsibilities: ["Code", "Test"],
      qualifications: ["BSc"],
      required_skills: ["JavaScript"],
      preferred_skills: ["React"],
    };

    const result = normalizeGeminiVacancy(output);

    expect(result["job_title"]).toBe("Software Engineer");
    expect(result["department"]).toBe("Engineering");
    expect(result["location"]).toBe("Lilongwe");
    expect(result["employment_type"]).toBe("full-time");
    expect(result["responsibilities"]).toEqual(["Code", "Test"]);
    expect(result["qualifications"]).toEqual(["BSc"]);
    expect(result["required_skills"]).toEqual(["JavaScript"]);
    expect(result["preferred_skills"]).toEqual(["React"]);
  });

  it("should handle empty input with defaults", () => {
    const result = normalizeGeminiVacancy({});

    expect(result["job_title"]).toBe("");
    expect(result["job_description"]).toBe("");
    expect(result["responsibilities"]).toEqual([]);
    expect(result["required_skills"]).toEqual([]);
  });

  it("should fall back to alternate field names", () => {
    const output = {
      title: "Developer",
      description: "Build things",
      type: "contract",
      skills: ["Python"],
    };

    const result = normalizeGeminiVacancy(output);

    expect(result["job_title"]).toBe("Developer");
    expect(result["job_description"]).toBe("Build things");
    expect(result["employment_type"]).toBe("contract");
    expect(result["required_skills"]).toEqual(["Python"]);
  });

  it("should handle nested array fields", () => {
    const output = {
      job_title: "Analyst",
      required_qualifications: ["MBA"],
      job_description: "Analyze data",
    };

    const result = normalizeGeminiVacancy(output);

    // qualifications should come from required_qualifications fallback
    expect(result["qualifications"]).toEqual(["MBA"]);
  });
});

/**
 * Unit tests for the ORS Scoring Engine — Relevance-Aware Eligibility.
 *
 * Covers the PRD scenarios:
 *   - Higher qualification but wrong field → NOT ELIGIBLE
 *   - Relevant experience vs total experience
 *   - Partial experience counting across multiple jobs
 *   - Edge cases: missing data, no requirements, preferred vs required
 */

import { describe, it, expect } from "vitest";
import { scoreApplicationV2 } from "../ors-scoring-v2";
import { classifyEducationRelevance } from "../field-relevance";
import type {
  CampaignScoringModel,
  CandidateScoringInput,
  RequirementGroup,
} from "../ors-requirements";

// ── Helper to build a Farm Manager scoring model ─────────────────────

function farmManagerModel(): CampaignScoringModel {
  return {
    requirementGroups: [
      {
        id: "edu_level",
        name: "Education Level",
        type: "education_level",
        state: "required",
        operator: "any",
        minMatch: 1,
        acceptedValues: ["Agriculture", "Farming", "Agricultural Science", "Farm Management"],
        minLevel: "Diploma",
      },
      {
        id: "edu_field",
        name: "Field of Study",
        type: "education_field",
        state: "required",
        operator: "any",
        minMatch: 1,
        acceptedValues: ["Agriculture", "Farming", "Agricultural Science", "Farm Management"],
      },
      {
        id: "exp_area",
        name: "Professional Experience",
        type: "experience_area",
        state: "required",
        operator: "any",
        minMatch: 1,
        acceptedValues: ["Farm Operations", "Agriculture", "Farming", "Crop Production"],
        minYears: 2,
      },
      {
        id: "skills_req",
        name: "Required Skills",
        type: "skill_required",
        state: "required",
        operator: "x_of",
        minMatch: 3,
        acceptedValues: [
          "Strong leadership and team supervision skills",
          "Understanding of orchard management",
          "Ability to manage irrigation systems",
          "Pest and disease management",
          "Farm infrastructure management",
          "Good record-keeping and reporting skills",
        ],
      },
      {
        id: "skills_pref",
        name: "Preferred Skills",
        type: "skill_preferred",
        state: "preferred",
        operator: "any",
        minMatch: 1,
        acceptedValues: ["Avocado production", "Horticulture", "Orchard management"],
      },
    ],
    weights: {
      education: 20,
      experience: 20,
      skills_required: 20,
      skills_preferred: 10,
      certifications: 5,
      industry: 10,
      location: 15,
    },
  };
}

// ── Candidate builders ───────────────────────────────────────────────

function accountantCandidate(): CandidateScoringInput {
  return {
    highestQualification: "Bachelor's Degree",
    fieldsOfStudy: ["Accounting"],
    yearsExperience: 8,
    experienceEntries: [
      {
        title: "Senior Accountant",
        field: "Accounting",
        years: 8,
        startDate: "2018-01-01",
        endDate: "",
        isCurrent: true,
      },
    ],
    skills: ["Good record-keeping and reporting skills"],
    certifications: [],
    country: "Malawi",
    industry: "Accounting",
  };
}

function farmerCandidate(): CandidateScoringInput {
  return {
    highestQualification: "Diploma",
    fieldsOfStudy: ["Agriculture"],
    yearsExperience: 5,
    experienceEntries: [
      {
        title: "Farm Supervisor",
        field: "Farm Operations",
        years: 3,
        startDate: "2021-01-01",
        endDate: "2024-01-01",
        isCurrent: false,
      },
      {
        title: "Agricultural Extension Officer",
        field: "Agriculture",
        years: 2,
        startDate: "2019-01-01",
        endDate: "2021-01-01",
        isCurrent: false,
      },
    ],
    skills: [
      "Strong leadership and team supervision skills",
      "Understanding of orchard management",
      "Ability to manage irrigation systems",
      "Pest and disease management",
      "Farm infrastructure management",
      "Good record-keeping and reporting skills",
    ],
    certifications: [],
    country: "Malawi",
    industry: "Agriculture",
  };
}

function mixedCandidate(): CandidateScoringInput {
  return {
    highestQualification: "Bachelor's Degree",
    fieldsOfStudy: ["Agricultural Science"],
    yearsExperience: 8,
    experienceEntries: [
      {
        title: "Accountant",
        field: "Accounting",
        years: 5,
        startDate: "2016-01-01",
        endDate: "2021-01-01",
        isCurrent: false,
      },
      {
        title: "Farm Manager",
        field: "Farm Operations",
        years: 3,
        startDate: "2021-01-01",
        endDate: "",
        isCurrent: true,
      },
    ],
    skills: [
      "Strong leadership and team supervision skills",
      "Understanding of orchard management",
      "Good record-keeping and reporting skills",
    ],
    certifications: [],
    country: "Malawi",
    industry: "Agriculture",
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("ORS Scoring Engine — Relevance-Aware Eligibility", () => {
  // ── PRD §4: Higher qualification but wrong field = NOT ELIGIBLE ──

  describe("PRD §4: Higher qualification but wrong field", () => {
    it("Accountant (Bachelor's in Accounting) applying for Farm Manager (Diploma in Agriculture) → not eligible", () => {
      const model = farmManagerModel();
      const candidate = accountantCandidate();
      const result = scoreApplicationV2(model, candidate);

      // The education_level gate FAILS because Accounting is unrelated to Agriculture
      // (PRD §4: higher qualification but wrong field = NOT ELIGIBLE)
      const eduLevelGate = result.eligibility.gates.find(
        (g) => g.name === "Education Level"
      );
      expect(eduLevelGate).toBeDefined();
      expect(eduLevelGate!.passed).toBe(false); // level met but field is wrong

      // The education_field gate should FAIL (wrong field)
      const eduFieldGate = result.eligibility.gates.find(
        (g) => g.name === "Field of Study"
      );
      expect(eduFieldGate).toBeDefined();
      expect(eduFieldGate!.passed).toBe(false); // Accounting ≠ Agriculture

      // Overall eligibility should be NOT ELIGIBLE
      expect(result.eligibility.eligible).toBe(false);
    });

    it("Accountant with Bachelor's scores higher education dimension but still not eligible overall", () => {
      const model = farmManagerModel();
      const candidate = accountantCandidate();
      const result = scoreApplicationV2(model, candidate);

      // Education dimension should score high (level met)
      const eduBreakdown = result.breakdown.find((d) => d.dimension === "education");
      expect(eduBreakdown).toBeDefined();
      expect(eduBreakdown!.score).toBeGreaterThan(0);

      // But overall eligibility is false
      expect(result.eligibility.eligible).toBe(false);
    });
  });

  // ── PRD §6: Total vs Relevant experience ──

  describe("PRD §6: Total vs Relevant experience", () => {
    it("Accountant with 8 years total but 0 relevant farming years → fails experience gate", () => {
      const model = farmManagerModel();
      const candidate = accountantCandidate();
      const result = scoreApplicationV2(model, candidate);

      const expGate = result.eligibility.gates.find(
        (g) => g.name === "Professional Experience"
      );
      expect(expGate).toBeDefined();
      expect(expGate!.passed).toBe(false); // 0 relevant years < 2 required
    });

    it("Farmer with 5 years total, all relevant → passes experience gate", () => {
      const model = farmManagerModel();
      const candidate = farmerCandidate();
      const result = scoreApplicationV2(model, candidate);

      const expGate = result.eligibility.gates.find(
        (g) => g.name === "Professional Experience"
      );
      expect(expGate).toBeDefined();
      expect(expGate!.passed).toBe(true); // 5 relevant years ≥ 2 required
    });
  });

  // ── PRD §9: Partial experience across multiple jobs ──

  describe("PRD §9: Partial experience across multiple jobs", () => {
    it("Mixed candidate (5yr accounting + 3yr farming) → passes experience gate with 3 relevant years", () => {
      const model = farmManagerModel();
      const candidate = mixedCandidate();
      const result = scoreApplicationV2(model, candidate);

      const expGate = result.eligibility.gates.find(
        (g) => g.name === "Professional Experience"
      );
      expect(expGate).toBeDefined();
      expect(expGate!.passed).toBe(true); // 3 relevant farming years ≥ 2 required
    });

    it("Mixed candidate with enough relevant experience is still eligible overall", () => {
      const model = farmManagerModel();
      const candidate = mixedCandidate();
      const result = scoreApplicationV2(model, candidate);

      // Mixed candidate has Agriculture field of study → field gate should pass
      const eduFieldGate = result.eligibility.gates.find(
        (g) => g.name === "Field of Study"
      );
      expect(eduFieldGate).toBeDefined();
      expect(eduFieldGate!.passed).toBe(true);

      // Overall should be eligible (meets education + experience)
      expect(result.eligibility.eligible).toBe(true);
    });
  });

  // ── PRD §8: Relevant experience categories ──

  describe("PRD §8: Relevant experience categories", () => {
    it("Farmer's experience in Farm Operations and Agriculture matches accepted values", () => {
      const model = farmManagerModel();
      const candidate = farmerCandidate();
      const result = scoreApplicationV2(model, candidate);

      const expGate = result.eligibility.gates.find(
        (g) => g.name === "Professional Experience"
      );
      expect(expGate).toBeDefined();
      expect(expGate!.passed).toBe(true);
      // Reason should mention relevant years
      expect(expGate!.reason).toMatch(/\d/); // contains a number
    });
  });

  // ── PRD §11: Missing or uncertain information ──

  describe("PRD §11: Missing or uncertain information", () => {
    it("Candidate with no experience data → does not crash", () => {
      const model = farmManagerModel();
      const candidate: CandidateScoringInput = {
        highestQualification: "Diploma",
        fieldsOfStudy: ["Agriculture"],
        yearsExperience: 0,
        experienceEntries: [],
        skills: [],
        certifications: [],
        country: "Malawi",
      };

      expect(() => scoreApplicationV2(model, candidate)).not.toThrow();
    });

    it("Candidate with no skills → skill gate fails gracefully", () => {
      const model = farmManagerModel();
      const candidate: CandidateScoringInput = {
        highestQualification: "Diploma",
        fieldsOfStudy: ["Agriculture"],
        yearsExperience: 5,
        experienceEntries: [
          { title: "Farm Manager", field: "Farm Operations", years: 5, startDate: "2019-01-01", endDate: "", isCurrent: true },
        ],
        skills: [],
        certifications: [],
        country: "Malawi",
      };

      const result = scoreApplicationV2(model, candidate);
      const skillGate = result.eligibility.gates.find(
        (g) => g.name === "Required Skills"
      );
      expect(skillGate).toBeDefined();
      expect(skillGate!.passed).toBe(false);
    });

    it("Empty candidate → no crash, returns valid structure", () => {
      const model = farmManagerModel();
      const candidate: CandidateScoringInput = {
        highestQualification: undefined as any,
        fieldsOfStudy: [],
        yearsExperience: 0,
        experienceEntries: [],
        skills: [],
        certifications: [],
        country: "",
      };

      expect(() => scoreApplicationV2(model, candidate)).not.toThrow();
      const result = scoreApplicationV2(model, candidate);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeLessThanOrEqual(100);
      expect(result.eligibility).toBeDefined();
      expect(Array.isArray(result.eligibility.gates)).toBe(true);
    });
  });

  // ── PRD §3: Eligibility vs Match Score ──

  describe("PRD §3: Eligibility vs Match Score separation", () => {
    it("Score can be non-zero even when not eligible", () => {
      const model = farmManagerModel();
      const candidate = accountantCandidate();
      const result = scoreApplicationV2(model, candidate);

      // Not eligible (wrong field)
      expect(result.eligibility.eligible).toBe(false);

      // But score is non-zero (education level met, some skills)
      expect(result.total).toBeGreaterThan(0);
    });

    it("Farmer candidate is eligible AND has high score", () => {
      const model = farmManagerModel();
      const candidate = farmerCandidate();
      const result = scoreApplicationV2(model, candidate);

      expect(result.eligibility.eligible).toBe(true);
      expect(result.total).toBeGreaterThan(50);
    });
  });

  // ── Recommendation labels ──

  describe("Recommendation labels", () => {
    it("Accountant gets a low recommendation", () => {
      const model = farmManagerModel();
      const candidate = accountantCandidate();
      const result = scoreApplicationV2(model, candidate);

      expect(result.recommendation).toBeDefined();
      // Low score should not be "Excellent Match" or "Strong Match"
      expect(["Excellent Match", "Strong Match"]).not.toContain(result.recommendation);
    });

    it("Farmer gets a higher recommendation", () => {
      const model = farmManagerModel();
      const candidate = farmerCandidate();
      const result = scoreApplicationV2(model, candidate);

      expect(result.recommendation).toBeDefined();
      expect(result.total).toBeGreaterThan(50);
    });
  });

  // ── Score reasons (evidence) ──

  describe("Score reasons (evidence)", () => {
    it("Accountant has reasons explaining the low score", () => {
      const model = farmManagerModel();
      const candidate = accountantCandidate();
      const result = scoreApplicationV2(model, candidate);

      expect(result.reasons).toBeDefined();
      expect(result.reasons.length).toBeGreaterThan(0);
      // Should mention skills gap
      const reasonsText = result.reasons.join(" ");
      expect(reasonsText).toMatch(/skill|Skill/);
    });

    it("Farmer has positive reasons for the high score", () => {
      const model = farmManagerModel();
      const candidate = farmerCandidate();
      const result = scoreApplicationV2(model, candidate);

      expect(result.reasons).toBeDefined();
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// FIELD RELEVANCE TAXONOMY TESTS
// ═══════════════════════════════════════════════════════════════════════

describe("Field Relevance Taxonomy", () => {
  it("Accounting is unrelated to Agriculture", () => {
    const result = classifyEducationRelevance(
      ["Accounting"],
      ["Agriculture", "Farming"]
    );
    expect(result.relevance).toBe("unrelated");
    expect(result.score).toBeLessThan(0.3);
  });

  it("Agricultural Science is very related to Agriculture", () => {
    const result = classifyEducationRelevance(
      ["Agricultural Science"],
      ["Agriculture", "Farming"]
    );
    expect(["exact", "very_related", "related"]).toContain(result.relevance);
    expect(result.score).toBeGreaterThan(0.5);
  });

  it("Farm Management is related to Agriculture", () => {
    const result = classifyEducationRelevance(
      ["Farm Management"],
      ["Agriculture", "Crop Production"]
    );
    expect(["exact", "very_related", "related"]).toContain(result.relevance);
  });

  it("Nursing is unrelated to Agriculture", () => {
    const result = classifyEducationRelevance(
      ["Nursing"],
      ["Agriculture", "Farming"]
    );
    expect(result.relevance).toBe("unrelated");
  });

  it("Empty candidate fields → unknown", () => {
    const result = classifyEducationRelevance(
      [],
      ["Agriculture"]
    );
    expect(result.relevance).toBe("unknown");
  });

  it("Empty required fields → unknown", () => {
    const result = classifyEducationRelevance(
      ["Accounting"],
      []
    );
    expect(result.relevance).toBe("unknown");
  });
});

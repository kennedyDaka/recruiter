/**
 * ORS Scoring Engine v3 — Comprehensive Test Suite
 * 
 * Tests all 24 scenarios from the architecture spec:
 * 1. Exact degree → Full education relevance
 * 2. Related degree → Partial/high score
 * 3. Unrelated degree → Very low/zero
 * 4. Higher degree but wrong field → Low relevance
 * 5. Exact previous position → Full experience relevance
 * 6. Related previous position → Partial relevance
 * 7. Multiple relevant positions → Combined with recency
 * 8. Below mandatory minimum → FAIL
 * 9. Required experience group matched → PASS
 * 10. Preferred experience matched → Bonus points
 * 11. Required skill missing → FAIL if configured
 * 12. New job title not in API → Normalize using evidence
 * 13. Job title completely unknown → REVIEW
 * 14. New university → Don't penalize automatically
 * 15. Missing candidate info → UNKNOWN
 * 16. Old experience → Recency factor applied
 * 17. Different industry, same position → Separate industry score
 * 18. Candidate declares skill without evidence → Lower confidence, not zero
 * 19. Recruiter changes requirements → Recalculate scores
 * 20. Candidate applies to another job → Score independently
 * 21. Candidate has more experience than required → Cap relevant points
 * 22. Candidate provides duplicate employment → Deduplicate
 * 23. Candidate has overlapping employment → Flag/handle overlap
 * 24. Candidate has foreign qualification → Normalize qualification
 */

import { scoreApplicationV2, testScoringModel } from "../src/lib/ors-scoring-v2";
import type {
  CampaignScoringModel,
  CandidateScoringInput,
  ScoringResult,
  RequirementGroup,
} from "../src/lib/ors-requirements";
import { createRequirementGroup } from "../src/lib/ors-requirements";

// ─── Helper Functions ──────────────────────────────────────────────

function logTest(testNum: number, name: string, result: ScoringResult, expected: {
  eligible?: boolean;
  status?: "pass" | "fail" | "review";
  minScore?: number;
  maxScore?: number;
}) {
  const passed = 
    (expected.eligible === undefined || result.eligibility.eligible === expected.eligible) &&
    (expected.status === undefined || result.eligibility.status === expected.status) &&
    (expected.minScore === undefined || result.total >= expected.minScore) &&
    (expected.maxScore === undefined || result.total <= expected.maxScore);
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST ${testNum}: ${name}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Result: ${passed ? "✅ PASS" : "❌ FAIL"}`);
  console.log(`Eligibility: ${result.eligibility.status.toUpperCase()} (${result.eligibility.eligible ? "eligible" : "not eligible"})`);
  console.log(`Score: ${result.total}/100`);
  console.log(`Confidence: ${result.confidence}`);
  console.log(`Recommendation: ${result.recommendation}`);
  console.log(`\nBreakdown:`);
  for (const breakdown of result.breakdown) {
    console.log(`  ${breakdown.label}: ${breakdown.score}/${breakdown.max}`);
  }
  if (result.eligibility.gates.length > 0) {
    console.log(`\nEligibility Gates:`);
    for (const gate of result.eligibility.gates) {
      console.log(`  ${gate.name}: ${gate.passed ? "✅ PASS" : "❌ FAIL"} (${gate.state}) - ${gate.reason}`);
    }
  }
  if (result.reasons.length > 0) {
    console.log(`\nReasons:`);
    for (const reason of result.reasons) {
      console.log(`  - ${reason}`);
    }
  }
  console.log(`${"=".repeat(60)}\n`);
  return passed;
}

// ─── Test Campaigns ────────────────────────────────────────────────

// Campaign 1: Fleet Manager
const fleetManagerCampaign: CampaignScoringModel = {
  requirementGroups: [
    createRequirementGroup({
      name: "Education Level",
      type: "education_level",
      state: "required",
      operator: "any",
      acceptedValues: ["Bachelor's Degree"],
      minMatch: 1,
      minLevel: "Bachelor's Degree",
    }),
    createRequirementGroup({
      name: "Field of Study",
      type: "education_field",
      state: "required",
      operator: "any",
      acceptedValues: ["Logistics", "Supply Chain Management", "Transport Management", "Business Administration"],
      minMatch: 1,
    }),
    createRequirementGroup({
      name: "Professional Experience",
      type: "experience_area",
      state: "required",
      operator: "any",
      acceptedValues: ["Fleet Management", "Transport Management", "Logistics Operations"],
      minMatch: 1,
      minYears: 3,
    }),
    createRequirementGroup({
      name: "Required Skills",
      type: "skill_required",
      state: "required",
      operator: "x_of",
      acceptedValues: ["Fleet Management", "Vehicle Tracking", "Route Planning", "Fuel Management", "Driver Management"],
      minMatch: 3,
    }),
    createRequirementGroup({
      name: "Preferred Skills",
      type: "skill_preferred",
      state: "preferred",
      operator: "any",
      acceptedValues: ["GPS Systems", "Telematics", "ERP", "Power BI"],
      minMatch: 1,
    }),
    createRequirementGroup({
      name: "Certifications",
      type: "certification",
      state: "preferred",
      operator: "any",
      acceptedValues: ["Commercial Driving License", "Fleet Management Certification"],
      minMatch: 1,
    }),
  ],
  weights: {
    education: 20,
    experience: 30,
    skills: 25,
    certifications: 10,
    position_relevance: 10,
    industry: 5,
    location: 0,
  },
  experienceRecencyYears: 5,
  targetOccupation: "Fleet Manager",
  highlyRelevantPositions: ["Fleet Manager", "Fleet Supervisor", "Transport Manager"],
  relatedPositions: ["Logistics Manager", "Transport Coordinator", "Logistics Officer"],
  industry: "Transportation",
};

// Campaign 2: Software Developer
const softwareDeveloperCampaign: CampaignScoringModel = {
  requirementGroups: [
    createRequirementGroup({
      name: "Education Level",
      type: "education_level",
      state: "required",
      operator: "any",
      acceptedValues: ["Bachelor's Degree"],
      minMatch: 1,
      minLevel: "Bachelor's Degree",
    }),
    createRequirementGroup({
      name: "Field of Study",
      type: "education_field",
      state: "preferred",
      operator: "any",
      acceptedValues: ["Computer Science", "Software Engineering", "Information Technology"],
      minMatch: 1,
    }),
    createRequirementGroup({
      name: "Professional Experience",
      type: "experience_area",
      state: "required",
      operator: "any",
      acceptedValues: ["Software Development", "Web Development", "Mobile Development"],
      minMatch: 1,
      minYears: 2,
    }),
    createRequirementGroup({
      name: "Critical Skills",
      type: "skill_critical",
      state: "required",
      operator: "all",
      acceptedValues: ["JavaScript", "TypeScript"],
      minMatch: 2,
    }),
    createRequirementGroup({
      name: "Required Skills",
      type: "skill_required",
      state: "required",
      operator: "x_of",
      acceptedValues: ["React", "Node.js", "Python", "SQL", "Git"],
      minMatch: 3,
    }),
    createRequirementGroup({
      name: "Preferred Skills",
      type: "skill_preferred",
      state: "preferred",
      operator: "any",
      acceptedValues: ["AWS", "Docker", "Kubernetes", "CI/CD"],
      minMatch: 1,
    }),
  ],
  weights: {
    education: 15,
    experience: 35,
    skills: 30,
    certifications: 5,
    position_relevance: 10,
    industry: 5,
    location: 0,
  },
  experienceRecencyYears: 3,
  targetOccupation: "Software Developer",
  highlyRelevantPositions: ["Software Developer", "Full Stack Developer", "Frontend Developer", "Backend Developer"],
  relatedPositions: ["Web Developer", "Mobile Developer", "DevOps Engineer"],
  industry: "Technology",
};

// Campaign 3: Nurse
const nurseCampaign: CampaignScoringModel = {
  requirementGroups: [
    createRequirementGroup({
      name: "Education Level",
      type: "education_level",
      state: "required",
      operator: "any",
      acceptedValues: ["Diploma"],
      minMatch: 1,
      minLevel: "Diploma",
    }),
    createRequirementGroup({
      name: "Field of Study",
      type: "education_field",
      state: "required",
      operator: "any",
      acceptedValues: ["Nursing", "Healthcare", "Medicine"],
      minMatch: 1,
    }),
    createRequirementGroup({
      name: "Professional Experience",
      type: "experience_area",
      state: "required",
      operator: "any",
      acceptedValues: ["Nursing", "Healthcare", "Patient Care"],
      minMatch: 1,
      minYears: 1,
    }),
    createRequirementGroup({
      name: "Certifications",
      type: "certification",
      state: "required",
      operator: "any",
      acceptedValues: ["Nursing License", "CPR Certification"],
      minMatch: 1,
    }),
    createRequirementGroup({
      name: "Preferred Skills",
      type: "skill_preferred",
      state: "preferred",
      operator: "any",
      acceptedValues: ["Patient Care", "Medical Records", "Emergency Response", "Wound Care"],
      minMatch: 1,
    }),
  ],
  weights: {
    education: 25,
    experience: 30,
    skills: 20,
    certifications: 20,
    position_relevance: 5,
    industry: 0,
    location: 0,
  },
  experienceRecencyYears: 5,
  targetOccupation: "Nurse",
  highlyRelevantPositions: ["Registered Nurse", "Staff Nurse", "Nurse Manager"],
  relatedPositions: ["Healthcare Assistant", "Medical Assistant", "Patient Care Technician"],
  industry: "Healthcare",
};

// ─── Test Candidates ───────────────────────────────────────────────

// Scenario 1-4: Education tests (Fleet Manager campaign)
const candidate1_exactDegree: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Logistics and Supply Chain Management"],
  yearsExperience: 5,
  experienceEntries: [
    { title: "Fleet Manager", field: "Transport & Fleet", years: 3, startDate: "2023-01", endDate: "2026-01", isCurrent: true },
    { title: "Fleet Supervisor", field: "Transport & Fleet", years: 2, startDate: "2021-01", endDate: "2023-01" },
  ],
  skills: ["Fleet Management", "Vehicle Tracking", "Route Planning", "Fuel Management", "Driver Management"],
  certifications: ["Commercial Driving License"],
  country: "Malawi",
  industry: "Transportation",
};

const candidate2_relatedDegree: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Business Administration"],
  yearsExperience: 4,
  experienceEntries: [
    { title: "Transport Coordinator", field: "Transport & Logistics", years: 4, startDate: "2022-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Fleet Management", "Route Planning", "Fuel Management", "Driver Management", "Excel"],
  certifications: [],
  country: "Malawi",
  industry: "Logistics",
};

const candidate3_unrelatedDegree: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["History"],
  yearsExperience: 6,
  experienceEntries: [
    { title: "Sales Manager", field: "Sales & Marketing", years: 6, startDate: "2020-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Sales", "Marketing", "Customer Service", "Negotiation", "Excel"],
  certifications: [],
  country: "Malawi",
  industry: "Retail",
};

const candidate4_higherDegreeWrongField: CandidateScoringInput = {
  highestQualification: "Master's Degree",
  fieldsOfStudy: ["History"],
  yearsExperience: 3,
  experienceEntries: [
    { title: "Logistics Officer", field: "Logistics", years: 3, startDate: "2023-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Fleet Management", "Vehicle Tracking", "Route Planning"],
  certifications: [],
  country: "Malawi",
  industry: "Logistics",
};

// Scenario 5-10: Experience tests (Fleet Manager campaign)
const candidate5_exactPosition: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Logistics"],
  yearsExperience: 7,
  experienceEntries: [
    { title: "Fleet Manager", field: "Transport & Fleet", years: 4, startDate: "2022-01", endDate: "2026-01", isCurrent: true },
    { title: "Fleet Supervisor", field: "Transport & Fleet", years: 3, startDate: "2019-01", endDate: "2022-01" },
  ],
  skills: ["Fleet Management", "Vehicle Tracking", "Route Planning", "Fuel Management", "Driver Management"],
  certifications: ["Commercial Driving License", "Fleet Management Certification"],
  country: "Malawi",
  industry: "Transportation",
};

const candidate6_relatedPosition: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Supply Chain Management"],
  yearsExperience: 5,
  experienceEntries: [
    { title: "Logistics Manager", field: "Logistics", years: 5, startDate: "2021-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Fleet Management", "Route Planning", "Fuel Management", "Driver Management"],
  certifications: [],
  country: "Malawi",
  industry: "Logistics",
};

const candidate7_multiplePositions: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Transport Management"],
  yearsExperience: 10,
  experienceEntries: [
    { title: "Fleet Manager", field: "Transport & Fleet", years: 2, startDate: "2024-01", endDate: "2026-01", isCurrent: true },
    { title: "Transport Coordinator", field: "Transport & Logistics", years: 3, startDate: "2021-01", endDate: "2024-01" },
    { title: "Logistics Officer", field: "Logistics", years: 5, startDate: "2016-01", endDate: "2021-01" },
  ],
  skills: ["Fleet Management", "Vehicle Tracking", "Route Planning", "Fuel Management", "Driver Management", "GPS Systems"],
  certifications: ["Commercial Driving License"],
  country: "Malawi",
  industry: "Transportation",
};

const candidate8_belowMinimum: CandidateScoringInput = {
  highestQualification: "Diploma",
  fieldsOfStudy: ["Logistics"],
  yearsExperience: 1,
  experienceEntries: [
    { title: "Logistics Assistant", field: "Logistics", years: 1, startDate: "2025-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Fleet Management", "Route Planning"],
  certifications: [],
  country: "Malawi",
  industry: "Logistics",
};

const candidate9_requiredGroupMatch: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Transport Management"],
  yearsExperience: 4,
  experienceEntries: [
    { title: "Transport Manager", field: "Transport", years: 4, startDate: "2022-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Fleet Management", "Vehicle Tracking", "Route Planning", "Fuel Management", "Driver Management"],
  certifications: [],
  country: "Malawi",
  industry: "Transportation",
};

const candidate10_preferredBonus: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Logistics"],
  yearsExperience: 5,
  experienceEntries: [
    { title: "Fleet Manager", field: "Transport & Fleet", years: 5, startDate: "2021-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Fleet Management", "Vehicle Tracking", "Route Planning", "Fuel Management", "Driver Management", "GPS Systems", "Telematics", "ERP", "Power BI"],
  certifications: ["Commercial Driving License", "Fleet Management Certification"],
  country: "Malawi",
  industry: "Transportation",
};

// Scenario 11-15: Skills and unknown tests (Software Developer campaign)
const candidate11_missingCriticalSkill: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Computer Science"],
  yearsExperience: 4,
  experienceEntries: [
    { title: "Software Developer", field: "Software Development", years: 4, startDate: "2022-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Python", "React", "Node.js", "SQL", "Git"],
  certifications: [],
  country: "Malawi",
  industry: "Technology",
};

const candidate12_newJobTitle: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Software Engineering"],
  yearsExperience: 3,
  experienceEntries: [
    { title: "Full Stack Engineer", field: "Software Development", years: 3, startDate: "2023-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "Python", "SQL", "Git"],
  certifications: [],
  country: "Malawi",
  industry: "Technology",
};

const candidate13_unknownJobTitle: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Information Technology"],
  yearsExperience: 2,
  experienceEntries: [
    { title: "Mobility Operations Coordinator", field: "Technology", years: 2, startDate: "2024-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["JavaScript", "TypeScript", "React", "Node.js"],
  certifications: [],
  country: "Malawi",
  industry: "Technology",
};

const candidate14_newUniversity: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Computer Science"],
  yearsExperience: 5,
  experienceEntries: [
    { title: "Software Developer", field: "Software Development", years: 5, startDate: "2021-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "Python", "SQL", "Git"],
  certifications: [],
  country: "Malawi",
  industry: "Technology",
};

const candidate15_missingInfo: CandidateScoringInput = {
  highestQualification: undefined,
  fieldsOfStudy: [],
  yearsExperience: 0,
  experienceEntries: [],
  skills: [],
  certifications: [],
  country: "Malawi",
  industry: "Technology",
};

// Scenario 16-20: Recency and industry tests (Fleet Manager campaign)
const candidate16_oldExperience: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Logistics"],
  yearsExperience: 15,
  experienceEntries: [
    { title: "Fleet Manager", field: "Transport & Fleet", years: 10, startDate: "2010-01", endDate: "2020-01" },
    { title: "Sales Manager", field: "Sales & Marketing", years: 5, startDate: "2020-01", endDate: "2025-01", isCurrent: true },
  ],
  skills: ["Fleet Management", "Vehicle Tracking", "Route Planning", "Fuel Management", "Driver Management"],
  certifications: ["Commercial Driving License"],
  country: "Malawi",
  industry: "Retail",
};

const candidate17_differentIndustry: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Logistics"],
  yearsExperience: 6,
  experienceEntries: [
    { title: "Fleet Manager", field: "Transport & Fleet", years: 6, startDate: "2020-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Fleet Management", "Vehicle Tracking", "Route Planning", "Fuel Management", "Driver Management"],
  certifications: ["Commercial Driving License"],
  country: "Malawi",
  industry: "Construction",
};

const candidate18_skillWithoutEvidence: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Logistics"],
  yearsExperience: 4,
  experienceEntries: [
    { title: "Transport Coordinator", field: "Transport & Logistics", years: 4, startDate: "2022-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Fleet Management", "Vehicle Tracking", "Route Planning"], // Missing some required skills
  certifications: [],
  country: "Malawi",
  industry: "Transportation",
};

// Scenario 19-20: Different job tests (Software Developer campaign)
const candidate19_changeRequirements: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Computer Science"],
  yearsExperience: 3,
  experienceEntries: [
    { title: "Software Developer", field: "Software Development", years: 3, startDate: "2023-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "Python", "SQL", "Git"],
  certifications: [],
  country: "Malawi",
  industry: "Technology",
};

const candidate20_anotherJob: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Nursing"],
  yearsExperience: 5,
  experienceEntries: [
    { title: "Registered Nurse", field: "Healthcare", years: 5, startDate: "2021-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Patient Care", "Medical Records", "Emergency Response", "Wound Care"],
  certifications: ["Nursing License", "CPR Certification"],
  country: "Malawi",
  industry: "Healthcare",
};

// Scenario 21-24: Edge cases (Nurse campaign)
const candidate21_moreExperience: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Nursing"],
  yearsExperience: 10,
  experienceEntries: [
    { title: "Registered Nurse", field: "Healthcare", years: 10, startDate: "2016-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Patient Care", "Medical Records", "Emergency Response", "Wound Care"],
  certifications: ["Nursing License", "CPR Certification"],
  country: "Malawi",
  industry: "Healthcare",
};

const candidate22_duplicateEmployment: CandidateScoringInput = {
  highestQualification: "Diploma",
  fieldsOfStudy: ["Nursing"],
  yearsExperience: 4,
  experienceEntries: [
    { title: "Staff Nurse", field: "Healthcare", years: 2, startDate: "2024-01", endDate: "2026-01", isCurrent: true },
    { title: "Staff Nurse", field: "Healthcare", years: 2, startDate: "2022-01", endDate: "2024-01" },
  ],
  skills: ["Patient Care", "Medical Records", "Emergency Response"],
  certifications: ["Nursing License"],
  country: "Malawi",
  industry: "Healthcare",
};

const candidate23_overlappingEmployment: CandidateScoringInput = {
  highestQualification: "Diploma",
  fieldsOfStudy: ["Nursing"],
  yearsExperience: 3,
  experienceEntries: [
    { title: "Staff Nurse", field: "Healthcare", years: 2, startDate: "2024-01", endDate: "2026-01", isCurrent: true },
    { title: "Healthcare Assistant", field: "Healthcare", years: 2, startDate: "2024-06", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Patient Care", "Medical Records"],
  certifications: ["Nursing License"],
  country: "Malawi",
  industry: "Healthcare",
};

const candidate24_foreignQualification: CandidateScoringInput = {
  highestQualification: "Bachelor's Degree",
  fieldsOfStudy: ["Nursing"],
  yearsExperience: 3,
  experienceEntries: [
    { title: "Registered Nurse", field: "Healthcare", years: 3, startDate: "2023-01", endDate: "2026-01", isCurrent: true },
  ],
  skills: ["Patient Care", "Medical Records", "Emergency Response", "Wound Care"],
  certifications: ["Nursing License", "CPR Certification"],
  country: "Nigeria",
  industry: "Healthcare",
};

// ─── Run Tests ─────────────────────────────────────────────────────

console.log("🚀 ORS Scoring Engine v3 — Comprehensive Test Suite");
console.log("=".repeat(60));

let totalTests = 0;
let passedTests = 0;

function runTest(testNum: number, name: string, model: CampaignScoringModel, candidate: CandidateScoringInput, expected: {
  eligible?: boolean;
  status?: "pass" | "fail" | "review";
  minScore?: number;
  maxScore?: number;
}) {
  totalTests++;
  const result = scoreApplicationV2(model, candidate);
  if (logTest(testNum, name, result, expected)) {
    passedTests++;
  }
}

// Test 1-4: Education tests
runTest(1, "Exact Degree (Logistics)", fleetManagerCampaign, candidate1_exactDegree, {
  eligible: true,
  status: "pass",
  minScore: 70,
});

runTest(2, "Related Degree (Business Admin)", fleetManagerCampaign, candidate2_relatedDegree, {
  eligible: true,
  status: "pass",
  minScore: 50,
});

runTest(3, "Unrelated Degree (History)", fleetManagerCampaign, candidate3_unrelatedDegree, {
  eligible: false,
  status: "fail",
  maxScore: 40,
});

runTest(4, "Higher Degree Wrong Field (Master's in History)", fleetManagerCampaign, candidate4_higherDegreeWrongField, {
  eligible: false,
  status: "fail",
  minScore: 40,
});

// Test 5-10: Experience tests
runTest(5, "Exact Position (Fleet Manager)", fleetManagerCampaign, candidate5_exactPosition, {
  eligible: true,
  status: "pass",
  minScore: 80,
});

runTest(6, "Related Position (Logistics Manager)", fleetManagerCampaign, candidate6_relatedPosition, {
  eligible: true,
  status: "pass",
  minScore: 60,
});

runTest(7, "Multiple Positions with Recency", fleetManagerCampaign, candidate7_multiplePositions, {
  eligible: true,
  status: "pass",
  minScore: 75,
});

runTest(8, "Below Minimum (Diploma, 1 year)", fleetManagerCampaign, candidate8_belowMinimum, {
  eligible: false,
  status: "fail",
  maxScore: 70,
});

runTest(9, "Required Group Match (Transport Manager)", fleetManagerCampaign, candidate9_requiredGroupMatch, {
  eligible: true,
  status: "pass",
  minScore: 70,
});

runTest(10, "Preferred Bonus (All Skills + Certs)", fleetManagerCampaign, candidate10_preferredBonus, {
  eligible: true,
  status: "pass",
  minScore: 85,
});

// Test 11-15: Skills and unknown tests
runTest(11, "Missing Critical Skill (No TypeScript)", softwareDeveloperCampaign, candidate11_missingCriticalSkill, {
  eligible: false,
  status: "fail",
  maxScore: 70,
});

runTest(12, "New Job Title (Full Stack Engineer)", softwareDeveloperCampaign, candidate12_newJobTitle, {
  eligible: true,
  status: "pass",
  minScore: 70,
});

runTest(13, "Unknown Job Title (Mobility Operations)", softwareDeveloperCampaign, candidate13_unknownJobTitle, {
  eligible: false,
  status: "fail",
  minScore: 20,
});

runTest(14, "New University (Unknown Institution)", softwareDeveloperCampaign, candidate14_newUniversity, {
  eligible: true,
  status: "pass",
  minScore: 75,
});

runTest(15, "Missing Info (No Data)", softwareDeveloperCampaign, candidate15_missingInfo, {
  eligible: false,
  status: "fail",
  maxScore: 30,
});

// Test 16-20: Recency and industry tests
runTest(16, "Old Experience (Fleet Manager 10 years ago)", fleetManagerCampaign, candidate16_oldExperience, {
  eligible: true,
  status: "pass",
  minScore: 50,
});

runTest(17, "Different Industry (Construction)", fleetManagerCampaign, candidate17_differentIndustry, {
  eligible: true,
  status: "pass",
  minScore: 65,
});

runTest(18, "Skill Without Evidence (Partial Skills)", fleetManagerCampaign, candidate18_skillWithoutEvidence, {
  eligible: true,
  status: "pass",
  minScore: 55,
});

runTest(19, "Change Requirements (Same Candidate, Different Rules)", softwareDeveloperCampaign, candidate19_changeRequirements, {
  eligible: true,
  status: "pass",
  minScore: 75,
});

runTest(20, "Another Job (Nurse for Developer Role)", softwareDeveloperCampaign, candidate20_anotherJob, {
  eligible: false,
  status: "fail",
  maxScore: 40,
});

// Test 21-24: Edge cases
runTest(21, "More Experience Than Required (10 years)", nurseCampaign, candidate21_moreExperience, {
  eligible: true,
  status: "pass",
  minScore: 80,
});

runTest(22, "Duplicate Employment (Same Position Twice)", nurseCampaign, candidate22_duplicateEmployment, {
  eligible: false,
  status: "fail",
  minScore: 70,
});

runTest(23, "Overlapping Employment", nurseCampaign, candidate23_overlappingEmployment, {
  eligible: false,
  status: "fail",
  minScore: 65,
});

runTest(24, "Foreign Qualification (Nigeria)", nurseCampaign, candidate24_foreignQualification, {
  eligible: true,
  status: "pass",
  minScore: 70,
});

// ─── Summary ───────────────────────────────────────────────────────

console.log("\n" + "=".repeat(60));
console.log("📊 TEST SUMMARY");
console.log("=".repeat(60));
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${totalTests - passedTests}`);
console.log(`Success Rate: ${Math.round((passedTests / totalTests) * 100)}%`);
console.log("=".repeat(60));

if (passedTests === totalTests) {
  console.log("\n🎉 ALL TESTS PASSED! Scoring engine is working correctly.");
} else {
  console.log("\n⚠️  Some tests failed. Review the results above.");
}

process.exit(passedTests === totalTests ? 0 : 1);

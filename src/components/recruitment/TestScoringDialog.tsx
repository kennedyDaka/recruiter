/**
 * TestScoringDialog — lets recruiters test their scoring rules with
 * hypothetical candidates before publishing the campaign.
 *
 * The recruiter enters a hypothetical candidate's profile and sees
 * the eligibility + score result instantly. This validates the scoring
 * rules without any real candidates.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Beaker, Plus, X, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { scoreApplicationV2, type ScoringResult } from "@/lib/ors-scoring-v2";
import type {
  CampaignScoringModel,
  CandidateScoringInput,
  RequirementGroup,
} from "@/lib/ors-requirements";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: CampaignScoringModel;
};

export function TestScoringDialog({ open, onOpenChange, model }: Props) {
  const [candidate, setCandidate] = useState<CandidateScoringInput>({
    highestQualification: "",
    fieldsOfStudy: [],
    yearsExperience: 0,
    experienceEntries: [],
    skills: [],
    certifications: [],
    country: "",
    industry: "",
  });

  const [newSkill, setNewSkill] = useState("");
  const [newField, setNewField] = useState("");
  const [newCert, setNewCert] = useState("");
  const [result, setResult] = useState<ScoringResult | null>(null);

  const handleTest = () => {
    const scored = scoreApplicationV2(model, candidate);
    setResult(scored);
  };

  const addSkill = () => {
    if (newSkill.trim()) {
      setCandidate((prev) => ({
        ...prev,
        skills: [...(prev.skills || []), newSkill.trim()],
      }));
      setNewSkill("");
    }
  };

  const removeSkill = (skill: string) => {
    setCandidate((prev) => ({
      ...prev,
      skills: (prev.skills || []).filter((s) => s !== skill),
    }));
  };

  const addField = () => {
    if (newField.trim()) {
      setCandidate((prev) => ({
        ...prev,
        fieldsOfStudy: [...(prev.fieldsOfStudy || []), newField.trim()],
      }));
      setNewField("");
    }
  };

  const removeField = (field: string) => {
    setCandidate((prev) => ({
      ...prev,
      fieldsOfStudy: (prev.fieldsOfStudy || []).filter((f) => f !== field),
    }));
  };

  const addCert = () => {
    if (newCert.trim()) {
      setCandidate((prev) => ({
        ...prev,
        certifications: [...(prev.certifications || []), newCert.trim()],
      }));
      setNewCert("");
    }
  };

  const removeCert = (cert: string) => {
    setCandidate((prev) => ({
      ...prev,
      certifications: (prev.certifications || []).filter((c) => c !== cert),
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beaker className="size-5" />
            Test Scoring Rules
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Enter a hypothetical candidate's profile to test your scoring rules.
          The candidate never sees this — it's for you to validate before publishing.
        </p>

        <Separator />

        {/* Candidate Input */}
        <div className="space-y-4">
          {/* Education */}
          <div className="space-y-2">
            <Label>Highest Qualification</Label>
            <Select
              value={candidate.highestQualification || ""}
              onValueChange={(value) =>
                setCandidate((prev) => ({ ...prev, highestQualification: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select qualification level" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "None",
                  "Secondary School",
                  "Certificate",
                  "Diploma",
                  "Bachelor's Degree",
                  "Postgraduate Diploma",
                  "Master's Degree",
                  "Doctorate",
                ].map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fields of Study */}
          <div className="space-y-2">
            <Label>Fields of Study</Label>
            <div className="flex flex-wrap gap-2">
              {(candidate.fieldsOfStudy || []).map((field) => (
                <Badge key={field} variant="secondary" className="gap-1">
                  {field}
                  <button
                    type="button"
                    onClick={() => removeField(field)}
                    className="ml-1 rounded-full hover:bg-muted"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
                placeholder="e.g., Logistics, Supply Chain"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addField();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addField}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          {/* Experience */}
          <div className="space-y-2">
            <Label>Years of Experience</Label>
            <Input
              type="number"
              min={0}
              max={50}
              value={candidate.yearsExperience || 0}
              onChange={(e) =>
                setCandidate((prev) => ({
                  ...prev,
                  yearsExperience: Number(e.target.value) || 0,
                }))
              }
            />
          </div>

          {/* Skills */}
          <div className="space-y-2">
            <Label>Skills</Label>
            <div className="flex flex-wrap gap-2">
              {(candidate.skills || []).map((skill) => (
                <Badge key={skill} variant="secondary" className="gap-1">
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="ml-1 rounded-full hover:bg-muted"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSkill}
                onChange={(e) => setNewSkill(e.target.value)}
                placeholder="e.g., Fleet Management, Excel"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addSkill}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          {/* Certifications */}
          <div className="space-y-2">
            <Label>Certifications</Label>
            <div className="flex flex-wrap gap-2">
              {(candidate.certifications || []).map((cert) => (
                <Badge key={cert} variant="secondary" className="gap-1">
                  {cert}
                  <button
                    type="button"
                    onClick={() => removeCert(cert)}
                    className="ml-1 rounded-full hover:bg-muted"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCert}
                onChange={(e) => setNewCert(e.target.value)}
                placeholder="e.g., First Aid Certificate"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCert();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addCert}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          {/* Country */}
          <div className="space-y-2">
            <Label>Country</Label>
            <Input
              value={candidate.country || ""}
              onChange={(e) =>
                setCandidate((prev) => ({ ...prev, country: e.target.value }))
              }
              placeholder="e.g., Malawi"
            />
          </div>
        </div>

        <Button onClick={handleTest} className="w-full">
          <Beaker className="mr-2 size-4" />
          Test Scoring
        </Button>

        {/* Results */}
        {result && (
          <>
            <Separator />
            <div className="space-y-4">
              {/* Eligibility */}
              <div
                className={`rounded-lg border p-4 ${
                  result.eligibility.eligible
                    ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
                    : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.eligibility.eligible ? (
                    <CheckCircle className="size-5 text-green-600" />
                  ) : (
                    <XCircle className="size-5 text-red-600" />
                  )}
                  <span className="font-semibold">
                    {result.eligibility.eligible ? "ELIGIBLE" : "INELIGIBLE"}
                  </span>
                </div>
                {result.eligibility.gates.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {result.eligibility.gates.map((gate) => (
                      <div key={gate.name} className="flex items-center gap-2 text-sm">
                        {gate.passed ? (
                          <CheckCircle className="size-3 text-green-600" />
                        ) : (
                          <XCircle className="size-3 text-red-600" />
                        )}
                        <span className={gate.passed ? "text-green-700" : "text-red-700"}>
                          {gate.name}: {gate.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Score */}
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">Score</span>
                  <span className="text-3xl font-bold">{result.total}/100</span>
                </div>
                <Badge className="mt-2">{result.recommendation}</Badge>

                {/* Breakdown */}
                <div className="mt-4 space-y-2">
                  {result.breakdown.map((dim) => (
                    <div key={dim.dimension} className="flex items-center gap-2">
                      <span className="w-40 text-sm">{dim.label}</span>
                      <div className="flex-1 h-2 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${dim.max > 0 ? (dim.score / dim.max) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="w-16 text-right text-sm font-mono">
                        {dim.score}/{dim.max}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reasons */}
              {result.reasons.length > 0 && (
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium mb-2">Evidence</h4>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {result.reasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

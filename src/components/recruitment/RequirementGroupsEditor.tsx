/**
 * RequirementGroupsEditor — UI for recruiters to define requirement groups
 * for the v2 scoring engine. Each group has accepted values, min match count,
 * and required/preferred classification.
 *
 * The candidate never sees this logic — they just report their actual
 * qualifications. The recruiter defines the rules here.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  X,
  GripVertical,
  GraduationCap,
  Briefcase,
  Wrench,
  Award,
  MapPin,
  Building2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import type { RequirementGroup, RequirementGroupType } from "@/lib/ors-requirements";
import { createRequirementGroup } from "@/lib/ors-requirements";

// ─── Group Type Config ──────────────────────────────────────────────

const GROUP_TYPE_CONFIG: Record<
  RequirementGroupType,
  {
    label: string;
    icon: any;
    color: string;
    placeholder: string;
    description: string;
    supportsYears: boolean;
    supportsMinMatch: boolean;
  }
> = {
  education_level: {
    label: "Education Level",
    icon: GraduationCap,
    color: "bg-blue-100 text-blue-800",
    placeholder: "e.g., Bachelor's Degree",
    description: "Minimum qualification level required",
    supportsYears: false,
    supportsMinMatch: false,
  },
  education_field: {
    label: "Field of Study",
    icon: GraduationCap,
    color: "bg-blue-100 text-blue-800",
    placeholder: "e.g., Logistics, Supply Chain Management",
    description: "Accepted fields of study",
    supportsYears: false,
    supportsMinMatch: true,
  },
  experience_area: {
    label: "Experience Area",
    icon: Briefcase,
    color: "bg-orange-100 text-orange-800",
    placeholder: "e.g., Fleet Management, Transport Operations",
    description: "Accepted work experience areas (OR group)",
    supportsYears: true,
    supportsMinMatch: false,
  },
  skill_critical: {
    label: "Critical Skills",
    icon: Wrench,
    color: "bg-red-100 text-red-800",
    placeholder: "e.g., Microsoft Excel, GPS Systems",
    description: "Must have ALL of these skills",
    supportsYears: false,
    supportsMinMatch: false,
  },
  skill_required: {
    label: "Required Skills",
    icon: Wrench,
    color: "bg-orange-100 text-orange-800",
    placeholder: "e.g., Fleet Management, Route Planning",
    description: "Must have ANY X of these skills",
    supportsYears: false,
    supportsMinMatch: true,
  },
  skill_preferred: {
    label: "Preferred Skills",
    icon: Wrench,
    color: "bg-green-100 text-green-800",
    placeholder: "e.g., Telematics, Power BI",
    description: "Bonus points for these skills",
    supportsYears: false,
    supportsMinMatch: false,
  },
  certification: {
    label: "Certification",
    icon: Award,
    color: "bg-purple-100 text-purple-800",
    placeholder: "e.g., First Aid Certificate, CDL License",
    description: "Required certifications",
    supportsYears: false,
    supportsMinMatch: false,
  },
  industry: {
    label: "Industry",
    icon: Building2,
    color: "bg-teal-100 text-teal-800",
    placeholder: "e.g., Logistics, Transport, FMCG",
    description: "Accepted industry experience",
    supportsYears: false,
    supportsMinMatch: false,
  },
  location: {
    label: "Location",
    icon: MapPin,
    color: "bg-indigo-100 text-indigo-800",
    placeholder: "e.g., Malawi, Lilongwe",
    description: "Accepted countries/locations",
    supportsYears: false,
    supportsMinMatch: false,
  },
  experience_years: {
    label: "Experience Years",
    icon: Briefcase,
    color: "bg-orange-100 text-orange-800",
    placeholder: "",
    description: "Minimum years of experience",
    supportsYears: true,
    supportsMinMatch: false,
  },
};

// ─── Component ──────────────────────────────────────────────────────

type Props = {
  groups: RequirementGroup[];
  onChange: (groups: RequirementGroup[]) => void;
};

export function RequirementGroupsEditor({ groups, onChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addGroup = (type: RequirementGroupType) => {
    const config = GROUP_TYPE_CONFIG[type];
    const newGroup = createRequirementGroup({
      name: config.label,
      type,
      level: "required",
      acceptedValues: [],
      minMatch: type === "skill_required" ? 3 : 1,
      minYears: type === "experience_area" ? 3 : undefined,
    });
    onChange([...groups, newGroup]);
    setExpandedId(newGroup.id);
  };

  const updateGroup = (id: string, updates: Partial<RequirementGroup>) => {
    onChange(
      groups.map((g) => (g.id === id ? { ...g, ...updates } : g)),
    );
  };

  const removeGroup = (id: string) => {
    onChange(groups.filter((g) => g.id !== id));
  };

  const addValue = (groupId: string, value: string) => {
    if (!value.trim()) return;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    if (!group.acceptedValues.includes(value.trim())) {
      updateGroup(groupId, {
        acceptedValues: [...group.acceptedValues, value.trim()],
      });
    }
  };

  const removeValue = (groupId: string, value: string) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    updateGroup(groupId, {
      acceptedValues: group.acceptedValues.filter((v) => v !== value),
    });
  };

  // Group by category
  const educationGroups = groups.filter((g) => g.type.startsWith("education"));
  const experienceGroups = groups.filter((g) => g.type.startsWith("experience"));
  const skillGroups = groups.filter((g) => g.type.startsWith("skill"));
  const otherGroups = groups.filter(
    (g) => !g.type.startsWith("education") && !g.type.startsWith("experience") && !g.type.startsWith("skill"),
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display text-base font-semibold">Requirement Groups</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Define what qualifies a candidate. Required groups block eligibility;
          preferred groups add score bonus. The candidate never sees these rules.
        </p>
      </div>

      {/* Quick Add Buttons */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["education_level", "Education Level"],
            ["education_field", "Field of Study"],
            ["experience_area", "Experience Area"],
            ["skill_critical", "Critical Skills"],
            ["skill_required", "Required Skills"],
            ["skill_preferred", "Preferred Skills"],
            ["certification", "Certification"],
          ] as const
        ).map(([type, label]) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addGroup(type)}
          >
            <Plus className="mr-1 size-3" />
            {label}
          </Button>
        ))}
      </div>

      {/* Group List */}
      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <AlertCircle className="mx-auto size-8 text-muted-foreground/30" />
          <p className="mt-2 text-sm text-muted-foreground">
            No requirement groups defined. Add groups above to configure scoring.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const config = GROUP_TYPE_CONFIG[group.type];
            const Icon = config.icon;
            const isExpanded = expandedId === group.id;

            return (
              <div
                key={group.id}
                className="rounded-lg border bg-card shadow-sm"
              >
                {/* Header */}
                <div
                  className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/30"
                  onClick={() => setExpandedId(isExpanded ? null : group.id)}
                >
                  <GripVertical className="size-4 text-muted-foreground" />
                  <Icon className="size-4" />
                  <span className="flex-1 text-sm font-medium">{group.name}</span>
                  <Badge className={config.color}>{config.label}</Badge>
                  <Badge variant={group.level === "required" ? "default" : "secondary"}>
                    {group.level}
                  </Badge>
                  {isExpanded ? (
                    <ChevronUp className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  )}
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t p-4 space-y-4">
                    {/* Name */}
                    <div className="space-y-2">
                      <Label>Group Name</Label>
                      <Input
                        value={group.name}
                        onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                        placeholder="e.g., Professional Experience"
                      />
                    </div>

                    {/* Level Toggle */}
                    <div className="flex items-center gap-4">
                      <div className="space-y-1">
                        <Label>Requirement Level</Label>
                        <p className="text-xs text-muted-foreground">
                          {group.level === "required"
                            ? "Failing this group makes the candidate ineligible"
                            : "Failing this group reduces the score but candidate stays eligible"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-sm">Preferred</span>
                        <Switch
                          checked={group.level === "required"}
                          onCheckedChange={(checked) =>
                            updateGroup(group.id, {
                              level: checked ? "required" : "preferred",
                            })
                          }
                        />
                        <span className="text-sm">Required</span>
                      </div>
                    </div>

                    {/* Accepted Values */}
                    <div className="space-y-2">
                      <Label>{config.description}</Label>
                      <div className="flex flex-wrap gap-2">
                        {group.acceptedValues.map((value) => (
                          <Badge
                            key={value}
                            variant="secondary"
                            className="gap-1"
                          >
                            {value}
                            <button
                              type="button"
                              onClick={() => removeValue(group.id, value)}
                              className="ml-1 rounded-full hover:bg-muted"
                            >
                              <X className="size-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <AddValueInput
                        placeholder={config.placeholder}
                        onAdd={(value) => addValue(group.id, value)}
                      />
                    </div>

                    {/* Min Match */}
                    {config.supportsMinMatch && group.acceptedValues.length > 0 && (
                      <div className="space-y-2">
                        <Label>Minimum matches required</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            max={group.acceptedValues.length}
                            className="w-24"
                            value={group.minMatch}
                            onChange={(e) =>
                              updateGroup(group.id, {
                                minMatch: Math.max(
                                  1,
                                  Math.min(
                                    group.acceptedValues.length,
                                    Number(e.target.value) || 1,
                                  ),
                                ),
                              })
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            of {group.acceptedValues.length} skills
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Min Years */}
                    {config.supportsYears && (
                      <div className="space-y-2">
                        <Label>Minimum years</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={0}
                            max={30}
                            className="w-24"
                            value={group.minYears || 0}
                            onChange={(e) =>
                              updateGroup(group.id, {
                                minYears: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                          />
                          <span className="text-sm text-muted-foreground">years</span>
                        </div>
                      </div>
                    )}

                    {/* Min Level for education */}
                    {group.type === "education_level" && (
                      <div className="space-y-2">
                        <Label>Minimum qualification level</Label>
                        <Select
                          value={group.minLevel || ""}
                          onValueChange={(value) =>
                            updateGroup(group.id, { minLevel: value })
                          }
                        >
                          <SelectTrigger className="w-64">
                            <SelectValue placeholder="Select minimum level" />
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
                    )}

                    {/* Remove Button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => removeGroup(group.id)}
                    >
                      <X className="mr-1 size-3" />
                      Remove Group
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {groups.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <h4 className="text-sm font-medium">Summary</h4>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <p>
              {groups.filter((g) => g.level === "required").length} required groups
              (blocks eligibility if failed)
            </p>
            <p>
              {groups.filter((g) => g.level === "preferred").length} preferred groups
              (score bonus if passed)
            </p>
            <p>
              {groups.reduce((sum, g) => sum + g.acceptedValues.length, 0)} total
              accepted values across all groups
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Value Input ────────────────────────────────────────────────

function AddValueInput({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    if (value.trim()) {
      onAdd(value.trim());
      setValue("");
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
          }
        }}
      />
      <Button type="button" variant="outline" size="sm" onClick={handleSubmit}>
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

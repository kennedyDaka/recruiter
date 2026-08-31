/**
 * AiExtractionTab — displays Gemini's structured extraction alongside
 * manually-entered candidate data on the application detail page.
 *
 * Shows:
 *   - AI processing status and attempts
 *   - Extracted candidate info (name, email, phone)
 *   - Structured education, experience, skills
 *   - Comparison with manually-entered data
 *   - Raw AI output for debugging
 */

import { useState } from "react";
import {
  Brain,
  CheckCircle,
  Clock,
  Code,
  Eye,
  EyeOff,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AiJob {
  id: string;
  status: string;
  raw_response: string | null;
  parsed_output: string | null;
  attempts: number;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}

interface AiExtractionTabProps {
  aiResults: AiJob[];
}

interface StatusConfig {
  label: string;
  color: string;
  icon: React.ReactNode;
}

const DEFAULT_STATUS: StatusConfig = { label: "Unknown", color: "bg-gray-300", icon: <Clock className="h-3.5 w-3.5 text-gray-300" /> };

const STATUS_CONFIG: { [key: string]: StatusConfig } = {
  completed: { label: "Completed", color: "bg-green-500", icon: <CheckCircle className="h-3.5 w-3.5 text-green-500" /> },
  processing: { label: "Processing", color: "bg-blue-500", icon: <Clock className="h-3.5 w-3.5 text-blue-500 animate-pulse" /> },
  failed: { label: "Failed", color: "bg-red-500", icon: <XCircle className="h-3.5 w-3.5 text-red-500" /> },
  fallback_completed: { label: "Fallback", color: "bg-yellow-500", icon: <Clock className="h-3.5 w-3.5 text-yellow-500" /> },
  queued: { label: "Queued", color: "bg-gray-400", icon: <Clock className="h-3.5 w-3.5 text-gray-400" /> },
  created: { label: "Created", color: "bg-gray-300", icon: <Clock className="h-3.5 w-3.5 text-gray-300" /> },
};

export function AiExtractionTab({ aiResults }: AiExtractionTabProps) {
  const [showRaw, setShowRaw] = useState(false);

  if (!aiResults.length) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <Brain className="h-8 w-8 opacity-40" />
          <p className="text-sm">No AI extraction data yet.</p>
          <p className="text-xs">AI processing runs automatically when a PDF CV is submitted.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {aiResults.map((job) => {
        const config = STATUS_CONFIG[job.status] ?? DEFAULT_STATUS;
        const parsed = parseJsonSafe(job.parsed_output);
        const raw = parseJsonSafe(job.raw_response);

        return (
          <div key={job.id} className="rounded-lg border border-border p-4">
            <div className="space-y-3">
              {/* Status bar */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  {config.icon}
                  <span className="font-medium">{config.label}</span>
                  <Badge variant="secondary" className="text-xs">
                    Attempt {job.attempts}
                  </Badge>
                  {job.error_code && (
                    <Badge variant="destructive" className="text-xs">
                      {job.error_code}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(job.created_at).toLocaleString()}
                  {job.completed_at && (
                    <> — {new Date(job.completed_at).toLocaleString()}</>
                  )}
                </span>
              </div>

              {/* Extracted candidate info */}
              {parsed && job.status === "completed" && (
                <div className="rounded-lg border border-border p-4">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-purple-500" />
                    Extracted Candidate Info
                  </h4>

                  {parsed.candidate && (
                    <dl className="grid gap-2 text-sm sm:grid-cols-3 mb-4">
                      <div>
                        <dt className="text-muted-foreground">Name</dt>
                        <dd className="font-medium">{parsed.candidate.name || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Email</dt>
                        <dd className="font-medium">{parsed.candidate.email || "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Phone</dt>
                        <dd className="font-medium">{parsed.candidate.phone || "—"}</dd>
                      </div>
                    </dl>
                  )}

                  {/* Education */}
                  {Array.isArray(parsed.education) && parsed.education.length > 0 && (
                    <div className="mb-4">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Education ({parsed.education.length})
                      </h5>
                      <div className="space-y-1.5">
                        {parsed.education.map((edu: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="font-medium">{edu.qualification || "—"}</span>
                            {edu.field_of_study && (
                              <span className="text-muted-foreground">in {edu.field_of_study}</span>
                            )}
                            {edu.institution && (
                              <span className="text-muted-foreground">at {edu.institution}</span>
                            )}
                            {edu.start_year && (
                              <span className="text-xs text-muted-foreground">
                                ({edu.start_year}{edu.end_year ? `–${edu.end_year}` : ""})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Experience */}
                  {Array.isArray(parsed.experience) && parsed.experience.length > 0 && (
                    <div className="mb-4">
                      <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        Experience ({parsed.experience.length})
                      </h5>
                      <div className="space-y-1.5">
                        {parsed.experience.map((exp: any, i: number) => (
                          <div key={i} className="text-sm">
                            <span className="font-medium">{exp.position || "—"}</span>
                            {exp.employer && (
                              <span className="text-muted-foreground"> at {exp.employer}</span>
                            )}
                            {exp.field && (
                              <Badge variant="outline" className="ml-2 text-xs">{exp.field}</Badge>
                            )}
                            {exp.start_date && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({exp.start_date}{exp.end_date ? `–${exp.end_date}` : exp.is_current ? "–present" : ""})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills & Certifications */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    {Array.isArray(parsed.skills) && parsed.skills.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Skills ({parsed.skills.length})
                        </h5>
                        <div className="flex flex-wrap gap-1">
                          {parsed.skills.map((skill: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(parsed.certifications) && parsed.certifications.length > 0 && (
                      <div>
                        <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Certifications ({parsed.certifications.length})
                        </h5>
                        <div className="flex flex-wrap gap-1">
                          {parsed.certifications.map((cert: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">{cert}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {typeof parsed.total_experience_years === "number" && (
                    <p className="text-xs text-muted-foreground mt-3">
                      Total experience: ~{parsed.total_experience_years.toFixed(1)} years
                    </p>
                  )}
                </div>
              )}

              {/* Raw output toggle */}
              {(job.raw_response || job.parsed_output) && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-xs text-muted-foreground"
                    onClick={() => setShowRaw(!showRaw)}
                  >
                    <Code className="h-3.5 w-3.5" />
                    {showRaw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showRaw ? "Hide" : "Show"} raw output
                  </Button>
                  {showRaw && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify(raw ?? parsed, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function parseJsonSafe(str: string | null): any {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

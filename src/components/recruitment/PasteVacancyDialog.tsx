/**
 * PasteVacancyDialog — allows recruiters to paste an existing vacancy/job
 * description and have Gemini structure it into the ORS vacancy format.
 *
 * Flow:
 *   Click "Already have a vacancy?" → Paste text → AI structures → Fields auto-populated
 */

import { useState } from "react";
import { FileText, Sparkles, Loader2, AlertCircle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { structureVacancyFn } from "@/lib/ai.functions";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface ParsedVacancy {
  job_title: string;
  department: string;
  location: string;
  employment_type: string;
  job_description: string;
  responsibilities: string[];
  qualifications: string[];
  required_experience: string[];
  required_skills: string[];
  preferred_skills: string[];
  certifications: string[];
  other_requirements: string[];
}

interface PasteVacancyDialogProps {
  onVacancyParsed: (vacancy: ParsedVacancy) => void;
  trigger?: React.ReactNode;
}

export function PasteVacancyDialog({
  onVacancyParsed,
  trigger,
}: PasteVacancyDialogProps) {
  const [open, setOpen] = useState(false);
  const [rawVacancy, setRawVacancy] = useState("");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const structureVacancy = useServerFn(structureVacancyFn);

  const handleParse = async () => {
    if (!rawVacancy.trim()) {
      setError("Please paste your vacancy text first.");
      return;
    }

    if (rawVacancy.trim().length < 10) {
      setError("Vacancy text must be at least 10 characters.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const result = await structureVacancy({ data: { rawVacancy: rawVacancy.trim() } });

      if (result.success && result.vacancy) {
        const parsed: ParsedVacancy = JSON.parse(result.vacancy as string);
        onVacancyParsed(parsed);
        setOpen(false);
        setRawVacancy("");
        toast.success("Vacancy structured successfully! Review and edit the fields below.");
      } else {
        setError(result.error || "AI processing failed. Please try again or create the vacancy manually.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("[PasteVacancy] Error:", err);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" type="button" className="gap-2">
            <FileText className="h-4 w-4" />
            Already have a vacancy?
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Vacancy Assistant
          </DialogTitle>
          <DialogDescription>
            Paste your existing vacancy or job description below. AI will extract and
            structure the information into the campaign builder fields.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="raw-vacancy">Paste your vacancy text</Label>
            <Textarea
              id="raw-vacancy"
              placeholder={`Example:\n\nWe are looking for a Logistics Officer to join our team in Lilongwe. The successful candidate should have a degree in logistics, supply chain or business administration and at least three years' experience in a similar role. Responsibilities include managing inventory, coordinating deliveries, and preparing monthly reports.`}
              value={rawVacancy}
              onChange={(e) => {
                setRawVacancy(e.target.value);
                setError(null);
              }}
              rows={10}
              className="font-mono text-sm"
              disabled={processing}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleParse}
            disabled={processing || !rawVacancy.trim()}
            className="gap-2"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Structuring...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Structure with AI
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { ParsedVacancy };

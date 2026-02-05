"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { type Question } from "@/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy, ArrowLeft, Loader2, Printer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function ExportPage() {
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => {
    try {
      const t = setTimeout(() => {
        const storedQuestions = sessionStorage.getItem("questionsForExport");
        if (storedQuestions) {
          setQuestions(JSON.parse(storedQuestions));
        } else {
          toast({
            title: "No questions to display",
            description: "Please go back and export questions first.",
            variant: "destructive",
          });
          router.push("/");
        }
        setIsLoading(false);
      }, 200);

      return () => clearTimeout(t);
    } catch (error) {
      console.error("Failed to parse questions from sessionStorage", error);
      toast({
        title: "Error loading questions",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  }, [toast, router]);

  // ✅ UPDATED: output MUST be compatible with quiz-builder parser
  // - DO NOT prefix question with "1." (your option regex treats "1." as an option line)
  // - Options: "A. ..." "B. ..."
  // - Answer: "Answer: A,C" (letters glued or comma-separated)
  const generatePlainText = (questionsToExport: Question[]): string => {
    const buildAnswerLine = (q: Question): string | null => {
      if (!q.correctAnswer) return null;

      if (q.options && q.options.length > 0) {
        const correctAnswers = Array.isArray(q.correctAnswer)
          ? q.correctAnswer
          : [q.correctAnswer];

        const letters = correctAnswers
          .map((ans) => {
            const idx = q.options?.indexOf(ans ?? "");
            return idx !== undefined && idx >= 0 ? String.fromCharCode(65 + idx) : "";
          })
          .filter(Boolean);

        if (letters.length) return `Answer: ${letters.join(",")}`;

        // fallback: maybe correctAnswer already contains A / A,C etc
        if (typeof q.correctAnswer === "string" && q.correctAnswer.trim()) {
          return `Answer: ${q.correctAnswer.trim().replace(/\s+/g, "")}`;
        }
        if (Array.isArray(q.correctAnswer) && q.correctAnswer.length) {
          const cleaned = q.correctAnswer
            .map((x) => String(x ?? "").trim())
            .filter(Boolean)
            .join(",");
          return cleaned ? `Answer: ${cleaned.replace(/\s+/g, "")}` : null;
        }
        return null;
      }

      // no options, still emit Answer for consistency
      return `Answer: ${
        Array.isArray(q.correctAnswer)
          ? q.correctAnswer.map((x) => String(x ?? "").trim()).join(",")
          : String(q.correctAnswer ?? "").trim()
      }`;
    };

    return questionsToExport
      .map((q) => {
        const qLine = (q.questionText ?? "").toString().trim();
        if (!qLine) return "";

        let block = qLine; // IMPORTANT: no numbering here

        if (q.options && q.options.length > 0) {
          const optionsText = q.options
            .map((opt, i) => `${String.fromCharCode(65 + i)}. ${String(opt ?? "").trim()}`)
            .join("\n");
          block += `\n${optionsText}`;
        }

        const ans = buildAnswerLine(q);
        if (ans) block += `\n${ans}`;

        return block.trim();
      })
      .filter(Boolean)
      .join("\n\n");
  };

  // ✅ UPDATED: clipboard copy with iOS / permission fallback
  const copyTextWithFallback = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  };

  const handleCopy = async () => {
    if (!questions.length) return;

    const plainText = generatePlainText(questions);
    const ok = await copyTextWithFallback(plainText);

    if (ok) {
      toast({
        title: "Copied for Import!",
        description: `${questions.length} question block(s) copied (parser-compatible).`,
      });
    } else {
      toast({
        title: "Copy failed",
        description: "Clipboard permission was blocked by the browser.",
        variant: "destructive",
      });
    }
  };

  const handleExportPdf = () => {
    if (!questions.length || isLoading) return;
    window.print();
  };

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white print:text-black">
      {/* Screen header (hidden in print) */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm print:hidden">
        {/* ✅ UPDATED: better mobile layout for buttons */}
        <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" onClick={() => router.back()} className="h-10">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <h1 className="font-headline text-lg sm:text-2xl">Exported Questions</h1>

            {/* spacer to balance row on mobile */}
            <div className="w-[92px] sm:hidden" aria-hidden />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={!questions.length || isLoading}
              className="h-10 w-full sm:w-auto"
            >
              <Printer className="mr-2 h-4 w-4" />
              Export PDF
            </Button>

            <Button
              onClick={handleCopy}
              disabled={!questions.length || isLoading}
              className="h-10 w-full sm:w-auto"
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy for Import
            </Button>
          </div>
        </div>
      </header>

      {/* Print header (only for PDF) */}
      <div className="hidden print:block p-6 pb-0">
        <h1 className="text-2xl font-bold">Exported Questions</h1>
        <p className="text-sm">Total: {questions.length}</p>
        <hr className="my-4 border-black/20" />
      </div>

      <main className="container mx-auto max-w-4xl p-4 sm:p-8 print:pt-0">
        {isLoading ? (
          <div className="flex justify-center items-center py-16 print:hidden">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4 text-muted-foreground">Loading questions...</p>
          </div>
        ) : questions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground print:hidden">
            <h3 className="font-headline text-2xl mb-2">No Questions to Display</h3>
            <p>Go back and export questions first.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map((q, index) => (
              <React.Fragment key={(q as any).id || index}>
                {/* ✅ SCREEN VERSION (cards) */}
                <Card className="overflow-hidden print:hidden">
                  <CardContent className="p-6">
                    <p className="mb-4 whitespace-pre-wrap font-semibold">
                      <span className="font-bold mr-2">{index + 1}.</span>
                      {q.questionText}
                    </p>

                    {q.imageUrl && (
                      <div className="relative mb-4 aspect-video w-full max-w-lg mx-auto rounded-md border">
                        <Image
                          src={q.imageUrl}
                          alt={`Image for question ${index + 1}`}
                          fill
                          className="object-contain"
                        />
                      </div>
                    )}

                    {q.options && q.options.length > 0 && (
                      <ul className="mb-4 list-inside list-[upper-alpha] space-y-2">
                        {q.options.map((opt, i) => (
                          <li key={i}>{opt}</li>
                        ))}
                      </ul>
                    )}

                    <p className="text-muted-foreground">
                      <span className="font-bold text-foreground">Answer: </span>
                      {Array.isArray(q.correctAnswer)
                        ? q.correctAnswer.join(", ")
                        : q.correctAnswer}
                    </p>
                  </CardContent>
                </Card>

                {/* ✅ PRINT VERSION (clean white, no card) */}
                <section className="hidden print:block break-inside-avoid-page">
                  <div className="font-semibold whitespace-pre-wrap">
                    {index + 1}. {q.questionText}
                  </div>

                  {q.imageUrl && (
                    <div className="mt-3">
                      <div className="relative w-full max-w-xl aspect-video">
                        <Image
                          src={q.imageUrl}
                          alt={`Image for question ${index + 1}`}
                          fill
                          className="object-contain"
                        />
                      </div>
                    </div>
                  )}

                  {q.options && q.options.length > 0 && (
                    <ol className="mt-3 space-y-1 pl-6 list-[upper-alpha]">
                      {q.options.map((opt, i) => (
                        <li key={i} className="whitespace-pre-wrap">
                          {opt}
                        </li>
                      ))}
                    </ol>
                  )}

                  <div className="mt-3">
                    <span className="font-bold">Answer: </span>
                    {Array.isArray(q.correctAnswer)
                      ? q.correctAnswer.join(", ")
                      : q.correctAnswer}
                  </div>

                  <hr className="mt-6 border-black/20" />
                </section>
              </React.Fragment>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

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

  const generatePlainText = (questionsToExport: Question[]): string => {
    return questionsToExport
      .map((q, idx) => {
        let questionText = `${idx + 1}. ${q.questionText ?? ""}`;

        if (q.options && q.options.length > 0) {
          const optionsText = q.options
            .map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`)
            .join("\n");
          questionText += `\n${optionsText}`;
        }

        if (q.correctAnswer) {
          let answerText = `Answer: `;
          if (q.options && q.options.length > 0) {
            const correctAnswers = Array.isArray(q.correctAnswer)
              ? q.correctAnswer
              : [q.correctAnswer];

            const answerLetters = correctAnswers
              .map((ans) => {
                const index = q.options?.indexOf(ans ?? "");
                return index !== -1 ? String.fromCharCode(65 + (index ?? 0)) : "";
              })
              .filter(Boolean)
              .join(", ");

            answerText +=
              answerLetters ||
              (Array.isArray(q.correctAnswer)
                ? q.correctAnswer.join(", ")
                : q.correctAnswer);
          } else {
            answerText += Array.isArray(q.correctAnswer)
              ? q.correctAnswer.join(", ")
              : q.correctAnswer;
          }
          questionText += `\n${answerText}`;
        }

        return questionText;
      })
      .join("\n\n");
  };

  const handleCopy = async () => {
    if (!questions.length) return;

    const plainText = generatePlainText(questions);
    try {
      await navigator.clipboard.writeText(plainText);
      toast({
        title: "Copied!",
        description: `${questions.length} questions copied as text.`,
      });
    } catch (err) {
      console.error(err);
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
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 p-4 backdrop-blur-sm print:hidden">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <h1 className="font-headline text-2xl">Exported Questions</h1>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportPdf}
            disabled={!questions.length || isLoading}
          >
            <Printer className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button onClick={handleCopy} disabled={!questions.length || isLoading}>
            <Copy className="mr-2 h-4 w-4" />
            Copy as Text
          </Button>
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
              <React.Fragment key={q.id || index}>
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

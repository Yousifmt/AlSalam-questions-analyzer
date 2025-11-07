"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type Question } from "@/types";
import { handleExplainQuestion } from "@/lib/actions";
import { type ExplainQuestionOutput } from "@/ai/flows/explain-question";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, Languages, RefreshCw } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";

/**
 * 🔧 WHERE TO EDIT FONT SIZES (both languages):
 * -------------------------------------------------
 * Change the values inside FONT_SCALES.ar / FONT_SCALES.en below.
 * -------------------------------------------------
 */
const FONT_SCALES = {
  ar: {
    body: "text-[15px] sm:text-[16px] md:text-[17px]",
    heading: "text-[16px] sm:text-[17px] md:text-[18px]",
  },
  en: {
    body: "text-[14px] sm:text-[15px] md:text-[16px]",
    heading: "text-[15px] sm:text-[16px] md:text-[17px]",
  },
} as const;


/** قاموس المعاني (زد ما تشاء) */
const KNOWN_SHORTCUTS: Record<string, { ar: string; en: string }> = {
  TPM: { ar: "وحدة النظام الأساسي الموثوق به", en: "Trusted Platform Module" },
  CRL: { ar: "قائمة إبطال الشهادات", en: "Certificate Revocation List" },
  PKI: { ar: "البنية التحتية للمفتاح العام", en: "Public Key Infrastructure" },
  CSR: { ar: "طلب توقيع الشهادة", en: "Certificate Signing Request" },
  CA:  { ar: "سلطة التصديق", en: "Certificate Authority" },
  CPU: { ar: "وحدة المعالجة المركزية", en: "Central Processing Unit" },
  RAM: { ar: "ذاكرة الوصول العشوائي", en: "Random Access Memory" },
  OCSP:{ ar: "بروتوكول حالة الشهادة على الإنترنت", en: "Online Certificate Status Protocol" },
  SSL: { ar: "طبقة المنافذ الآمنة", en: "Secure Sockets Layer" },
  TLS: { ar: "أمان طبقة النقل",  en: "Transport Layer Security" },
};

/** يضيف المعنى بين قوسين بعد الاختصار داخل النص، دون تكرار لو كان مذكورًا أصلاً */
function inlineExpandShortcuts(text: string, lang: "ar" | "en") {
  if (!text) return text;
  // إن كان الاختصار متبوعًا مباشرة بقوس، نتركه كما هو.
  return text.replace(/\b([A-Z]{2,6})\b/g, (m, sc) => {
    const key = String(sc).toUpperCase();
    const nextSlice = text.slice(text.indexOf(m) + m.length).trimStart();
    const alreadyExpanded = nextSlice.startsWith("("); // مثل: CRL (..)
    if (alreadyExpanded) return m;
    const meaning = KNOWN_SHORTCUTS[key]?.[lang];
    return meaning ? `${m} (${meaning})` : m;
  });
}

type ExplanationPanelProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  question: Question | null;
};

export function ExplanationPanel({ isOpen, setIsOpen, question }: ExplanationPanelProps) {
  const [level, setLevel] = React.useState<"short" | "full">("short");
  const [language, setLanguage] = React.useState<"en" | "ar">("en");
  const [explanation, setExplanation] = React.useState<ExplainQuestionOutput | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (question) {
      setLanguage(question.language);
      setExplanation(null);
    }
  }, [question]);

  const fetchExplanation = React.useCallback(async () => {
    if (!question) return;
    setIsLoading(true);
    setExplanation(null);
    try {
      const result = await handleExplainQuestion({
        questionText: question.questionText,
        options: question.options,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        level,
        language,
      });
      setExplanation(result as any);
    } catch (error) {
      console.error("Failed to fetch explanation:", error);
    } finally {
      setIsLoading(false);
    }
  }, [question, level, language]);

  React.useEffect(() => {
    if (isOpen && question) fetchExplanation();
  }, [isOpen, question, fetchExplanation]);

  const renderExplanationContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-6">
          <Skeleton className="h-6 w-1/4" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/4" />
          </div>
          <Skeleton className="h-6 w-1/3 mt-4" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <Skeleton className="h-6 w-1/3 mt-4" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      );
    }

    if (!explanation || !question) {
      return <p className="text-muted-foreground">No explanation available. Click "Regenerate" to create one.</p>;
    }

    const isArabic = language === "ar";
    const T = isArabic ? FONT_SCALES.ar : FONT_SCALES.en; // Typography scale

    const H3 = ({ children }: { children: React.ReactNode }) => (
      <h3 className={cn("font-headline font-semibold text-primary mb-2", T.heading)}>{children}</h3>
    );

    // ✨ نُوسِّع الاختصارات داخل "الشرح العام" فقط (حسب طلبك)
    const expandedGeneral = inlineExpandShortcuts(explanation.generalExplanation, language);

    return (
      <div className={cn("space-y-6", isArabic ? cn("text-right", T.body) : T.body)} dir={isArabic ? "rtl" : "ltr"}>
        {/* Chapter */}
        <div>
          <H3>{isArabic ? "الموضوع" : "Chapter"}</H3>
          <Badge variant="secondary" className={cn(isArabic && "text-[15px]")}>{question.chapter}</Badge>
        </div>

        {/* General Explanation (with inline shortcuts) */}
        <div>
          <H3>{isArabic ? "شرح عام" : "General Explanation"}</H3>
          <p className={cn("leading-relaxed", T.body)}>{expandedGeneral}</p>
        </div>

        {/* Correct Answer */}
        <div>
          <H3>{isArabic ? "شرح الإجابة الصحيحة" : "Correct Answer Explanation"}</H3>
          {question?.correctAnswer && (
            <div className="p-3 rounded-md bg-green-500/20 border border-green-500/50 mb-3">
              <p className={cn("font-semibold text-foreground", T.body)}>
                {isArabic ? "الإجابة الصحيحة" : "Correct Answer"}: {Array.isArray(question.correctAnswer) ? question.correctAnswer.join(", ") : question.correctAnswer}
              </p>
            </div>
          )}
          <p className={cn("leading-relaxed", T.body)}>{explanation.correctAnswerExplanation}</p>
        </div>

        {/* Why others are wrong */}
        {explanation.whyOthersWrong && explanation.whyOthersWrong.length > 0 && (
          <div>
            <H3>{isArabic ? "لماذا باقي الخيارات غير صحيحة" : "Why Other Options are Incorrect"}</H3>
            <ul className="space-y-3">
              {explanation.whyOthersWrong.map((item, i) => (
                <li key={i} className={cn("leading-relaxed", T.body)}>
                  <strong className="text-foreground">{item.option}:</strong> {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl flex flex-col p-0">
        <SheetHeader className="p-6 border-b border-border">
          <SheetTitle className="font-headline text-2xl flex items-center gap-2">
            <BrainCircuit className="text-primary" />
            Explain Question
          </SheetTitle>
          <SheetDescription className="text-gray-400">{question?.questionText}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-row flex-wrap items-center justify-between p-4 border-b border-border bg-secondary/50 gap-2 sm:gap-4">
          <Tabs value={level} onValueChange={(v) => setLevel(v as any)}>
            <TabsList className="h-9">
              <TabsTrigger value="short" className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm">Short</TabsTrigger>
              <TabsTrigger value="full" className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm">Full</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Languages className="text-muted-foreground h-5 w-5" />
            <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
              <SelectTrigger className="w-[100px] sm:w-[120px] bg-background h-9 text-xs sm:text-sm">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">Arabic</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchExplanation} disabled={isLoading}>
              <RefreshCw className={cn("mr-1 sm:mr-2 h-4 w-4", isLoading && "animate-spin")} />
              <span className="text-xs sm:text-sm">Regenerate</span>
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-6">{renderExplanationContent()}</div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

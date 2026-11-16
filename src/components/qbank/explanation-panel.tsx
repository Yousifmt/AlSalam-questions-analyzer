"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "../ui/badge";
import { type Question } from "@/types";
import { handleExplainQuestion } from "@/lib/actions";
import { type ExplainQuestionOutput } from "@/ai/flows/explain-question";
import {
  AlertCircle,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Languages,
  Lightbulb,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
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
  CA: { ar: "سلطة التصديق", en: "Certificate Authority" },
  CPU: { ar: "وحدة المعالجة المركزية", en: "Central Processing Unit" },
  RAM: { ar: "ذاكرة الوصول العشوائي", en: "Random Access Memory" },
  OCSP: { ar: "بروتوكول حالة الشهادة على الإنترنت", en: "Online Certificate Status Protocol" },
  SSL: { ar: "طبقة المنافذ الآمنة", en: "Secure Sockets Layer" },
  TLS: { ar: "أمان طبقة النقل", en: "Transport Layer Security" },
};

/** يضيف المعنى بين قوسين بعد الاختصار داخل النص، دون تكرار لو كان مذكورًا أصلاً */
function inlineExpandShortcuts(text: string, lang: "ar" | "en") {
  if (!text) return text;
  return text.replace(/\b([A-Z]{2,6})\b/g, (m: string, sc: string, offset: number) => {
    const key = String(sc).toUpperCase();
    // إن كان الاختصار متبوعًا مباشرة بقوس، نتركه كما هو (مثل: CRL (..))
    const nextSlice = text.slice(offset + m.length).trimStart();
    if (nextSlice.startsWith("(")) return m;
    const meaning = KNOWN_SHORTCUTS[key]?.[lang];
    return meaning ? `${m} (${meaning})` : m;
  });
}

type ExplanationPanelProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  question: Question | null;
};

/* ------------------------------------------------------------------ */
/*  Small presentational helpers                                       */
/* ------------------------------------------------------------------ */

function SectionCard({
  icon,
  title,
  headingClass,
  children,
  className,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  headingClass: string;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <section
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
      className={cn(
        "rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 shadow-sm",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-500",
        className
      )}
    >
      <h3
        className={cn(
          "mb-3 flex items-center gap-2 font-headline font-semibold text-primary",
          headingClass
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Sparkles className="h-4 w-4 animate-pulse text-primary" />
        <span className="animate-pulse">Generating explanation…</span>
      </div>

      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5"
        >
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg bg-white/10" />
            <Skeleton className="h-5 w-1/3 bg-white/10" />
          </div>
          <Skeleton className="h-4 w-full bg-white/10" />
          <Skeleton className="h-4 w-11/12 bg-white/10" />
          <Skeleton className="h-4 w-2/3 bg-white/10" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/20 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Lightbulb className="h-6 w-6 text-primary" />
      </div>
      <p className="max-w-xs text-sm text-gray-400">{message}</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <p className="max-w-xs text-sm text-gray-300">
        Something went wrong while generating the explanation.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-2 h-4 w-4" />
        Try again
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ExplanationPanel({ isOpen, setIsOpen, question }: ExplanationPanelProps) {
  const [level, setLevel] = React.useState<"short" | "full">("short");
  const [language, setLanguage] = React.useState<"en" | "ar">("en");
  const [explanation, setExplanation] = React.useState<ExplainQuestionOutput | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);

  // يمنع ظهور نتيجة قديمة إذا تغيّر السؤال/اللغة أثناء التحميل
  const requestId = React.useRef(0);

  React.useEffect(() => {
    if (question) {
      setLanguage(question.language);
      setExplanation(null);
      setHasError(false);
    }
  }, [question]);

  const fetchExplanation = React.useCallback(async () => {
    if (!question) return;
    const id = ++requestId.current;
    setIsLoading(true);
    setHasError(false);
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
      if (id !== requestId.current) return;
      setExplanation(result as any);
    } catch (error) {
      if (id !== requestId.current) return;
      console.error("Failed to fetch explanation:", error);
      setHasError(true);
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [question, level, language]);

  React.useEffect(() => {
    if (isOpen && question) fetchExplanation();
  }, [isOpen, question, fetchExplanation]);

  const renderExplanationContent = () => {
    if (isLoading) return <LoadingState />;
    if (hasError) return <ErrorState onRetry={fetchExplanation} />;

    if (!explanation || !question) {
      return (
        <EmptyState message='No explanation available. Click "Regenerate" to create one.' />
      );
    }

    const isArabic = language === "ar";
    const T = isArabic ? FONT_SCALES.ar : FONT_SCALES.en;

    // ✨ نُوسِّع الاختصارات داخل "الشرح العام" فقط
    const expandedGeneral = inlineExpandShortcuts(explanation.generalExplanation, language);

    const correctAnswerText = Array.isArray(question.correctAnswer)
      ? question.correctAnswer.join(", ")
      : question.correctAnswer;

    return (
      <div
        key={`${question.questionText}-${language}-${level}`}
        className={cn("space-y-4", T.body, isArabic && "text-right")}
        dir={isArabic ? "rtl" : "ltr"}
      >
        {/* Chapter */}
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in-0 duration-500">
          <span
            className={cn(
              "flex items-center gap-1.5 font-medium text-gray-300",
              T.heading
            )}
          >
            <BookOpen className="h-4 w-4 text-primary" />
            {isArabic ? "الموضوع" : "Chapter"}
          </span>
          <Badge
            variant="secondary"
            className={cn("rounded-full px-3 py-1", isArabic && "text-[15px]")}
          >
            {question.chapter}
          </Badge>
        </div>

        {/* General Explanation */}
        <SectionCard
          icon={<Lightbulb className="h-4 w-4 text-primary" />}
          title={isArabic ? "شرح عام" : "General Explanation"}
          headingClass={T.heading}
          delay={60}
        >
          <p className={cn("leading-relaxed text-gray-100", T.body)}>
            {expandedGeneral}
          </p>
        </SectionCard>

        {/* Correct Answer */}
        <SectionCard
          icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
          title={isArabic ? "شرح الإجابة الصحيحة" : "Correct Answer Explanation"}
          headingClass={T.heading}
          delay={120}
        >
          {correctAnswerText && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-green-500/50 bg-green-500/15 p-3.5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-green-400">
                  {isArabic ? "الإجابة الصحيحة" : "Correct Answer"}
                </p>
                <p className={cn("mt-0.5 break-words font-semibold text-white", T.body)}>
                  {correctAnswerText}
                </p>
              </div>
            </div>
          )}
          <p className={cn("leading-relaxed text-gray-100", T.body)}>
            {explanation.correctAnswerExplanation}
          </p>
        </SectionCard>

        {/* Why others are wrong */}
        {explanation.whyOthersWrong && explanation.whyOthersWrong.length > 0 && (
          <SectionCard
            icon={<XCircle className="h-4 w-4 text-primary" />}
            title={
              isArabic ? "لماذا باقي الخيارات غير صحيحة" : "Why Other Options are Incorrect"
            }
            headingClass={T.heading}
            delay={180}
          >
            <ul className="space-y-3">
              {explanation.whyOthersWrong.map((item, i) => (
                <li
                  key={i}
                  className={cn(
                    "rounded-lg border border-white/10 bg-white/5 p-3.5 leading-relaxed",
                    "border-s-4 border-s-red-500/70 transition-colors hover:bg-white/10",
                    T.body
                  )}
                >
                  <strong className="font-semibold text-white">{item.option}</strong>
                  <span className="text-gray-500"> — </span>
                  <span className="text-gray-200">{item.reason}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl md:max-w-2xl lg:max-w-3xl">
        {/* Header */}
        <SheetHeader className="space-y-3 border-b border-border bg-gradient-to-b from-primary/10 to-transparent p-5 text-left sm:p-6">
          <SheetTitle className="flex items-center gap-3 font-headline text-xl sm:text-2xl">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
              <BrainCircuit className="h-5 w-5 text-primary" />
            </span>
            Explain Question
          </SheetTitle>
          <SheetDescription className="line-clamp-3 text-sm leading-relaxed text-gray-300">
            {question?.questionText}
          </SheetDescription>
        </SheetHeader>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3 sm:px-6">
          <Tabs value={level} onValueChange={(v) => setLevel(v as any)}>
            <TabsList className="h-9 rounded-lg border border-white/10 bg-white/5 p-1">
              <TabsTrigger
                value="short"
                className="rounded-md px-3 py-1.5 text-xs text-gray-300 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow sm:text-sm"
              >
                Short
              </TabsTrigger>
              <TabsTrigger
                value="full"
                className="rounded-md px-3 py-1.5 text-xs text-gray-300 transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow sm:text-sm"
              >
                Full
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Languages className="hidden h-5 w-5 text-gray-400 sm:block" />
            <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
              <SelectTrigger className="h-9 w-[110px] bg-background text-xs sm:w-[130px] sm:text-sm">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">Arabic</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchExplanation}
              disabled={isLoading || !question}
              className="h-9 transition-all active:scale-95"
            >
              <RefreshCw className={cn("mr-1.5 h-4 w-4", isLoading && "animate-spin")} />
              <span className="text-xs sm:text-sm">Regenerate</span>
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-4 sm:p-6">{renderExplanationContent()}</div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
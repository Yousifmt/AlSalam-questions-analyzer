// src/app/page.tsx
"use client";

import * as React from "react";
import { type Question } from "@/types";
import Header from "@/components/qbank/header";
import QuestionList from "@/components/qbank/question-list";
import { ExplanationPanel } from "@/components/qbank/explanation-panel";
import { db } from "@/lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import FilterSheet from "@/components/qbank/filter-sheet";
import { LockProvider } from "@/context/lock-context";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { BackToTopButton } from "@/components/qbank/back-to-top";
import { ExamOptionsDialog } from "@/components/qbank/exam-options-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import Footer from "@/components/qbank/footer";

import {
  getSimilarOptionsMeta,
  extractOptions,
  diceSimilarity,
  normalizeText,
} from "@/components/qbank/similar-options";

const EXAM_QUESTION_COUNT = 90;
const RECENT_DAYS = 10;

export type ExamMode = "during" | "after";
export type SortType = "chapter_asc" | "chapter_desc" | "random";

const initialFilters = {
  chapter: [] as string[],
  questionType: [] as string[],
  showSavedOnly: false,
  quiz: "all",
  recentOnly: false,

  // ✅ NEW toggle
  groupSimilarOptions: false,
};

const getCreatedAtDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val?.toDate === "function") {
    try {
      return val.toDate();
    } catch {
      /* noop */
    }
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const getChapterNumber = (chapterString: string) => {
  const match = chapterString?.match?.(/Chapter (\d+)/);
  return match ? parseInt(match[1], 10) : Infinity;
};

export default function Home() {
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [filteredQuestions, setFilteredQuestions] = React.useState<Question[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filters, setFilters] = React.useState(initialFilters);
  const [sort, setSort] = React.useState<SortType>("chapter_asc");
  const [showAllAnswers, setShowAllAnswers] = React.useState(false);
  const [userAnswers, setUserAnswers] = React.useState<Record<string, string | string[]>>({});

  const [isExplanationPanelOpen, setIsExplanationPanelOpen] = React.useState(false);
  const [selectedQuestionForExplanation, setSelectedQuestionForExplanation] =
    React.useState<Question | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = React.useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = React.useState(true);

  const [isExamMode, setIsExamMode] = React.useState(false);
  const [isExamOptionsDialogOpen, setIsExamOptionsDialogOpen] = React.useState(false);
  const [examAnswerMode, setExamAnswerMode] = React.useState<ExamMode>("during");
  const [isExamFinished, setIsExamFinished] = React.useState(false);
  const [examScore, setExamScore] = React.useState(0);
  const [isResultsDialogOpen, setIsResultsDialogOpen] = React.useState(false);

  const isMobile = useIsMobile();
  const [showBackToTop, setShowBackToTop] = React.useState(false);
  const pageRef = React.useRef<HTMLDivElement>(null);

  const [savedQuestionIds, setSavedQuestionIds] = React.useState<string[]>([]);

  const fetchQuestions = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const questionsCollection = collection(db, "questions");
      const q = query(questionsCollection, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const questionsData = querySnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as Question)
      );
      setQuestions(questionsData);
    } catch (error) {
      console.error("Error fetching questions: ", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const allChapters = React.useMemo(() => {
    const chapters = new Set<string>();
    questions.forEach((q) => q.chapter && chapters.add(q.chapter));
    return Array.from(chapters).sort((a, b) => getChapterNumber(a) - getChapterNumber(b));
  }, [questions]);

  // meta: similar options inside same question
  const similarMetaById = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof getSimilarOptionsMeta>>();
    for (const q of questions) map.set(q.id, getSimilarOptionsMeta(q));
    return map;
  }, [questions]);

  // options only (normalized) for question-to-question similarity
  const optionsById = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const q of questions) {
      const opts = extractOptions(q).map((s) => normalizeText(s)).filter(Boolean);
      map.set(q.id, opts);
    }
    return map;
  }, [questions]);

  const questionSimilarity = React.useCallback(
    (a: Question, b: Question) => {
      const A = optionsById.get(a.id) ?? [];
      const B = optionsById.get(b.id) ?? [];
      if (A.length === 0 || B.length === 0) return 0;

      const bestAvg = (X: string[], Y: string[]) => {
        let sum = 0;
        for (const x of X) {
          let best = 0;
          for (const y of Y) {
            const s = diceSimilarity(x, y);
            if (s > best) best = s;
          }
          sum += best;
        }
        return sum / X.length;
      };

      const s1 = bestAvg(A, B);
      const s2 = bestAvg(B, A);
      return (s1 + s2) / 2;
    },
    [optionsById]
  );

  const randomSeed = React.useMemo(
    () =>
      [
        filters.quiz,
        searchQuery,
        filters.chapter.join(","),
        filters.questionType.join(","),
        String(filters.recentOnly),
        String(filters.showSavedOnly),
        String(filters.groupSimilarOptions),
        sort,
      ].join("|"),
    [
      filters.quiz,
      searchQuery,
      filters.chapter,
      filters.questionType,
      filters.recentOnly,
      filters.showSavedOnly,
      filters.groupSimilarOptions,
      sort,
    ]
  );

  const seededShuffle = React.useCallback((arr: Question[], seed: string) => {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const rnd = () => {
      h += 0x6d2b79f5;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }, []);

  const sortWithin = React.useCallback(
    (arr: Question[]) => {
      if (sort === "random") return seededShuffle(arr, randomSeed);
      if (sort === "chapter_desc") {
        return [...arr].sort((a, b) => getChapterNumber(b.chapter) - getChapterNumber(a.chapter));
      }
      return arr;
    },
    [sort, seededShuffle, randomSeed]
  );

  // nearest-neighbor order for similar bucket (options-only)
  const orderSimilarQuestions = React.useCallback(
    (arr: Question[]) => {
      if (arr.length <= 2) return arr;

      const byId = new Map(arr.map((q) => [q.id, q]));
      const remaining = new Set(arr.map((q) => q.id));
      const out: Question[] = [];

      const pickBestStart = () => {
        let bestId: string | null = null;
        let bestScore = -1;
        for (const id of remaining) {
          const s = similarMetaById.get(id)?.maxSimilarity ?? 0;
          if (s > bestScore) {
            bestScore = s;
            bestId = id;
          }
        }
        return bestId ? byId.get(bestId)! : byId.get([...remaining][0])!;
      };

      while (remaining.size) {
        let current = pickBestStart();
        out.push(current);
        remaining.delete(current.id);

        while (remaining.size) {
          let bestNext: Question | null = null;
          let bestSim = -1;

          for (const id of remaining) {
            const cand = byId.get(id)!;
            const sim = questionSimilarity(current, cand);
            if (sim > bestSim) {
              bestSim = sim;
              bestNext = cand;
            }
          }

          if (!bestNext) break;
          out.push(bestNext);
          remaining.delete(bestNext.id);
          current = bestNext;
        }
      }

      if (sort === "random") return seededShuffle(out, randomSeed);
      return out;
    },
    [questionSimilarity, similarMetaById, sort, seededShuffle, randomSeed]
  );

  React.useEffect(() => {
    if (isExamMode) return;

    const chapterSorted = [...questions].sort(
      (a, b) => getChapterNumber(a.chapter) - getChapterNumber(b.chapter)
    );

    let temp = chapterSorted;

    // quiz slicing (same logic you had)
    if (filters.quiz !== "all") {
      const quizNumber = parseInt(filters.quiz.replace("quiz", ""), 10);
      let startIndex = 0;
      let endIndex = chapterSorted.length;

      if (quizNumber === 1) {
        startIndex = 0;
        endIndex = 115;
      } else if (quizNumber === 2) {
        startIndex = 115;
        endIndex = 230;
      } else if (quizNumber === 3) {
        startIndex = 230;
        endIndex = 345;
      } else if (quizNumber === 4) {
        startIndex = 345;
        endIndex = 460;
      } else if (quizNumber === 5) {
        startIndex = 460;
        endIndex = 575;
      } else if (quizNumber === 6) {
        startIndex = 575;
        endIndex = chapterSorted.length;
      }

      temp = chapterSorted.slice(startIndex, endIndex);
    }

    if (filters.recentOnly) {
      const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
      temp = temp.filter((q) => {
        const d = getCreatedAtDate((q as any).createdAt);
        return d ? d >= cutoff : false;
      });
    }

    if (searchQuery) {
      const sq = searchQuery.toLowerCase();
      temp = temp.filter((q) => q.questionText?.toLowerCase().includes(sq));
    }

    if (filters.showSavedOnly) {
      temp = temp.filter((q) => savedQuestionIds.includes(q.id));
    }

    if (filters.chapter.length > 0) {
      temp = temp.filter((q) => filters.chapter.includes(q.chapter));
    }

    if (filters.questionType.length > 0) {
      temp = temp.filter((q) => filters.questionType.includes(q.questionType));
    }

    // ✅ grouping toggle
    if (filters.groupSimilarOptions) {
      const isSimilar = (q: Question) => !!similarMetaById.get(q.id)?.hasSimilar;

      const similarBucket = temp.filter(isSimilar);
      const otherBucket = temp.filter((q) => !isSimilar(q));

      const orderedSimilar = orderSimilarQuestions(similarBucket);
      const orderedOther = sortWithin(otherBucket);

      setFilteredQuestions([...orderedSimilar, ...orderedOther]);
      setUserAnswers({});
      return;
    }

    setFilteredQuestions(sortWithin(temp));
    setUserAnswers({});
  }, [
    isExamMode,
    questions,
    filters,
    searchQuery,
    savedQuestionIds,
    similarMetaById,
    orderSimilarQuestions,
    sortWithin,
  ]);

  React.useEffect(() => {
    const onWinScroll = () => setShowBackToTop(window.scrollY > 200);
    window.addEventListener("scroll", onWinScroll, { passive: true });
    return () => window.removeEventListener("scroll", onWinScroll);
  }, []);

  const handleExplainClick = (question: Question) => {
    setSelectedQuestionForExplanation(question);
    setIsExplanationPanelOpen(true);
  };

  const startExam = (mode: ExamMode) => {
    const shuffled = [...questions].sort(() => 0.5 - Math.random());
    const examQuestions = shuffled.slice(0, EXAM_QUESTION_COUNT);
    setFilteredQuestions(examQuestions);

    setIsExamMode(true);
    setExamAnswerMode(mode);
    setIsExamFinished(false);
    setUserAnswers({});
    setExamScore(0);
    setShowAllAnswers(false);

    setSearchQuery("");
    setFilters({ ...initialFilters });
    setSort("chapter_asc");
    setIsExamOptionsDialogOpen(false);
  };

  const handleAnswerChange = (questionId: string, answer: string | string[]) => {
    setUserAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const submitExam = () => {
    let score = 0;
    filteredQuestions.forEach((q) => {
      const userAnswer = userAnswers[q.id];
      if (!userAnswer) return;

      if (Array.isArray(q.correctAnswer)) {
        if (Array.isArray(userAnswer) && userAnswer.length === q.correctAnswer.length) {
          const sortedUserAnswers = [...userAnswer].sort();
          const sortedCorrectAnswers = [...q.correctAnswer].sort();
          if (sortedUserAnswers.every((val, index) => val === sortedCorrectAnswers[index])) {
            score++;
          }
        }
      } else {
        if (userAnswer === q.correctAnswer) score++;
      }
    });
    setExamScore(score);
    setIsExamFinished(true);
    setShowAllAnswers(true);
    setIsResultsDialogOpen(true);
  };

  const resetView = () => {
    setIsExamMode(false);
    setIsExamFinished(false);
    setUserAnswers({});
    setExamScore(0);
  };

  const handleQuestionsAdded = (newQuestions: Question[]) => {
    const combined = [...questions];
    newQuestions.forEach((newQ) => {
      const idx = combined.findIndex((q) => q.id === newQ.id);
      if (idx !== -1) combined[idx] = newQ;
      else combined.push(newQ);
    });

    combined.sort(
      (a: any, b: any) =>
        (getCreatedAtDate(b?.createdAt)?.getTime() ?? 0) -
        (getCreatedAtDate(a?.createdAt)?.getTime() ?? 0)
    );
    setQuestions(combined);
  };

  const handleQuestionDeleted = (questionId: string) => {
    setQuestions(questions.filter((q) => q.id !== questionId));
  };

  const handleQuestionUpdated = (updatedQuestion: Question) => {
    setQuestions(questions.map((q) => (q.id === updatedQuestion.id ? updatedQuestion : q)));
  };

  const toggleSaveQuestion = (questionId: string) => {
    setSavedQuestionIds((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId]
    );
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const clearAllFilters = () => {
    setFilters({ ...initialFilters });
    setSort("chapter_asc");
  };

  return (
    <LockProvider>
      <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground" ref={pageRef}>
        <FilterSheet
          isOpen={isFilterSheetOpen}
          setIsOpen={setIsFilterSheetOpen}
          filters={filters}
          setFilters={setFilters}
          chapters={allChapters}
          sort={sort}
          setSort={setSort}
          disabled={isExamMode}
          onClearAll={clearAllFilters}
        />

        <div className="flex-1 flex flex-col w-full max-w-full overflow-x-hidden">
          <div className="sticky top-0 z-30 w-full">
            <div
              className={cn(
                "transition-all duration-300 ease-in-out relative w-full",
                isMobile && !isHeaderVisible ? "h-0 overflow-hidden" : "h-auto"
              )}
            >
              <Header
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onQuestionsAdded={handleQuestionsAdded}
                onFilterClick={() => setIsFilterSheetOpen(true)}
                questionCount={filteredQuestions.length}
                showAllAnswers={showAllAnswers}
                setShowAllAnswers={setShowAllAnswers}
                isExamMode={isExamMode}
                onGenerateExam={() => setIsExamOptionsDialogOpen(true)}
                onResetView={resetView}
                filteredQuestions={filteredQuestions}
              />
              {isMobile && (
                <Button
                  variant="outline"
                  size="icon"
                  className={cn("absolute right-4 -bottom-4 z-20 rounded-full h-8 w-8 border-2 border-background")}
                  onClick={() => setIsHeaderVisible((prev) => !prev)}
                >
                  <ChevronUp className="h-4 w-4" />
                  <span className="sr-only">Toggle Header</span>
                </Button>
              )}
            </div>

            {isMobile && !isHeaderVisible && (
              <Button
                variant="outline"
                size="icon"
                className={cn("absolute right-4 top-2 z-20 rounded-full h-8 w-8 border-2 border-background")}
                onClick={() => setIsHeaderVisible((prev) => !prev)}
              >
                <ChevronDown className="h-4 w-4" />
                <span className="sr-only">Toggle Header</span>
              </Button>
            )}
          </div>

          <main className="flex-1 w-full max-w-full overflow-x-hidden">
            {isLoading ? (
              <div className="p-4 space-y-4 max-w-full lg:max-w-screen-lg mx-auto">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <QuestionList
                questions={filteredQuestions}
                allQuestions={questions}
                onExplainClick={handleExplainClick}
                onDelete={handleQuestionDeleted}
                onUpdate={handleQuestionUpdated}
                showAllAnswers={showAllAnswers}
                isExamMode={isExamMode}
                savedQuestionIds={savedQuestionIds}
                onToggleSave={toggleSaveQuestion}
                onAnswerChange={handleAnswerChange}
                examAnswerMode={examAnswerMode}
                isExamFinished={isExamFinished}
                userAnswers={userAnswers}
                onSubmitExam={submitExam}
              />
            )}
          </main>

          <Footer />
        </div>

        {selectedQuestionForExplanation && (
          <ExplanationPanel
            isOpen={isExplanationPanelOpen}
            setIsOpen={setIsExplanationPanelOpen}
            question={selectedQuestionForExplanation}
          />
        )}

        {showBackToTop && <BackToTopButton onClick={scrollToTop} />}

        <ExamOptionsDialog
          isOpen={isExamOptionsDialogOpen}
          setIsOpen={setIsExamOptionsDialogOpen}
          onStartExam={startExam}
        />

        <AlertDialog open={isResultsDialogOpen} onOpenChange={setIsResultsDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Exam Finished!</AlertDialogTitle>
              <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
                You have completed the exam. Here is your score.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4 text-center text-4xl font-bold">
              {examScore} / {EXAM_QUESTION_COUNT}
            </div>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setIsResultsDialogOpen(false)}>
                Review Answers
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </LockProvider>
  );
}

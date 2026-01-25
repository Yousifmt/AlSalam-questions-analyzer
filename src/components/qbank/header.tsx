"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Filter,
  PlusCircle,
  Search,
  X,
  Sun,
  Moon,
  Eye,
  EyeOff,
  RefreshCcw,
  FileText,
  Download,
  Wand2,
  CopyCheck,
  Lock,
  Unlock,
  EllipsisVertical,
} from "lucide-react";
import { PasteParserDialog } from "./paste-parser-dialog";
import { type Question } from "@/types";
import { useTheme } from "next-themes";
import { useLock } from "@/context/lock-context";
import { UnlockDialog } from "./unlock-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ExportOptionsDialog } from "./export-options-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const outlineStrong =
  "border-foreground/30 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-primary/40";
const inputStrong =
  "border-foreground/30 focus-visible:ring-2 focus-visible:ring-primary/40";

type HeaderProps = {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onQuestionsAdded: (newQuestions: Question[]) => void;
  onFilterClick: () => void;
  questionCount: number;
  showAllAnswers: boolean;
  setShowAllAnswers: (show: boolean | ((s: boolean) => boolean)) => void;
  isExamMode: boolean;
  onGenerateExam: () => void;
  onResetView: () => void;
  filteredQuestions: Question[];
};

export default function Header({
  searchQuery,
  setSearchQuery,
  onQuestionsAdded,
  onFilterClick,
  questionCount,
  showAllAnswers,
  setShowAllAnswers,
  isExamMode,
  onGenerateExam,
  onResetView,
  filteredQuestions,
}: HeaderProps) {
  const [isPasteDialogOpen, setIsPasteDialogOpen] = React.useState(false);
  const [isUnlockDialogOpen, setIsUnlockDialogOpen] = React.useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = React.useState(false);

  const { theme, setTheme } = useTheme();
  const { isLocked } = useLock();
  const router = useRouter();
  const { toast } = useToast();

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const handleToggleAnswers = () => setShowAllAnswers((prev) => !prev);

  const handleExportClick = () => {
    if (isExamMode) return;

    if (filteredQuestions.length === 0) {
      toast({
        title: "No questions to export",
        description: "The current filter has no questions. Please adjust your filters.",
        variant: "destructive",
      });
      return;
    }

    // ✅ Students (LOCKED): export immediately with current filtered list
    if (isLocked) {
      try {
        sessionStorage.setItem(
          "questionsForExport",
          JSON.stringify(filteredQuestions)
        );
        router.push("/export");
      } catch (error) {
        console.error("Failed to save questions to sessionStorage", error);
        toast({
          title: "Export Failed",
          description:
            "Could not prepare export. Your browser may have storage restrictions.",
          variant: "destructive",
        });
      }
      return;
    }

    // ✅ Admin (UNLOCKED): show export options dialog
    setIsExportDialogOpen(true);
  };

  return (
    <>
      <header className="flex-shrink-0 border-b border-border p-4 flex flex-col md:flex-row items-center justify-between gap-4 bg-background/80 backdrop-blur-sm">
        {/* Left */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-start">
          <h2 className="font-headline text-xl md:text-2xl">
            <span className="text-primary font-bold">Al-Salam</span>
            <span className="text-foreground"> Questions Analyzer</span>
          </h2>
          <span
            className={cn(
              "ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
              isLocked
                ? "border-amber-400/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "border-emerald-400/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            )}
          >
            {isLocked ? "Locked" : "Unlocked"}
          </span>
        </div>

        {/* Center */}
        <div className="w-full md:flex-1 flex flex-col md:flex-row items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              onClick={onFilterClick}
              size="sm"
              className={cn("md:w-auto w-fit", outlineStrong)}
              disabled={isExamMode}
            >
              <Filter className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Filters</span>
            </Button>

            <div className="relative flex-grow w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search questions..."
                className={cn("pl-10 pr-10", inputStrong)}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isExamMode}
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setSearchQuery("")}
                  disabled={isExamMode}
                >
                  <X className="h-5 w-5" />
                </Button>
              )}
            </div>

            <span
              className={cn(
                "text-xs sm:text-sm text-foreground whitespace-nowrap hidden md:inline-block",
                { "font-bold text-primary": isExamMode }
              )}
            >
              {isExamMode
                ? "Exam Mode"
                : `${questionCount} ${
                    questionCount === 1 ? "question" : "questions"
                  }`}
            </span>
          </div>
        </div>

        {/* Right */}
        <div className="w-full md:w-auto flex flex-col md:flex-row items-end md:items-center justify-end gap-1 md:gap-2">
          <div className="flex w-full md:w-auto items-center justify-end gap-2">
            {isExamMode ? (
              <Button onClick={onResetView} variant="destructive" size="sm">
                <RefreshCcw className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Reset View</span>
                <span className="md:hidden">Reset</span>
              </Button>
            ) : (
              <Button onClick={onGenerateExam} className="font-semibold" size="sm">
                <FileText className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Generate Exam</span>
                <span className="md:hidden">Exam</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className={outlineStrong}
              onClick={handleToggleAnswers}
              disabled={isExamMode}
            >
              {showAllAnswers ? (
                <EyeOff className="h-4 w-4 md:mr-2" />
              ) : (
                <Eye className="h-4 w-4 md:mr-2" />
              )}
              <span>{showAllAnswers ? "Hide Answers" : "Show Answers"}</span>
            </Button>

            {/* ✅ Export always visible, behavior changes by lock state */}
            <Button
              variant="outline"
              size="icon"
              className={cn("w-9 h-9", outlineStrong)}
              onClick={handleExportClick}
              disabled={isExamMode || filteredQuestions.length === 0}
              aria-label={isLocked ? "Export questions" : "Export options"}
              title={isLocked ? "Export" : "Export options (admin)"}
            >
              <Download className="h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="sm"
              className={cn("w-auto", outlineStrong)}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {mounted && theme === "dark" ? (
                <Sun className="h-[1.2rem] w-[1.2rem]" />
              ) : (
                <Moon className="h-[1.2rem] w-[1.2rem]" />
              )}
              <span className="ml-2">
                {mounted ? (theme === "dark" ? "Light" : "Dark") : "..."}
              </span>
            </Button>

            <Button
              variant="outline"
              size="icon"
              className={cn("w-9 h-9", outlineStrong)}
              onClick={() => setIsUnlockDialogOpen(true)}
              aria-label="Toggle lock"
            >
              {isLocked ? <Lock /> : <Unlock />}
            </Button>

            {/* Admin-only dropdown */}
            {!isLocked && !isExamMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn("w-9 h-9", outlineStrong)}
                    aria-label="Open admin actions"
                  >
                    <EllipsisVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className={cn(
                    "w-64 md:w-60 max-h-[70vh] overflow-auto border-border/40",
                    "rounded-lg md:rounded-xl p-1 shadow-lg",
                    "bg-popover text-popover-foreground"
                  )}
                >
                  <DropdownMenuLabel className="text-xs uppercase tracking-wide opacity-80">
                    Admin tools
                  </DropdownMenuLabel>

                  <DropdownMenuItem onSelect={() => setIsPasteDialogOpen(true)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add questions
                  </DropdownMenuItem>

                  <DropdownMenuItem onSelect={() => router.push("/categorize")}>
                    <Wand2 className="mr-2 h-4 w-4" /> Batch categorize
                  </DropdownMenuItem>

                  <DropdownMenuItem onSelect={() => router.push("/duplicates")}>
                    <CopyCheck className="mr-2 h-4 w-4" /> Show duplicates
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem onSelect={() => setIsUnlockDialogOpen(true)}>
                    <Lock className="mr-2 h-4 w-4" /> Lock editing
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <span
            className={cn("text-xs text-foreground md:hidden", {
              "font-bold text-primary": isExamMode,
            })}
          >
            {isExamMode
              ? "Exam Mode"
              : `${questionCount} ${
                  questionCount === 1 ? "question" : "questions"
                }`}
          </span>
        </div>
      </header>

      <PasteParserDialog
        isOpen={isPasteDialogOpen}
        setIsOpen={setIsPasteDialogOpen}
        onQuestionsAdded={onQuestionsAdded}
      />

      <UnlockDialog
        isOpen={isUnlockDialogOpen}
        setIsOpen={setIsUnlockDialogOpen}
      />

      {/* ✅ Export Options dialog ONLY admin (unlocked) can reach because we never open it while locked */}
      <ExportOptionsDialog
        isOpen={isExportDialogOpen}
        setIsOpen={setIsExportDialogOpen}
        questions={filteredQuestions}
      />
    </>
  );
}

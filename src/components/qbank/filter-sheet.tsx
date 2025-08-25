
"use client";

import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import FilterPanel from "./filter-panel";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";

type FilterSheetProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  filters: any;
  setFilters: (filters: any) => void;
  chapters: string[];
  sort: string;
  setSort: (sort: string) => void;
  disabled?: boolean;
};

export default function FilterSheet({ isOpen, setIsOpen, filters, setFilters, chapters, sort, setSort, disabled = false }: FilterSheetProps) {
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent side="left" className="w-full sm:max-w-xs p-0 flex flex-col">
        <SheetHeader className="p-6 border-b border-border">
          <SheetTitle className="font-headline text-2xl flex items-center gap-2">
            <Filter className={cn("text-primary", disabled && "text-muted-foreground")} />
            Filter & Sort Questions
          </SheetTitle>
          <SheetDescription className="text-gray-400">
            {disabled ? "Filters are disabled during Exam Mode." : "Refine and reorder the question list based on your criteria."}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className={cn("flex-1", disabled && "opacity-50 pointer-events-none")}>
            <FilterPanel
                filters={filters}
                setFilters={setFilters}
                chapters={chapters}
                sort={sort}
                setSort={setSort}
            />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

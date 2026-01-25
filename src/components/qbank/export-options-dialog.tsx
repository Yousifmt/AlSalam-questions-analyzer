"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { type Question } from "@/types";
import { Download } from "lucide-react";

type ExportOptionsDialogProps = {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  questions: Question[];
};

export function ExportOptionsDialog({
  isOpen,
  setIsOpen,
  questions,
}: ExportOptionsDialogProps) {
  const [count, setCount] = React.useState(questions.length);
  const [order, setOrder] = React.useState<"sorted" | "random">("sorted");
  const { toast } = useToast();
  const router = useRouter();

  React.useEffect(() => {
    if (isOpen) {
      setCount(Math.max(1, questions.length));
      setOrder("sorted");
    }
  }, [isOpen, questions.length]);

  const handleExport = () => {
    if (!questions.length) {
      toast({
        title: "Nothing to export",
        description: "No questions available in the current filter.",
        variant: "destructive",
      });
      return;
    }

    let list = [...questions];

    if (order === "random") {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }

    const safeCount = Math.min(Math.max(1, count), list.length);
    const finalQuestions = list.slice(0, safeCount);

    try {
      sessionStorage.setItem("questionsForExport", JSON.stringify(finalQuestions));
      router.push("/export");
      setIsOpen(false);
    } catch (error) {
      console.error("Failed to save questions to sessionStorage", error);
      toast({
        title: "Export Failed",
        description:
          "Could not prepare questions for export. Your browser may have storage restrictions.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-headline text-2xl flex items-center gap-2">
            <Download className="text-primary" />
            Export Options (Admin)
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Choose how many questions to export and in what order.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="question-count">Number of Questions</Label>
            <Input
              id="question-count"
              type="number"
              value={count}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isNaN(n)) return;
                setCount(Math.min(Math.max(1, n), questions.length));
              }}
              max={questions.length}
              min={1}
            />
            <p className="text-sm text-gray-500">
              Exporting from a pool of {questions.length} filtered questions.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Order</Label>
            <RadioGroup
              value={order}
              onValueChange={(v: "sorted" | "random") => setOrder(v)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="sorted" id="sorted" />
                <Label htmlFor="sorted">Current sort order</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="random" id="random" />
                <Label htmlFor="random">Random order</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={!questions.length}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Leaf,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { TopNav } from "@/components/TopNav";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
];

type Severity = "Low" | "Medium" | "High";

type DiagnoseResult = {
  disease: string;
  confidence: number;
  severity: Severity;
  recommendations: string[];
};

const MOCK_RESULT: DiagnoseResult = {
  disease: "Leaf Spot Detected",
  confidence: 87,
  severity: "Medium",
  recommendations: [
    "Remove affected leaves",
    "Avoid watering directly on leaves",
    "Improve air circulation",
    "Monitor plant condition for the next few days",
  ],
};

export default function DiagnosePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);

  const handleAnalyzed = (r: DiagnoseResult) => {
    setResult(r);
    setModalOpen(false);
  };

  const handleScanAgain = () => {
    setResult(null);
    setModalOpen(true);
  };

  return (
    <div className="min-h-dvh bg-slate-50">
      <TopNav />

      <main className="pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

          {/* Page Header */}
          <div className="flex items-center gap-3 mb-10 sm:mb-12">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <Leaf className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Plant Disease Detection
            </h1>
          </div>

          {/* Hero CTA */}
          <section
            aria-label="Diagnose plant"
            className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 sm:p-12 flex flex-col items-center justify-center text-center min-h-[360px]"
          >
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
              Diagnose Your Plant
            </h2>
            <p className="text-sm sm:text-base text-slate-500 max-w-md mb-8">
              Upload a photo of your plant to help us identify any diseases or pests.
            </p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-semibold text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Scan Plant
            </button>
          </section>

          {/* Mock result */}
          {result && (
            <section aria-label="Diagnosis result" className="mt-8">
              <ResultCard result={result} onScanAgain={handleScanAgain} />
            </section>
          )}
        </div>
      </main>

      <UploadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAnalyzed={handleAnalyzed}
      />
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

function UploadModal({
  open,
  onClose,
  onAnalyzed,
}: {
  open: boolean;
  onClose: () => void;
  onAnalyzed: (result: DiagnoseResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Reset state whenever the modal is closed
  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview((p) => {
        if (p) URL.revokeObjectURL(p);
        return null;
      });
      setError(null);
      setIsDragging(false);
      setIsAnalyzing(false);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isAnalyzing) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, isAnalyzing, onClose]);

  // Revoke object URL when preview changes/unmounts
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const validate = (f: File): string | null => {
    if (!ACCEPTED_MIME_TYPES.includes(f.type)) {
      return "Unsupported file type. Please upload PNG, JPG or WEBP.";
    }
    if (f.size > MAX_FILE_SIZE) {
      return "File is too large. Maximum size is 5 MB.";
    }
    return null;
  };

  const handleFile = (f: File) => {
    const err = validate(f);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleAnalyze = async () => {
    if (!file || isAnalyzing) return;
    setIsAnalyzing(true);
    // Simulated analysis delay — replace with real API later
    await new Promise((r) => setTimeout(r, 1500));
    onAnalyzed(MOCK_RESULT);
  };

  if (!open) return null;

  const fileSizeKB = file ? (file.size / 1024).toFixed(0) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={() => !isAnalyzing && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-xl p-6 sm:p-8"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isAnalyzing}
          aria-label="Close upload dialog"
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Header */}
        <div className="mb-6 pr-8">
          <h2
            id="upload-modal-title"
            className="text-xl font-bold text-slate-900 mb-1"
          >
            Upload File
          </h2>
          <p className="text-sm text-slate-500">
            Upload a photo of your plant to help us identify any diseases or pests.
          </p>
        </div>

        {/* Hidden native input */}
        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            // allow re-selecting the same file
            e.target.value = "";
          }}
        />

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => !isAnalyzing && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !isAnalyzing) {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isAnalyzing) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => !isAnalyzing && handleDrop(e)}
          className={`w-full min-h-[220px] sm:min-h-[260px] flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 transition-colors cursor-pointer ${
            isDragging
              ? "border-emerald-500 bg-emerald-50"
              : "border-slate-300 bg-slate-50/60 hover:border-emerald-400 hover:bg-slate-50"
          } ${isAnalyzing ? "opacity-60 pointer-events-none" : ""}`}
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Selected plant preview"
              className="max-h-56 max-w-full rounded-lg shadow-sm object-contain"
            />
          ) : (
            <>
              <div className="w-12 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center shadow-sm">
                <ImageIcon className="w-6 h-6 text-slate-400" aria-hidden="true" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  Drop your image here or click to browse
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  PNG, JPG, WEBP (max. 5MB)
                </p>
              </div>
            </>
          )}
        </div>

        {/* File info / error */}
        <div className="mt-3 min-h-[1.25rem]">
          {error ? (
            <p className="text-xs font-medium text-red-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
              {error}
            </p>
          ) : file ? (
            <p className="text-xs text-slate-500 truncate">
              <span className="font-medium text-slate-700">{file.name}</span>
              {fileSizeKB && <span className="text-slate-400"> · {fileSizeKB} KB</span>}
            </p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!file || !!error || isAnalyzing}
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-semibold text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-emerald-500"
          >
            {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {isAnalyzing ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({
  result,
  onScanAgain,
}: {
  result: DiagnoseResult;
  onScanAgain: () => void;
}) {
  const severityStyles: Record<Severity, string> = {
    Low: "bg-emerald-100 text-emerald-700",
    Medium: "bg-amber-100 text-amber-700",
    High: "bg-red-100 text-red-700",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-slate-900 truncate">
              {result.disease}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Diagnosis result</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onScanAgain}
          className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-md px-2 py-1"
        >
          Scan again
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Confidence
          </p>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {result.confidence}%
          </p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Severity
          </p>
          <span
            className={`inline-block px-2.5 py-1 rounded-full text-sm font-semibold ${severityStyles[result.severity]}`}
          >
            {result.severity}
          </span>
        </div>
      </div>

      {/* Recommendations */}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-3">
          Recommended actions
        </h4>
        <ul className="space-y-2">
          {result.recommendations.map((rec) => (
            <li
              key={rec}
              className="flex items-start gap-2.5 text-sm text-slate-600"
            >
              <CheckCircle2
                className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0"
                aria-hidden="true"
              />
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

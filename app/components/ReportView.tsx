"use client";

import { useState, useEffect } from "react";
import { pdf } from "@react-pdf/renderer";
import { ReportPdf } from "./ReportPdf";

interface AIUsageByModel {
  [model: string]: {
    inputTokens: number;
    outputTokens: number;
    calls: number;
    costCents: number;
  };
}

interface AIUsageSummary {
  byModel: AIUsageByModel;
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

interface Report {
  id: number;
  title: string;
  executiveSummary: string;
  currentPositioning: {
    mainCompany: { name: string; description?: string; websiteUrl?: string };
    competitors: Array<{ name: string; description?: string }>;
    keyFindings: string[];
  };
  competitorAnalysis: {
    marketPosition: string;
    competitiveAdvantages: string[];
    weaknesses: string[];
  };
  nextBigThingOptions: Array<{
    id: number;
    title: string;
    summary: string;
    difficulty: number;
  }>;
  recommendedStrategy?: {
    id: number;
    title: string;
    summary: string;
  };
  confidenceScore: number;
  aiUsage?: AIUsageSummary;
}

interface ReportViewProps {
  projectId: number;
}

// Model cost per 1M tokens (from ai-service.ts)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  summary: { input: 0.008, output: 0.008 },
  analysis: { input: 0.01, output: 0.01 },
  strategy: { input: 0.02, output: 0.02 },
};

function formatCents(cents: number): string {
  if (cents < 1) {
    return `$${(cents * 100).toFixed(2)}¢`;
  }
  return `$${(cents / 100).toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

function getModelTier(modelName: string): string {
  if (modelName.includes("deepseek")) return "summary";
  if (modelName.includes("Qwen3-Coder") || modelName.includes("MiniMax")) {
    // Check if it's used for strategy tasks
    return "strategy";
  }
  return "analysis";
}

function getDisplayName(modelFullName: string): string {
  // Convert "deepseek-ai/DeepSeek-V3.1" to "DeepSeek-V3.1"
  const parts = modelFullName.split("/");
  return parts[parts.length - 1];
}

export function ReportView({ projectId }: ReportViewProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/report`);
        if (response.ok) {
          const data = await response.json();
          setReport(data);
        }
      } catch (error) {
        console.error("Error fetching report:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchReport();
  }, [projectId]);

  const handleDownloadPdf = async () => {
    if (!report) return;
    setIsPdfLoading(true);
    try {
      const blob = await pdf(<ReportPdf report={report} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.title.replace(/[^a-z0-9]/gi, "_")}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
    } finally {
      setIsPdfLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-xl">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          No report generated yet.
        </p>
        <p className="text-sm text-gray-500">
          Complete the analysis pipeline to generate your strategic report.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-8 rounded-xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-blue-200 text-sm">Strategic Analysis Report</span>
          <div className="flex items-center gap-3">
            <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
              Confidence: {Math.round(report.confidenceScore * 100)}%
            </span>
            <button
              onClick={handleDownloadPdf}
              disabled={isPdfLoading}
              className="text-sm bg-white/20 hover:bg-white/30 disabled:opacity-50 px-4 py-1 rounded-full flex items-center gap-2 transition-colors"
            >
              {isPdfLoading ? (
                <span className="animate-spin inline-block h-3 w-3 border-b-2 border-white rounded-full" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {isPdfLoading ? "Generating..." : "Download PDF"}
            </button>
          </div>
        </div>
        <h2 className="text-3xl font-bold mb-2">{report.title}</h2>
        <p className="text-blue-100">{report.executiveSummary}</p>
      </div>

      {/* Current Positioning */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
        <h3 className="text-xl font-semibold mb-4">Current Market Position</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium mb-2">Your Company</h4>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              {report.currentPositioning?.mainCompany?.name || "N/A"}
            </p>
            {report.currentPositioning?.mainCompany?.description && (
              <p className="text-sm text-gray-500">
                {report.currentPositioning.mainCompany.description}
              </p>
            )}
          </div>
          <div>
            <h4 className="font-medium mb-2">Key Findings</h4>
            <ul className="space-y-2">
              {(report.currentPositioning?.keyFindings || []).map((finding: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{finding}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Competitor Analysis */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
        <h3 className="text-xl font-semibold mb-4">Competitor Analysis</h3>
        <div className="mb-4">
          <p className="text-gray-600 dark:text-gray-400">
            {report.competitorAnalysis?.marketPosition || "N/A"}
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-green-600 mb-2">
              Competitive Advantages
            </h4>
            <ul className="space-y-2">
              {(report.competitorAnalysis?.competitiveAdvantages || []).map(
                (adv: string, index: number) => (
                  <li key={index} className="flex items-start gap-2 text-sm">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{adv}</span>
                  </li>
                )
              )}
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-red-600 mb-2">Areas for Improvement</h4>
            <ul className="space-y-2">
              {(report.competitorAnalysis?.weaknesses || []).map((weakness: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-red-500 mt-0.5">!</span>
                  <span>{weakness}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Strategic Options */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
        <h3 className="text-xl font-semibold mb-4">Strategic Options</h3>
        <div className="grid md:grid-cols-3 gap-4">
          {(report.nextBigThingOptions || []).map((option: any, index: number) => (
            <div
              key={option.id || index}
              className={`p-4 rounded-lg border-2 ${
                report.recommendedStrategy?.id === option.id
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              {report.recommendedStrategy?.id === option.id && (
                <span className="text-xs font-medium text-green-600 mb-2 block">
                  Recommended
                </span>
              )}
              <h4 className="font-semibold mb-1">{option.title}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {option.summary}
              </p>
              <span className="text-xs text-gray-500">
                Difficulty: {option.difficulty}/10
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Strategy */}
      {report.recommendedStrategy && (
        <div className="bg-gradient-to-r from-green-600 to-green-800 text-white p-8 rounded-xl">
          <span className="text-green-200 text-sm mb-2 block">
            Recommended Strategy
          </span>
          <h3 className="text-2xl font-bold mb-2">
            {report.recommendedStrategy.title}
          </h3>
          <p className="text-green-100">{report.recommendedStrategy.summary}</p>
        </div>
      )}

      {/* AI Usage Summary */}
      {report.aiUsage && Object.keys(report.aiUsage.byModel).length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow">
          <h3 className="text-xl font-semibold mb-4">AI Usage Summary</h3>
          <p className="text-sm text-gray-500 mb-4">
            Models used and tokens consumed during analysis
          </p>

          <div className="space-y-3">
            {Object.entries(report.aiUsage.byModel).map(([model, usage]) => (
              <div key={model} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div className="flex-1">
                  <div className="font-medium text-sm">{getDisplayName(model)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {usage.calls} call{usage.calls !== 1 ? "s" : ""} ·{" "}
                    {formatTokens(usage.inputTokens)} input tokens ·{" "}
                    {formatTokens(usage.outputTokens)} output tokens
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">
                    {formatCents(usage.costCents)}
                  </div>
                  <div className="text-xs text-gray-500">
                    ${((usage.costCents / 100) / ((usage.inputTokens + usage.outputTokens) / 1000)).toFixed(4)}/1K tokens
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t-2 border-gray-200 dark:border-gray-600 flex justify-between items-center">
            <div>
              <span className="text-lg font-semibold">Total Cost</span>
              <span className="text-sm text-gray-500 ml-2">
                ({formatTokens(report.aiUsage.totalInputTokens)} input + {formatTokens(report.aiUsage.totalOutputTokens)} output tokens)
              </span>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCents(report.aiUsage.totalCostCents)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
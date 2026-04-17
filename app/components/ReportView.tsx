"use client";

import { useState, useEffect } from "react";

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
}

interface ReportViewProps {
  projectId: number;
}

export function ReportView({ projectId }: ReportViewProps) {
  const [report, setReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
          <span className="text-sm bg-white/20 px-3 py-1 rounded-full">
            Confidence: {Math.round(report.confidenceScore * 100)}%
          </span>
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
              {report.currentPositioning.mainCompany.name}
            </p>
            {report.currentPositioning.mainCompany.description && (
              <p className="text-sm text-gray-500">
                {report.currentPositioning.mainCompany.description}
              </p>
            )}
          </div>
          <div>
            <h4 className="font-medium mb-2">Key Findings</h4>
            <ul className="space-y-2">
              {report.currentPositioning.keyFindings.map((finding, index) => (
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
            {report.competitorAnalysis.marketPosition}
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-green-600 mb-2">
              Competitive Advantages
            </h4>
            <ul className="space-y-2">
              {report.competitorAnalysis.competitiveAdvantages.map(
                (adv, index) => (
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
              {report.competitorAnalysis.weaknesses.map((weakness, index) => (
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
          {report.nextBigThingOptions.map((option, index) => (
            <div
              key={option.id}
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
    </div>
  );
}
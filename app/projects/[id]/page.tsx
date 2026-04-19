"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { StrategyCanvas } from "@/app/components/StrategyCanvas";
import { NextBigThingOptions } from "@/app/components/NextBigThingOptions";
import { ReportView } from "@/app/components/ReportView";

interface Project {
  id: number;
  name: string;
  websiteUrl: string;
  category?: string;
  region?: string;
  notes?: string;
  status: string;
  createdAt: string;
}

interface AnalysisRun {
  id: number;
  stage: string;
  status: string;
  createdAt: string;
}

const ANALYSIS_STAGES = [
  { key: "business_research", label: "Business Research" },
  { key: "competitor_discovery", label: "Competitor Discovery" },
  { key: "competitor_normalization", label: "Analyzing Competitors" },
  { key: "deep_main_research", label: "Deep Website Analysis" },
  { key: "deep_competitor_research", label: "Competitor Deep Dive" },
  { key: "review_aggregation", label: "Review Aggregation" },
  { key: "factor_generation", label: "Generating Factors" },
  { key: "company_scoring", label: "Scoring Companies" },
  { key: "strategy_canvas", label: "Building Strategy Canvas" },
  { key: "next_big_thing", label: "Generating Strategies" },
  { key: "report_assembly", label: "Assembling Report" },
];

const STAGE_LABELS: Record<string, string> = {
  business_research: "Business Research",
  competitor_discovery: "Competitor Discovery",
  competitor_normalization: "Analyzing Competitors",
  deep_main_research: "Deep Dive: Your Website",
  deep_competitor_research: "Deep Dive: Competitor Sites",
  review_aggregation: "Gathering Reviews (Google, Yelp, Reddit)",
  factor_generation: "Generating Factors",
  company_scoring: "Scoring Companies",
  strategy_canvas: "Building Strategy Canvas",
  next_big_thing: "Generating Strategies",
  report_assembly: "Assembling Report",
  complete: "Analysis Complete",
};

const STAGE_DETAILS: Record<string, string> = {
  business_research: "Gathering basic business information...",
  competitor_discovery: "Identifying your main competitors...",
  competitor_normalization: "Standardizing competitor data...",
  deep_main_research: "Scraping your website for detailed insights...",
  deep_competitor_research: "Deep diving into competitor websites...",
  review_aggregation: "Finding customer reviews from multiple sources...",
  factor_generation: "Identifying key market factors...",
  company_scoring: "Scoring your company vs competitors...",
  strategy_canvas: "Building your strategy canvas...",
  next_big_thing: "Creating breakthrough strategy options...",
  report_assembly: "Writing your comprehensive report...",
  complete: "Done!",
};

export default function ProjectPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = parseInt(params.id, 10);
  
  const [project, setProject] = useState<Project | null>(null);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [activeTab, setActiveTab] = useState<"canvas" | "strategy" | "report">("canvas");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisRefreshKey, setAnalysisRefreshKey] = useState(0);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}`);
        if (response.ok) {
          const data = await response.json();
          setProject(data.project);
          setAnalysisRuns(data.runs || []);
        }
      } catch (error) {
        console.error("Error fetching project:", error);
      }
    };

    fetchProject();
  }, [projectId]);

  const startAnalysis = async () => {
    setIsAnalyzing(true);
    setCurrentStage(STAGE_LABELS["business_research"]);
    setAnalysisProgress(0);
    try {
      let currentStageKey = "business_research";
      let hasPendingStage = true;
      let stageIndex = 0;

      while (hasPendingStage) {
        setCurrentStage(STAGE_LABELS[currentStageKey]);
        setAnalysisProgress(Math.round((stageIndex / ANALYSIS_STAGES.length) * 100));
        
        console.log(`Starting analysis stage: ${currentStageKey}`);
        
        const response = await fetch(`/api/projects/${projectId}/analyze`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ stage: currentStageKey }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Analysis error:", response.status, errorText);
          throw new Error(`Analysis failed: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        console.log(`Stage ${currentStageKey} completed:`, data);
        
        setAnalysisRuns(prev => [...prev, data]);

        // Check if analysis is complete or if there's a next stage
        if (data.completed || data.stage === "complete" || data.status !== "pending") {
          hasPendingStage = false;
        } else {
          // Continue with the next stage
          currentStageKey = data.stage;
          stageIndex++;
        }
      }

      setAnalysisProgress(100);
      setCurrentStage(STAGE_LABELS["complete"]);
      
      // Trigger refresh of canvas/report data
      setAnalysisRefreshKey(prev => prev + 1);
    } catch (error) {
      console.error("Error starting analysis:", error);
      // Show error message to user
      setCurrentStage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setTimeout(() => {
        setIsAnalyzing(false);
        setCurrentStage(null);
        setAnalysisProgress(0);
      }, 1500); // Show complete message for 1.5 seconds
    }
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/projects" className="text-blue-600 hover:text-blue-700">
                ← Back to Projects
              </Link>
              <div>
                <h1 className="text-2xl font-bold">{project.name}</h1>
                <p className="text-gray-600 dark:text-gray-400">{project.websiteUrl}</p>
                <div className="flex gap-2 mt-2">
                  {project.category && (
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm rounded-full">
                      {project.category}
                    </span>
                  )}
                  {project.region && (
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-sm rounded-full">
                      {project.region}
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                    project.status === "complete"
                      ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                      : "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200"
                  }`}>
                    {project.status}
                  </span>
                </div>
              </div>
            </div>

            {!isAnalyzing ? (
              <button
                onClick={startAnalysis}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Start Analysis
              </button>
            ) : (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium text-blue-600">{currentStage}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {currentStage ? (STAGE_DETAILS[currentStage] || 'Processing...') : 'Starting...'}
                  </p>
                  <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-blue-600 transition-all duration-300 ease-out"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                </div>
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="container mx-auto px-4 py-6">
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("canvas")}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "canvas"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Strategy Canvas
            </button>
            <button
              onClick={() => setActiveTab("strategy")}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "strategy"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Next Big Thing
            </button>
            <button
              onClick={() => setActiveTab("report")}
              className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "report"
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Report
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="min-h-[500px]">
          {activeTab === "canvas" && <StrategyCanvas key={`canvas-${analysisRefreshKey}`} projectId={projectId} />}
          {activeTab === "strategy" && <NextBigThingOptions key={`strategy-${analysisRefreshKey}`} projectId={projectId} />}
          {activeTab === "report" && <ReportView key={`report-${analysisRefreshKey}`} projectId={projectId} />}
        </div>
      </div>
    </div>
  );
}
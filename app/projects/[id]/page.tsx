"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { StrategyCanvas } from "@components/StrategyCanvas";
import { NextBigThingOptions } from "@components/NextBigThingOptions";
import { ReportView } from "@components/ReportView";

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

export default function ProjectPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const projectId = parseInt(params.id, 10);
  
  const [project, setProject] = useState<Project | null>(null);
  const [analysisRuns, setAnalysisRuns] = useState<AnalysisRun[]>([]);
  const [activeTab, setActiveTab] = useState<"canvas" | "strategy" | "report">("canvas");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
    try {
      const response = await fetch(`/api/projects/${projectId}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stage: "business_research" }),
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysisRuns(prev => [...prev, data]);
      }
    } catch (error) {
      console.error("Error starting analysis:", error);
    } finally {
      setIsAnalyzing(false);
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

            {!isAnalyzing && (
              <button
                onClick={startAnalysis}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Start Analysis
              </button>
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
          {activeTab === "canvas" && <StrategyCanvas projectId={projectId} />}
          {activeTab === "strategy" && <NextBigThingOptions projectId={projectId} />}
          {activeTab === "report" && <ReportView projectId={projectId} />}
        </div>
      </div>
    </div>
  );
}
"use client";

import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface CanvasData {
  factors: Array<{
    id: number;
    name: string;
    description: string;
  }>;
  companies: Array<{
    id: number;
    name: string;
    isMain: boolean;
  }>;
  scores: Array<{
    companyId: number;
    factorId: number;
    score: number;
    confidence: number;
    explanation: string;
  }>;
}

interface StrategyCanvasProps {
  projectId: number;
}

export function StrategyCanvas({ projectId }: StrategyCanvasProps) {
  const [canvasData, setCanvasData] = useState<CanvasData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCompanies, setSelectedCompanies] = useState<number[]>([]);
  const [hoveredData, setHoveredData] = useState<{
    factor: string;
    score: number;
    company: string;
    explanation: string;
  } | null>(null);

  useEffect(() => {
    const fetchCanvasData = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/canvas`);
        if (response.ok) {
          const data = await response.json();
          setCanvasData(data);
          setSelectedCompanies(
            data.companies.map((c: { id: number }) => c.id)
          );
        }
      } catch (error) {
        console.error("Error fetching canvas data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCanvasData();
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!canvasData || canvasData.factors.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-xl">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          No strategy canvas data available yet.
        </p>
        <p className="text-sm text-gray-500">
          Start an analysis to generate the strategy canvas.
        </p>
      </div>
    );
  }

  // Transform data for Recharts
  const chartData = canvasData.factors.map((factor, index) => {
    const dataPoint: Record<string, string | number> = {
      name: factor.name,
      fullName: factor.description || factor.name,
    };

    canvasData.companies.forEach((company) => {
      const score = canvasData.scores.find(
        (s) => s.companyId === company.id && s.factorId === factor.id
      );
      dataPoint[company.name] = score?.score || 0;
    });

    return dataPoint;
  });

  const colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  const toggleCompany = (companyId: number) => {
    setSelectedCompanies((prev) =>
      prev.includes(companyId)
        ? prev.filter((id) => id !== companyId)
        : [...prev, companyId]
    );
  };

  return (
    <div className="space-y-6">
      {/* Company Legend / Toggle */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
        <h3 className="text-sm font-medium mb-3">Companies</h3>
        <div className="flex flex-wrap gap-3">
          {canvasData.companies.map((company, index) => (
            <label
              key={company.id}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedCompanies.includes(company.id)}
                onChange={() => toggleCompany(company.id)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span
                className={`text-sm ${
                  company.isMain ? "font-semibold" : ""
                }`}
                style={{
                  color: selectedCompanies.includes(company.id)
                    ? colors[index % colors.length]
                    : "#9ca3af",
                }}
              >
                {company.name}
                {company.isMain && " (Your Company)"}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Strategy Canvas</h3>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis domain={[0, 10]} tick={{ fontSize: 12 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                        <p className="font-medium mb-2">{data.fullName}</p>
                        {payload.map((entry, index) => (
                          <div key={index} className="flex items-center gap-2 text-sm">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span>{entry.name}:</span>
                            <span className="font-medium">{entry.value}/10</span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              {canvasData.companies
                .filter((c) => selectedCompanies.includes(c.id))
                .map((company, index) => (
                  <Line
                    key={company.id}
                    type="monotone"
                    dataKey={company.name}
                    stroke={colors[canvasData.companies.indexOf(company) % colors.length]}
                    strokeWidth={company.isMain ? 3 : 1}
                    dot={{ r: company.isMain ? 6 : 3 }}
                    activeDot={{ r: 8 }}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Factor Details */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Factor Details</h3>
        <div className="grid gap-4">
          {canvasData.factors.map((factor) => {
            const mainCompanyScore = canvasData.scores.find(
              (s) =>
                s.companyId ===
                  canvasData.companies.find((c) => c.isMain)?.id &&
                s.factorId === factor.id
            );

            return (
              <div
                key={factor.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <h4 className="font-medium mb-2">{factor.name}</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {factor.description || "No description available."}
                </p>
                {mainCompanyScore && (
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">Score:</span>
                    <span className="font-semibold">
                      {mainCompanyScore.score}/10
                    </span>
                    <span className="text-gray-500">Confidence:</span>
                    <span>{Math.round(mainCompanyScore.confidence * 100)}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
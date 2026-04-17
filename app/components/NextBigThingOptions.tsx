"use client";

import { useState, useEffect } from "react";

interface NextBigThingOption {
  id: number;
  title: string;
  summary: string;
  eliminate: string;
  reduce: string;
  raise: string;
  create: string;
  valueCurve: Array<{ factor: string; currentScore: number; proposedScore: number }>;
  targetCustomer: string;
  positioningStatement: string;
  risks: string[];
  difficulty: number;
  operationalImplications: string;
  revenuePotential?: string;
}

interface NextBigThingOptionsProps {
  projectId: number;
}

export function NextBigThingOptions({ projectId }: NextBigThingOptionsProps) {
  const [options, setOptions] = useState<NextBigThingOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/next-big-thing`);
        if (response.ok) {
          const data = await response.json();
          setOptions(data.options || []);
        }
      } catch (error) {
        console.error("Error fetching options:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOptions();
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-100 dark:bg-gray-800 rounded-xl">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          No strategic options generated yet.
        </p>
        <p className="text-sm text-gray-500">
          Complete the analysis to see your "Next Big Thing" options.
        </p>
      </div>
    );
  }

  const getDifficultyColor = (difficulty: number) => {
    if (difficulty <= 3) return "text-green-600 bg-green-100 dark:bg-green-900";
    if (difficulty <= 6) return "text-yellow-600 bg-yellow-100 dark:bg-yellow-900";
    return "text-red-600 bg-red-100 dark:bg-red-900";
  };

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Option Cards */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-semibold">Strategic Directions</h3>
          {options.map((option, index) => (
            <button
              key={option.id}
              onClick={() => setSelectedOption(index)}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                selectedOption === index
                  ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-blue-400"
              }`}
            >
              <span className="text-xs font-medium text-blue-600 mb-2 block">
                Option {index + 1}
              </span>
              <h4 className="font-semibold mb-1">{option.title}</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {option.summary}
              </p>
              <div className={`mt-2 text-xs font-medium px-2 py-1 rounded-full inline-block ${getDifficultyColor(option.difficulty)}`}>
                Difficulty: {option.difficulty}/10
              </div>
            </button>
          ))}
        </div>

        {/* Option Details */}
        <div className="lg:col-span-2">
          {selectedOption !== null && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="mb-6">
                <span className="text-xs font-medium text-blue-600 mb-2 block">
                  Option {(selectedOption || 0) + 1}
                </span>
                <h3 className="text-2xl font-bold mb-2">
                  {options[selectedOption].title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {options[selectedOption].summary}
                </p>
              </div>

              {/* ERRC Grid */}
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <h5 className="font-semibold text-red-700 dark:text-red-300 mb-2">
                    Eliminate
                  </h5>
                  <p className="text-sm">{options[selectedOption].eliminate}</p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                  <h5 className="font-semibold text-yellow-700 dark:text-yellow-300 mb-2">
                    Reduce
                  </h5>
                  <p className="text-sm">{options[selectedOption].reduce}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <h5 className="font-semibold text-blue-700 dark:text-blue-300 mb-2">
                    Raise
                  </h5>
                  <p className="text-sm">{options[selectedOption].raise}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <h5 className="font-semibold text-green-700 dark:text-green-300 mb-2">
                    Create
                  </h5>
                  <p className="text-sm">{options[selectedOption].create}</p>
                </div>
              </div>

              {/* Target Customer & Positioning */}
              <div className="mb-6">
                <div className="mb-4">
                  <h5 className="font-semibold mb-2">Target Customer</h5>
                  <p className="text-gray-600 dark:text-gray-400">
                    {options[selectedOption].targetCustomer}
                  </p>
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                  <h5 className="font-semibold mb-2">Positioning Statement</h5>
                  <p className="text-sm italic">
                    "{options[selectedOption].positioningStatement}"
                  </p>
                </div>
              </div>

              {/* Risks */}
              <div className="mb-6">
                <h5 className="font-semibold mb-2">Risks & Challenges</h5>
                <ul className="space-y-2">
                  {options[selectedOption].risks.map((risk, index) => (
                    <li key={index} className="flex items-start gap-2 text-sm">
                      <span className="text-red-500 mt-0.5">⚠</span>
                      <span>{risk}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Operational Implications */}
              <div className="mb-6">
                <h5 className="font-semibold mb-2">Operational Implications</h5>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {options[selectedOption].operationalImplications}
                </p>
              </div>

              {/* Revenue Potential */}
              {options[selectedOption].revenuePotential && (
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <h5 className="font-semibold text-green-700 dark:text-green-300 mb-2">
                    Revenue Potential
                  </h5>
                  <p className="text-sm">
                    {options[selectedOption].revenuePotential}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
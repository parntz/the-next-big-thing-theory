"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

export default function HomePage() {
  const sessionResult = useSession();
  const session = sessionResult?.data;

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-20 pb-32">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8">
              Unlock Your <span className="text-blue-600">Next Big Thing</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-12">
              AI-powered market strategy analysis. Generate Blue Ocean Strategy
              opportunities with evidence-based insights.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {session ? (
                <>
                  <Link
                    href="/projects/new"
                    className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-lg transition-colors"
                  >
                    Start New Analysis
                  </Link>
                  <Link
                    href="/projects"
                    className="px-8 py-4 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-600 dark:hover:border-blue-500 text-gray-700 dark:text-gray-300 text-lg font-semibold rounded-lg transition-colors"
                  >
                    View My Projects
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white text-lg font-semibold rounded-lg transition-colors"
                  >
                    Sign In
                  </Link>
                  <Link
                    href="/register"
                    className="px-8 py-4 border-2 border-gray-200 dark:border-gray-700 hover:border-blue-600 dark:hover:border-blue-500 text-gray-700 dark:text-gray-300 text-lg font-semibold rounded-lg transition-colors"
                  >
                    Create Account
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-gray-50 dark:bg-gray-900">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Comprehensive Strategy Analysis
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Our AI-driven platform provides deep market insights and actionable strategies
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                title: "Market Research",
                description: "AI-powered business research and industry analysis",
                icon: "🔍",
              },
              {
                title: "Competitor Mapping",
                description: "Automated competitor discovery and position analysis",
                icon: "📊",
              },
              {
                title: "Blue Ocean Strategy",
                description: "Generate three distinct strategic directions",
                icon: "🚀",
              },
              {
                title: "Evidence-Based Scoring",
                description: "Every score backed by supporting evidence",
                icon: "🧪",
              },
              {
                title: "Strategy Canvas",
                description: "Visualize your value curve against competitors",
                icon: "📈",
              },
              {
                title: "Actionable Reports",
                description: "Comprehensive reports with implementation guidance",
                icon: "📋",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-blue-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to Discover Your Next Big Thing?
          </h2>
          <p className="text-xl mb-12 text-blue-100">
            Join hundreds of businesses using our platform to uncover 
            new strategic opportunities.
          </p>
          <Link
            href="/projects/new"
            className="inline-block px-10 py-5 bg-white text-blue-600 text-lg font-bold rounded-lg hover:bg-gray-100 transition-colors"
          >
            Get Started Now
          </Link>
        </div>
      </section>
    </div>
  );
}
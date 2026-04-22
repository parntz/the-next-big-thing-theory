"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

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

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch("/api/projects", {
          credentials: "include"
        });
        if (response.ok) {
          const data = await response.json();
          setProjects(data);
        }
      } catch (error) {
        console.error("Error fetching projects:", error);
      }
    };

    fetchProjects();
  }, []);

  const handleDelete = async (projectId: number) => {
    if (!confirm("Are you sure you want to delete this project? All analysis data will be permanently removed.")) {
      return;
    }

    setIsDeleting(projectId);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        setProjects(prev => prev.filter(p => p.id !== projectId));
      } else {
        const errorData = await response.json();
        alert(`Failed to delete project: ${errorData.error}`);
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("Failed to delete project");
    } finally {
      setIsDeleting(null);
    }
  };

  const handleSignOut = () => {
    document.cookie = "session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Projects</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium"
            >
              Sign Out
            </button>
            <Link
              href="/projects/new"
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
            >
              New Project
            </Link>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-xl">
            <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
              No projects yet
            </p>
            <Link
              href="/projects/new"
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Create your first analysis project
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => (
              <div
                key={project.id}
                className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow hover:shadow-lg transition-shadow h-full flex flex-col"
              >
                <Link href={`/projects/${project.id}`} className="block flex-grow">
                  <h3 className="text-xl font-semibold mb-2">{project.name}</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4 truncate">
                    {project.websiteUrl}
                  </p>
                  {project.category && (
                    <span className="inline-block px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm rounded-full mb-2">
                      {project.category}
                    </span>
                  )}
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {new Date(project.createdAt).toLocaleDateString()}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      project.status === "complete"
                        ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                        : "bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200"
                    }`}>
                      {project.status}
                    </span>
                  </div>
                </Link>
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    onClick={() => handleDelete(project.id)}
                    disabled={isDeleting === project.id}
                    className="w-full px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isDeleting === project.id ? "Deleting..." : "Delete Project"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
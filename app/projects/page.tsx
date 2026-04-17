import Link from "next/link";
import { getDb } from "@lib/db/client";
import * as schema from "@lib/db/schema";

export default async function ProjectsPage() {
  const db = getDb();
  const projects = await db.query.projects.findMany({
    orderBy: [schema.projects.createdAt.desc],
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Your Projects</h1>
          <Link
            href="/projects/new"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            New Project
          </Link>
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
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="block"
              >
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow hover:shadow-lg transition-shadow h-full">
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
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
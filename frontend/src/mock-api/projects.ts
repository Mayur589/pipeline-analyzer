import type { Project, CreateProjectInput } from '../types/graph';
import { mockDb, generateId } from './db';

export async function createProject(input: CreateProjectInput): Promise<Project> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 60));

  const id = generateId('proj');
  const newProject: Project = {
    id,
    name: input.name,
    description: input.description || ''
  };

  mockDb.projects[id] = newProject;
  mockDb.graphs[id] = {
    nodes: [],
    edges: []
  };

  return newProject;
}

export async function getProjects(): Promise<Project[]> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 40));
  return Object.values(mockDb.projects);
}

export async function getProject(projectId: string): Promise<Project | null> {
  // Simulate network roundtrip
  await new Promise((resolve) => setTimeout(resolve, 30));
  return mockDb.projects[projectId] || null;
}

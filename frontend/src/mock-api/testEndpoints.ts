import { apiDispatch } from './client';
import type {
  NodeCategory,
  RelationshipDefinition,
  Project,
  Graph,
  Node,
  Edge
} from '../types/graph';

async function runEndpointTests() {
  console.log('🧪 Starting End-to-End Test Suite for All API Endpoints...\n');

  // 1. GET /node-types
  console.log('1. Testing GET /node-types');
  const nodeTypes = await apiDispatch<NodeCategory[]>({
    method: 'GET',
    path: '/node-types'
  });
  console.log(`   ✓ Received ${nodeTypes.length} node types.`);
  if (!Array.isArray(nodeTypes) || nodeTypes.length === 0) throw new Error('Failed GET /node-types');

  // 2. GET /relationships
  console.log('2. Testing GET /relationships');
  const relationships = await apiDispatch<RelationshipDefinition[]>({
    method: 'GET',
    path: '/relationships'
  });
  console.log(`   ✓ Received ${relationships.length} relationship definitions.`);
  if (!Array.isArray(relationships) || relationships.length === 0) throw new Error('Failed GET /relationships');

  // 3. GET /relationships/validate
  console.log('3. Testing GET /relationships/validate');
  const valResult = await apiDispatch<{ valid: boolean; allowedRelationshipIds: string[] }>({
    method: 'GET',
    path: '/relationships/validate',
    query: { sourceCategory: 'source_control', targetCategory: 'cicd_pipeline' }
  });
  console.log(`   ✓ Validated connection: valid=${valResult.valid}, allowed=${JSON.stringify(valResult.allowedRelationshipIds)}`);
  if (!valResult.valid || !valResult.allowedRelationshipIds.includes('triggers')) {
    throw new Error('Failed GET /relationships/validate');
  }

  // 4. POST /projects
  console.log('4. Testing POST /projects');
  const createdProject = await apiDispatch<Project>({
    method: 'POST',
    path: '/projects',
    body: { name: 'Production Pipeline Guard', description: 'End-to-End security analysis project' }
  });
  console.log(`   ✓ Created project: id=${createdProject.id}, name="${createdProject.name}"`);
  if (!createdProject.id || createdProject.name !== 'Production Pipeline Guard') {
    throw new Error('Failed POST /projects');
  }

  // 5. GET /projects
  console.log('5. Testing GET /projects');
  const allProjects = await apiDispatch<Project[]>({
    method: 'GET',
    path: '/projects'
  });
  console.log(`   ✓ Total projects listed: ${allProjects.length}`);
  if (!allProjects.find((p) => p.id === createdProject.id)) {
    throw new Error('Failed GET /projects');
  }

  // 6. GET /projects/{project_id}/graph
  console.log(`6. Testing GET /projects/${createdProject.id}/graph`);
  const graphInitial = await apiDispatch<Graph>({
    method: 'GET',
    path: `/projects/${createdProject.id}/graph`
  });
  console.log(`   ✓ Graph fetched for project ${graphInitial.projectId}: nodes=${graphInitial.nodes.length}, edges=${graphInitial.edges.length}`);
  if (graphInitial.nodes.length !== 0 || graphInitial.edges.length !== 0) {
    throw new Error('Failed initial graph check');
  }

  // 7. POST /projects/{project_id}/nodes (Node 1)
  console.log(`7. Testing POST /projects/${createdProject.id}/nodes (Node 1: Source Control)`);
  const node1 = await apiDispatch<Node>({
    method: 'POST',
    path: `/projects/${createdProject.id}/nodes`,
    body: {
      categoryId: 'source_control',
      properties: { name: 'core-backend-repo', visibility: 'Private', branchProtection: true },
      position: { x: 100, y: 100 }
    }
  });
  console.log(`   ✓ Created Node 1: id=${node1.id}, category=${node1.categoryId}`);

  // POST /projects/{project_id}/nodes (Node 2)
  console.log(`   Testing POST /projects/${createdProject.id}/nodes (Node 2: CI/CD Pipeline)`);
  const node2 = await apiDispatch<Node>({
    method: 'POST',
    path: `/projects/${createdProject.id}/nodes`,
    body: {
      categoryId: 'cicd_pipeline',
      properties: { name: 'github-actions-ci', runnerType: 'Ephemeral', approvalRequired: true },
      position: { x: 300, y: 100 }
    }
  });
  console.log(`   ✓ Created Node 2: id=${node2.id}, category=${node2.categoryId}`);

  // 8. PATCH /nodes/{node_id}
  console.log(`8. Testing PATCH /nodes/${node1.id}`);
  const updatedNode1 = await apiDispatch<Node>({
    method: 'PATCH',
    path: `/nodes/${node1.id}`,
    body: {
      properties: { name: 'core-backend-repo-v2', visibility: 'Private', branchProtection: true }
    }
  });
  console.log(`   ✓ Updated Node 1: name="${updatedNode1.properties.name}"`);
  if (updatedNode1.properties.name !== 'core-backend-repo-v2') {
    throw new Error('Failed PATCH /nodes/{node_id}');
  }

  // 9. POST /projects/{project_id}/edges
  console.log(`9. Testing POST /projects/${createdProject.id}/edges`);
  const edge = await apiDispatch<Edge>({
    method: 'POST',
    path: `/projects/${createdProject.id}/edges`,
    body: {
      sourceNodeId: node1.id,
      targetNodeId: node2.id,
      relationshipId: 'triggers'
    }
  });
  console.log(`   ✓ Created Edge: id=${edge.id}, ${edge.sourceNodeId} -[${edge.relationshipId}]-> ${edge.targetNodeId}`);
  if (!edge.id || edge.relationshipId !== 'triggers') {
    throw new Error('Failed POST /projects/{project_id}/edges');
  }

  // 10. PATCH /edges/{edge_id}
  console.log(`10. Testing PATCH /edges/${edge.id}`);
  const updatedEdge = await apiDispatch<Edge>({
    method: 'PATCH',
    path: `/edges/${edge.id}`,
    body: {
      relationshipId: 'triggers'
    }
  });
  console.log(`   ✓ Updated Edge: id=${updatedEdge.id}, relationship=${updatedEdge.relationshipId}`);

  // Verify graph has 2 nodes and 1 edge
  const graphUpdated = await apiDispatch<Graph>({
    method: 'GET',
    path: `/projects/${createdProject.id}/graph`
  });
  console.log(`   ✓ Verified Graph State: nodes=${graphUpdated.nodes.length}, edges=${graphUpdated.edges.length}`);
  if (graphUpdated.nodes.length !== 2 || graphUpdated.edges.length !== 1) {
    throw new Error('Graph state does not match after insertions');
  }

  // 11. DELETE /edges/{edge_id}
  console.log(`11. Testing DELETE /edges/${edge.id}`);
  await apiDispatch<void>({
    method: 'DELETE',
    path: `/edges/${edge.id}`
  });
  console.log(`   ✓ Edge ${edge.id} successfully deleted.`);

  // 12. DELETE /nodes/{node_id}
  console.log(`12. Testing DELETE /nodes/${node2.id}`);
  await apiDispatch<void>({
    method: 'DELETE',
    path: `/nodes/${node2.id}`
  });
  console.log(`   ✓ Node ${node2.id} successfully deleted.`);

  // Final graph check
  const graphFinal = await apiDispatch<Graph>({
    method: 'GET',
    path: `/projects/${createdProject.id}/graph`
  });
  console.log(`   ✓ Final Graph State: nodes=${graphFinal.nodes.length}, edges=${graphFinal.edges.length}`);
  if (graphFinal.nodes.length !== 1 || graphFinal.edges.length !== 0) {
    throw new Error('Graph state does not match after deletions');
  }

  console.log('\n🎉 ALL 11 ENDPOINTS VERIFIED AND WORKING PROPERLY!');
}

runEndpointTests().catch((err) => {
  console.error('❌ Endpoint test failed:', err);
  throw err;
});

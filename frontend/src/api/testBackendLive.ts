import {
  getNodeTypes,
  getRelationships,
  validateRelationship,
  getProjects,
  createProject,
  editProject,
  deleteProject,
  getGraph,
  createNode,
  editNode,
  deleteNode,
  createEdge,
  editEdge,
  deleteEdge,
  simulateAttack
} from './client.ts';

async function runLiveBackendTests() {
  console.log('🚀 Running Live Backend Integration Tests against http://127.0.0.1:3000...\n');

  // 1. GET /node-types
  console.log('1. Testing GET /node-types');
  const nodeTypes = await getNodeTypes();
  console.log(`   ✓ Received ${nodeTypes.length} node categories from backend.`);
  if (!Array.isArray(nodeTypes) || nodeTypes.length === 0) {
    throw new Error('Failed GET /node-types');
  }
  const identityCat = nodeTypes.find((c) => c.id === 'identity_people');
  if (!identityCat || identityCat.fieldDefs.length === 0) {
    throw new Error('Failed to parse identity_people fields');
  }
  console.log(`   ✓ Category "${identityCat.category}" has ${identityCat.fieldDefs.length} dynamic fieldDefs.`);

  // 2. GET /relationships
  console.log('2. Testing GET /relationships');
  const relationships = await getRelationships();
  console.log(`   ✓ Received ${relationships.length} relationship IDs.`);
  if (!Array.isArray(relationships) || relationships.length !== 21) {
    throw new Error(`Expected 21 relationships, got ${relationships.length}`);
  }

  // 3. GET /relationships/validate
  console.log('3. Testing GET /relationships/validate');
  const validCheck = await validateRelationship('identity_people', 'source_control');
  console.log(`   ✓ Valid connection: valid=${validCheck.valid}, allowed=${JSON.stringify(validCheck.allowedRelationshipIds)}`);
  if (!validCheck.valid || !validCheck.allowedRelationshipIds.includes('contributes_to')) {
    throw new Error('Validation failed for identity_people -> source_control');
  }

  const invalidCheck = await validateRelationship('distribution', 'identity_people');
  console.log(`   ✓ Invalid connection handled cleanly: valid=${invalidCheck.valid}`);
  if (invalidCheck.valid) {
    throw new Error('Expected distribution -> identity_people to be invalid');
  }

  // 4. POST /projects
  console.log('4. Testing POST /projects');
  const testProject = await createProject(`Integration Test Proj ${Date.now()}`);
  console.log(`   ✓ Created project: id=${testProject.id}, name="${testProject.name}"`);
  if (!testProject.id) throw new Error('Failed to create project');

  // 5. PATCH /projects/{project_id}
  console.log(`5. Testing PATCH /projects/${testProject.id}`);
  const updatedProject = await editProject(testProject.id, `${testProject.name} (Renamed)`);
  console.log(`   ✓ Renamed project: id=${updatedProject.id}, name="${updatedProject.name}"`);
  if (updatedProject.name !== `${testProject.name} (Renamed)`) {
    throw new Error('Failed to edit project name');
  }

  // 6. GET /projects
  console.log('6. Testing GET /projects');
  const projects = await getProjects();
  console.log(`   ✓ Listed ${projects.length} projects.`);
  if (!projects.find((p) => p.id === testProject.id)) {
    throw new Error('Created project not found in GET /projects list');
  }

  // 7. GET /projects/{project_id}/graph (Initial)
  console.log(`7. Testing GET /projects/${testProject.id}/graph (initial)`);
  const initialGraph = await getGraph(testProject.id);
  console.log(`   ✓ Graph fetched: nodes=${initialGraph.nodes.length}, edges=${initialGraph.edges.length}`);
  if (initialGraph.nodes.length !== 0 || initialGraph.edges.length !== 0) {
    throw new Error('Initial graph should be empty');
  }

  // 8. POST /projects/{project_id}/nodes (Node 1)
  console.log(`8. Testing POST /projects/${testProject.id}/nodes (Node 1: identity_people)`);
  const node1 = await createNode(testProject.id, 'identity_people', {
    name: 'Alice Security Lead',
    role: 'Maintainer',
    mfaEnabled: true
  });
  console.log(`   ✓ Created Node 1: id=${node1.id}, category=${node1.categoryId}`);
  if (!node1.id) throw new Error('Failed to create Node 1');

  // POST Node 2 (source_control)
  console.log(`   Testing POST /projects/${testProject.id}/nodes (Node 2: source_control)`);
  const node2 = await createNode(testProject.id, 'source_control', {
    name: 'github.com/org/payments',
    visibility: 'Private',
    branchProtection: true
  });
  console.log(`   ✓ Created Node 2: id=${node2.id}, category=${node2.categoryId}`);
  if (!node2.id) throw new Error('Failed to create Node 2');

  // 9. PATCH /projects/{project_id}/nodes/{node_id}
  console.log(`9. Testing PATCH /projects/${testProject.id}/nodes/${node1.id}`);
  const updatedNode1 = await editNode(testProject.id, node1.id, {
    name: 'Alice Principal Lead',
    role: 'DevOps Admin',
    mfaEnabled: true
  });
  console.log(`   ✓ Updated Node 1: name="${updatedNode1.properties.name}"`);
  if (updatedNode1.properties.name !== 'Alice Principal Lead') {
    throw new Error('Node property was not updated');
  }

  // 10. POST /projects/{project_id}/edges
  console.log(`10. Testing POST /projects/${testProject.id}/edges`);
  const edge = await createEdge(testProject.id, node1.id, node2.id, 'contributes_to');
  console.log(`   ✓ Created Edge: id=${edge.id}, ${edge.sourceNodeId} -[${edge.relationshipId}]-> ${edge.targetNodeId}`);
  if (!edge.id || edge.relationshipId !== 'contributes_to') {
    throw new Error('Failed to create edge');
  }

  // 11. PATCH /projects/{project_id}/edges/{edge_id}
  console.log(`11. Testing PATCH /projects/${testProject.id}/edges/${edge.id}`);
  const updatedEdge = await editEdge(testProject.id, edge.id, 'maintains');
  console.log(`   ✓ Updated Edge: id=${updatedEdge.id}, relationship=${updatedEdge.relationshipId}`);
  if (updatedEdge.relationshipId !== 'maintains') {
    throw new Error('Failed to update edge relationship');
  }

  // Verify graph has 2 nodes and 1 edge
  const graphWithData = await getGraph(testProject.id);
  console.log(`   ✓ Graph has ${graphWithData.nodes.length} nodes and ${graphWithData.edges.length} edges.`);
  if (graphWithData.nodes.length !== 2 || graphWithData.edges.length !== 1) {
    throw new Error('Graph state does not match expected node/edge count');
  }

  // 12. POST /projects/{project_id}/attack
  console.log(`12. Testing POST /projects/${testProject.id}/attack`);
  const attackResult = await simulateAttack(
    testProject.id,
    node1.id,
    'compromised_maintainer_credentials'
  );
  console.log(`   ✓ Attack simulated: id=${attackResult.attackId}, severity=${attackResult.overallSeverity.label} (${attackResult.overallSeverity.score}), steps=${attackResult.steps.length}`);
  if (!attackResult.attackId || attackResult.projectId !== testProject.id || attackResult.startNodeId !== node1.id) {
    throw new Error('Attack simulation returned invalid data structure');
  }

  // 13. DELETE /projects/{project_id}/edges/{edge_id}
  console.log(`13. Testing DELETE /projects/${testProject.id}/edges/${edge.id}`);
  await deleteEdge(testProject.id, edge.id);
  console.log(`   ✓ Edge ${edge.id} deleted.`);

  // 13. DELETE /projects/{project_id}/nodes/{node_id}
  console.log(`13. Testing DELETE /projects/${testProject.id}/nodes/{node_id}`);
  await deleteNode(testProject.id, node1.id);
  await deleteNode(testProject.id, node2.id);
  console.log(`   ✓ Nodes ${node1.id} and ${node2.id} deleted.`);

  // Graph check
  const graphAfterNodeDelete = await getGraph(testProject.id);
  console.log(`   ✓ Graph verified empty: nodes=${graphAfterNodeDelete.nodes.length}, edges=${graphAfterNodeDelete.edges.length}`);
  if (graphAfterNodeDelete.nodes.length !== 0 || graphAfterNodeDelete.edges.length !== 0) {
    throw new Error('Graph should be empty');
  }

  // 14. DELETE /projects/{project_id}
  console.log(`14. Testing DELETE /projects/${testProject.id}`);
  await deleteProject(testProject.id);
  const remainingProjects = await getProjects();
  if (remainingProjects.some((p) => p.id === testProject.id)) {
    throw new Error('Project should be deleted from backend');
  }
  console.log(`   ✓ Project ${testProject.id} successfully deleted from backend.`);

  console.log('\n🌟 ALL 14 REST API ENDPOINTS (INCLUDING ATTACK SIMULATION) TESTED AND VERIFIED AGAINST 127.0.0.1:3000!\n');
}

runLiveBackendTests().catch((err) => {
  console.error('❌ Live backend test failed:', err);
  (globalThis as unknown as { process?: { exit: (c: number) => void } }).process?.exit(1);
});

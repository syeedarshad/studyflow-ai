const mockApp = { getPath: () => 'd:/studyflow-ai' };
require('module').Module._cache[require.resolve('electron')] = { exports: { app: mockApp } };
const Database = require('../src/main/database');
const ProviderManager = require('../src/main/ai/provider-manager');

async function run() {
  console.log('Initializing DB...');
  const db = new Database();
  const providerManager = new ProviderManager(db);

  console.log('--- Triggering generateTasks() ---');
  // Pass a dummy goal description
  try {
    const result = await providerManager.generateTasks('Learn Python for data science', db.getAIContextSummary());
    console.log('--- Final Result ---');
    console.log(result.provider);
  } catch (err) {
    console.error('Error:', err);
  }
}

run();

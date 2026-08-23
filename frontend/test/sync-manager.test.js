/**
 * StudyFlow AI — SyncManager Multi-Account Isolation & Persistence Tests
 */

'use strict';
require('./setup');
const assert = require('assert');

let pass = 0, fail = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.log(`  ✗ ${name}\n      ${err.stack || err.message}`);
    fail++;
  }
}

// Set up mock window & localStorage environment
const storage = new Map();
global.localStorage = {
  getItem: (k) => storage.get(k) || null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
};

let currentUser = null;
global.window = {
  SessionManager: {
    getUser: () => currentUser,
    setUser: (u) => { currentUser = u; },
    clearUser: () => { currentUser = null; },
  },
  api: {
    BACKEND_URL: 'http://127.0.0.1:8000',
    getToken: () => (currentUser ? `token_user_${currentUser.id}` : null),
  },
  studyflow: {},
};

// Require SyncManager in this global environment
require('../src/renderer/services/sync-manager');
const SyncManager = global.window.SyncManager;

async function runTests() {
  console.log('\n== SyncManager Multi-Account Isolation & Persistence ==');

  // Test 1: Every persisted queue is user-scoped
  await check('1. Persisted sync queue key is user-scoped: studyflow_user_${userId}_sync_queue', () => {
    storage.clear();
    currentUser = { id: 101, name: 'Alice' };

    SyncManager.queuePendingWrite({
      type: 'CREATE_TASK',
      endpoint: '/api/v1/tasks',
      method: 'POST',
      body: { title: 'Alice Task 1' },
    });

    const aliceKey = SyncManager.getQueueKey(101);
    assert.strictEqual(aliceKey, 'studyflow_user_101_sync_queue');
    const stored = JSON.parse(localStorage.getItem(aliceKey));
    assert.ok(Array.isArray(stored));
    assert.strictEqual(stored.length, 1);
    assert.strictEqual(stored[0].body.title, 'Alice Task 1');
  });

  // Test 2: Every queued operation contains user_id
  await check('2. Every queued operation contains matching user_id', () => {
    currentUser = { id: 101, name: 'Alice' };
    const aliceKey = SyncManager.getQueueKey(101);
    const stored = JSON.parse(localStorage.getItem(aliceKey));
    assert.strictEqual(stored[0].user_id, 101);
  });

  // Test 3: Unauthenticated queue writes are rejected
  await check('3. Writing to sync queue without active user is rejected', () => {
    currentUser = null;
    const res = SyncManager.queuePendingWrite({
      type: 'CREATE_TASK',
      endpoint: '/api/v1/tasks',
      method: 'POST',
      body: { title: 'Orphan Task' },
    });
    assert.strictEqual(res, false);
  });

  // Test 4: On logout, active in-memory state is reset but user persisted queue is PRESERVED
  await check('4. On logout, SyncManager.reset() preserves persisted offline queue on disk', () => {
    currentUser = { id: 101, name: 'Alice' };
    SyncManager.queuePendingWrite({
      type: 'CREATE_TASK',
      endpoint: '/api/v1/tasks',
      method: 'POST',
      body: { title: 'Alice Offline Task 2' },
    });

    // Simulate logout
    SyncManager.reset();
    currentUser = null;

    const aliceKey = SyncManager.getQueueKey(101);
    const preserved = JSON.parse(localStorage.getItem(aliceKey));
    assert.ok(preserved, 'Alice queue must still exist in localStorage after logout');
    assert.strictEqual(preserved.length, 2);
  });

  // Test 5: User B login loads ONLY User B queue
  await check('5. User B login only loads User B queue and cannot see User A queue', () => {
    currentUser = { id: 202, name: 'Bob' };
    const bobKey = SyncManager.getQueueKey(202);
    assert.strictEqual(localStorage.getItem(bobKey), null, 'Bob has no prior queue');

    SyncManager.queuePendingWrite({
      type: 'CREATE_TASK',
      endpoint: '/api/v1/tasks',
      method: 'POST',
      body: { title: 'Bob Task 1' },
    });

    const bobQueue = JSON.parse(localStorage.getItem(bobKey));
    assert.strictEqual(bobQueue.length, 1);
    assert.strictEqual(bobQueue[0].body.title, 'Bob Task 1');
    assert.strictEqual(bobQueue[0].user_id, 202);

    // Verify Alice queue untouched
    const aliceKey = SyncManager.getQueueKey(101);
    const aliceQueue = JSON.parse(localStorage.getItem(aliceKey));
    assert.strictEqual(aliceQueue.length, 2);
  });

  // Test 6: Full Regression Workflow (Account Switching + Sync Execution)
  await check('6. Complete multi-account offline queue & sync regression lifecycle', async () => {
    storage.clear();
    const backendReceived = {
      user_101: [],
      user_202: [],
    };

    // Mock global fetch to record which user token delivered which task
    global.fetch = async (url, options = {}) => {
      if (url.includes('/health')) {
        return { ok: true, json: async () => ({ status: 'ok' }) };
      }
      const authHeader = options.headers?.Authorization || '';
      const body = options.body ? JSON.parse(options.body) : {};

      if (authHeader === 'Bearer token_user_101') {
        backendReceived.user_101.push(body);
        return { ok: true, json: async () => ({ id: 1, ...body }) };
      } else if (authHeader === 'Bearer token_user_202') {
        backendReceived.user_202.push(body);
        return { ok: true, json: async () => ({ id: 2, ...body }) };
      }
      return { ok: false, status: 401 };
    };

    // Step A: Login as User A
    currentUser = { id: 101, name: 'Alice' };
    SyncManager.isOnline = false; // Force offline

    // Step B: Create Task A offline
    SyncManager.queuePendingWrite({
      type: 'CREATE_TASK',
      endpoint: '/api/v1/tasks',
      method: 'POST',
      body: { title: 'Task A from Alice' },
    });

    // Step C: Verify stored in User A's persisted queue
    const aliceKey = SyncManager.getQueueKey(101);
    const aliceQueue = JSON.parse(localStorage.getItem(aliceKey));
    assert.strictEqual(aliceQueue.length, 1);
    assert.strictEqual(aliceQueue[0].body.title, 'Task A from Alice');

    // Step D: Logout User A
    SyncManager.reset();
    currentUser = null;

    // Step E: Verify User A's queue still exists
    assert.ok(localStorage.getItem(aliceKey), "User A's queue must survive logout");

    // Step F: Login as User B
    currentUser = { id: 202, name: 'Bob' };
    SyncManager.isOnline = false;

    // Step G: Verify User B cannot see User A queue
    const bobKey = SyncManager.getQueueKey(202);
    assert.strictEqual(localStorage.getItem(bobKey), null);

    // Step H: Create Task B offline
    SyncManager.queuePendingWrite({
      type: 'CREATE_TASK',
      endpoint: '/api/v1/tasks',
      method: 'POST',
      body: { title: 'Task B from Bob' },
    });

    // Step I: Verify it enters ONLY User B's queue
    const bobQueue = JSON.parse(localStorage.getItem(bobKey));
    assert.strictEqual(bobQueue.length, 1);
    assert.strictEqual(bobQueue[0].body.title, 'Task B from Bob');
    assert.strictEqual(bobQueue[0].user_id, 202);

    // Step J: Logout User B
    SyncManager.reset();
    currentUser = null;

    // Step K: Login as User A & Restore connectivity
    currentUser = { id: 101, name: 'Alice' };
    SyncManager.isOnline = true;
    await SyncManager.flushQueueForActiveUser();

    // Step L: Verify ONLY Task A synced to User A
    assert.strictEqual(backendReceived.user_101.length, 1);
    assert.strictEqual(backendReceived.user_101[0].title, 'Task A from Alice');
    assert.strictEqual(backendReceived.user_202.length, 0);
    assert.strictEqual(localStorage.getItem(aliceKey), null, "Alice queue cleared after successful sync");

    // Step M: Login as User B & Restore connectivity
    currentUser = { id: 202, name: 'Bob' };
    SyncManager.isOnline = true;
    await SyncManager.flushQueueForActiveUser();

    // Step N: Verify ONLY Task B synced to User B
    assert.strictEqual(backendReceived.user_202.length, 1);
    assert.strictEqual(backendReceived.user_202[0].title, 'Task B from Bob');
    assert.strictEqual(localStorage.getItem(bobKey), null, "Bob queue cleared after successful sync");
  });

  // Test 7: Race condition protection during account switching
  await check('7. Race condition protection: in-flight sync aborts if user switches during flush', async () => {
    storage.clear();
    currentUser = { id: 101, name: 'Alice' };

    // Queue 2 tasks for Alice
    SyncManager.queuePendingWrite({
      type: 'CREATE_TASK',
      endpoint: '/api/v1/tasks',
      method: 'POST',
      body: { title: 'Alice Task 1' },
    });
    SyncManager.queuePendingWrite({
      type: 'CREATE_TASK',
      endpoint: '/api/v1/tasks',
      method: 'POST',
      body: { title: 'Alice Task 2' },
    });

    const syncedCalls = [];
    global.fetch = async (url, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : {};
      syncedCalls.push({ auth: options.headers?.Authorization, title: body.title });
      
      // Simulate user logout/switch right after first call starts
      currentUser = { id: 202, name: 'Bob' };
      return { ok: true, json: async () => ({ id: 1 }) };
    };

    SyncManager.isOnline = true;
    await SyncManager.flushQueueForActiveUser();

    // Second task must NOT have synced under Bob's context
    assert.strictEqual(syncedCalls.length, 1, 'Sync loop must abort as soon as active user changes');
    assert.strictEqual(syncedCalls[0].auth, 'Bearer token_user_101');
  });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail > 0 ? 1 : 0);
}

runTests();

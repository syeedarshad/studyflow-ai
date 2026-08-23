"""
Phase 3 — Task API Tests
Tests for /api/v1/tasks endpoints and strict user isolation.
"""

import pytest
from tests.conftest import auth_header, make_unique_email, register_user


# ── Create Task ───────────────────────────────────────────────────────────────

async def test_create_task_success(async_client):
    """POST /api/v1/tasks creates a task and computes XP reward."""
    user = await register_user(async_client, email=make_unique_email("task_create"))
    headers = auth_header(user["session_token"])

    payload = {
        "title": "Study Linear Algebra Chapter 4",
        "category": "Math",
        "priority": "high",
        "due_date": "2026-08-20",
        "estimated_minutes": 45,
        "notes": "Focus on Eigenvectors",
    }

    resp = await async_client.post("/api/v1/tasks", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["success"] is True
    task = data["task"]
    assert task["title"] == "Study Linear Algebra Chapter 4"
    assert task["category"] == "Math"
    assert task["priority"] == "high"
    assert task["status"] == "pending"
    assert task["xp_reward"] == 25  # Math category XP
    assert task["user_id"] == user["user_id"]


async def test_create_task_unauthorized_401(async_client):
    """POST /api/v1/tasks returns 401 without valid session."""
    resp = await async_client.post("/api/v1/tasks", json={"title": "Test Task"})
    assert resp.status_code == 401


# ── List & Filter Tasks ───────────────────────────────────────────────────────

async def test_list_tasks_and_filter(async_client):
    """GET /api/v1/tasks lists user's active tasks with filters."""
    user = await register_user(async_client, email=make_unique_email("task_list"))
    headers = auth_header(user["session_token"])

    # Create 3 tasks
    await async_client.post(
        "/api/v1/tasks",
        json={"title": "Task 1", "category": "Coding", "priority": "high"},
        headers=headers,
    )
    await async_client.post(
        "/api/v1/tasks",
        json={"title": "Task 2", "category": "Revision", "priority": "low"},
        headers=headers,
    )
    await async_client.post(
        "/api/v1/tasks",
        json={"title": "Task 3", "category": "Coding", "priority": "medium"},
        headers=headers,
    )

    # List all
    resp = await async_client.get("/api/v1/tasks", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["total"] == 3

    # Filter by category
    resp_coding = await async_client.get("/api/v1/tasks?category=Coding", headers=headers)
    assert resp_coding.status_code == 200
    assert resp_coding.json()["total"] == 2


async def test_list_today_tasks(async_client):
    """GET /api/v1/tasks/today returns today's and undated tasks."""
    user = await register_user(async_client, email=make_unique_email("task_today"))
    headers = auth_header(user["session_token"])

    # Today task
    await async_client.post(
        "/api/v1/tasks",
        json={"title": "Today's Task", "due_date": "2026-08-18"},
        headers=headers,
    )
    # Future task
    await async_client.post(
        "/api/v1/tasks",
        json={"title": "Future Task", "due_date": "2026-08-25"},
        headers=headers,
    )
    # Undated task
    await async_client.post(
        "/api/v1/tasks",
        json={"title": "Undated Task", "due_date": None},
        headers=headers,
    )

    resp = await async_client.get("/api/v1/tasks/today?today=2026-08-18", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    titles = [t["title"] for t in data["tasks"]]
    assert "Today's Task" in titles
    assert "Undated Task" in titles
    assert "Future Task" not in titles


# ── Strict User Isolation (IDOR Tests) ────────────────────────────────────────

async def test_user_isolation_security(async_client):
    """User A cannot view, update, complete, or delete User B's task."""
    user_a = await register_user(async_client, email=make_unique_email("user_a"))
    user_b = await register_user(async_client, email=make_unique_email("user_b"))

    headers_a = auth_header(user_a["session_token"])
    headers_b = auth_header(user_b["session_token"])

    # User A creates a task
    create_resp = await async_client.post(
        "/api/v1/tasks",
        json={"title": "User A Private Task", "category": "Revision"},
        headers=headers_a,
    )
    task_a_id = create_resp.json()["task"]["id"]

    # User B attempts to read User A's task -> 404
    resp_get = await async_client.get(f"/api/v1/tasks/{task_a_id}", headers=headers_b)
    assert resp_get.status_code == 404

    # User B attempts to update User A's task -> 404
    resp_update = await async_client.patch(
        f"/api/v1/tasks/{task_a_id}",
        json={"title": "Hacked Title"},
        headers=headers_b,
    )
    assert resp_update.status_code == 404

    # User B attempts to complete User A's task -> 404
    resp_complete = await async_client.post(
        f"/api/v1/tasks/{task_a_id}/complete",
        headers=headers_b,
    )
    assert resp_complete.status_code == 404

    # User B attempts to delete User A's task -> 404
    resp_delete = await async_client.delete(
        f"/api/v1/tasks/{task_a_id}",
        headers=headers_b,
    )
    assert resp_delete.status_code == 404

    # Verify User A's task is still intact
    resp_check = await async_client.get(f"/api/v1/tasks/{task_a_id}", headers=headers_a)
    assert resp_check.status_code == 200
    assert resp_check.json()["task"]["title"] == "User A Private Task"
    assert resp_check.json()["task"]["status"] == "pending"


# ── Update & Complete & Delete ────────────────────────────────────────────────

async def test_update_task_fields(async_client):
    """PATCH /api/v1/tasks/{id} updates fields and recalculates XP if category changes."""
    user = await register_user(async_client, email=make_unique_email("task_upd"))
    headers = auth_header(user["session_token"])

    create_resp = await async_client.post(
        "/api/v1/tasks",
        json={"title": "Old Title", "category": "Revision"},
        headers=headers,
    )
    task_id = create_resp.json()["task"]["id"]

    resp = await async_client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"title": "New Title", "category": "Exam Prep", "priority": "high"},
        headers=headers,
    )
    assert resp.status_code == 200
    task = resp.json()["task"]
    assert task["title"] == "New Title"
    assert task["category"] == "Exam Prep"
    assert task["xp_reward"] == 30  # Exam Prep category XP


async def test_complete_task_awards_xp(async_client):
    """POST /api/v1/tasks/{id}/complete marks status completed and returns XP."""
    user = await register_user(async_client, email=make_unique_email("task_comp"))
    headers = auth_header(user["session_token"])

    create_resp = await async_client.post(
        "/api/v1/tasks",
        json={"title": "Finish Physics HW", "category": "Math"},
        headers=headers,
    )
    task_id = create_resp.json()["task"]["id"]

    resp = await async_client.post(f"/api/v1/tasks/{task_id}/complete", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["task"]["status"] == "completed"
    assert data["task"]["completed_at"] is not None
    assert data["xp_awarded"] == 25


async def test_delete_task_soft_deletes(async_client):
    """DELETE /api/v1/tasks/{id} soft deletes task."""
    user = await register_user(async_client, email=make_unique_email("task_del"))
    headers = auth_header(user["session_token"])

    create_resp = await async_client.post(
        "/api/v1/tasks",
        json={"title": "Task to Delete"},
        headers=headers,
    )
    task_id = create_resp.json()["task"]["id"]

    del_resp = await async_client.delete(f"/api/v1/tasks/{task_id}", headers=headers)
    assert del_resp.status_code == 200

    # Getting it now returns 404
    get_resp = await async_client.get(f"/api/v1/tasks/{task_id}", headers=headers)
    assert get_resp.status_code == 404


# ── Batch Import & Deduplication ──────────────────────────────────────────────

async def test_batch_import_and_deduplication(async_client):
    """POST /api/v1/tasks/import imports local SQLite tasks and deduplicates on replay."""
    user = await register_user(async_client, email=make_unique_email("task_imp"))
    headers = auth_header(user["session_token"])

    tasks_batch = [
        {"title": "Imported Task 1", "category": "Coding", "due_date": "2026-08-20"},
        {"title": "Imported Task 2", "category": "Revision", "due_date": "2026-08-21"},
    ]

    # First import: 2 imported, 0 skipped
    resp1 = await async_client.post(
        "/api/v1/tasks/import", json={"tasks": tasks_batch}, headers=headers
    )
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["imported"] == 2
    assert data1["skipped"] == 0

    # Second import with same tasks: 0 imported, 2 skipped (deduplication)
    resp2 = await async_client.post(
        "/api/v1/tasks/import", json={"tasks": tasks_batch}, headers=headers
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["imported"] == 0
    assert data2["skipped"] == 2

    # Verify total tasks count
    list_resp = await async_client.get("/api/v1/tasks", headers=headers)
    assert list_resp.json()["total"] == 2

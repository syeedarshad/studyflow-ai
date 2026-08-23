"""
StudyFlow AI — Task Router
─────────────────────────────────────────────────────────────
All /api/v1/tasks/* endpoints.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth.dependencies import CurrentAuth, require_auth
from app.api.tasks.schemas import (
    DeleteTaskResponse,
    TaskBatchImportRequest,
    TaskBatchImportResponse,
    TaskCompleteResponse,
    TaskCreate,
    TaskPublic,
    TaskResponse,
    TasksListResponse,
    TaskUpdate,
)
from app.api.tasks.service import TaskService
from database.base import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get(
    "",
    response_model=TasksListResponse,
    summary="List tasks for current user",
)
async def list_tasks(
    status_filter: Optional[str] = Query(None, alias="status"),
    category: Optional[str] = None,
    due_date: Optional[str] = None,
    goal_id: Optional[int] = None,
    search: Optional[str] = None,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> TasksListResponse:
    service = TaskService(db)
    tasks = await service.list_tasks(
        user_id=auth.user.id,
        status_filter=status_filter,
        category=category,
        due_date=due_date,
        goal_id=goal_id,
        search=search,
    )
    return TasksListResponse(
        tasks=[TaskPublic.model_validate(t) for t in tasks],
        total=len(tasks),
    )


@router.get(
    "/today",
    response_model=TasksListResponse,
    summary="List today's tasks for current user",
)
async def list_today_tasks(
    today: Optional[str] = None,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> TasksListResponse:
    service = TaskService(db)
    tasks = await service.list_today_tasks(user_id=auth.user.id, today_str=today)
    return TasksListResponse(
        tasks=[TaskPublic.model_validate(t) for t in tasks],
        total=len(tasks),
    )


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Get a specific task",
)
async def get_task(
    task_id: int,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    service = TaskService(db)
    task = await service.get_task_or_404(task_id=task_id, user_id=auth.user.id)
    return TaskResponse(task=TaskPublic.model_validate(task))


@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new task",
)
async def create_task(
    body: TaskCreate,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    service = TaskService(db)
    task = await service.create_task(user_id=auth.user.id, task_data=body)
    return TaskResponse(task=TaskPublic.model_validate(task))


@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Update a task",
)
async def update_task(
    task_id: int,
    body: TaskUpdate,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> TaskResponse:
    service = TaskService(db)
    task = await service.update_task(task_id=task_id, user_id=auth.user.id, updates=body)
    return TaskResponse(task=TaskPublic.model_validate(task))


@router.post(
    "/{task_id}/complete",
    response_model=TaskCompleteResponse,
    summary="Complete a task and award XP",
)
async def complete_task(
    task_id: int,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> TaskCompleteResponse:
    service = TaskService(db)
    task, xp_awarded = await service.complete_task(task_id=task_id, user_id=auth.user.id)
    return TaskCompleteResponse(
        task=TaskPublic.model_validate(task),
        xp_awarded=xp_awarded,
        message="Task completed! XP awarded.",
    )


@router.delete(
    "/{task_id}",
    response_model=DeleteTaskResponse,
    summary="Delete a task",
)
async def delete_task(
    task_id: int,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> DeleteTaskResponse:
    service = TaskService(db)
    await service.delete_task(task_id=task_id, user_id=auth.user.id)
    return DeleteTaskResponse(message="Task deleted successfully.")


@router.post(
    "/import",
    response_model=TaskBatchImportResponse,
    summary="Batch import local SQLite tasks (non-destructive)",
)
async def batch_import_tasks(
    body: TaskBatchImportRequest,
    auth: CurrentAuth = Depends(require_auth),
    db: AsyncSession = Depends(get_db),
) -> TaskBatchImportResponse:
    service = TaskService(db)
    imported, skipped, total = await service.batch_import(
        user_id=auth.user.id, tasks_data=body.tasks
    )
    return TaskBatchImportResponse(
        imported=imported,
        skipped=skipped,
        total=total,
    )

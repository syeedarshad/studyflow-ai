"""
StudyFlow AI — Task Service
─────────────────────────────────────────────────────────────
Business logic and orchestration for tasks.
"""

from datetime import datetime, timezone
from typing import List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.tasks.models import Task
from app.api.tasks.repository import TaskRepository
from app.api.tasks.schemas import TaskCreate, TaskUpdate

CATEGORY_XP_MAP = {
    "revision": 10,
    "coding": 20,
    "math": 25,
    "exam prep": 30,
    "lecture": 15,
    "project": 25,
    "reading": 10,
    "assignment": 20,
}


def get_category_xp(category: Optional[str]) -> int:
    if not category:
        return 10
    return CATEGORY_XP_MAP.get(category.strip().lower(), 10)


class TaskService:
    def __init__(self, db: AsyncSession):
        self.repo = TaskRepository(db)

    async def get_task_or_404(self, task_id: int, user_id: int) -> Task:
        task = await self.repo.get_by_id(task_id, user_id)
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task with ID {task_id} not found.",
            )
        return task

    async def list_tasks(
        self,
        user_id: int,
        status_filter: Optional[str] = None,
        category: Optional[str] = None,
        due_date: Optional[str] = None,
        goal_id: Optional[int] = None,
        search: Optional[str] = None,
    ) -> List[Task]:
        return await self.repo.list_tasks(
            user_id=user_id,
            status=status_filter,
            category=category,
            due_date=due_date,
            goal_id=goal_id,
            search=search,
        )

    async def list_today_tasks(self, user_id: int, today_str: Optional[str] = None) -> List[Task]:
        if not today_str:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return await self.repo.list_today_tasks(user_id=user_id, today_str=today_str)

    async def create_task(self, user_id: int, task_data: TaskCreate) -> Task:
        xp_reward = task_data.xp_reward or get_category_xp(task_data.category)
        return await self.repo.create(user_id=user_id, task_data=task_data, xp_reward=xp_reward)

    async def update_task(self, task_id: int, user_id: int, updates: TaskUpdate) -> Task:
        task = await self.get_task_or_404(task_id, user_id)
        if updates.category and not updates.xp_reward:
            updates.xp_reward = get_category_xp(updates.category)
        return await self.repo.update(task, updates)

    async def complete_task(self, task_id: int, user_id: int) -> Tuple[Task, int]:
        task = await self.get_task_or_404(task_id, user_id)
        if task.status == "completed":
            return task, 0

        completed_task = await self.repo.complete(task)
        xp_awarded = completed_task.xp_reward
        return completed_task, xp_awarded

    async def delete_task(self, task_id: int, user_id: int) -> None:
        task = await self.get_task_or_404(task_id, user_id)
        await self.repo.delete(task)

    async def batch_import(self, user_id: int, tasks_data: List[TaskCreate]) -> Tuple[int, int, int]:
        imported, skipped = await self.repo.batch_import(
            user_id=user_id, tasks_data=tasks_data, get_xp_fn=get_category_xp
        )
        return imported, skipped, len(tasks_data)

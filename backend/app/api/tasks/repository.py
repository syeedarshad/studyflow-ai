"""
StudyFlow AI — Task Repository
─────────────────────────────────────────────────────────────
All database operations for tasks with strict user_id scoping.
"""

from datetime import datetime, timezone
from typing import List, Optional, Tuple

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.tasks.models import Task
from app.api.tasks.schemas import TaskCreate, TaskUpdate


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TaskRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, task_id: int, user_id: int, include_deleted: bool = False) -> Optional[Task]:
        """Fetch a specific task belonging to user_id."""
        conditions = [Task.id == task_id, Task.user_id == user_id]
        if not include_deleted:
            conditions.append(Task.status != "deleted")

        stmt = select(Task).where(and_(*conditions))
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_tasks(
        self,
        user_id: int,
        status: Optional[str] = None,
        category: Optional[str] = None,
        due_date: Optional[str] = None,
        goal_id: Optional[int] = None,
        search: Optional[str] = None,
    ) -> List[Task]:
        """List tasks for user_id with optional filters."""
        conditions = [Task.user_id == user_id]

        if status:
            conditions.append(Task.status == status)
        else:
            conditions.append(Task.status != "deleted")

        if category:
            conditions.append(Task.category == category)
        if due_date:
            conditions.append(Task.due_date == due_date)
        if goal_id is not None:
            conditions.append(Task.goal_id == goal_id)
        if search:
            conditions.append(Task.title.ilike(f"%{search.strip()}%"))

        prio_order = case(
            (Task.priority == "high", 1),
            (Task.priority == "medium", 2),
            else_=3,
        )

        stmt = select(Task).where(and_(*conditions)).order_by(
            prio_order, Task.due_date.asc().nulls_last(), Task.created_at.asc()
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def list_today_tasks(self, user_id: int, today_str: str) -> List[Task]:
        """List tasks due today or without a due date."""
        prio_order = case(
            (Task.priority == "high", 1),
            (Task.priority == "medium", 2),
            else_=3,
        )

        stmt = (
            select(Task)
            .where(
                and_(
                    Task.user_id == user_id,
                    Task.status != "deleted",
                    or_(
                        Task.due_date == today_str,
                        Task.due_date.is_(None),
                        Task.due_date == "",
                    ),
                )
            )
            .order_by(prio_order, Task.created_at.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, user_id: int, task_data: TaskCreate, xp_reward: int) -> Task:
        """Create a new task for user_id."""
        task = Task(
            user_id=user_id,
            title=task_data.title.strip(),
            category=task_data.category.strip() if task_data.category else "Revision",
            priority=task_data.priority.strip() if task_data.priority else "medium",
            status="pending",
            xp_reward=xp_reward,
            due_date=task_data.due_date,
            reminder_time=task_data.reminder_time,
            is_recurring=task_data.is_recurring,
            recurrence_pattern=task_data.recurrence_pattern,
            notes=task_data.notes,
            estimated_minutes=task_data.estimated_minutes or 30,
            goal_id=task_data.goal_id,
        )
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def update(self, task: Task, updates: TaskUpdate) -> Task:
        """Update existing task fields."""
        update_dict = updates.model_dump(exclude_unset=True)
        for key, value in update_dict.items():
            if value is not None or key in ("due_date", "reminder_time", "notes", "goal_id", "recurrence_pattern"):
                setattr(task, key, value)

        task.updated_at = _utcnow()
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def complete(self, task: Task) -> Task:
        """Mark task completed."""
        task.status = "completed"
        task.completed_at = _utcnow()
        task.updated_at = _utcnow()
        await self.db.commit()
        await self.db.refresh(task)
        return task

    async def delete(self, task: Task) -> None:
        """Soft-delete a task."""
        task.status = "deleted"
        task.updated_at = _utcnow()
        await self.db.commit()

    async def batch_import(
        self, user_id: int, tasks_data: List[TaskCreate], get_xp_fn
    ) -> Tuple[int, int]:
        """
        Non-destructive import of local SQLite tasks for user_id.
        Deduplicates against active tasks by (title, due_date, goal_id).
        Returns (imported_count, skipped_count).
        """
        # Fetch existing active tasks for deduplication
        existing_stmt = select(Task.title, Task.due_date, Task.goal_id).where(
            and_(Task.user_id == user_id, Task.status != "deleted")
        )
        existing_res = await self.db.execute(existing_stmt)
        existing_keys = {
            (r[0].strip().lower(), r[1] or "", r[2]) for r in existing_res.all()
        }

        imported = 0
        skipped = 0

        for t in tasks_data:
            key = (t.title.strip().lower(), t.due_date or "", t.goal_id)
            if key in existing_keys:
                skipped += 1
                continue

            xp = t.xp_reward if t.xp_reward is not None else get_xp_fn(t.category)
            task = Task(
                user_id=user_id,
                title=t.title.strip(),
                category=t.category.strip() if t.category else "Revision",
                priority=t.priority.strip() if t.priority else "medium",
                status="pending",
                xp_reward=xp,
                due_date=t.due_date,
                reminder_time=t.reminder_time,
                is_recurring=t.is_recurring,
                recurrence_pattern=t.recurrence_pattern,
                notes=t.notes,
                estimated_minutes=t.estimated_minutes or 30,
                goal_id=t.goal_id,
            )
            self.db.add(task)
            existing_keys.add(key)
            imported += 1

        if imported > 0:
            await self.db.commit()

        return imported, skipped

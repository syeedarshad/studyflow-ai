"""
StudyFlow AI — Task Pydantic Schemas
─────────────────────────────────────────────────────────────
Request & response models for /api/v1/tasks/* endpoints.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    category: str = Field(default="Revision", max_length=100)
    priority: str = Field(default="medium", max_length=20)
    due_date: Optional[str] = Field(default=None, max_length=10)
    reminder_time: Optional[str] = Field(default=None, max_length=50)
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None
    estimated_minutes: int = Field(default=30, ge=1, le=1440)
    goal_id: Optional[int] = None
    xp_reward: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    category: Optional[str] = Field(default=None, max_length=100)
    priority: Optional[str] = Field(default=None, max_length=20)
    status: Optional[str] = Field(default=None, max_length=20)
    due_date: Optional[str] = Field(default=None, max_length=10)
    reminder_time: Optional[str] = Field(default=None, max_length=50)
    is_recurring: Optional[bool] = None
    recurrence_pattern: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None
    estimated_minutes: Optional[int] = Field(default=None, ge=1, le=1440)
    goal_id: Optional[int] = None
    xp_reward: Optional[int] = None


class TaskPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    category: str
    priority: str
    status: str
    xp_reward: int
    due_date: Optional[str] = None
    reminder_time: Optional[str] = None
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    notes: Optional[str] = None
    estimated_minutes: int = 30
    goal_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None


class TaskResponse(BaseModel):
    success: bool = True
    task: TaskPublic


class TasksListResponse(BaseModel):
    success: bool = True
    tasks: List[TaskPublic]
    total: int


class TaskCompleteResponse(BaseModel):
    success: bool = True
    task: TaskPublic
    xp_awarded: int
    message: str = "Task completed successfully."


class DeleteTaskResponse(BaseModel):
    success: bool = True
    message: str = "Task deleted successfully."


class TaskBatchImportRequest(BaseModel):
    tasks: List[TaskCreate]


class TaskBatchImportResponse(BaseModel):
    success: bool = True
    imported: int
    skipped: int
    total: int

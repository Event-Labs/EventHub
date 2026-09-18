-- Migration: Drop staff_tasks table, triggers, and task_status_enum
DROP TRIGGER IF EXISTS trigger_staff_tasks_updated_at ON staff_tasks;
DROP TABLE IF EXISTS staff_tasks CASCADE;
DROP TYPE IF EXISTS task_status_enum CASCADE;

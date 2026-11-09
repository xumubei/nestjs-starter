// @env node
import type { PaginationDto } from '../http/pagination.dto.js'
import type { CreateTaskDto, Task, UpdateTaskDto } from './task.dto.js'
import { randomUUID } from 'node:crypto'
import { Injectable, NotFoundException } from '@nestjs/common'
import { currentOwner } from '../auth/current-account.js'
import { DatabaseService } from '../database/database.service.js'

function requireTask(task?: Task): Task {
  if (!task) {
    throw new NotFoundException('Task not found')
  }
  return task
}

@Injectable()
export class TasksService {
  constructor(private readonly database: DatabaseService) {}

  /** Every query filters by the authenticated account, so callers never pass it in. */
  private get ownerId(): string {
    return currentOwner().ownerId
  }

  async list({ limit, offset }: PaginationDto): Promise<Task[]> {
    const { rows } = await this.database.pool.query<Task>(
      'SELECT id, title, completed FROM tasks WHERE owner_id = $1 ORDER BY created_at, id LIMIT $2 OFFSET $3',
      [this.ownerId, limit, offset],
    )
    return rows
  }

  async get(id: string): Promise<Task> {
    const { rows } = await this.database.pool.query<Task>(
      'SELECT id, title, completed FROM tasks WHERE owner_id = $1 AND id = $2',
      [this.ownerId, id],
    )
    return requireTask(rows[0])
  }

  async create(input: CreateTaskDto): Promise<Task> {
    const { rows } = await this.database.pool.query<Task>(
      'INSERT INTO tasks (id, owner_id, title) VALUES ($1, $2, $3) RETURNING id, title, completed',
      [
        randomUUID(),
        this.ownerId,
        input.title,
      ],
    )
    return rows[0]
  }

  async update(id: string, input: UpdateTaskDto): Promise<Task> {
    const { rows } = await this.database.pool.query<Task>(
      'UPDATE tasks SET title = COALESCE($3, title), completed = COALESCE($4, completed) WHERE owner_id = $1 AND id = $2 RETURNING id, title, completed',
      [
        this.ownerId,
        id,
        input.title,
        input.completed,
      ],
    )
    return requireTask(rows[0])
  }

  async remove(id: string): Promise<void> {
    const { rowCount } = await this.database.pool.query(
      'DELETE FROM tasks WHERE owner_id = $1 AND id = $2',
      [this.ownerId, id],
    )
    if (!rowCount) {
      throw new NotFoundException('Task not found')
    }
  }
}

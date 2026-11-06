import type { AuthenticatedRequest } from '../auth/types.js'
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common'
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { PaginationDto } from '../database/pagination.dto.js'
import { ownerScope } from '../modules/datascope/index.js'
import { CreateTaskDto, Task, UpdateTaskDto } from './task.dto.js'
import { TasksService } from './tasks.service.js'

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOkResponse({
    type: [Task],
  })
  list(@Req() request: AuthenticatedRequest, @Query() query: PaginationDto): Promise<Task[]> {
    return this.tasks.list(ownerScope(request.accountId), query)
  }

  @Get(':id')
  @ApiOkResponse({ type: Task })
  get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<Task> {
    return this.tasks.get(ownerScope(request.accountId), id)
  }

  @Post()
  @ApiCreatedResponse({ type: Task })
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateTaskDto): Promise<Task> {
    return this.tasks.create(ownerScope(request.accountId), input)
  }

  @Patch(':id')
  @ApiOkResponse({ type: Task })
  update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateTaskDto): Promise<Task> {
    return this.tasks.update(ownerScope(request.accountId), id, input)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tasks.remove(ownerScope(request.accountId), id)
  }
}

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger'
import { PaginationDto } from '../http/pagination.dto.js'
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
  list(@Query() query: PaginationDto): Promise<Task[]> {
    return this.tasks.list(query)
  }

  @Get(':id')
  @ApiOkResponse({ type: Task })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Task> {
    return this.tasks.get(id)
  }

  @Post()
  @ApiCreatedResponse({ type: Task })
  create(@Body() input: CreateTaskDto): Promise<Task> {
    return this.tasks.create(input)
  }

  @Patch(':id')
  @ApiOkResponse({ type: Task })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateTaskDto): Promise<Task> {
    return this.tasks.update(id, input)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.tasks.remove(id)
  }
}

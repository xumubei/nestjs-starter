import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBoolean, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator'

export class CreateTaskDto {
  @ApiProperty({ example: 'Try the starter', maxLength: 120 })
  @Transform(({ value }: { value: unknown }) => typeof value === 'string'
    ? value.trim()
    : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string
}

export class UpdateTaskDto extends PartialType(CreateTaskDto, { skipNullProperties: false }) {
  @ApiPropertyOptional({ example: true })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  completed?: boolean
}

export class Task {
  @ApiProperty({ format: 'uuid' })
  id!: string

  @ApiProperty({ example: 'Try the starter' })
  title!: string

  @ApiProperty({ example: false })
  completed!: boolean
}

import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsIn,
  IsDateString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export type PostListStateFilter = 'all' | 'scheduled' | 'draft' | 'published';

export class GetPostsListDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @IsOptional()
  @IsString()
  customer?: string;

  @IsOptional()
  @IsString()
  customers?: string;

  @IsOptional()
  @IsString()
  providers?: string;

  @IsOptional()
  @IsString()
  sources?: string;

  @IsOptional()
  @IsString()
  states?: string;

  @IsOptional()
  @IsIn(['all', 'scheduled', 'draft', 'published'])
  state?: PostListStateFilter = 'all';
}

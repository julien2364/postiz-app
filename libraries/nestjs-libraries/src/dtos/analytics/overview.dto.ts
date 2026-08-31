import { IsDateString, IsOptional, IsString } from 'class-validator';

export class AnalyticsOverviewDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

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
}

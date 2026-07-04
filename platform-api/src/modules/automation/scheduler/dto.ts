// DTOs do Scheduler (preview + calendarios).
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class PreviewScheduleDto {
  @IsIn(['interval', 'daily', 'weekly', 'monthly', 'cron', 'business_day'])
  kind!: 'interval' | 'daily' | 'weekly' | 'monthly' | 'cron' | 'business_day';

  @IsOptional()
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'time deve ser HH:MM' })
  time?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  day?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  every_minutes?: number;

  @IsOptional()
  @IsObject()
  business?: { which: 'first' | 'last'; weekday?: number };

  @IsOptional()
  @IsString()
  cron?: string;

  @IsOptional()
  @IsString()
  calendar_id?: string;
}

export class CreateCalendarDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  /** Datas 'YYYY-MM-DD'. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  holidays?: string[];

  /** Dias uteis 0=dom..6=sab. */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  workdays?: number[];
}

export class UpdateCalendarDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  holidays?: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  workdays?: number[];
}

import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

}

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  default_queue_id?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class CreateQueueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  team_id?: string;

}

export class UpdateQueueDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  team_id?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class AddMemberDto {
  @IsUUID()
  user_id!: string;

  @IsIn(['MEMBER', 'SUPERVISOR'])
  role!: 'MEMBER' | 'SUPERVISOR';

  // Opt-in: recebe alerta de incidente ISP via WhatsApp (nasce OFF).
  @IsOptional()
  @IsBoolean()
  receive_incident_alerts?: boolean;
}

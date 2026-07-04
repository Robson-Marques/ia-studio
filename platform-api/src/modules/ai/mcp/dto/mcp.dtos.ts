// DTOs do submodulo MCP Client. Validacao via class-validator (sem any).
import { McpTransport } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMcpServerDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  workspace_id!: string;

  @IsString()
  environment_id!: string;

  @IsEnum(McpTransport)
  transport!: McpTransport;

  // url (HTTP/SSE) ou command (STDIO).
  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsString()
  secret_id?: string;
}

export class UpdateMcpServerDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsString()
  secret_id?: string;

  // Liga/desliga o servidor MCP. Nasce OFF; so o usuario liga (feature flag manual).
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Configuracao tecnica, uma vez por instalacao. A chave nunca volta pela API:
// na edicao, campo ausente/vazio preserva o valor ja cifrado no Secrets Manager.
export class ConfigureNivooConsumerDto {
  @IsString()
  @IsNotEmpty()
  installation_id!: string;

  @IsString()
  @IsNotEmpty()
  consumer_origin!: string;

  @IsOptional()
  @IsString()
  internal_key?: string;
}

import { Allow, IsNotEmpty, IsString } from 'class-validator';

export class ExecuteOperationDto {
  @IsString()
  @IsNotEmpty()
  operation!: string;

  /** Payload da operacao — validado pelo provider (schema por operacao). */
  @Allow()
  params?: unknown;
}

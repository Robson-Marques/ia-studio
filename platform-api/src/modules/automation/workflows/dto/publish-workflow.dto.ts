import { IsInt, Min } from 'class-validator';

export class PublishWorkflowDto {
  /** Versao a apontar como ativa (publicar OU rollback — diretriz 3). */
  @IsInt()
  @Min(1)
  version!: number;
}

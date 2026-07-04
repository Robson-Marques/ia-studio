import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateWorkflowDto } from './create-workflow.dto';

export class UpdateWorkflowDto extends PartialType(
  OmitType(CreateWorkflowDto, ['workspace_id', 'environment_id'] as const),
) {}

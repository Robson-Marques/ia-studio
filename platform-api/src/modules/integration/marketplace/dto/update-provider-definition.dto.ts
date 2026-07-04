import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateProviderDefinitionDto } from './create-provider-definition.dto';

// key e imutavel apos criacao (identidade do conector no registry).
export class UpdateProviderDefinitionDto extends PartialType(
  OmitType(CreateProviderDefinitionDto, ['key'] as const),
) {}

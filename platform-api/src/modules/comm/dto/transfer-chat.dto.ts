import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class TransferChatDto {
  @IsIn(['user', 'queue', 'team'])
  type!: 'user' | 'queue' | 'team';

  @IsUUID()
  @IsNotEmpty()
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CloseChatDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

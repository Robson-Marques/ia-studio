import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnalyzeChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  chat_id!: string;
}

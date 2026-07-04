import { IsIn } from 'class-validator';

export const CONNECTION_STATE_ACTIONS = ['enable', 'disable', 'maintenance'] as const;
export type ConnectionStateAction = (typeof CONNECTION_STATE_ACTIONS)[number];

export class UpdateConnectionStateDto {
  @IsIn(CONNECTION_STATE_ACTIONS, {
    message: 'action deve ser enable, disable ou maintenance.',
  })
  action!: ConnectionStateAction;
}

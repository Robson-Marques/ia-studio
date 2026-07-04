// Modulo global do broker (diretriz 8): expoe SOMENTE o token MESSAGE_BROKER
// (interface IMessageBroker) — a implementacao BullMQ fica encapsulada aqui.
import { Global, Module } from '@nestjs/common';
import { MESSAGE_BROKER } from './message-broker.interface';
import { BullMqBroker } from './bullmq.broker';

@Global()
@Module({
  providers: [{ provide: MESSAGE_BROKER, useClass: BullMqBroker }],
  exports: [MESSAGE_BROKER],
})
export class BrokerModule {}

// Event Bus (diretriz 7) — modulo global: qualquer modulo publica via
// EventBusService sem import cruzado.
import { Global, Module } from '@nestjs/common';
import { EventBusService } from './event-bus.service';
import { EventLogRepository } from './event-log.repository';

@Global()
@Module({
  providers: [EventBusService, EventLogRepository],
  exports: [EventBusService, EventLogRepository],
})
export class EventsModule {}

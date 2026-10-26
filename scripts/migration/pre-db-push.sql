-- Hook de limpeza de schema executado pelo upgrade.sh ANTES do `prisma db push`.
-- Vive versionado: cada release carrega aqui a limpeza necessaria para o SEU
-- schema, e o atualizador roda o hook da versao-ALVO (ja em checkout). Assim uma
-- remocao destrutiva (coluna/tabela/valor de enum) se aplica sozinha no upgrade,
-- sem passo manual no host e sem `db push` recusar por perda de dados.
--
-- REGRAS: idempotente (sempre `IF EXISTS`/guarda), no-op em instalacao nova, e so
-- remove objetos que nenhuma linha viva usa. O backup completo ja rodou antes.
--
-- Conteudo atual (faxina v0.11.22): remove residuos do Baileys (coluna de modo
-- manual + tabela de sessao) e dos motores LLM Gemini/Ollama (valores de enum).
DROP INDEX IF EXISTS "comm_whatsapp_chats_manual_connection_id_idx";
ALTER TABLE IF EXISTS "comm_whatsapp_chats" DROP COLUMN IF EXISTS "manual_connection_id";
DROP TABLE IF EXISTS "comm_whatsapp_baileys_sessions";
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AiProviderKind' AND e.enumlabel IN ('GEMINI', 'OLLAMA')
  ) THEN
    CREATE TYPE "AiProviderKind_new" AS ENUM ('OPENAI', 'ANTHROPIC', 'OPENROUTER', 'GROQ', 'DEEPSEEK', 'MISTRAL', 'AZURE_OPENAI', 'COHERE');
    ALTER TABLE "ai_agent_runs" ALTER COLUMN "provider_kind" TYPE "AiProviderKind_new" USING ("provider_kind"::text::"AiProviderKind_new");
    ALTER TYPE "AiProviderKind" RENAME TO "AiProviderKind_old";
    ALTER TYPE "AiProviderKind_new" RENAME TO "AiProviderKind";
    DROP TYPE "AiProviderKind_old";
    RAISE NOTICE 'enum AiProviderKind recriado sem GEMINI/OLLAMA';
  END IF;
END $$;

-- v0.11.96: os identificadores remotos/jobs sao colunas novas e anulaveis.
-- O Prisma 5 emite aviso de perda de dados ao adicionar UNIQUE em tabelas
-- existentes, mesmo quando todas as linhas antigas recebem NULL. Preparar as
-- colunas e os indices aqui evita --accept-data-loss. Se houver valores
-- duplicados por drift previo, CREATE UNIQUE INDEX falha sem apagar dados.
ALTER TABLE IF EXISTS "comm_whatsapp_chats" ADD COLUMN IF NOT EXISTS "remote_chat_id" TEXT;
ALTER TABLE IF EXISTS "comm_whatsapp_messages" ADD COLUMN IF NOT EXISTS "remote_message_id" TEXT;
ALTER TABLE IF EXISTS "comm_whatsapp_messages" ADD COLUMN IF NOT EXISTS "remote_job_id" TEXT;
ALTER TABLE IF EXISTS "isp_incident_dispatches" ADD COLUMN IF NOT EXISTS "job_id" TEXT;
ALTER TABLE IF EXISTS "isp_incident_team_alerts" ADD COLUMN IF NOT EXISTS "job_id" TEXT;

DO $$
BEGIN
  IF to_regclass('comm_whatsapp_chats') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "comm_whatsapp_chats_remote_chat_id_key"
      ON "comm_whatsapp_chats" ("remote_chat_id");
  END IF;
  IF to_regclass('comm_whatsapp_messages') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "comm_whatsapp_messages_remote_message_id_key"
      ON "comm_whatsapp_messages" ("remote_message_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "comm_whatsapp_messages_remote_job_id_key"
      ON "comm_whatsapp_messages" ("remote_job_id");
  END IF;
  IF to_regclass('isp_incident_dispatches') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "isp_incident_dispatches_job_id_key"
      ON "isp_incident_dispatches" ("job_id");
  END IF;
  IF to_regclass('isp_incident_team_alerts') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "isp_incident_team_alerts_job_id_key"
      ON "isp_incident_team_alerts" ("job_id");
  END IF;
END $$;

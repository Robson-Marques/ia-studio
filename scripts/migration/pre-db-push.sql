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

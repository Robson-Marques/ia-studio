\ = Get-Content -Path 'platform-api/src/modules/ai/connectchat/connectchat-auto-responder.service.ts' -Raw

\ = 'await this\.inbox\.sendAgentMessage\(conversation\.id,\s*([^)]+),\s*([^]+)\);\s*await this\.complete\(key, sequence, claim\);'
\ = 'const sent = await this.sendReply(conversation.id, \, $2, key, sequence, claim);
        if (!sent) return;
        await this.complete(key, sequence, claim);'
\ = \ -replace \, \

Set-Content -Path 'platform-api/src/modules/ai/connectchat/connectchat-auto-responder.service.ts' -Value \ -Encoding UTF8
Write-Host 'Done'

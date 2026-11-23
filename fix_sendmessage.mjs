import fs from 'fs';

const filePath = 'C:/Users/Flowspec/Documents/delivery-system/IA STUDIO/platform-api/src/modules/ai/connectchat/connectchat-auto-responder.service.ts';
let content = fs.readFileSync(filePath, 'utf-8');

const pattern = /await this\.inbox\.sendAgentMessage\(conversation\.id,\s*([^)]+),\s*([^]+)\);\s*await this\.complete\(key, sequence, claim\);/g;
const replacement = 'const sent = await this.sendReply(conversation.id, , $2, key, sequence, claim);\n        if (!sent) return;\n        await this.complete(key, sequence, claim);';

content = content.replace(pattern, replacement);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Done');

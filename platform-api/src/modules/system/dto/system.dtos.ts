import { IsString, Matches, MaxLength } from 'class-validator';

// Tag de versao no formato vX.Y.Z (SemVer com prefixo "v"). O regex tambem
// barra caracteres perigosos (`;`, espacos, `/`, `..`) — a tag vira argumento
// do upgrade.sh, entao precisa ser estritamente validada.
const TAG_REGEX = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export class StartUpgradeDto {
  @IsString()
  @MaxLength(64)
  @Matches(TAG_REGEX, { message: 'version deve ser uma tag no formato vX.Y.Z.' })
  version!: string;
}

export class RestoreDto {
  // Nome do arquivo de backup a restaurar (validado tambem contra path-traversal
  // no service via assertSafeFileName).
  @IsString()
  @MaxLength(256)
  file!: string;
}

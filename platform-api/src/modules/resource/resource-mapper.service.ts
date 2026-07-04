// Mapper (diretriz 24): aplica o field_map de um ResourceMapping sobre um
// registro bruto do provider → objeto canonico. Funcoes puras de transformacao
// (dot-path) — nao toca DB nem provider. `fromCanonical` opcional (inverso).
import { Injectable } from '@nestjs/common';
import { ResourceMapping } from '@prisma/client';
import { allFieldsFor } from './resource-model.catalog';

/** Le um valor por dot-path ("a.b.0.c") de um objeto arbitrario. */
export function getByPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  const parts = path.split('.');
  let cur: unknown = source;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(part);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

export interface CanonicalRecord {
  [field: string]: unknown;
}

@Injectable()
export class ResourceMapperService {
  /**
   * Aplica field_map + extensions de um mapping sobre um registro bruto.
   * field_map = { canonicalField: "sourcePath" }; extensions idem (namespaced
   * sob `extensions`). Campos sem origem viram null. `_raw` NAO e incluido por
   * padrao (a plataforma nao persiste dado de negocio; quem quiser o cru pede).
   */
  toCanonical(
    mapping: Pick<ResourceMapping, 'resource_type' | 'field_map' | 'extensions'>,
    raw: unknown,
  ): CanonicalRecord {
    const fieldMap = this.asMap(mapping.field_map);
    const out: CanonicalRecord = {};
    for (const [canonical, path] of Object.entries(fieldMap)) {
      if (typeof path !== 'string') continue;
      out[canonical] = getByPath(raw, path) ?? null;
    }

    const extensions = this.asMap(mapping.extensions);
    if (Object.keys(extensions).length > 0) {
      const ext: CanonicalRecord = {};
      for (const [canonical, path] of Object.entries(extensions)) {
        if (typeof path !== 'string') continue;
        ext[canonical] = getByPath(raw, path) ?? null;
      }
      out['extensions'] = ext;
    }
    return out;
  }

  /** Aplica o mapping sobre uma lista de registros brutos. */
  toCanonicalList(
    mapping: Pick<ResourceMapping, 'resource_type' | 'field_map' | 'extensions'>,
    rows: unknown[],
  ): CanonicalRecord[] {
    return rows.map((r) => this.toCanonical(mapping, r));
  }

  /**
   * Inverso simples (opcional): monta um objeto de origem a partir de um
   * canonico (canonicalField → sourcePath top-level). So suporta paths simples
   * (sem indices), suficiente para escrita basica.
   */
  fromCanonical(
    mapping: Pick<ResourceMapping, 'field_map'>,
    canonical: CanonicalRecord,
  ): Record<string, unknown> {
    const fieldMap = this.asMap(mapping.field_map);
    const out: Record<string, unknown> = {};
    for (const [canonicalField, path] of Object.entries(fieldMap)) {
      if (typeof path !== 'string' || path.includes('.')) continue;
      if (canonical[canonicalField] !== undefined) out[path] = canonical[canonicalField];
    }
    return out;
  }

  /** Valida que as chaves do field_map sao campos canonicos do tipo. */
  unknownFields(resourceType: string, fieldMap: Record<string, unknown>): string[] {
    const known = new Set(allFieldsFor(resourceType).map((f) => f.key));
    return Object.keys(fieldMap).filter((k) => !known.has(k));
  }

  private asMap(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}

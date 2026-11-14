import type { DimensionKey, DimensionProvenanceKind } from '../equipment/schema.ts';
import type { ExtractedDimensionCandidate } from './extractor.ts';

function toMeters(value: number, unitRaw: string): number {
  const u = unitRaw.toLowerCase().trim();
  if (u === 'mm' || u.startsWith('millimeter') || u.startsWith('millimetre')) return +(value / 1000).toFixed(4);
  if (u === 'cm' || u.startsWith('centimeter') || u.startsWith('centimetre')) return +(value / 100).toFixed(4);
  if (u === 'in' || u === 'inch' || u === 'inches' || u === '"') return +(value * 0.0254).toFixed(4);
  return +value.toFixed(4);
}

export function extractLaunchPointAtPivot(text: string): string | undefined {
  const launchPoint = '(?:launch|firing|release) (?:point|position)';
  const pivot = '(?:the )?(?:(?:barrel|launcher|cannon) )?pivot(?: point| axis)?';
  const relation = '(?:coincides with|is coincident with)';
  const direct = new RegExp('\\b(?:the )?' + launchPoint + ' ' + relation + ' ' + pivot + '\\b', 'i');
  const inverse = new RegExp('\\b' + pivot + ' ' + relation + ' (?:the )?' + launchPoint + '\\b', 'i');
  const normalized = text.replace(/\s+/g, ' ');
  if (/\b(?:launch|firing|release) (?:point|position) (?:does not coincide with|is not (?:coincident with|at))\b/i.test(normalized)) return undefined;
  return normalized.match(direct)?.[0] ?? normalized.match(inverse)?.[0];
}

export function extractDocumentedBore(text: string) {
  const entries = [...text.matchAll(/\b(?:barrel|tube|guide)\s+(?:inside diameter|inner diameter|bore(?: diameter)?)\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|inches|inch|in|m)\b/gi)]
    .filter(match => !/\b(?:about|approx\w*|roughly|estimated)\b|[~≈]/i.test(text.slice(Math.max(0, (match.index ?? 0) - 12), match.index)))
    .map(match => ({ meters: toMeters(Number(match[1]), match[2]), quote: match[0] }))
    .filter(entry => entry.meters >= .006 && entry.meters < .2);
  const conflict = new Set(entries.map(entry => entry.meters)).size > 1;
  return { bore: conflict ? undefined : entries[0], conflict };
}

export function extractExplicitDimensions(text: string, sourceUrl = '') {
  const dimension_candidates: Partial<Record<DimensionKey, ExtractedDimensionCandidate>> = {};
  const provenanceKind: DimensionProvenanceKind = sourceUrl ? 'product_page' : 'user_text';

  // Guide dimensions describe a part. Product length and bore have separate meanings.
  const barrelLenMatch = text.match(
    /\b(?:barrel|guide|tube|channel|housing|ramp)[- ]+length\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in)\b|\b(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in)\s+long\s+(?:(?:machined|anodized|aluminum|launch)\s+)*(?:barrel|guide|tube|channel|housing|ramp)\b/i
  );
  if (barrelLenMatch) {
    const rawVal = Number(barrelLenMatch[1] ?? barrelLenMatch[3]);
    const unit = barrelLenMatch[2] ?? barrelLenMatch[4];
    const valM = toMeters(rawVal, unit);
    if (valM >= 0.1 && valM <= 1.5) {
      const matchIdx = barrelLenMatch.index ?? 0;
      const windowSnippet = text.slice(Math.max(0, matchIdx - 20), Math.min(text.length, matchIdx + barrelLenMatch[0].length + 20));
      const isApprox = /\b(approx|approximate|estimated|estimate|proportion|proportional|about|around|~)\b/i.test(windowSnippet);
      dimension_candidates.barrelLength = {
        key: 'barrelLength',
        value_m: valM,
        quote: isApprox && !barrelLenMatch[0].toLowerCase().includes('approx') ? `approx. ${barrelLenMatch[0].trim()}` : barrelLenMatch[0].trim(),
        source: isApprox ? 'visual_estimate' : provenanceKind,
        confidenceNote: isApprox
          ? 'Approximate visual estimate (unconfirmed without traceable spec sheet)'
          : 'Explicitly stated in specification text',
      };
    }
  }

  // Barrel / Guide diameter or width
  const barrelDiaMatch = text.match(
    /\b(?:barrel|guide|tube|housing|channel)\s+(?:(?:outside|outer|external)\s+(?:diameter|width)|od)\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in)\b|\b(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in)\s+(?:outside|outer|external)\s+(?:diameter|width)\s+(?:of\s+(?:the\s+)?)?(?:barrel|guide|tube|housing|channel)\b/i
  );
  if (barrelDiaMatch) {
    const rawVal = Number(barrelDiaMatch[1] ?? barrelDiaMatch[3]);
    const unit = barrelDiaMatch[2] ?? barrelDiaMatch[4];
    const valM = toMeters(rawVal, unit);
    if (valM >= 0.02 && valM <= 0.2) {
      const matchIdx = barrelDiaMatch.index ?? 0;
      const windowSnippet = text.slice(Math.max(0, matchIdx - 20), Math.min(text.length, matchIdx + barrelDiaMatch[0].length + 20));
      const isApprox = /\b(approx|approximate|estimated|estimate|proportion|proportional|about|around|~)\b/i.test(windowSnippet);
      dimension_candidates.barrelDiameter = {
        key: 'barrelDiameter',
        value_m: valM,
        quote: isApprox && !barrelDiaMatch[0].toLowerCase().includes('approx') ? `approx. ${barrelDiaMatch[0].trim()}` : barrelDiaMatch[0].trim(),
        source: isApprox ? 'visual_estimate' : provenanceKind,
        confidenceNote: isApprox
          ? 'Approximate visual estimate (unconfirmed without traceable spec sheet)'
          : 'Explicitly stated in specification text',
      };
    }
  }

  // Base footprint (e.g., "52 x 24 cm base" or "base length: 0.52 m, base width: 0.24 m")
  const footprintMatch = text.match(
    /(\d+(?:\.\d+)?)\s*[x×by]+\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inches)\s*(?:birch\s*|plywood\s*|cast\s*|aluminum\s*)?(?:base|footprint|platform)/i
  );
  if (footprintMatch) {
    const v1 = toMeters(Number(footprintMatch[1]), footprintMatch[3]);
    const v2 = toMeters(Number(footprintMatch[2]), footprintMatch[3]);
    const len = Math.max(v1, v2);
    const wid = Math.min(v1, v2);
    if (len >= 0.15 && len <= 1.5) {
      dimension_candidates.baseLength = {
        key: 'baseLength',
        value_m: len,
        quote: footprintMatch[0].trim(),
        source: provenanceKind,
        confidenceNote: 'Extracted from 2D base footprint specification',
      };
    }
    if (wid >= 0.08 && wid <= 0.8) {
      dimension_candidates.baseWidth = {
        key: 'baseWidth',
        value_m: wid,
        quote: footprintMatch[0].trim(),
        source: provenanceKind,
        confidenceNote: 'Extracted from 2D base footprint specification',
      };
    }
  } else {
    const baseLenMatch = text.match(
      /base\s*length\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inches)\b|(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inches)\s*(?:cast\s*|bench\s*|extruded\s*)?base(?:plate|\s*length|\s*rail)?/i
    );
    if (baseLenMatch) {
      const valM = toMeters(
        Number(baseLenMatch[1] ?? baseLenMatch[3]),
        baseLenMatch[2] ?? baseLenMatch[4]
      );
      if (valM >= 0.15 && valM <= 1.5) {
        dimension_candidates.baseLength = {
          key: 'baseLength',
          value_m: valM,
          quote: baseLenMatch[0].trim(),
          source: provenanceKind,
          confidenceNote: 'Explicitly stated base length',
        };
      }
    }
    const baseWidMatch = text.match(
      /base\s*width\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inches)\b|(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inches)\s*(?:base\s*width|outrigger\s*stance)/i
    );
    if (baseWidMatch) {
      const valM = toMeters(
        Number(baseWidMatch[1] ?? baseWidMatch[3]),
        baseWidMatch[2] ?? baseWidMatch[4]
      );
      if (valM >= 0.08 && valM <= 0.8) {
        dimension_candidates.baseWidth = {
          key: 'baseWidth',
          value_m: valM,
          quote: baseWidMatch[0].trim(),
          source: provenanceKind,
          confidenceNote: 'Explicitly stated base width',
        };
      }
    }
  }

  // Projectile / Ball / Sphere diameter
  const ballMatch = text.match(
    /(?:projectile|ball|sphere|marble)s?\s*(?:diameter|size)?\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inches)\b|(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inches)\s*(?:precision\s*|steel\s*|brass\s*|plastic\s*|chrome\s*|drilled\s*)?(?:projectile|ball|sphere|marble)s?\b|\b(?:balls?|spheres?|marbles?)\b[^;.!?\r\n]{1,72}?\bdiameter\s*(?:of|:|=|is)?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inches)\b|\bdiameter of (?:the )?(?:projectile|ball|sphere|marble)s?\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inches)\b/i
  );
  if (ballMatch) {
    const valM = toMeters(Number(ballMatch[1] ?? ballMatch[3] ?? ballMatch[5] ?? ballMatch[7]), ballMatch[2] ?? ballMatch[4] ?? ballMatch[6] ?? ballMatch[8]);
    if (valM >= 0.005 && valM <= 0.08) {
      dimension_candidates.projectileDiameter = {
        key: 'projectileDiameter',
        value_m: valM,
        quote: ballMatch[0].trim(),
        source: provenanceKind,
        confidenceNote: 'Explicitly stated projectile diameter',
      };
    }
  }
  return dimension_candidates;
}

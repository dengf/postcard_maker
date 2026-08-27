import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './i18n/en';

// English that never reaches `t()` renders untranslated in the middle of an
// otherwise fully translated page. Ported from budget_planner's identical
// guard -- see that repo's version for the three real bugs it would have
// caught.

const COMPONENTS = path.join(import.meta.dirname, 'components');

function sources() {
  return fs
    .readdirSync(COMPONENTS)
    .filter((f) => f.endsWith('.jsx') && !f.endsWith('.test.jsx'))
    .map((file) => ({
      file,
      source: fs
        .readFileSync(path.join(COMPONENTS, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
    }));
}

const CARRIES_A_WORD = /[A-Za-z]*[a-z][A-Za-z]/;
const isCatalogKey = (text) => Object.hasOwn(en, text);

/** The brand name -- a proper noun, identical in every locale. */
const BRAND = new Set(['meifio']);
const isBrand = (text) => BRAND.has(text);

/** A CSS unit suffix glued onto a template value, e.g. `` `${n}cqmin` `` --
 * not a word needing translation. */
const CSS_UNITS = new Set(['cqmin', 'cqw', 'cqh', 'px', 'em', 'rem', 'vh', 'vw']);
const isCssUnit = (text) => CSS_UNITS.has(text);

function hardcodedEnglish(source) {
  const found = [];
  const add = (index, text) => {
    if (CARRIES_A_WORD.test(text) && !isCatalogKey(text) && !isBrand(text) && !isCssUnit(text)) {
      found.push({ line: index + 1, text });
    }
  };

  source.split('\n').forEach((line, index) => {
    for (const m of line.matchAll(/>\s*([A-Za-z][A-Za-z ,.'%-]{4,})\s*</g)) {
      add(index, m[1].trim());
    }
    for (const m of line.matchAll(
      /\b(?:label|placeholder|title|aria-label|suffix|alt)\s*=\s*['"]([^'"]+)['"]/g,
    )) {
      add(index, m[1]);
    }
    for (const m of line.matchAll(/`[^`]*\$\{[^}]+\}\s*([A-Za-z][A-Za-z ]+)`/g)) {
      add(index, m[1].trim());
    }
  });
  return found;
}

describe('components put no English on screen that a catalog cannot translate', () => {
  it('finds sources to check', () => {
    expect(sources().length).toBeGreaterThan(5);
  });

  it.each(sources())('$file', ({ file, source }) => {
    expect({ file, hardcoded: hardcodedEnglish(source) }).toEqual({ file, hardcoded: [] });
  });
});

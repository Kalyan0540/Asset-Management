import { z } from 'zod';
import type { Item } from './model.ts';

export const filterFields = ['name', 'tag', 'folder', 'type', 'rating', 'shape', 'color'] as const;
export const filterRuleSchema = z
  .object({
    field: z.enum(filterFields),
    operator: z.enum(['contains', 'is', 'is not']),
    value: z.string().trim().min(1).max(120),
    tolerance: z.number().int().min(0).max(100).optional(),
  })
  .strict();
export const smartFolderSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    match: z.enum(['all', 'any']),
    rules: z.array(filterRuleSchema).min(1).max(20),
    addTag: z.string().trim().max(80).optional(),
    addFolder: z.string().uuid().optional(),
  })
  .strict();
export type FilterRule = z.infer<typeof filterRuleSchema>;
export type SmartFolder = z.infer<typeof smartFolderSchema> & { id: string };
export type VisualInfo = { width?: number; height?: number; colors?: string[] };

export function matchesRule(item: Item, rule: FilterRule, visual?: VisualInfo) {
  const raw = item.source?.metadata;
  const width = visual?.width ?? Number(raw?.width);
  const height = visual?.height ?? Number(raw?.height);
  let values: string[];
  switch (rule.field) {
    case 'name':
      values = [item.title];
      break;
    case 'tag':
      values = item.tags;
      break;
    case 'folder':
      values = item.collections;
      break;
    case 'type':
      values = [
        item.mime,
        item.mime.split('/')[0],
        item.filename.split('.').at(-1) ?? '',
        item.kind === 'note' ? 'markdown' : '',
      ];
      break;
    case 'rating':
      values = [String(item.rating ?? raw?.star ?? raw?.rating ?? 0)];
      break;
    case 'shape':
      values =
        width > 0 && height > 0
          ? [
              Math.abs(width / height - 1) < 0.04
                ? 'square'
                : width > height
                  ? 'landscape'
                  : 'portrait',
            ]
          : [];
      break;
    case 'color': {
      const palette = Array.isArray(raw?.palettes) ? raw.palettes : [];
      values =
        visual?.colors ??
        palette.flatMap((entry) => {
          const rgb = entry?.color;
          return Array.isArray(rgb) &&
            rgb.length >= 3 &&
            rgb.slice(0, 3).every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
            ? [
                '#' +
                  rgb
                    .slice(0, 3)
                    .map((n) => n.toString(16).padStart(2, '0'))
                    .join(''),
              ]
            : [];
        });
      break;
    }
  }
  if (rule.field === 'color' && /^#[a-f0-9]{6}$/i.test(rule.value)) {
    const rgb = (hex: string) =>
      [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    const target = rgb(rule.value);
    const found = values.some(
      (value) =>
        /^#[a-f0-9]{6}$/i.test(value) &&
        Math.hypot(...rgb(value).map((channel, n) => channel - target[n])) <=
          (rule.tolerance ?? 0) * 4.42,
    );
    return rule.operator === 'is not' ? !found : found;
  }
  const needle = rule.value.toLowerCase();
  const found = values.some((value) =>
    rule.operator === 'contains'
      ? value.toLowerCase().includes(needle)
      : value.toLowerCase() === needle,
  );
  return rule.operator === 'is not' ? !found : found;
}
export function matchesSmartFolder(
  item: Item,
  folder: Pick<SmartFolder, 'rules' | 'match'>,
  visual?: VisualInfo,
) {
  const predicate = (rule: FilterRule) => matchesRule(item, rule, visual);
  return folder.match === 'any' ? folder.rules.some(predicate) : folder.rules.every(predicate);
}

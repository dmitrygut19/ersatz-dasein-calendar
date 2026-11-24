import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const tokens = JSON.parse(readFileSync(new URL('../design/tokens.json', import.meta.url), 'utf8'));
const rules = [];
for (const [name, value] of Object.entries(tokens.color.primitive)) rules.push(`--${name}: ${value};`);
for (const [name, value] of Object.entries(tokens.color.semantic)) rules.push(`--${name}: var(--${value.match(/primitive\.([^}]+)/)[1]});`);
for (const [name, value] of Object.entries(tokens.spacing)) rules.push(`--space-${name}: ${value}px;`);
for (const [name, value] of Object.entries(tokens.radius)) rules.push(`--radius-${name}: ${value}px;`);
for (const [name, value] of Object.entries(tokens.size)) rules.push(`--${name}: ${value}px;`);
for (const [name, value] of Object.entries(tokens.font)) rules.push(`--font-${name}: ${typeof value === 'string' ? JSON.stringify(value) : value};`);
for (const [name, value] of Object.entries(tokens.typography)) {
  rules.push(`--${name}-size: ${value.size}px;`, `--${name}-line: ${value.lineHeight === 'auto' ? 'normal' : `${value.lineHeight}px`};`, `--${name}-weight: ${value.weight};`);
}
mkdirSync(new URL('../src/styles/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), `/* Generated from design/tokens.json. Do not edit. */\n:root {\n${rules.map(x => `  ${x}`).join('\n')}\n}\n`);

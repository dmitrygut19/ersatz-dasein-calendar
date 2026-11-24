import { readFileSync, writeFileSync } from 'node:fs';
const tokens=readFileSync('node_modules/lino-ui/src/ds/tokens.css','utf8');
const begin=tokens.indexOf(':root {');
const base=tokens.slice(begin+7,tokens.indexOf('\n}',begin));
const source=readFileSync('node_modules/lino-ui/src/lib/lino.css','utf8');
// Published component CSS, scoped to opt-in admin roots. Buttons and ButtonGroup excluded.
const sections=source.split(/(?=\/\* ---------- )/).filter(part=>!/^\/\* ---------- (button|button group|toolbar|picture|plaque|slider|keys)/.test(part));
writeFileSync('src/styles/admin-lino-kit.css',`/* Generated from installed lino-ui 0.2.0. No Button or ButtonGroup styles. */\n.admin-ui--lino {${base}\n}\n@scope (.admin-ui--lino) {\n${sections.join('')}\n}\n`);
console.log('Generated scoped admin lino styles; legacy buttons excluded.');

import assert from 'node:assert/strict';
import { participationUrl, isCalendarSourceUrl } from '../src/lib/participation-url.ts';
const cases = [
  [['Встреча: https://meet.jit.si/community'], 'https://meet.jit.si/community'],
  [['Подключаемся (https://discord.gg/community).'], 'https://discord.gg/community'],
  [['<a href="https://youtube.com/watch?v=abc&amp;t=30">Эфир</a>'], 'https://youtube.com/watch?v=abc&t=30'],
  [['<a href="https://youtube.com/watch?v=abc&#38;t=30">Эфир</a>'], 'https://youtube.com/watch?v=abc&t=30'],
  [['meet.google.com/abc-defg-hij'], 'https://meet.google.com/abc-defg-hij'],
  [['www.example.org/room'], 'https://www.example.org/room'],
  [['https://calendar.google.com/calendar/event?eid=abc', 'https://meet.jit.si/community'], 'https://meet.jit.si/community'],
  [['https://www.google.com/calendar/event?eid=abc'], ''],
  [['https://example.org/materials', 'Эфир https://youtube.com/live/abc'], 'https://youtube.com/live/abc'],
  [['https://youtube.com.evil.example/materials', 'https://meet.google.com/abc'], 'https://meet.google.com/abc'],
  [['https://custom.example/our-room'], 'https://custom.example/our-room'],
  [['javascript:alert(1)', 'mailto:host@example.org'], ''],
  [['https://name:password@example.org/room'], ''],
  [['https://example.org/room_(open)'], 'https://example.org/room_(open)'],
  [['(https://example.org/room_(open))'], 'https://example.org/room_(open)'],
  [['Связь с host@meet.google.com/room'], ''],
  [['https://zoom.us/j/123456?pwd=token'], 'https://zoom.us/j/123456?pwd=token'],
  [['нет ссылки'], ''],
];
for (const [fields, expected] of cases) assert.equal(participationUrl(...fields), expected, JSON.stringify(fields));
assert.equal(isCalendarSourceUrl('https://calendar.google.com.evil.example/'), false);
console.log(`PASS ${cases.length} participation URL cases`);

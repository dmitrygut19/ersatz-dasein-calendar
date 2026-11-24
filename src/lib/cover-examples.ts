import { lodgeCoverExamples } from './lodge-icons';
/** Available library artwork. Assignment and inheritance live in event type data. */
export const coverExamples = [
  { path: '/assets/event-covers/saturnalia-spears.png', name: 'Сатурналии — два копья', mode: 'poster' },
  { path: '/assets/event-covers/congress-temple.png', name: 'Храм с лавровым венком', mode: 'illustration' },
  { path: '/assets/event-covers/community-table.png', name: 'Круглый стол с креслами', mode: 'illustration' },
  { path: '/assets/event-covers/project-scrolls.png', name: 'Свитки с циркулем', mode: 'illustration' },
  { path: '/assets/cover-examples/congress-illustration.png', name: 'Объёмный храм', mode: 'illustration' },
  { path: '/assets/cover-examples/antique-poster-v2.jpg', name: 'Античная афиша', mode: 'poster' },
  ...lodgeCoverExamples,
] as const;

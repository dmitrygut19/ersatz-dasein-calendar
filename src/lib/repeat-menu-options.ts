export function repeatMenuOptions(dateValue: string) {
  const date = new Date(`${dateValue || '2026-10-29'}T12:00:00`);
  const day = date.getDate(), weekday = date.getDay();
  const weekly = ['воскресеньям','понедельникам','вторникам','средам','четвергам','пятницам','субботам'][weekday];
  const weekdayName = ['воскресенье','понедельник','вторник','среду','четверг','пятницу','субботу'][weekday];
  const month = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(date);
  const last = day + 7 > new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const ordinal = ['первый','второй','третий','четвёртый','пятый'][Math.ceil(day / 7) - 1];
  const modifier = ['воскресенье','понедельник','вторник','среду','четверг','пятницу','субботу'][weekday];
  const monthly = last ? `Каждый месяц в ${[3,5,6].includes(weekday) ? 'последнюю' : 'последний'} ${weekdayName}` : `Каждый месяц в ${ordinal} ${modifier}`;
  return ['Не повторять','Каждый день',`Каждую неделю по ${weekly}`,monthly,`Каждый месяц ${day}-го`,`Каждый год ${day} ${month}`,'Настроить…'];
}

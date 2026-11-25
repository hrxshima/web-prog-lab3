export const MAX_NAME_LENGTH = 24;

export function rankRecords(records) {
  return records.slice()
    .sort((first, second) => second.score - first.score || first.date.localeCompare(second.date))
    .slice(0, 10);
}

export function recordScore(data, name, date = new Date().toISOString()) {
  name = name.trim();
  const { game, records } = data;
  if (!game.over || game.saved || !name || name.length > MAX_NAME_LENGTH) return data;

  const updatedRecords = records.some(record => record.id === game.id)
    ? records
    : rankRecords([...records, { id: game.id, name, score: game.score, date }]);

  return { ...data, game: { ...game, saved: true }, records: updatedRecords };
}

export function renderLeaderboard(table, empty, records) {
  const body = table.tBodies[0];
  const rows = records.map((record, index) => {
    const row = document.createElement('tr');
    const date = document.createElement('time');
    date.dateTime = record.date;
    date.textContent = record.date.slice(0, 10);

    [index + 1, record.name, record.score, date].forEach((value, column) => {
      const cell = document.createElement(column === 1 ? 'th' : 'td');
      if (column === 1) cell.scope = 'row';
      cell.append(value);
      row.append(cell);
    });

    return row;
  });

  body.replaceChildren(...rows);
  table.hidden = records.length === 0;
  empty.hidden = !table.hidden;
}

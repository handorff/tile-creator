import type { HistoryState } from '../../types/model';

export interface HistoryTimelineItem {
  pastLength: number;
  label: string;
  isCurrent: boolean;
  isFuture: boolean;
}

export function buildHistoryTimeline(history: HistoryState): HistoryTimelineItem[] {
  const currentPastLength = history.past.length;
  const pastItems = history.past.map((entry, index) => {
    const pastLength = index + 1;
    return {
      pastLength,
      label: entry.description,
      isCurrent: pastLength === currentPastLength,
      isFuture: false
    };
  });

  const futureItems = [...history.future].reverse().map((entry, index) => {
    const pastLength = currentPastLength + index + 1;
    return {
      pastLength,
      label: entry.description,
      isCurrent: false,
      isFuture: true
    };
  });

  return [
    {
      pastLength: 0,
      label: 'Start',
      isCurrent: currentPastLength === 0,
      isFuture: false
    },
    ...pastItems,
    ...futureItems
  ];
}

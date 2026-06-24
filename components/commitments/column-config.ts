/**
 * Shared column definitions for the commitments table.
 * Lives in a separate file to avoid a circular-import cycle between
 * commitments-client.tsx (which imports CommitmentRow) and
 * commitment-row.tsx (which needs these types/constants).
 */

export type ColumnId = 'direction' | 'counterparty' | 'created' | 'due' | 'priority';
export type SortableColId = ColumnId | 'description';

/**
 * Tailwind width classes for each draggable column.
 * Values must be string literals so Tailwind's JIT detects them at scan time.
 */
export const COL_WIDTH: Record<ColumnId, string> = {
  direction:    'w-28',   // 112 px — "Assigned to me" chip fits comfortably
  counterparty: 'w-48',  // 192 px — name + email stacked
  created:      'w-20',  //  80 px
  due:          'w-20',  //  80 px
  priority:     'w-20',  //  80 px — "PRIORITY" header + sort icon fits without clipping
};

export const COL_LABEL: Record<ColumnId, string> = {
  direction:    'Type',
  counterparty: 'To / From',
  created:      'Detected',
  due:          'Due',
  priority:     'Priority',
};

export const DEFAULT_COLUMN_ORDER: ColumnId[] = [
  'direction', 'counterparty', 'created', 'due', 'priority',
];

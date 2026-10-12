import type { ExpenseCategory, MaintenanceKind } from './types';

export const MAINTENANCE_KINDS: { value: MaintenanceKind; label: string }[] = [
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'adjustment', label: 'Ajuste' },
  { value: 'repair', label: 'Reparación' },
];

/** Categories the user can pick. Filament purchases and maintenance create their own expense. */
export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'parts', label: 'Refacciones' },
  { value: 'electricity', label: 'Luz' },
  { value: 'shipping', label: 'Envíos' },
  { value: 'packaging', label: 'Empaque' },
  { value: 'other', label: 'Otros' },
];

export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  filament: 'Filamento',
  parts: 'Refacciones',
  electricity: 'Luz',
  shipping: 'Envíos',
  packaging: 'Empaque',
  maintenance: 'Mantenimiento',
  other: 'Otros',
};

export const maintenanceLabel = (kind: MaintenanceKind) =>
  MAINTENANCE_KINDS.find((item) => item.value === kind)?.label ?? kind;

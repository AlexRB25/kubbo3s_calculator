import type { ExpenseCategory, MaintenanceKind, PackagingKind } from './types';

export const PACKAGING_KINDS: { value: PackagingKind; label: string }[] = [
  { value: 'box', label: 'Caja' },
  { value: 'envelope', label: 'Sobre' },
  { value: 'bag', label: 'Bolsa / plástico' },
  { value: 'other', label: 'Otro' },
];

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
  material: 'Materia prima',
  parts: 'Refacciones',
  electricity: 'Luz',
  shipping: 'Envíos',
  packaging: 'Empaque',
  maintenance: 'Mantenimiento',
  other: 'Otros',
};

export const maintenanceLabel = (kind: MaintenanceKind) =>
  MAINTENANCE_KINDS.find((item) => item.value === kind)?.label ?? kind;

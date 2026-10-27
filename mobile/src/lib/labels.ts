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

/**
 * Filament brands sold in Mexico, to pick from when adding a filament (any other can be typed).
 * Mexican brands first, then the rest alphabetically.
 */
export const FILAMENT_BRANDS = [
  'FilaMex',
  'México Maker',
  'Amolen',
  'Anycubic',
  'Bambu Lab',
  'ColorFabb',
  'Creality',
  'Duramic',
  'Elegoo',
  'Eryone',
  'eSun',
  'Fiberlogy',
  'Flashforge',
  'Geeetech',
  'Hatchbox',
  'iSANMATE',
  'JAMG HE',
  'Jayo',
  'Kexcelled',
  'Kingroon',
  'Overture',
  'Paramount 3D',
  'Polymaker',
  'Prusament',
  'Qidi',
  'Siraya Tech',
  'Snapmaker',
  'Sunlu',
  'Tinmorry',
  'Voxelab',
  'Ziro',
];

/** The list plus the brands the user already typed, without repeats (ignoring case). */
export function brandOptions(used: (string | null | undefined)[]) {
  const all = [...FILAMENT_BRANDS];
  for (const brand of used) {
    const name = (brand ?? '').trim();
    if (name && !all.some((item) => item.toLowerCase() === name.toLowerCase())) all.push(name);
  }
  return all;
}

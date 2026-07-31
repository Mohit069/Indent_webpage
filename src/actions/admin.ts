'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { departments, itemCategories, items, uoms } from '@/db/schema';
import {
  departmentSchema,
  formValues,
  itemSchema,
  uomSchema,
} from '@/lib/validation';

/*
 * Master data — departments, units, items, categories.
 *
 * Reached only from /admin, which the layout gates on holding at least one
 * admin permission. Accounts are not managed here; see actions/users.ts.
 */

export type AdminActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
};

function fieldErrorsFrom(issues: { path: (string | number)[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] = i.message;
  return out;
}

/*
 * The four person actions that used to live here — createPerson,
 * setPersonActive, setPersonRole, setPersonEmail — are gone. Accounts are
 * managed in actions/users.ts, which does the same jobs behind an
 * `authorize('user:manage')` check and writes to the activity log.
 *
 * These had no caller left anywhere in src/, and leaving them would have left
 * four unauthenticated endpoints able to edit accounts. A server action is an
 * HTTP endpoint whether or not anything renders a form for it.
 */

export async function createDepartment(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = departmentSchema.safeParse(formValues(formData, ['name', 'code']));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  try {
    await db.insert(departments).values(parsed.data);
  } catch {
    return { error: 'A department with that name or code already exists.' };
  }

  revalidatePath('/admin/departments');
  return { success: `${parsed.data.name} added.` };
}

export async function createUom(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = uomSchema.safeParse(formValues(formData, ['code', 'name']));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  try {
    await db.insert(uoms).values(parsed.data);
  } catch {
    return { error: 'That unit code already exists.' };
  }

  revalidatePath('/admin/uoms');
  return { success: `${parsed.data.code} added.` };
}

export async function createItem(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  // specification and categoryId are optional; see formValue's note.
  const parsed = itemSchema.safeParse(
    formValues(formData, ['code', 'name', 'specification', 'categoryId', 'defaultUomId']),
  );
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  try {
    await db.insert(items).values({
      code: parsed.data.code,
      name: parsed.data.name,
      specification: parsed.data.specification ?? null,
      categoryId: parsed.data.categoryId ?? null,
      defaultUomId: parsed.data.defaultUomId,
    });
  } catch {
    return { error: 'That item code already exists.' };
  }

  revalidatePath('/admin/items');
  revalidatePath('/triage');
  return { success: `${parsed.data.name} added to the item master.` };
}

export async function createItemCategory(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return { fieldErrors: { name: 'Enter a category name' } };

  try {
    await db.insert(itemCategories).values({ name });
  } catch {
    return { error: 'That category already exists.' };
  }

  revalidatePath('/admin/items');
  return { success: `${name} added.` };
}

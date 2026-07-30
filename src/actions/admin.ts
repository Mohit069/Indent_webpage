'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/db';
import { departments, itemCategories, items, people, uoms } from '@/db/schema';
import {
  departmentSchema,
  itemSchema,
  personSchema,
  uomSchema,
} from '@/lib/validation';

/*
 * Master data.
 *
 * No permission checks — there are no roles. Anyone who reaches these screens
 * can edit the masters, which is the intended trade for an internal tool shared
 * by a handful of people.
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

export async function createPerson(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = personSchema.safeParse({
    name: formData.get('name'),
    designation: formData.get('designation'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    // An unticked checkbox is absent from FormData, not false.
    canApprove: formData.get('canApprove') !== null,
    canReject: formData.get('canReject') !== null,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error.issues) };

  try {
    await db.insert(people).values({
      name: parsed.data.name,
      designation: parsed.data.designation,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      canApprove: parsed.data.canApprove,
      canReject: parsed.data.canReject,
    });
  } catch {
    return { error: 'Someone is already recorded with that email address.' };
  }

  revalidatePath('/', 'layout');
  revalidatePath('/admin/people');
  return { success: `${parsed.data.name} is now in the "acting as" list.` };
}

/** People are deactivated, never deleted — their name is on the history of
 *  every indent they touched, and that record has to keep resolving. */
export async function setPersonActive(personId: string, isActive: boolean): Promise<void> {
  await db.update(people).set({ isActive }).where(eq(people.id, personId));
  revalidatePath('/', 'layout');
  revalidatePath('/admin/people');
}

/** Grant or withdraw the right to approve or to reject. */
export async function setPersonRole(
  personId: string,
  role: 'canApprove' | 'canReject',
  granted: boolean,
): Promise<void> {
  await db
    .update(people)
    .set(role === 'canApprove' ? { canApprove: granted } : { canReject: granted })
    .where(eq(people.id, personId));

  revalidatePath('/', 'layout');
  revalidatePath('/admin/people');
  // The buttons on the indent screens depend on this.
  revalidatePath('/indents');
}

/** Change someone's recorded email address, or clear it. */
export async function setPersonEmail(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const personId = String(formData.get('personId') ?? '');
  const parsed = personSchema.shape.email.safeParse(formData.get('email'));

  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]?.message ?? 'Invalid' } };
  }

  try {
    await db
      .update(people)
      .set({ email: parsed.data ?? null })
      .where(eq(people.id, personId));
  } catch {
    return { error: 'Someone is already recorded with that email address.' };
  }

  revalidatePath('/admin/people');
  return { success: 'Email updated.' };
}

export async function createDepartment(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const parsed = departmentSchema.safeParse({
    name: formData.get('name'),
    code: formData.get('code'),
  });
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
  const parsed = uomSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
  });
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
  const parsed = itemSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    specification: formData.get('specification'),
    categoryId: formData.get('categoryId'),
    defaultUomId: formData.get('defaultUomId'),
  });
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

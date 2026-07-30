import { cookies } from 'next/headers';
import { getActor, listPeople } from '@/lib/actor';
import { AppShell } from '@/components/app-shell';
import { DeviceSetup } from '@/components/device-setup';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [people, actor, jar] = await Promise.all([listPeople(), getActor(), cookies()]);

  /*
   * Ask once per computer, then never again.
   *
   * Skipped entirely when nobody has been added yet, otherwise a fresh install
   * would trap you: you could not reach Settings to add the people the chooser
   * is asking you to choose from.
   */
  if (!actor && people.length > 0) {
    return <DeviceSetup people={people} />;
  }

  // Read here rather than in the client, so the sidebar paints at its remembered
  // width instead of rendering wide and snapping narrow after hydration.
  const collapsed = jar.get('sidebar_collapsed')?.value === '1';

  return (
    <AppShell people={people} actor={actor} defaultCollapsed={collapsed}>
      {children}
    </AppShell>
  );
}

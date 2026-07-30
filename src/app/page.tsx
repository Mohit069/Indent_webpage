import { redirect } from 'next/navigation';

/** There is nothing to sign into — go straight to the indents. */
export default function RootPage() {
  redirect('/indents');
}

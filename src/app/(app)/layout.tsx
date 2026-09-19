import { AppFrame } from "@/app/ui/sidebar";
import { getAuthorizedSession } from "@/lib/auth-access";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getAuthorizedSession(await headers());
  if (!session) redirect("/sign-in");
  return <AppFrame user={{ name: session.user.name, email: session.user.email }}>{children}</AppFrame>;
}

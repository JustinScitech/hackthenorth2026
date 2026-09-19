import { AppFrame } from "@/app/ui/sidebar";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppFrame>{children}</AppFrame>;
}

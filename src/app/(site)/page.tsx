import type { Metadata } from "next";
import { AstraHome } from "./home/astra-home";

export const metadata: Metadata = {
  title: { absolute: "Astra Risk · See the whole risk" },
  description:
    "Astra reads submissions, investigates real-world risk, evaluates carrier appetite, and explains every decision. Explore an interactive underwriting digital twin.",
};
export default function HomePage() {
  return <AstraHome />;
}

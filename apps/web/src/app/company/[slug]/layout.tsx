import { LobProvider } from "@/features/lob/providers/LobProvider";

export default function CompanyLayout(props: { children: React.ReactNode }) {
  return <LobProvider>{props.children}</LobProvider>;
}
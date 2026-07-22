import { redirect } from "next/navigation";

export default function CurrentDriverRedirectPage() {
  redirect("/teams/current");
}

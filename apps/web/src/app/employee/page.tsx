import Link from "next/link";
import FoyerHeader from "@/features/foyer/components/FoyerHeader";

export default function EmployeePage() {
  return (
    <main className="foyer-page foyer-page--light">
      <FoyerHeader />

      <section className="foyer-detail">
        <p className="foyer-kicker">Employee entry</p>
        <h1>I already work here.</h1>
        <p>
          If your company already uses Insight, sign in to access your schedule,
          communication, payroll information, and daily work tools.
        </p>

        <div className="cta-row">
          <Link className="button button-primary" href="/sign-in">
            Sign In
          </Link>
        </div>
      </section>
    </main>
  );
}

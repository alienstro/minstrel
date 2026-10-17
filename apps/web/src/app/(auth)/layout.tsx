// Each auth form draws its own canvas stage, because the heading changes with each step of the form.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}

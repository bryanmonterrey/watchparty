import type { Metadata } from "next";
import { LoginCard } from "@/components/auth/login-card";

export const metadata: Metadata = {
  title: "Login",
};

export default function LoginPage() {
  return <LoginCard />;
}

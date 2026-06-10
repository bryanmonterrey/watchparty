import { type Metadata } from "next";
import { EncryptionProvider } from "@/components/encryption/encryption-provider";

export const metadata: Metadata = {
  title: "Messages",
};

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <EncryptionProvider>{children}</EncryptionProvider>;
}

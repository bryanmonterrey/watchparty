import { type Metadata } from "next";
import { EncryptionProvider } from "@/components/encryption/encryption-provider";
import { EncryptionGate } from "@/components/encryption/encryption-gate";

export const metadata: Metadata = {
  title: "messages",
};

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <EncryptionProvider>
      <EncryptionGate>{children}</EncryptionGate>
    </EncryptionProvider>
  );
}

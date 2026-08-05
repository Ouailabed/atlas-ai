import "./globals.css";

export const metadata = {
  title: "Aria - Your AI Life Assistant",
  description: "An autonomous AI life operating system",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAM2 Image Segmentation — Runs in Your Browser",
  description:
    "Segment any object in your photos instantly, entirely in the browser. Powered by Meta's SAM2 model via ONNX Runtime Web — no server, no upload, full privacy.",
  keywords: [
    "SAM2",
    "Segment Anything Model",
    "image segmentation",
    "browser AI",
    "ONNX Runtime",
    "object segmentation",
    "client-side AI",
    "Meta SAM",
  ],
  openGraph: {
    title: "SAM2 Image Segmentation — Runs in Your Browser",
    description:
      "Segment any object in your photos instantly, entirely in the browser. Powered by Meta's SAM2 model via ONNX Runtime Web — no server, no upload, full privacy.",
    type: "website",
    url: "https://next-sam.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "SAM2 Image Segmentation — Runs in Your Browser",
    description:
      "Segment any object in your photos instantly, entirely in the browser. Powered by Meta's SAM2 model via ONNX Runtime Web.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

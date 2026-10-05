import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "Azumi Pedidos", short_name: "Azumi", start_url: "/", display: "standalone", background_color: "#ffffff", theme_color: "#098c83", icons: [{ src: "/icon", sizes: "192x192", type: "image/png" }, { src: "/icon-large", sizes: "512x512", type: "image/png" }] };
}

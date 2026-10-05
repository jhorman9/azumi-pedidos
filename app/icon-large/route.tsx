import { ImageResponse } from "next/og";

export function GET() { return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#098c83", color: "white", fontSize: 340, fontWeight: 700 }}>A</div>, { width: 512, height: 512 }); }

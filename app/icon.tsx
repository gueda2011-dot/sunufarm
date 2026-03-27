import { ImageResponse } from "next/og"

export const size = {
  width: 512,
  height: 512,
}

export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #14532d 0%, #22c55e 70%, #dcfce7 100%)",
          color: "white",
          fontSize: 220,
          fontWeight: 800,
          letterSpacing: -12,
        }}
      >
        SF
      </div>
    ),
    size,
  )
}

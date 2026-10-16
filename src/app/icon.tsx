import { ImageResponse } from "next/og";

export const size = {
  width: 48,
  height: 48,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#09090b",
        borderRadius: "10px",
        border: "2px solid #27272a",
      }}
    >
      <div
        style={{
          fontFamily: "serif",
          fontSize: 26,
          fontWeight: 800,
          color: "#fafafa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          marginTop: -2,
        }}
      >
        JR
      </div>
    </div>,
    {
      ...size,
    },
  );
}

import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#09090b",
        borderRadius: "38px",
        border: "4px solid #27272a",
      }}
    >
      <div
        style={{
          fontFamily: "serif",
          fontSize: 96,
          fontWeight: 800,
          color: "#fafafa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
          marginTop: -6,
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

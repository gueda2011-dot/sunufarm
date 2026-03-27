import { ImageResponse } from "next/og"

export const size = {
  width: 180,
  height: 180,
}

export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #14532d 0%, #16a34a 100%)",
        }}
      >
        <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
          <rect x="10" y="10" width="160" height="160" rx="46" fill="#F6FFF8" />
          <path
            d="M116 62C106 53 89 52 78 61C69 67 65 78 66 89C67 101 73 112 83 119C93 126 106 125 117 118C125 113 132 104 134 94C137 82 132 68 122 60L116 62Z"
            fill="#16A34A"
          />
          <path
            d="M105 58C109 49 119 42 130 41C127 51 118 59 105 58Z"
            fill="#BBF7D0"
          />
          <path
            d="M82 65C89 61 97 60 105 63C113 67 118 74 120 83C122 91 120 101 114 108C108 114 100 118 91 118C81 118 71 113 66 105C60 96 60 85 65 76C68 72 74 68 82 65Z"
            fill="#14532D"
          />
          <path
            d="M83 73C89 68 99 67 106 72C113 76 117 85 115 93C113 101 106 108 98 111C89 113 80 111 73 105C67 99 64 90 66 82C68 78 71 75 75 73L77 79C74 81 73 84 73 88C73 98 81 106 91 106C102 106 110 98 110 88C110 78 102 70 91 70C88 70 85 71 83 73Z"
            fill="#F6FFF8"
          />
          <circle cx="98" cy="82" r="3" fill="#14532D" />
          <path
            d="M114 84L125 88L114 93C111 94 108 91 108 88C108 85 111 83 114 84Z"
            fill="#F59E0B"
          />
        </svg>
      </div>
    ),
    size,
  )
}

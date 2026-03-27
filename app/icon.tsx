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
          background: "linear-gradient(160deg, #0f3b26 0%, #177245 52%, #2fb36d 100%)",
        }}
      >
        <svg width="512" height="512" viewBox="0 0 512 512" fill="none">
          <rect x="42" y="42" width="428" height="428" rx="132" fill="url(#panel)" />
          <circle cx="256" cy="256" r="144" fill="#F6FFF8" />
          <path
            d="M330 188C300 161 248 159 215 184C189 203 176 237 179 270C182 304 200 335 230 352C261 370 300 368 331 348C356 332 374 307 381 278C390 241 375 204 348 182L330 188Z"
            fill="#16A34A"
          />
          <path
            d="M297 177C309 149 337 128 371 124C362 157 334 182 297 177Z"
            fill="#B9F3C9"
          />
          <path
            d="M230 196C249 184 274 182 295 191C317 201 332 221 338 245C343 269 338 297 321 316C306 333 285 343 262 344C233 345 205 329 191 304C176 280 176 247 190 223C199 211 213 202 230 196Z"
            fill="#0F3B26"
          />
          <path
            d="M230 219C250 205 280 204 301 217C322 231 332 259 325 284C319 308 300 327 276 334C251 342 223 336 204 318C185 300 177 272 184 248C190 236 198 226 210 219L215 237C208 244 204 254 204 265C204 294 227 318 256 318C285 318 308 294 308 265C308 236 285 212 256 212C247 212 238 214 230 219Z"
            fill="#F6FFF8"
          />
          <circle cx="275" cy="248" r="8" fill="#0F3B26" />
          <path
            d="M320 252L349 264L321 278C313 281 304 275 304 265C304 256 313 249 320 252Z"
            fill="#F59E0B"
          />
          <path
            d="M222 181C225 162 241 148 260 148C253 167 239 179 222 181Z"
            fill="#86EFAC"
          />
          <defs>
            <linearGradient id="panel" x1="72" y1="82" x2="426" y2="444" gradientUnits="userSpaceOnUse">
              <stop stopColor="#14532D" />
              <stop offset="1" stopColor="#22C55E" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    ),
    size,
  )
}

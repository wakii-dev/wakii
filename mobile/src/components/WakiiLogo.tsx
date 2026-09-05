import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg'

type Props = {
  size?: number
}

// "The Monogram" (wakii-site public/wakii-icon.svg) — dark tile gradient,
// mint stroke, dot. Multi-color mark, so no color prop.
export function WakiiLogo({ size = 24 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 128 128">
      <Defs>
        <LinearGradient id="wakiiTile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#131A17" />
          <Stop offset="1" stopColor="#04140D" />
        </LinearGradient>
      </Defs>
      <Rect width={128} height={128} rx={28} fill="url(#wakiiTile)" />
      <Path
        d="M26 42 L44 88 L64 48 L84 88 L102 42"
        fill="none"
        stroke="#45E0A8"
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={106} cy={86} r={8.5} fill="#D7E2DD" />
    </Svg>
  )
}

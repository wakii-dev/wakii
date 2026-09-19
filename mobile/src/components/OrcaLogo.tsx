import Svg, { Defs, G, LinearGradient, Stop, Path, Circle } from 'react-native-svg'
import type { StyleProp, ViewStyle } from 'react-native'

// "The Monogram" (wakii-site public/wakii-icon.svg) — dark tile gradient,
// mint stroke, dot. Multi-color mark, so no color prop. (Trước đây là whale
// orca — rebrand 2.16.2; component name giữ để không đụng 2 usage sites.)
export function OrcaLogo({ size = 24, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 128 128" style={style}>
      <Defs>
        <LinearGradient id="wakiiTileWakii" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#131A17" />
          <Stop offset="1" stopColor="#04140D" />
        </LinearGradient>
      </Defs>
      <Path fill="url(#wakiiTileWakii)" d="M0 0h128v128H0z" rx={28} />
      <G transform="translate(-3 -1)">
      <Path d="M26 42 L44 88 L64 48 L84 88 L102 42" fill="none" stroke="#45E0A8" strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={106} cy={86} r={8.5} fill="#D7E2DD" />
      </G>
    </Svg>
  )
}

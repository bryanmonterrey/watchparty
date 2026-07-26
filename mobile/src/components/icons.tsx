// Native ports of the web app's login icons (components/icons.tsx and
// components/auth/provider-icons.tsx). Path data copied verbatim — the
// provider marks keep their original Figma canvas coordinates with the
// viewBox positioned over each icon, same trick as on web.
import Svg, { Circle, Path, Rect, type SvgProps } from 'react-native-svg';

type IconProps = SvgProps & { size?: number };

// The brand mark. Mirrors web's PinkStarLogo (components/icons.tsx) — same
// path, same peach fill — so both apps show one logo. Replaced the older
// Star2Icon star, which is the shape the web app moved off.
export function PinkStarLogo({ size = 28, ...props }: IconProps) {
  return (
    <Svg width={size} height={(size * 564) / 554} viewBox="0 0 554 564" fill="none" {...props}>
      <Path
        d="M324.642 11.001C355.155 -13.7306 400.907 5.69008 404.312 44.8189L414.088 157.151C415.397 172.193 423.568 185.792 436.235 194.01L530.828 255.378C563.779 276.754 559.447 326.268 523.285 341.598L419.472 385.608C405.57 391.501 395.162 403.475 391.261 418.061L362.127 526.989C351.979 564.932 303.55 576.113 277.796 546.459L203.86 461.326C193.959 449.926 179.356 443.727 164.277 444.524L51.6782 450.477C12.4563 452.551 -13.1427 409.947 7.10175 376.29L65.2201 279.665C73.0027 266.726 74.3854 250.922 68.9679 236.828L28.5111 131.579C14.4187 94.9178 47.0271 57.4062 85.2931 66.2592L195.148 91.6744C209.859 95.0778 225.317 91.509 237.047 82.0013L324.642 11.001Z"
        fill="#FCE0CB"
      />
    </Svg>
  );
}

export function MessagesIcon({ size = 26, ...props }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,0.85)"
      strokeWidth={2}
      strokeLinejoin="round"
      {...props}>
      <Path d="M2 6L8.91302 9.91697C11.4616 11.361 12.5384 11.361 15.087 9.91697L22 6" />
      <Path d="M2.01577 13.4756C2.08114 16.5412 2.11383 18.0739 3.24496 19.2094C4.37608 20.3448 5.95033 20.3843 9.09883 20.4634C11.0393 20.5122 12.9607 20.5122 14.9012 20.4634C18.0497 20.3843 19.6239 20.3448 20.7551 19.2094C21.8862 18.0739 21.9189 16.5412 21.9842 13.4756C22.0053 12.4899 22.0053 11.5101 21.9842 10.5244C21.9189 7.45886 21.8862 5.92609 20.7551 4.79066C19.6239 3.65523 18.0497 3.61568 14.9012 3.53657C12.9607 3.48781 11.0393 3.48781 9.09882 3.53656C5.95033 3.61566 4.37533 3.65521 3.24495 4.79065C2.11382 5.92608 2.08114 7.45885 2.01576 10.5244C1.99474 11.5101 1.99475 12.4899 2.01577 13.4756Z" />
    </Svg>
  );
}

export function CheckGlyph({ size = 18, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Circle cx={12} cy={12} r={10} fill="#000" fillOpacity={0.15} />
      <Path
        d="M8 12.5l2.5 2.5L16 9"
        stroke="#000"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function BackArrowIcon({ size = 24, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <Path
        d="M19 12H5M5 12L11 6M5 12L11 18"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Simplified ghost mark on Phantom purple — swap for the brand asset later.
export function PhantomIcon({ size = 40, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" {...props}>
      <Rect width={40} height={40} rx={12} fill="#AB9FF2" />
      <Path
        d="M20 8c-7 0-12 5.5-12 12.5V30c0 .8.9 1.3 1.6.8l2.2-1.7 2.5 2 2.6-2 2.6 2 2.6-2 2.5 2 2.2 1.7c.7.5 1.6 0 1.6-.8v-9.5C32 13.5 27 8 20 8Z"
        fill="#fff"
      />
      <Circle cx={15.5} cy={19} r={2} fill="#AB9FF2" />
      <Circle cx={24.5} cy={19} r={2} fill="#AB9FF2" />
    </Svg>
  );
}

export function GoogleIcon({ size = 26, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="522 287 28 28" fill="none" {...props}>
      <Path d="M549.987 301.262C549.987 300.115 549.892 299.278 549.686 298.41H536.279V303.587H544.148C543.99 304.874 543.133 306.812 541.229 308.114L541.203 308.287L545.441 311.496L545.735 311.524C548.432 309.09 549.987 305.509 549.987 301.262Z" fill="#4285F4" />
      <Path d="M536.279 314.904C540.135 314.904 543.371 313.664 545.735 311.524L541.229 308.114C540.024 308.935 538.405 309.509 536.279 309.509C532.503 309.509 529.299 307.075 528.156 303.711L527.989 303.725L523.581 307.058L523.523 307.215C525.872 311.772 530.695 314.904 536.279 314.904Z" fill="#34A853" />
      <Path d="M528.156 303.711C527.854 302.843 527.68 301.913 527.68 300.952C527.68 299.991 527.854 299.061 528.14 298.192L528.132 298.008L523.669 294.621L523.523 294.689C522.555 296.58 522 298.704 522 300.952C522 303.2 522.555 305.323 523.523 307.215L528.156 303.711Z" fill="#FBBC05" />
      <Path d="M536.279 292.395C538.961 292.395 540.769 293.526 541.8 294.472L545.83 290.627C543.355 288.38 540.135 287 536.279 287C530.695 287 525.872 290.131 523.523 294.689L528.14 298.193C529.299 294.829 532.503 292.395 536.279 292.395Z" fill="#EB4335" />
    </Svg>
  );
}

export function XIcon({ size = 24, ...props }: IconProps) {
  return (
    <Svg width={size} height={(size * 28) / 27} viewBox="615 287 27 28" fill="none" {...props}>
      <Path d="M631.036 298.856L641.068 287H638.69L629.98 297.294L623.024 287H615L625.52 302.567L615 315H617.377L626.575 304.129L633.922 315H641.946L631.036 298.856H631.036ZM627.78 302.704L626.715 301.154L618.234 288.82H621.885L628.729 298.774L629.795 300.324L638.692 313.263H635.04L627.78 302.705V302.704Z" fill="white" />
    </Svg>
  );
}

export function TwitchIcon({ size = 26, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="707 287 28 28" fill="none" {...props}>
      <Path d="M708.909 287L707 291.864V311.318H713.998V314.968H717.819L721.636 311.318H727.363L735 304.025V287H708.909ZM711.453 289.43H732.455V302.807L727.999 307.063H721L717.184 310.708V307.063H711.453V289.43ZM718.454 301.592H721V294.297H718.454V301.592ZM725.454 301.592H727.999V294.297H725.454V301.592Z" fill="#5A3E85" />
    </Svg>
  );
}

export function KickIcon({ size = 23, ...props }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="799 287 26 26" fill="none" {...props}>
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M800.879 287.002H809.23V292.772H812.008V289.886H814.787V287.002H823.138V295.674H820.359V298.559H817.581V301.444H820.359V304.329H823.138V313.002H814.787V310.116H812.008V307.232H809.23V313.002H800.879V287.002Z"
        fill="#53FC18"
      />
    </Svg>
  );
}

export function DiscordIcon({ size = 33, ...props }: IconProps) {
  return (
    <Svg width={size} height={(size * 29) / 37} viewBox="886 287 37 29" fill="none" {...props}>
      <Path d="M917.343 289.419C914.947 288.289 912.387 287.468 909.709 287C909.38 287.599 908.996 288.406 908.731 289.047C905.885 288.615 903.065 288.615 900.271 289.047C900.007 288.406 899.614 287.599 899.282 287C896.602 287.468 894.038 288.292 891.643 289.425C886.812 296.785 885.502 303.963 886.157 311.039C889.361 313.451 892.466 314.917 895.519 315.876C896.273 314.83 896.945 313.718 897.524 312.546C896.421 312.124 895.365 311.602 894.367 310.997C894.632 310.799 894.891 310.592 895.141 310.379C901.229 313.251 907.844 313.251 913.859 310.379C914.112 310.592 914.371 310.799 914.633 310.997C913.632 311.605 912.573 312.127 911.47 312.549C912.049 313.718 912.718 314.833 913.475 315.879C916.531 314.92 919.639 313.454 922.843 311.039C923.611 302.836 921.53 295.724 917.343 289.419ZM898.354 306.687C896.526 306.687 895.027 304.967 895.027 302.872C895.027 300.777 896.494 299.054 898.354 299.054C900.213 299.054 901.712 300.774 901.68 302.872C901.683 304.967 900.213 306.687 898.354 306.687ZM910.646 306.687C908.819 306.687 907.32 304.967 907.32 302.872C907.32 300.777 908.787 299.054 910.646 299.054C912.506 299.054 914.005 300.774 913.973 302.872C913.973 304.967 912.506 306.687 910.646 306.687Z" fill="#5865F2" />
    </Svg>
  );
}

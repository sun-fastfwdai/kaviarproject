import {
  ArrowLeft, ArrowRight, ArrowSquareOut, ArrowsClockwise, Brain, CalendarBlank, CaretDown, CaretLeft, CaretRight, CaretUpDown,
  ChartBar, Check, CheckCircle, Circle, Clock, Copy, Database, DownloadSimple, Eye, Folder, Gear, House, Image, Info, Key,
  Lightning, LinkBreak, Lock, MagnifyingGlass, Megaphone, Package, Plug, Plus, Prohibit, Pulse, Receipt, Repeat, Rows,
  SealCheck, ShoppingBag, SignOut, Sparkle, Stack, Storefront, Tag, Target, TrendDown, TrendUp, User, Users, UsersThree,
  Warning, WarningCircle, WebhooksLogo, X, Globe, UploadSimple, FilePdf, VideoCamera, PencilSimple, Paperclip, LinkSimple, ArrowUp,
  ShieldCheck, Palette, CloudArrowUp, Phone, Swatches, FileText, ArrowElbowDownLeft, SpinnerGap,
  Cursor, Hand, ChatCircle, ArrowCounterClockwise, ArrowClockwise, Monitor, DeviceTablet, DeviceMobile, Columns, Play, Pause, Minus,
  MusicNotes, PenNib, SquaresFour, DotsThree, Star, ArrowUpRight, PaintBrush,
} from "@phosphor-icons/react/ssr";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

const ICONS = {
  globe: Globe, upload: UploadSimple, pdf: FilePdf, video: VideoCamera, pencil: PencilSimple, clip: Paperclip, link: LinkSimple, "arrow-up": ArrowUp,
  shield: ShieldCheck, palette: Palette, cloud: CloudArrowUp, phone: Phone, swatches: Swatches, file: FileText, enter: ArrowElbowDownLeft, spinner: SpinnerGap,
  "arrow-l": ArrowLeft, "arrow-r": ArrowRight, external: ArrowSquareOut, refresh: ArrowsClockwise, brain: Brain,
  calendar: CalendarBlank, "chev-d": CaretDown, "chev-l": CaretLeft, "chev-r": CaretRight, updown: CaretUpDown,
  "chart-bar": ChartBar, check: Check, "check-circle": CheckCircle, circle: Circle, clock: Clock, copy: Copy,
  database: Database, download: DownloadSimple, eye: Eye, folder: Folder, settings: Gear, home: House, image: Image,
  info: Info, key: Key, lightning: Lightning, unlink: LinkBreak, lock: Lock, search: MagnifyingGlass, megaphone: Megaphone,
  box: Package, plug: Plug, plus: Plus, blocked: Prohibit, activity: Pulse, receipt: Receipt, repeat: Repeat, rows: Rows,
  "seal-check": SealCheck, bag: ShoppingBag, signout: SignOut, sparkle: Sparkle, layers: Stack, store: Storefront, tag: Tag,
  target: Target, "trend-down": TrendDown, "trend-up": TrendUp, user: User, users: Users, "users-three": UsersThree,
  pointer: Cursor, hand: Hand, msg: ChatCircle, undo: ArrowCounterClockwise, redo: ArrowClockwise, monitor: Monitor, tablet: DeviceTablet, mobile: DeviceMobile,
  split: Columns, play: Play, pause: Pause, minus: Minus, music: MusicNotes, pen: PenNib, squares: SquaresFour, more: DotsThree, star: Star, "arrow-ur": ArrowUpRight, brush: PaintBrush,
  warning: Warning, "warning-circle": WarningCircle, webhook: WebhooksLogo, x: X,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name, size = 16, color = "currentColor", weight = "regular", style, className,
}: {
  name: IconName; size?: number; color?: string; weight?: "regular" | "bold" | "fill"; style?: React.CSSProperties; className?: string;
}) {
  const C = ICONS[name];
  return <C size={size} color={color} weight={weight} style={{ flexShrink: 0, ...style }} className={className} aria-hidden />;
}

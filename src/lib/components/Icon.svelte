<script lang="ts">
  import Folder from "lucide-svelte/icons/folder";
  import FolderOpen from "lucide-svelte/icons/folder-open";
  import FileText from "lucide-svelte/icons/file-text";
  import Archive from "lucide-svelte/icons/archive";
  import Inbox from "lucide-svelte/icons/inbox";
  import Globe from "lucide-svelte/icons/globe";
  import Pin from "lucide-svelte/icons/pin";
  import Tag from "lucide-svelte/icons/tag";
  import Monitor from "lucide-svelte/icons/monitor";
  import Terminal from "lucide-svelte/icons/terminal";
  import Cpu from "lucide-svelte/icons/cpu";
  import Network from "lucide-svelte/icons/network";
  import Shield from "lucide-svelte/icons/shield";
  import Database from "lucide-svelte/icons/database";
  import Settings from "lucide-svelte/icons/settings";
  import Wrench from "lucide-svelte/icons/wrench";
  import Lightbulb from "lucide-svelte/icons/lightbulb";
  import Briefcase from "lucide-svelte/icons/briefcase";
  import Landmark from "lucide-svelte/icons/landmark";
  import BookOpen from "lucide-svelte/icons/book-open";
  import Calendar from "lucide-svelte/icons/calendar";
  import Users from "lucide-svelte/icons/users";
  import Home from "lucide-svelte/icons/home";
  import Building from "lucide-svelte/icons/building";
  import Car from "lucide-svelte/icons/car";
  import DollarSign from "lucide-svelte/icons/dollar-sign";
  import Heart from "lucide-svelte/icons/heart";
  import Coffee from "lucide-svelte/icons/coffee";
  import Music from "lucide-svelte/icons/music";
  import Plane from "lucide-svelte/icons/plane";
  import Lock from "lucide-svelte/icons/lock";
  import Unlock from "lucide-svelte/icons/unlock";
  import Check from "lucide-svelte/icons/check";
  import CheckCircle from "lucide-svelte/icons/check-circle";
  import Plus from "lucide-svelte/icons/plus";
  import X from "lucide-svelte/icons/x";
  import Search from "lucide-svelte/icons/search";
  import ChevronRight from "lucide-svelte/icons/chevron-right";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import Bot from "lucide-svelte/icons/bot";
  import Copy from "lucide-svelte/icons/copy";
  import Brain from "lucide-svelte/icons/brain";
  import FileEdit from "lucide-svelte/icons/file-edit";
  import Eye from "lucide-svelte/icons/eye";
  import Sliders from "lucide-svelte/icons/sliders";
  import PanelLeft from "lucide-svelte/icons/panel-left";
  import PanelRight from "lucide-svelte/icons/panel-right";
  import Columns2 from "lucide-svelte/icons/columns-2";
  import Split from "lucide-svelte/icons/split";
  import RefreshCw from "lucide-svelte/icons/refresh-cw";
  import FolderPlus from "lucide-svelte/icons/folder-plus";
  import FilePlus from "lucide-svelte/icons/file-plus";
  import ChevronsDownUp from "lucide-svelte/icons/chevrons-down-up";
  import ChevronsUpDown from "lucide-svelte/icons/chevrons-up-down";
  import ListFilter from "lucide-svelte/icons/list-filter";
  import Ellipsis from "lucide-svelte/icons/ellipsis";
  import ShieldCheck from "lucide-svelte/icons/shield-check";
  import FileCode from "lucide-svelte/icons/file-code";
  import Key from "lucide-svelte/icons/key";
  import Trash2 from "lucide-svelte/icons/trash-2";
  import Palette from "lucide-svelte/icons/palette";
  import FolderSync from "lucide-svelte/icons/folder-sync";

  interface Props {
    name: string;
    size?: number | string;
    color?: string;
    class?: string;
  }

  let { name, size = 16, color = "currentColor", class: className = "" }: Props = $props();

  const iconRegistry: Record<string, any> = {
    // Lucide names
    "folder": Folder,
    "folder-open": FolderOpen,
    "file-text": FileText,
    "file": FileText,
    "file-code": FileCode,
    "archive": Archive,
    "inbox": Inbox,
    "globe": Globe,
    "pin": Pin,
    "tag": Tag,
    "monitor": Monitor,
    "terminal": Terminal,
    "cpu": Cpu,
    "network": Network,
    "shield": Shield,
    "database": Database,
    "settings": Settings,
    "wrench": Wrench,
    "lightbulb": Lightbulb,
    "briefcase": Briefcase,
    "landmark": Landmark,
    "book-open": BookOpen,
    "calendar": Calendar,
    "users": Users,
    "home": Home,
    "building": Building,
    "car": Car,
    "dollar-sign": DollarSign,
    "heart": Heart,
    "coffee": Coffee,
    "music": Music,
    "plane": Plane,
    "lock": Lock,
    "unlock": Unlock,
    "check": Check,
    "check-circle": CheckCircle,
    "plus": Plus,
    "x": X,
    "search": Search,
    "chevron-right": ChevronRight,
    "chevron-down": ChevronDown,
    "bot": Bot,
    "copy": Copy,
    "brain": Brain,
    "file-edit": FileEdit,
    "eye": Eye,
    "sliders": Sliders,
    "panel-left": PanelLeft,
    "panel-right": PanelRight,
    "columns-2": Columns2,
    "split": Split,
    "refresh-cw": RefreshCw,
    "folder-plus": FolderPlus,
    "file-plus": FilePlus,
    "chevrons-down-up": ChevronsDownUp,
    "chevrons-up-down": ChevronsUpDown,
    "list-filter": ListFilter,
    "filter": ListFilter,
    "ellipsis": Ellipsis,
    "shield-check": ShieldCheck,
    "key": Key,
    "trash": Trash2,
    "trash-2": Trash2,
    "palette": Palette,
    "folder-sync": FolderSync,

    // Legacy emoji mappings
    "🖥️": Monitor,
    "💼": Briefcase,
    "🏠": Home,
    "📚": BookOpen,
    "📥": Inbox,
    "📦": Archive,
    "🌐": Globe,
    "🏛️": Landmark,
    "💡": Lightbulb,
    "⚙️": Settings,
    "🛠️": Wrench,
    "🚗": Car,
    "🏢": Building,
    "💰": DollarSign,
    "❤️": Heart,
    "🧠": Brain,
    "🔒": Lock,
    "📄": FileText,
    "📁": Folder,
    "📂": FolderOpen,
    "📌": Pin,
    "🚦": CheckCircle,
    "📅": Calendar,
    "🏷️": Tag,
    "📝": FileEdit,
  };

  let ResolvedComponent = $derived(iconRegistry[name] || Folder);
</script>

<span class="cortex-icon {className}">
  <ResolvedComponent {size} {color} />
</span>

<style>
  .cortex-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
    line-height: 1;
    flex-shrink: 0;
  }
</style>

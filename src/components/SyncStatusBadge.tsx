import { Cloud, CloudOff, LoaderCircle } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { useSyncStatus } from "../hooks/useSyncStatus";

export default function SyncStatusBadge() {
  const { t } = useLanguage();
  const { status } = useSyncStatus();

  const config = {
    local: {
      icon: CloudOff,
      text: t("syncStatus.local"),
      className: "text-(--color-ink-faint)",
    },
    syncing: {
      icon: LoaderCircle,
      text: t("syncStatus.syncing"),
      className: "text-(--color-primary)",
      spin: true,
    },
    synced: {
      icon: Cloud,
      text: t("syncStatus.synced"),
      className: "text-(--color-secondary)",
    },
    offline: {
      icon: CloudOff,
      text: t("syncStatus.offline"),
      className: "text-(--color-accent-orange)",
    },
    unauthorized: {
      icon: CloudOff,
      text: t("syncStatus.unauthorized"),
      className: "text-red-500",
    },
  }[status];

  const Icon = config.icon;

  return (
    <div
      className={[
        "flex items-center gap-2 rounded-(--radius-md) px-2 py-1.5 text-[12px] font-medium",
        "bg-(--color-canvas-soft)",
        config.className,
      ].join(" ")}
      title={config.text}
    >
      <Icon size={13} className={config.spin ? "animate-spin" : ""} />
      <span className="truncate">{config.text}</span>
    </div>
  );
}

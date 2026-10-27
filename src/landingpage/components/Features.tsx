import { useTranslation } from "react-i18next";
import BarChart3 from "lucide-react/dist/esm/icons/bar-chart-3.js";
import Bell from "lucide-react/dist/esm/icons/bell.js";
import CalendarDays from "lucide-react/dist/esm/icons/calendar-days.js";
import CheckSquare from "lucide-react/dist/esm/icons/check-square.js";
import Cloud from "lucide-react/dist/esm/icons/cloud.js";
import FileSignature from "lucide-react/dist/esm/icons/file-signature.js";
import FileText from "lucide-react/dist/esm/icons/file-text.js";
import FolderKanban from "lucide-react/dist/esm/icons/folder-kanban.js";
import GitBranch from "lucide-react/dist/esm/icons/git-branch.js";
import Headphones from "lucide-react/dist/esm/icons/headphones.js";
import Kanban from "lucide-react/dist/esm/icons/kanban.js";
import Landmark from "lucide-react/dist/esm/icons/landmark.js";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard.js";
import LayoutTemplate from "lucide-react/dist/esm/icons/layout-template.js";
import MessageCircle from "lucide-react/dist/esm/icons/message-circle.js";
import Package from "lucide-react/dist/esm/icons/package.js";
import Receipt from "lucide-react/dist/esm/icons/receipt.js";
import Settings from "lucide-react/dist/esm/icons/settings.js";
import Smartphone from "lucide-react/dist/esm/icons/smartphone.js";
import Target from "lucide-react/dist/esm/icons/target.js";
import TrendingDown from "lucide-react/dist/esm/icons/trending-down.js";
import UserCog from "lucide-react/dist/esm/icons/user-cog.js";
import Users from "lucide-react/dist/esm/icons/users.js";
import Wallet from "lucide-react/dist/esm/icons/wallet.js";
import type { LucideIcon } from "lucide-react";

const categories: { titleKey: string; items: { icon: LucideIcon; key: string }[] }[] = [
  {
    titleKey: "cat_sales",
    items: [
      { icon: Target, key: "leads" },
      { icon: Users, key: "clients" },
      { icon: GitBranch, key: "funnel" },
      { icon: FileText, key: "proposals" },
      { icon: FileSignature, key: "contracts" },
      { icon: Package, key: "store" },
    ],
  },
  {
    titleKey: "cat_ops",
    items: [
      { icon: FolderKanban, key: "projects" },
      { icon: CheckSquare, key: "tasks" },
      { icon: Headphones, key: "tickets" },
      { icon: CalendarDays, key: "agenda" },
    ],
  },
  {
    titleKey: "cat_comms",
    items: [
      { icon: MessageCircle, key: "chat" },
      { icon: Smartphone, key: "wa_api" },
      { icon: LayoutTemplate, key: "templates" },
      { icon: Cloud, key: "wa_cloud" },
      { icon: Kanban, key: "kanban" },
    ],
  },
  {
    titleKey: "cat_finance",
    items: [
      { icon: Receipt, key: "invoices" },
      { icon: Wallet, key: "payables" },
      { icon: TrendingDown, key: "expenses" },
      { icon: BarChart3, key: "reports" },
      { icon: Landmark, key: "billing" },
    ],
  },
];

const extras: { icon: LucideIcon; key: string }[] = [
  { icon: LayoutDashboard, key: "dashboard" },
  { icon: Settings, key: "settings" },
  { icon: UserCog, key: "profiles" },
  { icon: Bell, key: "notifications" },
];

const Features = () => {
  const { t } = useTranslation("landing");
  return (
    <section id="recursos" className="relative py-24">
      <div className="absolute inset-0 bg-grid opacity-20" />
      <div className="container relative mx-auto px-4 lg:px-8">
        <div className="mb-16 text-center">
          <h2 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
            {t("features_title_before")} <span className="text-gradient">{t("features_title_em")}</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">{t("features_lead")}</p>
        </div>

        <div className="grid gap-12 lg:grid-cols-2">
          {categories.map((cat) => (
            <div key={cat.titleKey}>
              <h3 className="mb-4 font-display text-lg font-semibold text-foreground">{t(cat.titleKey)}</h3>
              <div className="grid gap-3">
                {cat.items.map((item) => (
                  <div
                    key={item.key}
                    className="group flex items-start gap-4 rounded-lg border border-border/50 bg-card/50 p-4 transition-all hover:border-primary/30 hover:bg-card hover:glow-primary"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <item.icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{t(`item_${item.key}`)}</h4>
                      <p className="text-sm text-muted-foreground">{t(`item_${item.key}_desc`)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {extras.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 p-4 transition-all hover:border-primary/30"
            >
              <item.icon size={18} className="shrink-0 text-primary" />
              <div>
                <span className="font-medium text-foreground">{t(`extra_${item.key}`)}</span>
                <span className="ml-2 text-sm text-muted-foreground">{t(`extra_${item.key}_desc`)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;

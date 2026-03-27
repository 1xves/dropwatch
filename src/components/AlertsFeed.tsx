import { motion } from "framer-motion";
import { Bell, TrendingUp, AlertTriangle, Megaphone } from "lucide-react";

export interface Alert {
  id: string;
  brand: string;
  message: string;
  type: "price_change" | "new_release" | "restock" | "news";
  timestamp: Date;
}

interface AlertsFeedProps {
  alerts: Alert[];
}

const alertIcons: Record<string, React.ReactNode> = {
  price_change: <TrendingUp className="h-4 w-4" />,
  new_release: <Megaphone className="h-4 w-4" />,
  restock: <AlertTriangle className="h-4 w-4" />,
  news: <Bell className="h-4 w-4" />,
};

const alertColors: Record<string, string> = {
  price_change: "text-drop-upcoming bg-drop-upcoming/10",
  new_release: "text-drop-hot bg-drop-hot/10",
  restock: "text-drop-soon bg-drop-soon/10",
  news: "text-primary bg-primary/10",
};

const AlertsFeed = ({ alerts }: AlertsFeedProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="glass-card rounded-2xl p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-display font-bold text-foreground">Alerts & News</h2>
      </div>

      {alerts.length === 0 ? (
        <p className="text-muted-foreground text-sm font-body">
          No alerts yet. Tracked brands will appear here.
        </p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {[...alerts].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).map((alert, i) => (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.03 * i }}
              className="flex items-start gap-3 p-3 rounded-xl bg-secondary/30 hover:bg-secondary/60 transition-colors"
            >
              <div className={`p-2 rounded-lg shrink-0 ${alertColors[alert.type]}`}>
                {alertIcons[alert.type]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-body text-foreground">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {alert.brand} · {alert.timestamp.toLocaleDateString()}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default AlertsFeed;

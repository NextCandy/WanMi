import { useEffect, useState } from "react";

import { ErrorState } from "../../../components/ui";
import { api } from "../../../lib/api";
import { Panel } from "../Panel";
import type { DashboardData } from "../types";

export function OverviewView({ onTldClick }: { onTldClick: (tld: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardData>("/api/admin/dashboard")
      .then(setData)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "概览加载失败"));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <div className="skeleton-card" style={{ minHeight: 160 }} />;

  const stats: Array<[string, number]> = [
    ["域名总数", data.counts.total],
    ["前台展示", data.counts.listed],
    ["已隐藏", data.counts.hidden],
    ["精品域名", data.counts.featured],
  ];
  const maxTld = data.tlds[0]?.count ?? 1;

  return (
    <div className="admin-stack">
      <section className="admin-stat-grid">
        {stats.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      <Panel title="后缀分布" description="点击任一后缀跳转到筛选后的域名管理">
        <div className="dist-list">
          {data.tlds.slice(0, 12).map((item) => (
            <button
              className="dist-row"
              key={item.tld}
              onClick={() => onTldClick(item.tld)}
              aria-label={`筛选后缀 .${item.tld}，共 ${item.count} 个域名`}
            >
              <span className="dist-label">.{item.tld}</span>
              <span className="dist-track">
                <i style={{ width: `${Math.max(4, (item.count / maxTld) * 100)}%` }} />
              </span>
              <b>{item.count}</b>
            </button>
          ))}
        </div>
      </Panel>

      <div className="admin-two-col">
        <Panel title="90 天内到期">
          {data.expiring90d.length ? (
            <div className="kv-list">
              {data.expiring90d.map((item) => (
                <div key={item.full_domain}>
                  <span>{item.full_domain}</span>
                  <b>{new Date(item.expires_at).toLocaleDateString("zh-CN")}</b>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
              暂无 90 天内到期的域名（库中尚无到期日期数据）。
            </p>
          )}
        </Panel>

        <Panel title="最近操作">
          {data.recentLogs.length ? (
            <div className="activity-list">
              {data.recentLogs.map((log) => (
                <div key={log.id}>
                  <span className={`dot${log.success ? "" : " error"}`} />
                  <div>
                    <strong>{log.message}</strong>
                    <small>{new Date(log.created_at).toLocaleString("zh-CN")}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>暂无操作记录</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
